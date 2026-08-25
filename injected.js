
(() => {
  function emit(data, source = "push") {
    try {
      window.dispatchEvent(new CustomEvent("VENTUS_DATALAYER_EVENT", {
        detail: {
          timestamp: Date.now(),
          url: location.href,
          source,
          data
        }
      }));
    } catch (_) {}
  }

  function hook() {
    window.dataLayer = window.dataLayer || [];
    const dl = window.dataLayer;

    if (dl.__ventusHooked) return;
    Object.defineProperty(dl, "__ventusHooked", {
      value: true,
      configurable: true
    });

    try {
      dl.forEach((item) => {
        if (item !== undefined) emit(item, "existing");
      });
    } catch (_) {}

    const originalPush = dl.push.bind(dl);

    dl.push = function(...args) {
      args.forEach((item) => {
        if (item !== undefined) emit(item, "push");
      });
      return originalPush(...args);
    };
  }

  hook();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    try { hook(); } catch (_) {}
    if (attempts >= 30) clearInterval(timer);
  }, 500);
})();
