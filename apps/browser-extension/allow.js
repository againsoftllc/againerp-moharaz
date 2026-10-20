// Opened by the extension when a page in AgainERP (the AI fill, the ↻ sync) needs a shop it can't read yet.
// chrome.permissions.request only works from a click on an extension page, which is what this is.
const params = new URLSearchParams(location.search);
const host = (params.get("host") || "").replace(/^www\./, "");
const result = document.getElementById("result");
const hostButton = document.getElementById("allow-host");

if (host) {
  hostButton.textContent = `Allow ${host} only`;
} else {
  hostButton.hidden = true;
}

async function ask(origins, label) {
  result.className = "small";
  result.textContent = "";
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins });
  } catch (err) {
    result.className = "small err";
    result.textContent = `Chrome refused the request: ${err.message}`;
    return;
  }
  if (granted) {
    result.className = "small ok";
    result.textContent = `Done — ${label} is allowed. Go back to AgainERP and click the button again. This tab closes by itself.`;
    setTimeout(() => window.close(), 3500);
  } else {
    result.className = "small err";
    result.textContent = "Access wasn't allowed, so the extension still can't read that shop.";
  }
}

hostButton.addEventListener("click", () =>
  ask([`https://*.${host}/*`, `http://*.${host}/*`, `https://${host}/*`, `http://${host}/*`], host),
);
document.getElementById("allow-all").addEventListener("click", () =>
  ask(["https://*/*", "http://*/*"], "every website"),
);
