let events = [];
const MAX_ROWS = 500;

function load() {
  chrome.runtime.sendMessage({ type: "VENTUS_GET_EVENTS" }, (r) => {
    if (chrome.runtime.lastError) return;
    events = Array.isArray(r?.events) ? r.events.filter(Boolean) : [];
    scheduleRender();
  });
}

/* FIX: the panel re-rendered every row (up to 8000) synchronously for each new event
   and reloaded everything on each header/status update. */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
let loadTimer = null;

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === "VENTUS_NEW_EVENT" && m.payload) {
    if (!events.some((e) => e.id === m.payload.id)) events.push(m.payload);
    scheduleRender();
  }
  if (m?.type === "VENTUS_REFRESH") {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(load, 150);
  }
});

document.getElementById("search").addEventListener("input", scheduleRender);

function render() {
  const q = document.getElementById("search").value.toLowerCase();
  const tbody = document.getElementById("rows");
  const rows = events
    .filter((e) => !q || JSON.stringify(e).toLowerCase().includes(q))
    .slice(-MAX_ROWS)
    .reverse();

  tbody.innerHTML = rows.map((e) => {
    const d = new Date(Number(e.timestamp) || Date.now());
    return `<tr><td>${d.toLocaleTimeString("pt-BR", { hour12: false })}</td><td>${x(e.siteHost)}</td><td>${e.type === "datalayer" ? "DL" : "Network"}</td><td>${x(e.type === "datalayer" ? "Data Layer" : e.platform)}</td><td>${x(e.eventName)}</td><td>${x(e.trackingId || e.conversionId || "-")}</td><td>${x(e.status ?? "-")}</td></tr>`;
  }).join("");
}

function x(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

load();
