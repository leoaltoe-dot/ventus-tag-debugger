const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6";

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Ventus-Version",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}

function send(res, status, body) {
  res.writeHead(status, headers());
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooLarge = false;

    req.on("data", chunk => {
      if (tooLarge) return;
      data += chunk;

      if (data.length > 1024 * 1024) {
        tooLarge = true;
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON inválido."));
      }
    });

    req.on("error", reject);
  });
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text) {
    return payload.output_text;
  }

  const text = [];

  for (const item of payload.output || []) {
    if (item.type !== "message") continue;

    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        text.push(content.text);
      }
    }
  }

  return text.join("\n");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const match = String(text || "").match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("A IA não retornou JSON válido.");
  }

  return JSON.parse(match[0]);
}


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

const SYSTEM_PROMPT = `
Você é o Ventus AI, especialista sênior em:
- Google Analytics 4;
- Google Tag Manager web e server-side;
- Meta Pixel e Meta CAPI;
- Google Ads conversions;
- Floodlight;
- ecommerce;
- atribuição;
- qualidade de dados;
- debugging de tracking.

Você receberá os dados técnicos de UMA tag capturada pelo Ventus Tag Debugger.

Analise somente as evidências disponíveis.

Verifique:
1. parâmetros obrigatórios ou recomendados ausentes;
2. inconsistências entre Data Layer e request;
3. ecommerce items;
4. transaction_id, value e currency quando aplicável;
5. Measurement ID / Pixel ID / conversion ID;
6. status HTTP e erro de rede;
7. possível duplicidade;
8. GTM container;
9. browser-side vs server-side ingress;
10. possíveis impactos em atribuição e mensuração;
11. boas práticas específicas da plataforma.

IMPORTANTE:
- não invente que um evento chegou à plataforma se isso não estiver comprovado;
- "server-side-ingress" significa apenas navegador -> endpoint server-side;
- não afirme que Meta CAPI/GA4 recebeu o envio downstream;
- seja específico sobre o parâmetro ou campo em questão;
- respostas devem ser curtas e acionáveis.

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

Responda SOMENTE JSON válido:
{
  "score": 0,
  "summary": "Resumo curto",
  "findings": [
    {
      "severity": "high|medium|low|good",
      "title": "Título curto",
      "text": "Explicação",
      "fix": "Como corrigir",
      "param": "parâmetro (opcional)"
    }
  ],
  "recommendations": [
    "Recomendação objetiva"
  ]
}
`;

async function callOpenAI(tag) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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
    throw new Error("A IA não retornou conteúdo.");
  }

  return normalizeAnalysis(safeJsonParse(output));
}

const server = http.createServer(async (req, res) => {
  /* FIX: "/health?x=1" ou "/analyze/" retornavam 404 */
  const pathname = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "") || "/";

  /* Só a extensão (chrome-extension://) ou ferramentas locais sem Origin podem chamar o backend */
  const origin = req.headers.origin || "";
  if (origin && !/^chrome-extension:\/\//.test(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return send(res, 403, { error: "Origem não permitida." });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers());
    return res.end();
  }

  if (req.method === "GET" && pathname === "/health") {
    return send(res, 200, {
      ok: true,
      service: "Ventus AI",
      model: OPENAI_MODEL,
      apiKeyConfigured: Boolean(OPENAI_API_KEY)
    });
  }

  if (req.method === "POST" && pathname === "/analyze") {
    try {
      const body = await readBody(req);

      if (!body.tag) {
        return send(res, 400, {
          error: "Campo 'tag' não informado."
        });
      }

      const analysis = await callOpenAI(body.tag);

      return send(res, 200, analysis);
    } catch (error) {
      return send(res, 500, {
        error: error.message || "Erro interno."
      });
    }
  }

  return send(res, 404, {
    error: "Endpoint não encontrado."
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("============================================");
  console.log(" Ventus AI");
  console.log("============================================");
  console.log(` Backend: http://localhost:${PORT}`);
  console.log(` Endpoint: http://localhost:${PORT}/analyze`);
  console.log(` Modelo: ${OPENAI_MODEL}`);
  console.log(
    ` API Key: ${OPENAI_API_KEY ? "configurada" : "NÃO CONFIGURADA"}`
  );
  console.log("============================================");
  console.log("");
});
