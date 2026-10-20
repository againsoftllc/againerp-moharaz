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

  // The extension reads a competitor page, then saves the result through THIS admin page's own API
  // (same origin, this page's sign-in) — so it lands in the environment the admin is looking at, whichever
  // API address the extension itself is signed in to (e.g. live while this page is a local copy).
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (!message || message.type !== "page-api") return;
    (async () => {
      let token = "";
      try {
        token = (JSON.parse(localStorage.getItem("againerp-admin-auth") || "{}").state || {}).token || "";
      } catch (_) {
        token = "";
      }
      if (!token) {
        reply({ ok: false, status: 401, data: { detail: "Sign in to the admin page first" } });
        return;
      }
      const response = await fetch(`${location.origin}/api/v1${message.path}`, {
        method: message.method || "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: message.body ? JSON.stringify(message.body) : undefined,
      });
      const body = await response.json().catch(() => ({}));
      reply({ ok: response.ok, status: response.status, data: body });
    })().catch((err) => reply({ ok: false, status: 0, data: { detail: String((err && err.message) || err) } }));
    return true; // answer asynchronously
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== "againerp-page") return;

    if (data.type === "ping") {
      window.postMessage({ source: "againerp-extension", type: "ready", version: VERSION }, location.origin);
      return;
    }
    if (!["sync-one", "discover-one", "read-html", "read-images", "connect"].includes(data.type) || !data.requestId || !data.item) return;

    const reply = (payload) =>
      window.postMessage(
        { source: "againerp-extension", type: `${data.type}-result`, requestId: data.requestId, ...payload },
        location.origin,
      );
    try {
      // (sent from this tab, so the extension can send the results back through THIS page's API)
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
