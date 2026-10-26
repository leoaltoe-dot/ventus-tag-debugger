/* Ventus Tag Debugger — deterministic tag validator (v5.8)
   Runs locally on every captured tag. Its result is shown on the cards, used as the
   offline analysis and sent to the AI backend as ground truth (ruleValidation). */
(function (root) {
  "use strict";

  const GA4_RECOMMENDED = ["add_payment_info", "add_shipping_info", "add_to_cart", "add_to_wishlist", "begin_checkout", "generate_lead", "login", "purchase", "refund", "remove_from_cart", "search", "select_item", "select_promotion", "share", "sign_up", "view_cart", "view_item", "view_item_list", "view_promotion", "page_view", "view_search_results", "select_content", "earn_virtual_currency", "spend_virtual_currency", "tutorial_begin", "tutorial_complete", "join_group", "level_up", "post_score", "unlock_achievement", "close_convert_lead", "close_unconvert_lead", "disqualify_lead", "qualify_lead", "working_lead", "scroll", "click", "file_download", "form_start", "form_submit", "video_start", "video_progress", "video_complete", "user_engagement"];
  const GA4_RESERVED = ["first_visit", "session_start", "first_open", "app_remove", "app_update", "app_clear_data", "app_exception", "in_app_purchase", "notification_open", "notification_receive", "notification_dismiss", "notification_foreground", "os_update", "ad_click", "ad_exposure", "ad_impression", "ad_query", "ad_reward", "screen_view"];
  const GA4_ECOMMERCE = ["purchase", "refund", "add_to_cart", "remove_from_cart", "begin_checkout", "add_payment_info", "add_shipping_info", "view_item", "view_item_list", "select_item", "view_cart", "add_to_wishlist"];
  const GA4_MONETARY = ["purchase", "refund", "add_to_cart", "remove_from_cart", "begin_checkout", "add_payment_info", "add_shipping_info", "view_item", "view_cart", "add_to_wishlist"];
  const META_STANDARD = ["PageView", "Purchase", "Lead", "CompleteRegistration", "AddToCart", "AddToWishlist", "InitiateCheckout", "AddPaymentInfo", "Search", "ViewContent", "Contact", "CustomizeProduct", "Donate", "FindLocation", "Schedule", "StartTrial", "SubmitApplication", "Subscribe"];
  const META_CONVERSION = ["Purchase", "Lead", "CompleteRegistration", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Subscribe", "StartTrial", "SubmitApplication", "Contact", "Schedule"];
  const META_CATALOG = ["ViewContent", "AddToCart", "Purchase", "InitiateCheckout", "AddToWishlist"];

  const first = (v) => Array.isArray(v) ? (v[0] ?? "") : (v === undefined || v === null ? "" : v);
  const str = (v) => String(first(v) ?? "");
  const has = (v) => str(v).trim() !== "";
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  /* "199.90" ok · "199,90" / "R$ 199" / "" not ok */
  function parseMoney(raw) {
    const s = str(raw).trim();
    if (!s) return { present: false };
    if (/^-?\d+(\.\d+)?$/.test(s)) return { present: true, ok: true, number: Number(s), raw: s };
    return { present: true, ok: false, raw: s, reason: /,/.test(s) ? "usa vírgula como separador decimal" : "não é um número" };
  }
  const isCurrency = (c) => /^[A-Z]{3}$/.test(str(c));

  /* GA4 items: pr1=id123~nmCamiseta~pr59.9~qt2~brMarca~caRoupas */
  function parseGa4Items(p) {
    return Object.keys(p).filter((k) => /^pr\d+$/.test(k)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))).map((k) => {
      const item = { key: k };
      str(p[k]).split("~").forEach((part) => {
        const code = part.slice(0, 2), val = part.slice(2);
        if (code === "id") item.id = val; else if (code === "nm") item.name = val; else if (code === "pr") item.price = val; else if (code === "qt") item.qty = val;
      });
      return item;
    });
  }

  /* Data Layer payload in any shape: {event, ecommerce:{…}} · gtag arguments ["event","purchase",{…}] · {event, value…} */
  function dlEcommerce(dl) {
    if (!dl) return null;
    let obj = dl;
    if (Array.isArray(dl)) obj = dl[0] === "event" && dl[2] && typeof dl[2] === "object" ? dl[2] : null;
    if (!obj || typeof obj !== "object") return null;
    const e = obj.ecommerce && typeof obj.ecommerce === "object" ? obj.ecommerce : obj;
    const items = Array.isArray(e.items) ? e.items : (Array.isArray(e.purchase?.products) ? e.purchase.products : null);
    return { value: e.value ?? e.purchase?.actionField?.revenue, currency: e.currency ?? e.currencyCode, transaction_id: e.transaction_id ?? e.purchase?.actionField?.id, items };
  }

  function validateTag(tag, ctx = {}) {
    const p = tag.allParams || {};
    const ev = String(tag.eventName || "");
    const findings = [];
    const checks = [];
    const add = (severity, title, text, fix, param) => findings.push({ severity, title, text, fix: fix || "", param: param || "" });
    const check = (label, value, status, note) => checks.push({ label, value: value === undefined || value === null || value === "" ? "—" : String(value), status, note: note || "" });

    /* ---------- delivery ---------- */
    if (tag.status === "ERROR") add("high", "Hit não entregue", `A requisição falhou no navegador (${tag.error || "erro de rede"}).`, "Verifique bloqueadores, CSP, DNS/certificado do endpoint e se o consentimento não está barrando o envio.", "status");
    else if (typeof tag.status === "number" && tag.status >= 400) add("high", `Endpoint respondeu HTTP ${tag.status}`, "O servidor recusou o hit; ele não foi processado.", tag.transport === "server-side-ingress" ? "Confira se há um client no sGTM que reivindique este caminho e se o domínio aponta para o container certo." : "Confira o endpoint, o ID da tag e os parâmetros enviados.", "status");
    else if (typeof tag.status === "number") add("good", `Entregue (HTTP ${tag.status})`, "O endpoint respondeu sem erro HTTP.", "", "status");
    check("Entrega", tag.status ?? "pendente", tag.status === "ERROR" || tag.status >= 400 ? "error" : typeof tag.status === "number" ? "ok" : "info");

    if (ctx.duplicates > 0) add("high", "Evento duplicado", `Este evento com o mesmo identificador foi disparado ${ctx.duplicates + 1} vezes na página.`, "Garanta que a tag dispara uma única vez (gatilho por evento do Data Layer, não por pageview + evento) e envie transaction_id/event_id para deduplicação.", "transaction_id");
    if (tag.possibleDualSend) add("high", "Possível contagem dupla (direto + sGTM)", "O mesmo evento GA4 saiu direto para o Google e para o server container em até 3 s.", "Envie o GA4 só pelo server container (transport_url / server_container_url) ou remova a tag do servidor.", "transport");

    /* ---------- server-side ---------- */
    const ss = tag.serverSide;
    if (ss?.isServerSide) {
      if (ss.party === "third") add("medium", "sGTM em domínio de terceiros", `O endpoint ${ss.host || ""} não é subdomínio do site; cookies definidos por ele não são first-party.`, "Aponte um subdomínio próprio (ex.: sgtm.seudominio.com) para o server container.", "host");
      if (ss.preview) add("low", "Hit em modo preview do sGTM", "Tem o header X-Gtm-Server-Preview: aparece só no preview do server container.", "", "");
      check("Server-side", `${ss.host || ""}${ss.party ? " · " + (ss.party === "first" ? "1ª parte" : "3ª parte") : ""}`, ss.party === "third" ? "warn" : "ok");
      if ((ss.firstPartyCookies || ss.cookies || []).length) check("Cookies FP do servidor", (ss.firstPartyCookies || ss.cookies).join(", "), "ok");
    }

    const platform = tag.platform;
    if (platform === "GA4") validateGa4(tag, p, ev, add, check, ctx);
    else if (platform === "Meta") validateMeta(tag, p, ev, add, check);
    else if (platform === "Google Ads") validateAds(tag, p, ev, add, check);
    else if (platform === "Floodlight") validateFloodlight(tag, p, add, check);
    else if (platform === "TikTok") validateTikTok(tag, p, ev, add, check);
    else if (platform === "Server Side") {
      if (!ev && !has(p.event_name) && !has(p.en) && !has(p.event)) add("medium", "Evento sem nome", "O hit server-side não informa event_name.", "Envie event_name no payload.", "event_name");
      check("Evento", ev, ev ? "ok" : "warn");
    } else if (platform === "GTM") {
      check("Container", tag.trackingId, /^GTM-/.test(tag.trackingId || "") ? "ok" : "warn");
    }

    /* ---------- context (informational, never penalised heavily) ---------- */
    const isConversion = /purchase|lead|sign_?up|complete_?registration|checkout|add_?to_?cart|conversion/i.test(ev) || platform === "Google Ads" || platform === "Floodlight";
    if (isConversion && !tag.dataLayer && platform !== "GTM") add("low", "Sem push de Data Layer associado", "Não houve dataLayer.push com o mesmo nome logo antes do hit.", "Se a tag deveria disparar a partir do Data Layer, confira o push e o gatilho no GTM.", "dataLayer");
    check("Data Layer", tag.dataLayer ? "correlacionado" : "não correlacionado", tag.dataLayer ? "ok" : "info");
    if (platform !== "GTM") check("Container GTM", tag.gtmContainer || "não identificado", tag.gtmContainer ? "ok" : "info");

    const order = { high: 0, medium: 1, low: 2, good: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    const penalty = findings.reduce((n, f) => n + (f.severity === "high" ? 25 : f.severity === "medium" ? 10 : f.severity === "low" ? 3 : 0), 0);
    const score = Math.max(0, 100 - penalty);
    const counts = { high: 0, medium: 0, low: 0, good: 0 };
    findings.forEach((f) => counts[f.severity]++);
    const summary = counts.high ? `${counts.high} problema(s) crítico(s)${counts.medium ? ` e ${counts.medium} de atenção` : ""} em ${platform} · ${ev || "evento"}.`
      : counts.medium ? `${counts.medium} ponto(s) de atenção em ${platform} · ${ev || "evento"}.`
      : `Nenhum problema relevante em ${platform} · ${ev || "evento"} nos dados visíveis pelo navegador.`;
    return { source: "rules", score, summary, counts, findings, checks, recommendations: findings.filter((f) => f.fix && f.severity !== "good").map((f) => f.fix) };
  }

  /* ---------------------------------- GA4 ---------------------------------- */
  function validateGa4(tag, p, ev, add, check, ctx) {
    const tid = str(p.tid) || tag.trackingId || "";
    if (!tid) add("high", "Measurement ID ausente", "O hit não tem tid.", "Configure o Measurement ID (G-XXXX) na tag do Google.", "tid");
    else if (!/^G-[A-Z0-9]+$/i.test(tid) && !/^GT-/i.test(tid)) add("medium", "Measurement ID fora do padrão", `tid = ${tid}`, "Use o ID do fluxo de dados web (G-XXXX).", "tid");
    check("Measurement ID", tid, tid ? "ok" : "error");

    if (!ev) add("high", "Evento sem nome", "O hit não tem en.", "", "en");
    else {
      let bad = false;
      if (ev.length > 40) { bad = true; add("high", "Nome do evento com mais de 40 caracteres", `“${ev}” tem ${ev.length} caracteres; o GA4 limita a 40.`, "Encurte o nome do evento.", "en"); }
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(ev)) { bad = true; add("high", "Nome do evento com caracteres inválidos", "No GA4 o nome deve começar com letra e ter só letras, números e _.", "Renomeie usando snake_case (ex.: form_submit).", "en"); }
      if (/^(ga_|google_|firebase_)/i.test(ev)) { bad = true; add("high", "Prefixo reservado no nome do evento", "Prefixos ga_, google_ e firebase_ são reservados.", "Renomeie o evento.", "en"); }
      if (GA4_RESERVED.includes(ev)) { bad = true; add("medium", "Nome de evento reservado", `“${ev}” é coletado automaticamente pelo GA4.`, "Não envie este evento manualmente.", "en"); }
      const caseTwin = GA4_RECOMMENDED.find((r) => r !== ev && norm(r) === norm(ev));
      if (caseTwin) { bad = true; add("high", "Evento recomendado escrito diferente", `“${ev}” não é reconhecido como “${caseTwin}” (o GA4 diferencia maiúsculas e sublinhados).`, `Envie exatamente “${caseTwin}” para ativar os relatórios padrão.`, "en"); }
      check("Evento", ev, bad ? "error" : "ok", GA4_RECOMMENDED.includes(ev) ? "recomendado" : "personalizado");
    }

    /* parameter name / value limits */
    Object.keys(p).filter((k) => /^epn?\./.test(k)).forEach((k) => {
      const name = k.replace(/^epn?\./, ""), val = str(p[k]);
      if (name.length > 40) add("medium", "Nome de parâmetro com mais de 40 caracteres", `${name} (${name.length})`, "O GA4 descarta parâmetros com nome acima de 40 caracteres.", k);
      if (/^ep\./.test(k) && val.length > 100) add("medium", "Valor de parâmetro com mais de 100 caracteres", `${name}: ${val.length} caracteres serão truncados.`, "Reduza o valor ou envie um identificador.", k);
    });

    const evLower = ev.toLowerCase();
    if (GA4_MONETARY.includes(evLower)) {
      const rawValue = p["epn.value"] ?? p["ep.value"] ?? p.value;
      const money = parseMoney(rawValue);
      const currency = str(p.cu) || str(p["ep.currency"]) || str(p.currency);
      if (money.present) {
        if (!money.ok) add("high", "value inválido", `value = “${money.raw}” ${money.reason}.`, "Envie value como número com ponto decimal (ex.: 199.9), sem símbolo de moeda.", "value");
        else if (p["ep.value"] !== undefined && p["epn.value"] === undefined) add("medium", "value enviado como texto", "Chegou como ep.value (string) em vez de epn.value (número).", "No Data Layer/GTM envie value como número, não como texto.", "value");
        if (!currency) add("high", "value sem currency", "Com value e sem currency o GA4 não registra a receita.", "Envie currency (ex.: BRL).", "currency");
        if (evLower === "purchase" && money.ok && money.number === 0) add("medium", "purchase com value 0", "A compra foi registrada sem receita.", "Confira a variável de valor do pedido.", "value");
      } else if (evLower === "purchase" || evLower === "refund") add("high", `${evLower} sem value`, "Sem value a receita não é contabilizada.", "Envie value (número) e currency.", "value");
      if (currency && !isCurrency(currency)) add("high", "currency fora do padrão ISO 4217", `currency = “${currency}”.`, "Use 3 letras maiúsculas (BRL, USD, EUR).", "currency");
      check("value", money.present ? money.raw : "", !money.present ? (["purchase", "refund"].includes(evLower) ? "error" : "info") : money.ok ? "ok" : "error");
      check("currency", currency, currency ? (isCurrency(currency) ? "ok" : "error") : money.present ? "error" : "info");
    }
    if (evLower === "purchase" || evLower === "refund") {
      const tx = str(p["ep.transaction_id"]) || str(p.transaction_id);
      if (!tx) add("high", "transaction_id ausente", "Sem transaction_id o GA4 não deduplica compras repetidas (ex.: recarregar a página de obrigado).", "Envie ep.transaction_id com o número do pedido.", "transaction_id");
      check("transaction_id", tx, tx ? "ok" : "error");
    }
    if (GA4_ECOMMERCE.includes(evLower)) {
      const items = parseGa4Items(p);
      if (!items.length) add(evLower === "purchase" ? "high" : "medium", "Evento de e-commerce sem items", "Nenhum item (pr1, pr2…) foi enviado; os relatórios de produto ficam vazios.", "Envie o array items no evento (ecommerce.items).", "items");
      const broken = items.filter((i) => !i.id && !i.name);
      if (broken.length) add("high", "Item sem item_id e item_name", `${broken.length} item(ns) sem identificação (${broken.map((i) => i.key).join(", ")}).`, "Cada item precisa de item_id ou item_name.", "items");
      const badPrice = items.filter((i) => i.price !== undefined && !/^-?\d+(\.\d+)?$/.test(i.price));
      if (badPrice.length) add("medium", "Preço de item inválido", `price em ${badPrice.map((i) => i.key).join(", ")} não é numérico.`, "Envie price como número com ponto decimal.", "items");
      check("items", items.length ? `${items.length} item(ns)` : "", items.length && !broken.length ? "ok" : items.length ? "error" : evLower === "purchase" ? "error" : "warn");
    }

    /* Data Layer × hit consistency */
    const dl = dlEcommerce(tag.dataLayer);
    if (dl) {
      const hitValue = parseMoney(p["epn.value"] ?? p["ep.value"]);
      const dlValue = Number(dl.value);
      if (dl.value !== undefined && hitValue.ok && Number.isFinite(dlValue) && Math.abs(dlValue - hitValue.number) > 0.009) add("high", "value diferente do Data Layer", `Data Layer: ${dl.value} · hit: ${hitValue.raw}.`, "A variável do GTM não está lendo ecommerce.value (ou está lendo um push antigo).", "value");
      const hitCur = str(p.cu) || str(p["ep.currency"]);
      if (dl.currency && hitCur && String(dl.currency) !== hitCur) add("medium", "currency diferente do Data Layer", `Data Layer: ${dl.currency} · hit: ${hitCur}.`, "", "currency");
      const hitTx = str(p["ep.transaction_id"]);
      if (dl.transaction_id && hitTx && String(dl.transaction_id) !== hitTx) add("high", "transaction_id diferente do Data Layer", `Data Layer: ${dl.transaction_id} · hit: ${hitTx}.`, "", "transaction_id");
      if (dl.transaction_id && !hitTx && evLower === "purchase") add("high", "transaction_id existe no Data Layer mas não foi enviado", `Data Layer tem ${dl.transaction_id}.`, "Mapeie ecommerce.transaction_id na tag de purchase.", "transaction_id");
      const nItems = parseGa4Items(p).length;
      if (Array.isArray(dl.items) && dl.items.length && nItems && dl.items.length !== nItems) add("medium", "Quantidade de items diferente do Data Layer", `Data Layer: ${dl.items.length} · hit: ${nItems}.`, "", "items");
    }

    /* consent mode (gcs = G1<ad><analytics>, gcd = consent mode v2 string) */
    const gcs = str(p.gcs), gcd = str(p.gcd);
    if (gcs) {
      const ad = gcs[2], an = gcs[3];
      check("Consent Mode", `${gcs}${gcd ? " · v2" : ""}`, "info", `ads: ${ad === "1" ? "concedido" : "negado"} · analytics: ${an === "1" ? "concedido" : "negado"}`);
      if (an === "0") add("low", "analytics_storage negado", "O hit foi enviado sem cookies (ping de consent mode); o GA4 modela esses usuários.", "", "gcs");
    } else if (gcd) check("Consent Mode", "v2 (gcd)", "ok");
    else { check("Consent Mode", "não detectado", "warn"); add("low", "Consent Mode não detectado", "O hit não tem gcs/gcd.", "Implemente o Consent Mode v2 (default + update) antes da tag do Google, conforme a sua CMP.", "gcs"); }
    if (has(p._dbg) || has(p["ep.debug_mode"])) check("DebugView", "ativo", "info");
  }

  /* ---------------------------------- Meta --------------------------------- */
  function validateMeta(tag, p, ev, add, check) {
    const id = str(p.id) || tag.trackingId || "";
    if (!id) add("high", "Pixel ID ausente", "O hit não tem id.", "Confira o ID do Pixel na tag.", "id");
    else if (!/^\d{10,20}$/.test(id)) add("medium", "Pixel ID fora do padrão", `id = ${id}`, "O Pixel ID é numérico (15–16 dígitos).", "id");
    check("Pixel ID", id, id ? "ok" : "error");
    if (!ev) add("high", "Evento sem nome", "O hit não tem ev.", "", "ev");
    const twin = META_STANDARD.find((s) => s !== ev && s.toLowerCase() === ev.toLowerCase());
    if (twin) add("high", "Evento padrão escrito diferente", `“${ev}” vira evento personalizado; o padrão é “${twin}”.`, `Use exatamente “${twin}” (com maiúsculas) para otimização e relatórios.`, "ev");
    check("Evento", ev, twin ? "error" : ev ? "ok" : "error", META_STANDARD.includes(ev) ? "padrão" : "personalizado");

    const money = parseMoney(p["cd[value]"] ?? p.value);
    const currency = str(p["cd[currency]"]) || str(p.currency);
    if (ev === "Purchase") {
      if (!money.present) add("high", "Purchase sem value", "Purchase exige value e currency.", "Envie cd[value] (número) e cd[currency].", "value");
      if (!currency) add("high", "Purchase sem currency", "Purchase exige currency.", "Envie cd[currency] (ex.: BRL).", "currency");
    }
    if (money.present && !money.ok) add("high", "value inválido", `value = “${money.raw}” ${money.reason}.`, "Envie value como número com ponto decimal.", "value");
    if (currency && !isCurrency(currency)) add("high", "currency fora do padrão ISO 4217", `currency = “${currency}”.`, "Use 3 letras maiúsculas.", "currency");
    if (money.present || ev === "Purchase") { check("value", money.raw, money.ok ? "ok" : "error"); check("currency", currency, currency && isCurrency(currency) ? "ok" : "error"); }

    if (META_CONVERSION.includes(ev)) {
      const eid = str(p.eid) || str(p.event_id);
      if (!eid) add("medium", "Sem event_id (eid)", "Sem event_id a Meta não consegue deduplicar este evento com o mesmo evento enviado pela Conversions API.", "Gere um event_id único por evento e envie o mesmo valor no Pixel e na CAPI.", "eid");
      check("event_id", eid, eid ? "ok" : "warn", "deduplicação com CAPI");
    }
    if (META_CATALOG.includes(ev)) {
      const ids = str(p["cd[content_ids]"]) || str(p["cd[contents]"]);
      if (!ids) add("low", "Sem content_ids", "Anúncios de catálogo (Advantage+) dependem de content_ids/contents.", "Envie content_ids com os mesmos IDs do catálogo.", "content_ids");
      check("content_ids", ids ? "presente" : "", ids ? "ok" : "warn");
    }
    if (!has(p.fbp)) { add("low", "Sem _fbp", "O hit não tem fbp (cookie do navegador); a qualidade de correspondência cai.", "Verifique se o cookie _fbp está sendo criado (consentimento/bloqueio).", "fbp"); }
    check("_fbp", has(p.fbp) ? "presente" : "", has(p.fbp) ? "ok" : "warn");
  }

  /* ------------------------------- Google Ads ------------------------------ */
  function validateAds(tag, p, ev, add, check) {
    const id = tag.conversionId || tag.trackingId || "";
    const label = str(p.label) || tag.conversionLabel || "";
    const remarketing = /viewthroughconversion/.test(String(tag.endpoint || tag.path || ""));
    if (!id) add("high", "Conversion ID ausente", "", "Confira o ID de conversão (AW-XXXX).", "conversion_id");
    check("Conversion ID", id, id ? "ok" : "error");
    if (!label && !remarketing) add("high", "Conversion label ausente", "Sem label a conversão não é atribuída a uma ação.", "Configure o rótulo da conversão na tag.", "label");
    check("Label", label || (remarketing ? "remarketing" : ""), label || remarketing ? "ok" : "error");
    const money = parseMoney(p.value);
    const currency = str(p.currency_code) || str(p.currency);
    if (money.present && !money.ok) add("high", "value inválido", `value = “${money.raw}” ${money.reason}.`, "Envie value como número.", "value");
    if (money.present && !currency) add("medium", "value sem currency_code", "", "Envie currency_code.", "currency_code");
    if (money.present) { check("value", money.raw, money.ok ? "ok" : "error"); check("currency", currency, currency ? "ok" : "warn"); }
    const oid = str(p.oid) || str(p.transaction_id);
    if (label && !oid) add("low", "Sem transaction_id (oid)", "Sem oid o Google Ads não deduplica conversões repetidas.", "Envie o ID do pedido em transaction_id.", "oid");
    if (label) check("transaction_id (oid)", oid, oid ? "ok" : "warn");
  }

  /* ------------------------------- Floodlight ------------------------------ */
  function validateFloodlight(tag, p, add, check) {
    [["src", "Advertiser ID"], ["type", "Grupo (type)"], ["cat", "Atividade (cat)"]].forEach(([k, label]) => {
      if (!has(p[k])) add("high", `${label} ausente`, `Parâmetro ${k} não enviado.`, "Confira a configuração da tag Floodlight.", k);
      check(label, str(p[k]), has(p[k]) ? "ok" : "error");
    });
    if (!has(p.ord) && !has(p.num)) add("medium", "Sem ord/num", "Sem ord (vendas) ou num (contadores) o Floodlight não deduplica.", "Envie ord com o ID do pedido ou um número aleatório.", "ord");
    check("ord / num", str(p.ord) || str(p.num), has(p.ord) || has(p.num) ? "ok" : "warn");
  }

  /* --------------------------------- TikTok -------------------------------- */
  function validateTikTok(tag, p, ev, add, check) {
    const code = tag.trackingId || "";
    if (!code) add("high", "Pixel code ausente", "", "Confira o código do pixel TikTok.", "pixel_code");
    check("Pixel code", code, code ? "ok" : "error");
    check("Evento", ev, ev ? "ok" : "error");
    const j = p._json || {};
    const eid = str(p.event_id) || str(j.event_id);
    if (/CompletePayment|PlaceAnOrder|SubmitForm|CompleteRegistration/i.test(ev) && !eid) add("medium", "Sem event_id", "Sem event_id não há deduplicação com a Events API.", "Envie o mesmo event_id no pixel e na Events API.", "event_id");
  }

  const api = { validateTag, parseGa4Items, parseMoney, dlEcommerce };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VentusValidator = api;
})(typeof window !== "undefined" ? window : globalThis);
