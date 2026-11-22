# Design — Ventus "Soot & Lime" (v6.0)

Sistema visual do popup e do painel DevTools. Fonte da verdade: os tokens no topo de `popup.css`.

## Direção
Dada pela Taste Skill para o tipo *developer tool* (`start.mjs deal --page software`):
palette **soot-pale-lime**, tipografia **Mona Sans + Geist Mono**, raio **sharp**.

Por que cabe: um debugger de tags é um instrumento de leitura rápida usado ao lado do DevTools. Fundo quase preto
deixa os dados (IDs, status, payload) em primeiro plano; um único acento lime marca o que está ativo/selecionado/ao vivo,
sem competir com as cores de status (verde OK, vermelho erro, âmbar atenção). Violeta saiu do sistema — só existe no logo.

## Cor
| Papel | Dark (padrão) | Light ("papel") |
|---|---|---|
| Fundo / superfície | `#0f0f0f` / `#161616` | `#efefea` / `#fbfbf8` |
| Texto / secundário / mudo | `#f4f4ef` / `#c9c9c2` / `#93938b` | `#121211` / `#3b3b37` / `#686862` |
| Acento (preenchimento) | `#dafa9c` com tinta `#0f0f0f` | `#dafa9c` com tinta `#121211` |
| Acento como texto | `#dafa9c` | `#476600` (contraste ≥ 4.5:1) |
| OK / Erro / Atenção | `#5fd38d` / `#ff6b5e` / `#f2c14e` | `#1b7f47` / `#c8331f` / `#946000` |

- A **topbar é sempre soot** nos dois temas: é a faixa da marca.
- Acento só para: aba ativa, item selecionado, captura ligada, ação primária (Analisar com IA), evento recém-chegado.
- Cores de plataforma derivam das marcas (GA4 laranja, Meta azul, Ads verde, Floodlight coral, TikTok rosa, sGTM ciano, GTM cinza, Data Layer areia) e aparecem só no ícone da plataforma.
- Blocos de código são escuros nos dois temas.

## Tipografia
- **Mona Sans** (variável, empacotada em `fonts/`): toda a UI. Pesos 450–650; títulos 600–620 com tracking −0.02em.
- **Geist Mono**: só para dado — IDs, horários, status HTTP, contagens, payloads, URLs. Nunca como enfeite.
- Escala compacta (Operate): 10.5 / 11.5 / 12 / 13 / 15 / 17 px. Rótulos em *sentence case* (sem caixa-alta espaçada).
- `font-variant-numeric: tabular-nums` no body.

## Forma
- Raio: 2–3px em chips/badges, 4px em controles e cartões, 6px em modais.
- Sem barra lateral colorida em caixas; estado = borda inteira, tinta de fundo ou ponto.
- Grade de detalhes como ficha técnica: linhas finas, sem caixa dentro de caixa.

## Movimento (princípios Emil Kowalski)
- Curvas: `--ease-out: cubic-bezier(.23,1,.32,1)`, `--ease-drawer: cubic-bezier(.32,.72,0,1)`.
- Durações: pressionar 120ms · hover/cor 150ms · estados 200–240ms · modal 200ms entra / 130ms sai.
- Só `transform`, `opacity` (e `filter: blur` curto). Nada de `transition: all`.
- Todo botão responde ao clique com `scale(.97)`; hovers só em `@media (hover:hover)`.
- Momentos com propósito: indicador de aba que desliza; brilho lime em evento recém-chegado (1.1s, resiste a re-render);
  entrada curta ao trocar o evento do detalhe; tooltip de status com 380ms de atraso; modal com `@starting-style`.
- `prefers-reduced-motion`: sem deslocamento; mantém fades de cor/opacidade que explicam estado.

## Navegador
`::selection` lime, `caret-color` no acento, scrollbars finas no tom das bordas, anel de foco duplo (fundo + acento).
