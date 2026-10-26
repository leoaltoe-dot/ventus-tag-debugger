const SYSTEM_PROMPT = `
Você é o Ventus AI, especialista sênior em digital analytics e tracking.

Analise uma única tag capturada pelo Ventus Tag Debugger.

Você domina:
- Google Analytics 4;
- Google Tag Manager Web;
- Google Tag Manager Server-Side;
- Meta Pixel;
- Meta CAPI;
- Google Ads Conversions;
- Floodlight;
- ecommerce;
- atribuição;
- qualidade de dados;
- troubleshooting de requests.

Analise apenas as evidências fornecidas.

Verifique:
1. parâmetros obrigatórios/recomendados ausentes;
2. inconsistências entre Data Layer e request;
3. ecommerce e array items;
4. transaction_id, value e currency;
5. Measurement ID, Pixel ID ou Conversion ID;
6. status HTTP;
7. possíveis erros de rede;
8. possível duplicidade;
9. GTM container;
10. browser-side vs server-side ingress;
11. possíveis impactos em atribuição;
12. boas práticas da plataforma.

REGRAS:
- não invente evidências;
- não afirme que um evento chegou ao vendor apenas porque chegou ao endpoint server-side;
- "server-side-ingress" significa somente navegador -> endpoint server-side;
- seja objetivo e técnico;
- recomendações devem ser acionáveis.

VALIDAÇÃO POR REGRAS (campo "ruleValidation"):
- contém checagens determinísticas já feitas pela extensão (formato de value/currency, items, transaction_id, nomes de evento, event_id, consent mode, Data Layer × hit);
- trate-as como fatos: não as contradiga sem evidência no payload e NÃO as repita;
- traga o que as regras não cobrem: coerência entre parâmetros, contexto do evento no funil, riscos de atribuição, boas práticas específicas;
- se não houver nada além das regras, devolva findings vazio e um summary curto.
Cada finding deve ter "fix" (como corrigir, objetivo) e, se aplicável, "param" (parâmetro envolvido).

SERVER-SIDE (campo "serverSide" e "possibleDualSend"):
- serverSide.party = "first" → endpoint em subdomínio do site (bom para cookies first-party); "third" → domínio de terceiros (Stape/Cloud Run etc.), cookies não são first-party;
- serverSide.firstPartyCookies (ex.: FPID, FPLC, FPGCL*) indica que a resposta veio de um server container que definiu cookies;
- serverSide.preview = true → hit enviado em modo preview do sGTM;
- possibleDualSend = true → o mesmo evento GA4 saiu direto para o Google E para o server container em até 3 s: alerte risco de contagem dupla;
- nunca afirme que o servidor repassou ao GA4/Meta/Ads: isso não é visível no navegador.

Retorne SOMENTE JSON válido no formato:
{
  "score": 0,
  "summary": "Resumo curto",
  "findings": [
    {
      "severity": "high|medium|low|good",
      "title": "Título curto",
      "text": "Explicação objetiva",
      "fix": "Como corrigir",
      "param": "parâmetro (opcional)"
    }
  ],
  "recommendations": [
    "Recomendação objetiva"
  ]
}
`;


/* Garante um formato estável mesmo quando o modelo responde fora do esquema */
function normalizeAnalysis(raw) {
  const sev = new Set(["high", "medium", "low", "good"]);
  const a = raw && typeof raw === "object" ? raw : {};
  const score = Math.max(0, Math.min(100, Math.round(Number(a.score))));
  return {
    score: Number.isFinite(score) ? score : null,
    summary: String(a.summary || "Análise concluída.").slice(0, 600),
    findings: (Array.isArray(a.findings) ? a.findings : []).slice(0, 20).map(f => ({
      severity: sev.has(String(f?.severity).toLowerCase()) ? String(f.severity).toLowerCase() : "low",
      title: String(f?.title || "Ponto identificado").slice(0, 160),
      text: String(f?.text || "").slice(0, 1200),
      fix: String(f?.fix || "").slice(0, 600),
      param: String(f?.param || "").slice(0, 80)
    })),
    recommendations: (Array.isArray(a.recommendations) ? a.recommendations : []).slice(0, 12).map(r => String(r).slice(0, 600))
  };
}

/* Segurança: o Worker é público (workers.dev). Sem esta checagem qualquer site ou script
   podia chamar /analyze e consumir créditos da OpenAI. Por padrão só páginas de extensão
   (chrome-extension://) são aceitas; ALLOWED_ORIGINS (separadas por vírgula) restringe a
   IDs específicos, ex.: "chrome-extension://abcdefghijklmnop". */
function isAllowedOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (list.length) return list.includes(origin);
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Ventus-Version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status = 200, origin = "*") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text) {
    return payload.output_text;
  }

  const parts = [];

  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;

    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n");
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const match = String(text || "").match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("A IA não retornou JSON válido.");
  }

  return JSON.parse(match[0]);
}

function sanitizeServerSide(value, key = "") {
  const blocked = [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "email",
    "email_address",
    "phone",
    "phone_number",
    "telephone",
    "first_name",
    "last_name",
    "firstname",
    "lastname"
  ];

  const normalized = String(key || "").toLowerCase();

  if (
    blocked.some(
      item =>
        normalized === item ||
        normalized.endsWith(`.${item}`) ||
        normalized.includes(item)
    )
  ) {
    return "[REDACTED]";
  }

  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(v => sanitizeServerSide(v, key));
  }

  if (typeof value === "object") {
    const output = {};

    for (const [k, v] of Object.entries(value).slice(0, 250)) {
      output[k] = sanitizeServerSide(v, k);
    }

    return output;
  }

  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}…`;
  }

  return value;
}

async function analyzeWithOpenAI(tag, env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada no Cloudflare Worker.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(tag)
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
      `OpenAI API retornou HTTP ${response.status}`
    );
  }

  const output = extractOutputText(payload);

  if (!output) {
    throw new Error("A OpenAI não retornou conteúdo.");
  }

  return normalizeAnalysis(parseModelJson(output));
}

export default {
  async fetch(request, env) {
    const rawOrigin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    const allowed = isAllowedOrigin(rawOrigin, env);
    const origin = allowed ? rawOrigin : "null";

    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    if (request.method === "GET" && url.pathname.replace(/\/+$/, "") === "/health") {
      return json(
        {
          ok: true,
          service: "Ventus AI",
          model: env.OPENAI_MODEL || "gpt-5.6",
          apiKeyConfigured: Boolean(env.OPENAI_API_KEY),
          environment: "cloudflare-workers"
        },
        200,
        origin
      );
    }

    if (request.method === "POST" && url.pathname.replace(/\/+$/, "") === "/analyze") {
      if (!allowed) {
        return json({ error: "Origem não permitida." }, 403, origin);
      }
      try {
        /* Content-Length pode faltar (chunked): mede o corpo real */
        const text = await request.text();

        if (text.length > 1_000_000) {
          return json(
            { error: "Payload maior que 1 MB." },
            413,
            origin
          );
        }

        let body;
        try { body = JSON.parse(text); } catch { return json({ error: "JSON inválido." }, 400, origin); }

        if (!body?.tag) {
          return json(
            { error: "Campo 'tag' é obrigatório." },
            400,
            origin
          );
        }

        const tag = sanitizeServerSide(body.tag);
        const result = await analyzeWithOpenAI(tag, env);

        return json(result, 200, origin);
      } catch (error) {
        return json(
          {
            error: error?.message || "Erro interno na análise."
          },
          500,
          origin
        );
      }
    }

    return json(
      {
        error: "Endpoint não encontrado."
      },
      404,
      origin
    );
  }
};
