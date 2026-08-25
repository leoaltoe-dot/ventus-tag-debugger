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

Retorne SOMENTE JSON válido no formato:
{
  "score": 0,
  "summary": "Resumo curto",
  "findings": [
    {
      "severity": "high|medium|low|good",
      "title": "Título curto",
      "text": "Explicação objetiva"
    }
  ],
  "recommendations": [
    "Recomendação objetiva"
  ]
}
`;

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

  return parseModelJson(output);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
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

    if (request.method === "POST" && url.pathname === "/analyze") {
      try {
        const length = Number(request.headers.get("Content-Length") || 0);

        if (length > 1_000_000) {
          return json(
            { error: "Payload maior que 1 MB." },
            413,
            origin
          );
        }

        const body = await request.json();

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
