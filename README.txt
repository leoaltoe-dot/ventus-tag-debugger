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

VENTUS v4.8
- Botão claro/escuro no cabeçalho.
- Tema aplicado ao popup, cards, histórico, detalhes e IA.
- Preferência salva no Chrome e mantida entre sessões.

VENTUS v4.9 — DARK THEME FIXED
- Dark mode rebuilt with semantic palette instead of simple color overrides.
- Separate dark colors for background, surfaces, cards, inputs, borders and text.
- Platform colors preserved for GA4, Meta, Ads and Data Layer.
- Status green/red/orange preserved with accessible contrast.
- AI modal, history, details and Data Layer use dedicated dark surfaces.
- Theme preference remains persisted in chrome.storage.local.

VENTUS v5.0
- Todos os botões reorganizados e padronizados visualmente.
- Tabs e filtros com hierarquia consistente.
- Erros/status associados pelo requestId do Chrome.
- HTTP 4xx, HTTP 5xx e falhas de rede diferenciados.
- Falhas de rede classificadas como blocked, cancelled, timeout ou network_error.
- Duração até conclusão/falha armazenada no evento.

VENTUS v5.1
- Header reorganizado em uma única linha.
- Monitoramento e liga/desliga permanecem dentro do cabeçalho.
- Logo centralizada independentemente dos controles laterais.
- Tema/configurações alinhados à direita.
- Status da IA não empurra mais os controles para fora do header.
- Layout compacto para popup estreito.

VENTUS v5.2 — HEADER STRUCTURE FIX
- Header refeito com três grupos reais no HTML:
  esquerda = monitoramento + liga/desliga
  centro = logo Ventus
  direita = tema + IA + limpar + status da IA
- Removido alinhamento baseado em margens artificiais.
- Logo permanece centralizada mesmo com quantidades diferentes de controles laterais.
- Controles permanecem dentro do cabeçalho no popup compacto.
- Assinatura fica oculta apenas em larguras muito pequenas para preservar alinhamento.

VENTUS v5.3
- Status IA movido para a mesma linha dos controles do header.
- Badge IA offline/online redesenhado como pill compacto com indicador de status.
- Removida a segunda linha do bloco de ações.
- Tema, configurações, IA e limpar permanecem alinhados horizontalmente.
