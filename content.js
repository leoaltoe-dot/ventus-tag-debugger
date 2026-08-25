
const injected = document.createElement("script");
injected.src = chrome.runtime.getURL("injected.js");
injected.onload = () => injected.remove();
(document.head || document.documentElement).appendChild(injected);

window.addEventListener("VENTUS_DATALAYER_EVENT", (event) => {
  if (!event?.detail) return;

  chrome.runtime.sendMessage({
    type: "VENTUS_DATALAYER",
    payload: event.detail
  }).catch(() => {});
});
