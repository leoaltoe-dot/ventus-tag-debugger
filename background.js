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
function looksLikeGA4(params,url){const tid=first(params.tid),version=first(params.v),event=first(params.en);const idLooksGA=/^G-[A-Z0-9]+$/i.test(tid)||/^GT-[A-Z0-9]+$/i.test(tid);const signature=(version==='2'&&!!tid)||(idLooksGA&&!!event)||(!!params._p&&!!tid&&!!params.cid);const path=safeUrl(url)?.pathname||"";return signature&&/\/(g\/)?collect/i.test(path);}
function detectMeta(url,params){const u=safeUrl(url);const host=u?.hostname?.toLowerCase()||"";const path=u?.pathname?.toLowerCase()||"";if(host.endsWith('facebook.com')&&(path==='/tr/'||path==='/tr'||path.startsWith('/tr/')))return true;if(host.endsWith('facebook.com')&&path.includes('/privacy_sandbox/pixel/register/trigger'))return true;if(host.endsWith('facebook.com')&&(path.includes('/pixel/')||path.includes('/events/'))&&(params.id||params.ev||params.event||params.event_name))return true;const metaSignature=!!(params.event_name||params.event||params.ev)&&!!(params.pixel_id||params.pixelId||params.meta_pixel_id||params.fb_pixel_id||params.fbp||params.fbc||params['user_data.fbp']||params['user_data.fbc']);if(metaSignature)return true;return false;}
function looksLikeServerSideEndpoint(url,params){const u=safeUrl(url);if(!u)return false;const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase();const knownVendorHost=host.includes('google-analytics.com')||host.includes('facebook.com')||host.includes('googleadservices.com')||host.includes('doubleclick.net')||host.includes('googletagmanager.com')||host.includes('tiktok.com');const customHost=!knownVendorHost;const collectionPath=path.includes('/g/collect')||path.endsWith('/collect')||path.includes('/event')||path.includes('/events')||path.includes('/track')||path.includes('/pixel')||path.includes('/mp/collect');const trackingSignature=!!params.tid||!!params.en||!!params.event||!!params.event_name||!!params.pixel_id||!!params.fbp||!!params.fbc||!!params.gclid||!!params.conversion_id;return customHost&&collectionPath&&trackingSignature;}
function detectPlatform(url,params){const u=String(url||'').toLowerCase();if(looksLikeGA4(params,url))return 'GA4';if(u.includes('google-analytics.com/g/collect')||u.includes('google-analytics.com/collect')||u.includes('region1.google-analytics.com/g/collect'))return 'GA4';if(detectMeta(url,params))return 'Meta';if(u.includes('/pagead/viewthroughconversion/')||u.includes('googleadservices.com/pagead/conversion')||u.includes('googleads.g.doubleclick.net/pagead/conversion')||u.includes('google.com/pagead/1p-conversion')||u.includes('google.com/pagead/conversion'))return 'Google Ads';if(u.includes('fls.doubleclick.net/activity')||(u.includes('doubleclick.net')&&u.includes('/activity')))return 'Floodlight';if(u.includes('googletagmanager.com/gtm.js')||u.includes('googletagmanager.com/gtag/js'))return 'GTM';if(/\/gtm\.js$/i.test(safeUrl(url)?.pathname||'')&&/^GTM-/i.test(first(params.id)))return 'GTM';if(u.includes('analytics.tiktok.com'))return 'TikTok';if(looksLikeServerSideEndpoint(url,params))return 'Server Side';return null;}
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

function headersToObject(list) {
  const headers = {};
  (list || []).forEach((h) => append(headers, h.name, h.value || ""));
  return headers;
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  ready.then(() => {
    if (!ventusEnabled) return;
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
      transport: (platform === "Server Side" || looksLikeServerSideEndpoint(details.url, allParams)) ? "server-side-ingress" : "browser-direct"
    };
    save(record);

    if (platform === "GA4" && Array.isArray(bodyParams?._batch) && bodyParams._batch.length > 1) {
      /* FIX: the parent record kept the batch's first event name but its allParams
         mixed every row; children now also keep startedAt so duration is correct. */
      bodyParams._batch.slice(1).forEach((row, index) => {
        const p = { ...queryParams, ...row };
        save({
          ...record, id: crypto.randomUUID(), timestamp: now + index + 1,
          eventName: first(p.en) || "GA4 batch event", trackingId: first(p.tid) || info.trackingId,
          allParams: p, bodyParams: row, batchChild: true
        });
      });
    }
  });
}, { urls: ["<all_urls>"] }, ["requestBody"]);

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  ready.then(() => updateMatchingRequest(details.requestId, { requestHeaders: headersToObject(details.requestHeaders) }));
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);

chrome.webRequest.onHeadersReceived.addListener((details) => {
  ready.then(() => updateMatchingRequest(details.requestId, { responseHeaders: headersToObject(details.responseHeaders) }));
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
