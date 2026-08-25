VENTUS TAG DEBUGGER v3.6

- Novo popup inspirado no mockup enviado.
- Logo centralizada no header.
- Eventos à esquerda e detalhes à direita.
- Clique em qualquer evento para abrir:
  Resumo, Data Layer, Parâmetros, Headers, Resposta e Timeline.
- GTM Container identificado pelo request gtm.js?id=GTM-XXXX do mesmo site.
- DataLayer correlacionado pelo mesmo event name e proximidade temporal.
- Histórico por site preservado.

Observação: quando um site usa vários containers GTM, a versão mostra o GTM mais recente carregado antes do evento.


VENTUS v3.9
- Meta Pixel detection broadened.
- Captures first-party/server-side ingress endpoints.
- Adds Server Side filter.
- Marks browser-direct vs server-side-ingress.

Important: the extension can see the browser request reaching a server-side endpoint.
It cannot see the downstream server-to-server call from that endpoint to Meta CAPI/GA4,
because that call happens outside Chrome.


VENTUS v4.1
- Logo Ventus redesenhada e atualizada nos ícones da extensão.
- Assinatura sutil "by Leonardo Altoé" adicionada ao lado da marca.
- Assinatura responsiva para não comprometer o espaço do popup.


VENTUS v4.2 — AI ANALYZER
- Botão "Analisar com IA" em cada tag.
- Botão de IA também no detalhe da tag.
- Modal de diagnóstico com score, problemas e recomendações.
- Configuração do endpoint por engrenagem.
- Sanitização de headers/dados sensíveis antes do envio.
- Fallback de análise técnica local se o backend estiver indisponível.
- Pasta backend-example incluída.

SEGURANÇA
A chave da OpenAI deve existir somente no backend, nunca dentro da extensão.


VENTUS v4.3 — AI READY
- Backend local configurado para GPT-5.6 via Responses API.
- Endpoint padrão da extensão: http://localhost:8787/analyze.
- Badge IA online/offline no popup.
- Health check automático a cada 30 segundos.
- Script Windows .bat.
- Script PowerShell com entrada oculta da chave.
- Script macOS/Linux.
- Teste de conexão verifica se a OPENAI_API_KEY está realmente configurada.


VENTUS v4.4 — CLOUDFLARE PUBLIC AI
- Cloudflare Worker incluído.
- Deploy público via workers.dev.
- Script automático Windows / PowerShell / macOS / Linux.
- OPENAI_API_KEY cadastrada como Cloudflare Secret.
- URL pública detectada automaticamente.
- ai-config.js atualizado automaticamente após deploy.
- Extensão deixa de depender do localhost depois do deploy.


VENTUS v4.5 — AI BUTTON FIX
- Botão "Analisar com IA" usa event delegation.
- Funciona mesmo após re-render da lista.
- Clique no botão não abre/fecha o card por engano.
- Modal abre imediatamente ao clicar.
- Timeout de 20 segundos na chamada da IA.
- Mensagem clara em caso de tag não encontrada, timeout, CORS ou erro de backend.

VENTUS v4.6
- Botão global Ligado/Desligado.
- Desligado pausa novas capturas.
- Estado persiste entre sessões.
- Histórico com TTL máximo de 24 horas.
- Limpeza automática a cada hora, ao iniciar o Chrome e ao carregar/salvar eventos.

VENTUS v4.7
- Botão pequeno para copiar status/erro em cada tag.
- Copia plataforma, evento, ID, status, descrição do status, erro técnico, método, endpoint e transporte.
- Feedback visual ✓ ao copiar.
