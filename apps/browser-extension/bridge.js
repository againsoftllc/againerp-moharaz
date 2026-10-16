// Runs on the AgainERP admin pages only (registered for the "Admin panel address" set in the
// popup). Lets the Price Compare page ask the extension to read a competitor link in this
// browser when the server's own check fails (e.g. a Cloudflare block).
//
// Page → extension:  window.postMessage({ source: "againerp-page", type: "sync-one" | "discover-one", requestId, item }, origin)
// Extension → page:  window.postMessage({ source: "againerp-extension", type: "<type>-result", requestId, ... }, origin)
(() => {
  // Injected by the manifest (localhost / *.againerp.com) and/or the runtime registration for a
  // custom admin address — only one copy may answer, or every request would run twice.
  if (window.__againerpBridge) return;
  window.__againerpBridge = true;
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.dataset.againerpExtension = VERSION;
  window.postMessage({ source: "againerp-extension", type: "ready", version: VERSION }, location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "againerp-page") return;

    if (data.type === "ping") {
      window.postMessage({ source: "againerp-extension", type: "ready", version: VERSION }, location.origin);
      return;
    }
    if (!["sync-one", "discover-one"].includes(data.type) || !data.requestId || !data.item) return;

    const reply = (payload) =>
      window.postMessage(
        { source: "againerp-extension", type: `${data.type}-result`, requestId: data.requestId, ...payload },
        location.origin,
      );
    try {
      chrome.runtime.sendMessage({ type: data.type, item: data.item }, (response) => {
        if (chrome.runtime.lastError) {
          reply({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        reply(response || { ok: false, error: "No answer from the extension" });
      });
    } catch (err) {
      // The extension was reloaded/updated since this page opened.
      reply({ ok: false, error: "The extension was updated — reload this page and try again" });
    }
  });
})();
