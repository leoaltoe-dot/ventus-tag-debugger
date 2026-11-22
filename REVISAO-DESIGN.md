# Revisão de design — Ventus Tag Debugger v5.9 → v6.0

Três passes, cada um com sua skill:

1. **Taste Skill** definiu a direção visual (o *deal* para developer tool).
2. **Impeccable** revisou o layout (modo *Operate*: tarefa primeiro, densidade, consistência).
3. **Skills do Emil Kowalski** guiaram a revisão e a reconstrução das animações.

Comparação lado a lado: `antes-depois.png`.

---

## 1. Direção visual (Taste Skill)

Rodei o *deal* da Taste para `--page software --trade "developer tool"`. Ele sorteia em vez de escolher por gosto, e eu fiquei com a primeira opção, como a skill manda:

- **Palette:** `soot-pale-lime`: chão quase preto `#0f0f0f`, acento lime `#dafa9c`.
- **Tipografia:** `mona` = **Mona Sans** (UI) + **Geist Mono** (dados).
- **Raio:** `sharp` (regra da Taste para fintech/dev tools).
- **Regra aplicada:** *nunca violeta* no design próprio. O gradiente azul→roxo dos botões de IA e o roxo do Meta saíram. O roxo agora só aparece no logo, que é asset seu.

**Por que cabe:** um debugger é lido em segundos, ao lado do DevTools. O fundo soot põe os dados na frente. Há um único acento, usado só para o que está *vivo, ativo ou selecionado*, e as cores de status ficam livres para dizer OK/erro.

O que a Taste não cobre: a skill foi feita para sites institucionais (hero, seções por tela, fotos). Num popup de 800×600 eu usei só o *deal* (cor, tipo e raio) e as regras de sistema (um acento, um estilo de botão, um raio, *sentence case*). O gate de página (`gate.mjs`) não se aplica e não foi rodado.

---

## 2. Revisão de layout (Impeccable)

| # | Problema na v5.9 | Severidade | O que mudou na v6.0 |
|---|---|---|---|
| 1 | **Logo e ícones da extensão com uma faixa branca embaixo.** O PNG é um recorte de screenshot, e a faixa aparecia na topbar e no ícone da barra do Chrome. | Alta | Recortei o "V" e montei um ícone limpo sobre fundo soot (`logo-mark.png`, `icons/*`). O `logo.png` original continua no repositório. |
| 2 | **Topbar com sinais repetidos**: o selo "Monitorando" e o toggle "Ligado" diziam a mesma coisa; ainda havia um selo "IA offline" e a assinatura disputando o centro. | Alta | Um controle só de **captura** (status + interruptor). O status da IA virou um ponto no botão de configuração (o texto continua para leitor de tela). As abas subiram para a topbar: a lista ganhou **~60px de altura**. |
| 3 | **Coluna esquerda gastava ~200 de 600px antes do 1º evento**: 4 cartões de status de 50px, busca, filtros em 3 linhas. Só cabiam ~2 cartões. | Alta | O status virou um controle segmentado de 30px. Os filtros ficaram compactos (2 linhas). Cabem ~3 cartões (antes, ~2). |
| 4 | **"11 Eventos" aparecia duas vezes** (contador da aba e cartão de status). | Média | O segmentado diz "Todos 11 · OK 8 · Erros 2 · Pendentes 1". |
| 5 | **Cada cartão tinha botões "⧉" e "✦ Analisar"**: 11 botões iguais na lista, mais um rodapé tracejado. | Média | As ações aparecem no hover, no foco ou na seleção, com slide curto. Em telas touch ficam sempre visíveis. O rodapé tracejado saiu. |
| 6 | **Plataforma codificada 3×** (barra lateral colorida + ícone colorido + rótulo colorido). Barra lateral em caixa arredondada é um anti-padrão. | Média | A cor da plataforma fica só no ícone. O rótulo é neutro. A seleção usa borda inteira + tinta lime. |
| 7 | **Detalhe em "card soup"**: cada informação numa caixa com borda, dentro do painel. | Média | Virou ficha técnica: rótulo e valor com linhas finas, sem caixa dentro de caixa. |
| 8 | **Nota de validação "0" dentro de um círculo** parecia um contador ("zero problemas?"), num bloco todo rosa. | Média | Agora é **`0/100`** grande, em mono, na cor da severidade, sobre fundo neutro com borda tingida. |
| 9 | **Glifos unicode como ícones** (⧉ ✦ × ✓ ⚠ ↗, e "⌁" no estado vazio). | Média | Viraram ícones SVG desenhados no mesmo traço (1.8). |
| 10 | **Eyebrow com texto em gradiente** ("VENTUS AI", "CONFIGURAÇÃO"). | Baixa | Removido. O título carrega a hierarquia. |
| 11 | **Rótulos em caixa-alta espaçada em todo lugar.** | Baixa | *Sentence case* com peso e tamanho. |
| 12 | **Partes que o navegador desenha** (seleção, cursor de texto, scrollbar, anel de foco) com o padrão do Chrome. | Baixa | Seleção lime, caret no acento, anel de foco duplo, scrollbar no tom das bordas. |
| 13 | **Texto "faint" com 3,4:1 de contraste** (horários, endpoint). | Baixa | Ajustado para ≥ 4,7:1 nos dois temas. |

**Tema:** o escuro passou a ser o **padrão** (quem já escolheu claro continua no claro). O claro ("papel") foi refeito com os mesmos papéis. A topbar é soot nos dois temas.

**Assinatura "by Leonardo Altoé":** saiu da topbar para o rodapé do modal de configuração, junto com a versão. Foi o único item de marca que mudei de lugar. Se preferir de volta na topbar, é uma linha de CSS (`.signatureWrap{display:flex}`) + mover o HTML.

### Avisos do detector Impeccable que mantive (de propósito)
- **"Overused font" (Mona Sans / Geist Mono):** vem do *deal* da Taste, que você pediu para guiar a direção. Mantive por isso.
- **"Tiny text" (11,5px):** popup de 800×600 em modo Operate, denso por natureza. O corpo principal fica em 12–13px.
- **"Cramped padding" no controle de captura:** é um controle de 28px com conteúdo centralizado, não um bloco de texto.

---

## 3. Animações (Emil Kowalski)

Critério: *deve animar?* → *para quê?* → *qual curva* → *quanto tempo*. Ferramenta aberta dezenas de vezes por sessão: tudo rápido e com propósito de estado.

| Antes | Depois | Por quê |
|---|---|---|
| `transition: all .15s` em filtros, botões, abas, sites | Propriedades explícitas: `background-color, border-color, color, transform` | `all` anima coisas que não deveriam e custa layout |
| `ease` / `ease-out` nativos | `--ease-out: cubic-bezier(.23,1,.32,1)` e `--ease-drawer` | As curvas nativas são fracas; a custom dá resposta imediata |
| Nenhum `:active` nos botões | `transform: scale(.97)` em 120ms | O botão "ouve" o clique |
| Hovers sem media query | `@media (hover:hover)` | Hover fantasma no toque |
| Sublinhado da aba aparecia/sumia | **Um indicador que desliza** entre as abas (240ms, `transform` only) | Continuidade espacial entre seções |
| Evento novo surgia sem sinal | **Brilho lime de 1,1s** no cartão recém-chegado, com `animation-delay` negativo para resistir a re-render | Estado: "isto acabou de chegar" (o recurso central da ferramenta) |
| Trocar de evento no detalhe era instantâneo e duro | Entrada de 160ms (opacidade + 2px), sem animação na troca de abas internas | Suaviza a troca sem atrasar quem compara eventos |
| Tooltip de status aparecia instantâneo | Atraso de 380ms + 140ms de entrada a partir do canto da origem | Evita disparo acidental ao varrer a lista |
| Modal: só entrada (`translateY(8px)`), saída seca | `@starting-style` + `display allow-discrete`: entra em 200ms (scale .96→1), **sai em 130ms** | Saída mais rápida que a entrada; o modal escala do centro |
| Ícone de copiar trocava texto por "✓" | Troca de SVG com blur curto (200ms) | Lê como uma transformação, não como duas coisas se sobrepondo |
| Interruptor: só `transform .2s` | Polegar "estica" ao pressionar, desliza em ease-out | Sensação física de interruptor |
| Pulso do "ao vivo" a 1.8s, forte | 2.4s, mais discreto; para quando pausado | Sinal de estado contínuo, sem chamar atenção |
| Spinner .8s | .65s | Spinner mais rápido parece carregar mais rápido |
| Drawer mobile `transform .2s ease` | 320ms `--ease-drawer` | Curva de sheet do iOS |
| `prefers-reduced-motion` matava tudo, inclusive fades | Sem deslocamento; mantém fades de cor que explicam estado | Movimento reduzido ≠ zero feedback |

Observação: as skills `review-animations` e `improve-animations` do pacote do Emil só podem ser chamadas por você (`/emil-design-skills:review-animations`). Usei a `emil-design-eng`, que carrega a mesma filosofia e o checklist. Se quiser, rode a `review-animations` sobre o `popup.css` novo como segunda opinião.

---

## 4. Arquivos alterados

- `popup.css`: reescrito (mesmos nomes de classe).
- `popup.html`: topbar nova (marca + abas + ações), modais sem eyebrow, botões de fechar em SVG, assinatura no modal de configuração.
- `popup.js`: ícones SVG no lugar de glifos, feedback de cópia, tema escuro como padrão, rótulos do segmentado e uma camada de movimento aditiva no fim do arquivo (envolve `renderCounts`, `renderLive` e `renderDetail` sem mudar a lógica).
- `panel.css`, `panel.html`: painel do DevTools com os mesmos tokens.
- `manifest.json`: versão **6.0.0** e `minimum_chrome_version` **117** (exigido por `@starting-style`).
- Novos: `fonts/` (Mona Sans e Geist Mono variáveis, licença OFL incluída), `logo-mark.png`, `icons/*` refeitos, `PRODUCT.md`, `DESIGN.md`.

## 5. O que não deu para verificar
- Testei num Chromium headless com `chrome.*` simulado e dados de exemplo (GA4, Meta, Ads bloqueado, Floodlight 404, TikTok pendente, sGTM). **Falta carregar a extensão real** (`chrome://extensions` → Carregar sem compactação) e navegar num site com tags.
- **Larguras < 800px** (aba estreita): o `body` tem largura fixa de 800px desde a v5.x, então os breakpoints estreitos nunca chegam a valer. Não mexi nisso para não arriscar o dimensionamento do popup. Se um dia houver *side panel*, isso precisa de ajuste.
- O backend de IA não foi chamado (o teste ficou offline). A tela de resultado foi verificada no modo "regras locais".
