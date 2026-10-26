/* Ventus Tag Debugger — bridge between the page (injected.js, MAIN world) and the background.
   FIX: injected.js is now declared in manifest.json with "world": "MAIN", so it runs
   synchronously at document_start. Injecting it with <script src> ran asynchronously,
   after early inline dataLayer pushes, and could be blocked/delayed. */

window.addEventListener("VENTUS_DATALAYER_EVENT", (event) => {
  let detail = event?.detail;
  if (!detail) return;

  if (typeof detail === "string") {
    try { detail = JSON.parse(detail); } catch (_) { return; }
  }

  /* FIX: after the extension is reloaded/updated, chrome.runtime.sendMessage throws
     synchronously ("Extension context invalidated") on every dataLayer push. */
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: "VENTUS_DATALAYER", payload: detail }).catch(() => {});
  } catch (_) {}
});
