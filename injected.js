/* Ventus Tag Debugger — dataLayer hook (runs in the page's MAIN world at document_start) */
(() => {
  if (window.__ventusDataLayerHook) return;
  window.__ventusDataLayerHook = true;

  const MAX_DEPTH = 8;
  const MAX_KEYS = 200;
  const MAX_ITEMS = 100;
  const MAX_STRING = 5000;

  /* FIX: GTM pushes objects with DOM nodes (gtm.element), functions (eventCallback)
     and circular references. Those cannot cross from the page world to the content
     script (detail arrived as null) nor be sent with chrome.runtime.sendMessage.
     Everything is converted to plain JSON before leaving the page. */
  function toPlain(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value ?? null;
    const t = typeof value;
    if (t === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
    if (t === "number") return Number.isFinite(value) ? value : String(value);
    if (t === "boolean") return value;
    if (t === "bigint") return value.toString();
    if (t === "function") return "[function]";
    if (t === "symbol") return value.toString();
    if (depth >= MAX_DEPTH) return "[max depth]";

    try {
      if (typeof Element !== "undefined" && value instanceof Element) {
        const id = value.id ? `#${value.id}` : "";
        const cls = typeof value.className === "string" && value.className.trim()
          ? "." + value.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
        return `[${value.tagName.toLowerCase()}${id}${cls}]`;
      }
      if (typeof Node !== "undefined" && value instanceof Node) return `[${value.nodeName}]`;
      if (value === window) return "[window]";
      if (value instanceof Date) return value.toISOString();
      if (value instanceof RegExp) return value.toString();
      if (value instanceof Error) return `${value.name}: ${value.message}`;
    } catch (_) { /* cross-origin objects can throw on access */ }

    if (seen.has(value)) return "[circular]";
    seen.add(value);

    /* gtag() pushes the `arguments` object */
    const isArgs = Object.prototype.toString.call(value) === "[object Arguments]";
    if (Array.isArray(value) || isArgs) {
      return Array.prototype.slice.call(value, 0, MAX_ITEMS).map((v) => toPlain(v, depth + 1, seen));
    }

    const out = {};
    let count = 0;
    for (const key in value) {
      if (count++ >= MAX_KEYS) { out["…"] = "[truncated]"; break; }
      try {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        out[key] = toPlain(value[key], depth + 1, seen);
      } catch (_) {
        out[key] = "[unreadable]";
      }
    }
    return out;
  }

  function emit(data, source = "push") {
    try {
      const detail = JSON.stringify({
        timestamp: Date.now(),
        url: location.href,
        source,
        data: toPlain(data)
      });
      window.dispatchEvent(new CustomEvent("VENTUS_DATALAYER_EVENT", { detail }));
    } catch (_) { /* never break the page */ }
  }

  function hookArray(dl) {
    if (!Array.isArray(dl) || dl.__ventusHooked) return dl;
    try {
      Object.defineProperty(dl, "__ventusHooked", { value: true, configurable: true });
    } catch (_) { return dl; }

    try {
      dl.forEach((item) => { if (item !== undefined) emit(item, "existing"); });
    } catch (_) {}

    const originalPush = dl.push;
    dl.push = function (...args) {
      args.forEach((item) => { if (item !== undefined) emit(item, "push"); });
      return originalPush.apply(this, args);
    };
    return dl;
  }

  /* FIX: sites commonly do `window.dataLayer = [...]` before the GTM snippet, which
     replaced the hooked array. The old version only retried for 15s; a setter on
     window.dataLayer now hooks every array assigned to it, at any time. */
  let current = hookArray(window.dataLayer);
  try {
    const desc = Object.getOwnPropertyDescriptor(window, "dataLayer");
    if (!desc || desc.configurable) {
      Object.defineProperty(window, "dataLayer", {
        configurable: true,
        enumerable: true,
        get() { return current; },
        set(value) { current = hookArray(value); }
      });
    }
  } catch (_) {
    /* fallback: poll like the previous version */
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      try { hookArray(window.dataLayer); } catch (_) {}
      if (attempts >= 60) clearInterval(timer);
    }, 500);
  }
})();
