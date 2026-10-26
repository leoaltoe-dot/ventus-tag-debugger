/* Ventus Tag Debugger — background service worker (v5.4) */
const MAX_EVENTS = 8000;
const VENTUS_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 750;
const REFRESH_DEBOUNCE_MS = 400;
const PENDING_REQUEST_TTL_MS = 5 * 60 * 1000;

let ventusEnabled = true;
let events = [];
/* requestId -> array of events (parent + GA4 batch children) still waiting for headers/status */
const pendingRequests = new Map();

/* FIX: the service worker can wake up because of a webRequest/message before the
   history is read from storage. Previously, events captured in that window were
   pushed into an empty array and the next persist() overwrote the whole saved
   history. Everything that touches `events` now waits for this promise. */
const ready = new Promise((resolve) => {
  chrome.storage.local.get(["ventusEvents", "ventusEnabled"], (result) => {
    ventusEnabled = result?.ventusEnabled !== false;
    const stored = Array.isArray(result?.ventusEvents) ? result.ventusEvents.filter(Boolean) : [];
    /* keep anything captured while loading (should be none, but be safe) */
    events = stored.concat(events).slice(-MAX_EVENTS);
    pruneExpiredEvents();
    resolve();
  });
});

let persistTimer = null;
function persist() {
  /* FIX: storage.local.set with up to 8000 events ran on every request and every
     header/status update. Writes are now debounced. */
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.local.set({ ventusEvents: events }, () => {
      const err = chrome.runtime.lastError;
      if (err && /quota/i.test(err.message || "")) {
        /* FIX: quota errors were silent and the history stopped being saved */
        events = events.slice(-Math.floor(events.length / 2));
        chrome.storage.local.set({ ventusEvents: events }, () => void chrome.runtime.lastError);
      }
    });
  }, PERSIST_DEBOUNCE_MS);
}

let refreshTimer = null;
function scheduleRefresh() {
  /* FIX: VENTUS_REFRESH was broadcast for every header/status update, forcing the
     popup to reload thousands of events several times per request. */
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: "VENTUS_REFRESH" }).catch(() => {});
  }, REFRESH_DEBOUNCE_MS);
}

function broadcast(record) {
  chrome.runtime.sendMessage({ type: "VENTUS_NEW_EVENT", payload: record }).catch(() => {});
}

function pruneExpiredEvents() {
  const cutoff = Date.now() - VENTUS_HISTORY_TTL_MS;
  const before = events.length;
  events = events.filter((e) => e && Number(e.timestamp || 0) >= cutoff);
  if (events.length !== before) {
    persist();
    scheduleRefresh();
  }
  /* drop pending entries that never completed */
  const pendingCutoff = Date.now() - PENDING_REQUEST_TTL_MS;
  for (const [id, list] of pendingRequests) {
    if (!list.length || Number(list[0].timestamp || 0) < pendingCutoff) pendingRequests.delete(id);
  }
}

function save(record) {
  if (!record || !ventusEnabled) return;
  events.push(record);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  if (record.type === "network" && record.requestId) {
    const list = pendingRequests.get(record.requestId) || [];
    list.push(record);
    pendingRequests.set(record.requestId, list);
  }
  persist();
  broadcast(record);
}

function scheduleHistoryCleanup() {
  chrome.alarms.create("ventus-history-cleanup", { delayInMinutes: 1, periodInMinutes: 60 });
}

scheduleHistoryCleanup();
chrome.runtime.onInstalled.addListener(() => { scheduleHistoryCleanup(); ready.then(pruneExpiredEvents); });
chrome.runtime.onStartup.addListener(() => { scheduleHistoryCleanup(); ready.then(pruneExpiredEvents); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ventus-history-cleanup") ready.then(pruneExpiredEvents);
});

/* ---- detecção de plataformas (inalterada) ---- */
function append(obj, key, value) { if (obj[key] === undefined) obj[key] = value; else if (Array.isArray(obj[key])) obj[key].push(value); else obj[key] = [obj[key], value]; }
function safeUrl(url) { try { return new URL(url); } catch (_) { return null; } }
function hostFrom(url) { return safeUrl(url)?.hostname || ""; }
function pageContext(details) { const contextUrl = details.documentUrl || details.initiator || ""; return { pageUrl: contextUrl, siteHost: hostFrom(contextUrl) || "site-desconhecido" }; }
function parseQuery(url) { const out = {}; const u = safeUrl(url); if (!u) return out; for (const [k,v] of u.searchParams.entries()) append(out,k,v); return out; }
function rawBodyText(requestBody) { if (!requestBody?.raw?.length) return ""; try { const chunks=requestBody.raw.filter(x=>x?.bytes).map(x=>new Uint8Array(x.bytes)); const total=chunks.reduce((n,c)=>n+c.length,0); const merged=new Uint8Array(total); let offset=0; for(const c of chunks){merged.set(c,offset);offset+=c.length;} return new TextDecoder('utf-8').decode(merged);} catch(_){return "";} }
function parseBody(details) {
  const body=details.requestBody; if(!body)return {}; if(body.formData)return body.formData;
  const text=rawBodyText(body).trim(); if(!text)return {};
  if(text.startsWith('{')||text.startsWith('[')){try{return {_json:JSON.parse(text)}}catch(_){}}
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length>1){return {_batch:lines.map(line=>{const row={};try{const sp=new URLSearchParams(line);for(const[k,v]of sp.entries())append(row,k,v);}catch(_){row._raw=line;}return row;})};}
  if(text.includes('=')){try{const out={};const sp=new URLSearchParams(text);for(const[k,v]of sp.entries())append(out,k,v);if(Object.keys(out).length)return out;}catch(_){}}
  return {_raw:text};
}
function mergeParams(query,body){const out={...query};if(body?._json&&typeof body._json==='object'&&!Array.isArray(body._json)){for(const[k,v]of Object.entries(body._json))if(out[k]===undefined&&(v===null||typeof v!=='object'))out[k]=v;}if(Array.isArray(body?._batch)){out._batch=body._batch;const firstRow=body._batch[0]||{};for(const[k,v]of Object.entries(firstRow))if(out[k]===undefined)out[k]=v;}else{for(const[k,v]of Object.entries(body||{})){if(out[k]===undefined)out[k]=v;else out[`body.${k}`]=v;}}return out;}
function first(v){if(Array.isArray(v))return v[0]??"";if(v===undefined||v===null)return "";return String(v);}
/* ---- v5.7: server-side tagging (sGTM) detection ---------------------------------- */
/* Hosts of the vendors themselves: a hit going here is browser → vendor (direct). */
const VENDOR_HOSTS=['google-analytics.com','analytics.google.com','googletagmanager.com','googleadservices.com','doubleclick.net','google.com','facebook.com','facebook.net','tiktok.com','tiktokw.us','bing.com','linkedin.com','licdn.com','twitter.com','x.com','pinterest.com','snapchat.com','reddit.com','redditstatic.com'];
/* Analytics / monitoring products that use /track, /collect, /event paths but are NOT server-side tagging. */
const NON_SS_HOSTS=['segment.io','segment.com','mixpanel.com','clarity.ms','amplitude.com','rudderstack.com','rudderlabs.com','posthog.com','hotjar.com','hotjar.io','sentry.io','nr-data.net','newrelic.com','datadoghq.com','datadoghq.eu','browser-intake-datadoghq.com','heap.io','heapanalytics.com','fullstory.com','intercom.io','hubspot.com','hs-analytics.net','hs-banner.com','mouseflow.com','smartlook.com','smartlook.cloud','logrocket.io','lr-ingest.io','lr-in.com','braze.com','onesignal.com','pendo.io','optimizely.com','visualwebsiteoptimizer.com','cloudflareinsights.com','yandex.ru','yandex.com','matomo.cloud','plausible.io','statsig.com','launchdarkly.com','bugsnag.com','rollbar.com','doubleverify.com','adsrvr.org','criteo.com','criteo.net','taboola.com','outbrain.com','quantserve.com','scorecardresearch.com','zendesk.com','zdassets.com','rdstation.com.br','rdstation.com','vtex.com.br','vtexcommercestable.com.br','shopify.com','shopifysvc.com','nuvemshop.com.br','cookiebot.com','onetrust.com','cookielaw.org'];
const SS_PROVIDERS=[[/(^|\.)stape\.(io|net|dev)$/,'Stape'],[/\.run\.app$/,'Google Cloud Run'],[/\.appspot\.com$/,'Google App Engine'],[/\.a\.run\.app$/,'Google Cloud Run'],[/(^|\.)addingwell\.(com|io)$/,'Addingwell'],[/(^|\.)tagserver\.|(^|\.)taggrs\./,'TAGGRS'],[/\.azurewebsites\.net$/,'Azure App Service'],[/\.herokuapp\.com$/,'Heroku'],[/\.amazonaws\.com$/,'AWS']];
function hostIn(host,list){host=String(host||'').toLowerCase();return list.some(d=>host===d||host.endsWith('.'+d));}
/* eTLD+1 heuristic good enough for first/third-party: handles com.br, co.uk, com.au… */
function registrableDomain(host){const h=String(host||'').toLowerCase().replace(/\.$/,'');if(!h||/^[\d.]+$/.test(h)||h.includes(':'))return h;const p=h.split('.');if(p.length<=2)return h;const last2=p.slice(-2).join('.');if(/^(com|net|org|gov|edu|co|ac|art|blog|eco|ind|inf|jus|leg|mil|nom|tur|ne|or|go|gob|gv)\.[a-z]{2}$/.test(last2))return p.slice(-3).join('.');return last2;}
function ga4Signature(params){const tid=first(params.tid);return first(params.v)==='2'&&/^G(T)?-[A-Z0-9]+$/i.test(tid)&&!!(first(params.en)||params._p||params.cid);}
function looksLikeGA4(params,url){const tid=first(params.tid),version=first(params.v),event=first(params.en);const idLooksGA=/^G-[A-Z0-9]+$/i.test(tid)||/^GT-[A-Z0-9]+$/i.test(tid);const signature=(version==='2'&&!!tid)||(idLooksGA&&!!event)||(!!params._p&&!!tid&&!!params.cid);const path=safeUrl(url)?.pathname||"";
  /* v5.7: sGTM can expose the GA4 client on any path (e.g. /x9k2); a full v=2 + G-tid + en/cid signature is enough */
  return (signature&&/\/(g\/)?collect/i.test(path))||(ga4Signature(params)&&!hostIn(safeUrl(url)?.hostname,NON_SS_HOSTS));}
function isCustomHost(host){return !hostIn(host,VENDOR_HOSTS)&&!hostIn(host,NON_SS_HOSTS);}
function gtmLoaderId(url,params){const id=first(params.id);if(!/^GTM-[A-Z0-9]+$/i.test(id))return '';const path=(safeUrl(url)?.pathname||'').toLowerCase();return (path.endsWith('.js')||path.endsWith('/gtm')||path==='/'||/^\/[a-z0-9_-]{3,}$/i.test(path))?id:'';}
function looksLikeServerSideEndpoint(url,params){const u=safeUrl(url);if(!u)return false;const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();if(!isCustomHost(host))return false;
  const collectionPath=/\/g\/collect|\/collect\/?$|\/mp\/collect|\/events?(\/|$)|\/track(\/|$)|\/pixel(\/|$)|\/data\/?$|\/capi(\/|$)/.test(path);
  const trackingSignature=!!(params.tid||params.en||params.event_name||params.pixel_id||params.fbp||params.fbc||params.gclid||params.conversion_id||params.event_id||params['user_data.fbp']);
  return collectionPath&&trackingSignature;}
/* Returns what can be proven from the browser about a request going to a server-side container. */
function serverSideInfo(url,params,pageUrl,platform){const u=safeUrl(url);const host=(u?.hostname||'').toLowerCase();const pageHost=hostFrom(pageUrl||'');
  const out={isServerSide:false,host,party:null,provider:'',signals:[],preview:false,cookies:[]};
  if(!u||!isCustomHost(host))return out;
  const keys=Object.keys(params||{});const path=u.pathname.toLowerCase();
  if(platform==='GA4')out.signals.push('Hit GA4 (Measurement Protocol v2) enviado para domínio que não é do Google');
  if(keys.some(k=>/^sst\./.test(k)))out.signals.push('Parâmetros sst.* (gerados pela tag do Google quando há server container)');
  if(platform==='GTM')out.signals.push('Container GTM servido pelo próprio servidor (loader first-party)');
  if(/\/data\/?$/.test(path)&&params.event_name)out.signals.push('Formato do Stape Data Tag (/data + event_name)');
  if(platform==='Meta')out.signals.push('Evento Meta enviado para domínio próprio (gateway / CAPI)');
  if(platform==='Google Ads'||platform==='Floodlight')out.signals.push(`Hit ${platform} roteado por domínio próprio`);
  if(!out.signals.length&&looksLikeServerSideEndpoint(url,params))out.signals.push('Endpoint de coleta com parâmetros de tracking em domínio próprio');
  out.isServerSide=out.signals.length>0;
  if(out.isServerSide){out.party=pageHost&&registrableDomain(host)===registrableDomain(pageHost)?'first':'third';const pv=SS_PROVIDERS.find(([re])=>re.test(host));out.provider=pv?pv[1]:'';}
  return out;}
function detectMeta(url,params){const u=safeUrl(url);const host=u?.hostname?.toLowerCase()||"";const path=u?.pathname?.toLowerCase()||"";if(host.endsWith('facebook.com')&&(path==='/tr/'||path==='/tr'||path.startsWith('/tr/')))return true;if(host.endsWith('facebook.com')&&path.includes('/privacy_sandbox/pixel/register/trigger'))return true;if(host.endsWith('facebook.com')&&(path.includes('/pixel/')||path.includes('/events/'))&&(params.id||params.ev||params.event||params.event_name))return true;const metaSignature=!!(params.event_name||params.event||params.ev)&&!!(params.pixel_id||params.pixelId||params.meta_pixel_id||params.fb_pixel_id||params.fbp||params.fbc||params['user_data.fbp']||params['user_data.fbc']);if(metaSignature)return true;return false;}
function detectPlatform(url,params){const u=String(url||'').toLowerCase();if(looksLikeGA4(params,url))return 'GA4';if(u.includes('google-analytics.com/g/collect')||u.includes('google-analytics.com/collect')||u.includes('region1.google-analytics.com/g/collect'))return 'GA4';if(detectMeta(url,params))return 'Meta';if(u.includes('/pagead/viewthroughconversion/')||u.includes('googleadservices.com/pagead/conversion')||u.includes('googleads.g.doubleclick.net/pagead/conversion')||u.includes('google.com/pagead/1p-conversion')||u.includes('google.com/pagead/conversion'))return 'Google Ads';if(u.includes('fls.doubleclick.net/activity')||(u.includes('doubleclick.net')&&u.includes('/activity')))return 'Floodlight';if(u.includes('googletagmanager.com/gtm.js')||u.includes('googletagmanager.com/gtag/js'))return 'GTM';if(isCustomHost(safeUrl(url)?.hostname)&&gtmLoaderId(url,params))return 'GTM';if(u.includes('analytics.tiktok.com'))return 'TikTok';if(looksLikeServerSideEndpoint(url,params))return 'Server Side';return null;}
function adsId(url){const path=safeUrl(url)?.pathname||"";const m=path.match(/\/(?:1p-|viewthrough)?conversion\/(\d+)/);return m?m[1]:"";}
function identify(platform,url,p){let eventName="",trackingId="",conversionId="",conversionLabel="";if(platform==='GA4'){eventName=first(p.en)||first(p.event_name)||'GA4 request';trackingId=first(p.tid);}if(platform==='Meta'){eventName=first(p.ev)||first(p.event)||first(p.event_name)||'Meta Pixel';trackingId=first(p.id)||first(p.pixel_id)||first(p.pixelId)||first(p.meta_pixel_id)||first(p.fb_pixel_id);if(eventName==='Meta Pixel'&&String(url).includes('/privacy_sandbox/pixel/register/trigger'))eventName='Meta Pixel Trigger';}if(platform==='Google Ads'){conversionId=first(p.conversion_id)||adsId(url);conversionLabel=first(p.label);trackingId=conversionId;eventName=conversionLabel?'conversion':(first(p.en)||'Google Ads request');}if(platform==='Floodlight'){eventName=first(p.cat)||first(p.type)||'Floodlight activity';trackingId=first(p.src);conversionId=trackingId;conversionLabel=first(p.cat);}if(platform==='GTM'){eventName='gtm.js';trackingId=first(p.id);}if(platform==='TikTok'){const j=p._json||{};eventName=first(p.event)||first(p.ev)||String(j.event||'')||'TikTok request';trackingId=first(p.pixel_code)||first(p.pixel_id)||String(j.context?.pixel?.code||j.pixel_code||'');}if(platform==='Server Side'){eventName=first(p.en)||first(p.event_name)||first(p.event)||'Server-side event';trackingId=first(p.tid)||first(p.pixel_id)||first(p.conversion_id)||'';}return{eventName,trackingId,conversionId,conversionLabel};}
function classifyHttpStatus(statusCode){const code=Number(statusCode);if(!Number.isFinite(code))return'pending';if(code>=200&&code<400)return'success';if(code>=400&&code<500)return'client_error';if(code>=500)return'server_error';return'other';}function classifyNetworkError(errorText){const value=String(errorText||'').toLowerCase();if(value.includes('blocked_by_client')||value.includes('blocked_by_response')||value.includes('blocked'))return'blocked';if(value.includes('aborted')||value.includes('cancel'))return'cancelled';if(value.includes('timed_out')||value.includes('timeout'))return'timeout';return'network_error';}
/* FIX: header/status updates used to scan the whole history (up to 8000 events)
   for EVERY request the browser made on any site. Only tracked requests are kept
   in a Map now, so untracked traffic costs a single lookup. */
function updateMatchingRequest(requestId, patch, done = false) {
  const list = pendingRequests.get(requestId);
  if (!list) return;
  list.forEach((event) => Object.assign(event, patch));
  if (done) pendingRequests.delete(requestId);
  persist();
  scheduleRefresh();
}

/* v5.7: cookie values are never stored (they were saved in plain text for every tracking
   request). Names and Set-Cookie attributes (Domain, Max-Age, SameSite…) are kept because
   they are what matters when debugging first-party cookies set by a server container. */
function maskCookieHeader(name, value) {
  const n = String(name || "").toLowerCase();
  if (n === "cookie") return String(value || "").split(/;\s*/).filter(Boolean).map((c) => c.split("=")[0] + "=•••").join("; ");
  if (n === "set-cookie") return String(value || "").replace(/^([^=;]+)=[^;]*/, "$1=•••");
  return value || "";
}
function headersToObject(list) {
  const headers = {};
  (list || []).forEach((h) => append(headers, h.name, maskCookieHeader(h.name, h.value)));
  return headers;
}
const FP_COOKIE_RE = /^(FPID|FPLC|FPAU|FPGSID|FPGCL[A-Z]*|_fplc|_sbp|stape)$/i;

chrome.webRequest.onBeforeRequest.addListener((details) => {
  ready.then(() => {
    if (!ventusEnabled) return;
    /* v5.7: CORS preflights are not hits (a beacon with a custom header showed up twice) */
    if (details.method === "OPTIONS") return;
    /* v5.7: redirects (HSTS upgrade, Google Ads 1p-conversion chain…) fire onBeforeRequest again
       with the same requestId; record the hop instead of creating a duplicate event */
    const already = pendingRequests.get(details.requestId);
    if (already) {
      already.forEach((ev) => { ev.redirects = [...(ev.redirects || []), details.url].slice(-10); });
      persist(); scheduleRefresh();
      return;
    }
    const queryParams = parseQuery(details.url);
    const bodyParams = parseBody(details);
    const allParams = mergeParams(queryParams, bodyParams);
    const platform = detectPlatform(details.url, allParams);
    if (!platform) return;

    const info = identify(platform, details.url, allParams);
    const u = safeUrl(details.url);
    const context = pageContext(details);
    const now = Date.now();
    const record = {
      id: crypto.randomUUID(), type: "network", timestamp: now, requestId: details.requestId,
      tabId: details.tabId, frameId: details.frameId, siteHost: context.siteHost, pageUrl: context.pageUrl,
      platform, eventName: info.eventName, trackingId: info.trackingId, conversionId: info.conversionId,
      conversionLabel: info.conversionLabel, method: details.method, url: details.url, host: u?.host || "",
      path: u?.pathname || "", requestType: details.type, initiator: details.initiator || "",
      queryParams, bodyParams, allParams, requestHeaders: {}, responseHeaders: {}, status: null,
      statusCategory: "pending", error: null, startedAt: now,
      serverSide: serverSideInfo(details.url, allParams, context.pageUrl, platform),
      transport: "browser-direct"
    };
    record.transport = record.serverSide.isServerSide ? "server-side-ingress" : "browser-direct";
    save(record);

    if (platform === "GA4" && Array.isArray(bodyParams?._batch) && bodyParams._batch.length > 1) {
      /* FIX: the parent record kept the batch's first event name but its allParams
         mixed every row; children now also keep startedAt so duration is correct. */
      bodyParams._batch.slice(1).forEach((row, index) => {
        const p = { ...queryParams, ...row };
        save({
          ...record, id: crypto.randomUUID(), timestamp: now + index + 1,
          eventName: first(p.en) || "GA4 batch event", trackingId: first(p.tid) || info.trackingId,
          allParams: p, bodyParams: row, batchChild: true, serverSide: { ...record.serverSide, signals: [...record.serverSide.signals], cookies: [] }
        });
      });
    }
  });
}, { urls: ["<all_urls>"] }, ["requestBody"]);

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  ready.then(() => {
    const list = pendingRequests.get(details.requestId);
    if (!list) return;
    /* v5.7: sGTM preview/debug requests carry the X-Gtm-Server-Preview header */
    const preview = (details.requestHeaders || []).some((h) => /^x-gtm-server-preview$/i.test(h.name));
    if (preview) list.forEach((e) => { if (e.serverSide) e.serverSide.preview = true; });
    updateMatchingRequest(details.requestId, { requestHeaders: headersToObject(details.requestHeaders) });
  });
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);

chrome.webRequest.onHeadersReceived.addListener((details) => {
  ready.then(() => {
    const list = pendingRequests.get(details.requestId);
    if (!list) return;
    /* v5.7: first-party cookies set by the server container (FPID/FPLC from the GA4 client,
       FPGCL* from the conversion linker, Stape's own) prove the response came from sGTM */
    const fp = (details.responseHeaders || []).filter((h) => /^set-cookie$/i.test(h.name))
      .map((h) => String(h.value || "").split("=")[0].trim()).filter((n) => FP_COOKIE_RE.test(n));
    if (fp.length) list.forEach((e) => {
      if (!e.serverSide) return;
      e.serverSide.cookies = [...new Set([...(e.serverSide.cookies || []), ...fp])];
      const sig = "Resposta definiu cookie first-party do server container (" + fp.join(", ") + ")";
      if (!e.serverSide.signals.includes(sig)) e.serverSide.signals.push(sig);
      if (!e.serverSide.isServerSide && isCustomHost(e.serverSide.host)) {
        e.serverSide.isServerSide = true; e.transport = "server-side-ingress";
        e.serverSide.party = registrableDomain(e.serverSide.host) === registrableDomain(e.siteHost) ? "first" : "third";
      }
    });
    updateMatchingRequest(details.requestId, { responseHeaders: headersToObject(details.responseHeaders) });
  });
}, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);

chrome.webRequest.onCompleted.addListener((details) => {
  ready.then(() => {
    const list = pendingRequests.get(details.requestId);
    if (!list) return;
    const completedAt = Date.now();
    const startedAt = list[0].startedAt || list[0].timestamp || completedAt;
    updateMatchingRequest(details.requestId, {
      status: details.statusCode, statusLine: details.statusLine || "",
      statusCategory: classifyHttpStatus(details.statusCode), error: null,
      completedAt, durationMs: Math.max(0, completedAt - startedAt)
    }, true);
  });
}, { urls: ["<all_urls>"] });

chrome.webRequest.onErrorOccurred.addListener((details) => {
  ready.then(() => {
    const list = pendingRequests.get(details.requestId);
    if (!list) return;
    const completedAt = Date.now();
    const startedAt = list[0].startedAt || list[0].timestamp || completedAt;
    updateMatchingRequest(details.requestId, {
      status: "ERROR", statusCategory: classifyNetworkError(details.error),
      error: details.error || "Falha de rede", completedAt, durationMs: Math.max(0, completedAt - startedAt)
    }, true);
  });
}, { urls: ["<all_urls>"] });

function dataLayerEventName(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return String(data.event || data.event_name || "dataLayer.push");
  }
  /* gtag() pushes the `arguments` object: ["event","purchase",{...}] / ["config","G-XXX"] */
  if (Array.isArray(data) && data.length) {
    if (data[0] === "event" && data[1]) return String(data[1]);
    return `gtag ${String(data[0])}`;
  }
  return "dataLayer.push";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("VENTUS_")) return;

  /* FIX: every message handler now waits for the history to be loaded; previously
     the popup could receive an empty list right after the worker woke up. */
  ready.then(() => {
    switch (message.type) {
      case "VENTUS_DATALAYER": {
        const p = message.payload;
        sendResponse({ ok: true });
        if (!p) return;
        const data = p.data;
        const pageUrl = p.url || sender.tab?.url || "";
        save({
          id: crypto.randomUUID(), type: "datalayer", timestamp: Number(p.timestamp) || Date.now(),
          tabId: sender.tab?.id ?? null, frameId: sender.frameId ?? 0,
          siteHost: hostFrom(pageUrl) || "site-desconhecido", pageUrl, platform: "DataLayer",
          eventName: dataLayerEventName(data), source: p.source || "push", data
        });
        return;
      }
      case "VENTUS_SET_ENABLED":
        ventusEnabled = message.enabled !== false;
        chrome.storage.local.set({ ventusEnabled });
        sendResponse({ ok: true, enabled: ventusEnabled });
        chrome.runtime.sendMessage({ type: "VENTUS_ENABLED_CHANGED", enabled: ventusEnabled }).catch(() => {});
        return;
      case "VENTUS_GET_ENABLED":
        sendResponse({ enabled: ventusEnabled });
        return;
      case "VENTUS_GET_EVENTS":
        pruneExpiredEvents();
        sendResponse({ events: events.filter(Boolean) });
        return;
      case "VENTUS_CLEAR_EVENTS":
        events = [];
        pendingRequests.clear();
        persist();
        sendResponse({ ok: true });
        return;
      case "VENTUS_CLEAR_SITE": {
        const site = String(message.siteHost || "");
        events = events.filter((e) => e?.siteHost !== site);
        for (const [id, list] of pendingRequests) {
          if (list.some((e) => e.siteHost === site)) pendingRequests.delete(id);
        }
        persist();
        sendResponse({ ok: true });
        return;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  });
  return true; /* keep the channel open for the async response */
});
