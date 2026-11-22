# Product

<!-- impeccable:product-schema 1 -->

> Escrito a partir do README.md e da conversa de 21/11/2026. Linhas marcadas *(inferido)* ainda precisam de confirmação do Leonardo.

## Platform

web

## Users
Profissionais de Digital Analytics, Tracking, Analytics Engineering e Data Science que validam implementações de tags enquanto navegam no site do cliente. *(inferido)* Usam o popup ao lado do DevTools, em sessões longas de QA de tracking, alternando entre o site e a extensão dezenas de vezes por hora.

## Product Purpose
Mostrar, em tempo real, que tags dispararam, com quais parâmetros, de qual container GTM, com que status HTTP e com qual push de Data Layer relacionado — e apontar o que está errado antes de o dado chegar ao GA4/Meta/Ads.

## Positioning
Junta numa única tela o que normalmente exige DevTools > Network, Tag Assistant e o preview do GTM: requests de várias plataformas (GA4, Meta, Google Ads, Floodlight, GTM, TikTok, sGTM), o Data Layer correlacionado, validação por regras e análise por IA, com histórico por domínio.

## Operating Context
- Extensão Chrome MV3; popup de 800×600 (limite do Chrome) e painel no DevTools.
- Uso típico: navegar no funil (page_view → view_item → add_to_cart → purchase) e conferir cada hit.
- IA opcional via backend próprio (Cloudflare Worker ou servidor Node local); a extensão remove dados sensíveis antes do envio.

## Capabilities and Constraints
- Captura via `webRequest` + script injetado no `dataLayer`; histórico apagado após 24 h.
- Liga/desliga da captura; limpeza total e por site com confirmação em dois cliques.
- Lista renderiza no máximo 300 cartões (desempenho); histórico até 500 linhas.
- Interface em português do Brasil.
- Sem rede externa no popup além do endpoint de IA configurado: fontes e ícones vão empacotados.

## Brand Commitments
- Nome: Ventus / Ventus Tag Debugger. Marca: o "V" em gradiente azul (asset do cliente, mantido como está).
- Assinatura "by Leonardo Altoé".

## Evidence on Hand
- README.md, VALIDACAO-ERROS.txt, COMO-CONFIGURAR.txt. Nenhum depoimento, cliente ou métrica de uso — não inventar.

## Product Principles
1. O dado primeiro: IDs, nomes de evento, status e payloads precisam ser legíveis de relance.
2. Erro tem que saltar aos olhos; o que está OK fica quieto.
3. Nada de cerimônia: a ferramenta é aberta dezenas de vezes por sessão.
4. Privacidade explícita no que vai para a IA.
