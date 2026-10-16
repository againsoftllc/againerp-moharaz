/* global againerpExtractProduct */
const $ = (id) => document.getElementById(id);
const show = (el, on = true) => (el.hidden = !on);

const state = {
  apiBase: "",
  webBase: "",
  token: "",
  userName: "",
  page: null, // what extract.js read
  lookup: null, // server's competitor + product suggestions
  selectedId: "",
  products: [], // rows currently listed
};

// ── storage / API ──────────────────────────────────────────────────────────

function normalizeBase(value) {
  return (value || "").trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(["apiBase", "webBase", "token", "userName"]);
  Object.assign(state, {
    apiBase: saved.apiBase || "",
    webBase: saved.webBase || "",
    token: saved.token || "",
    userName: saved.userName || "",
  });
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${state.apiBase}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError(`Can't reach AgainERP at ${state.apiBase}. Check the API address in Settings.`, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : response.statusText;
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }
  return data;
}

function handleAuthError(err) {
  if (err.status === 401) {
    state.token = "";
    chrome.storage.local.remove("token");
    openLogin("Your session expired — sign in again.");
    return true;
  }
  return false;
}

// ── login view ─────────────────────────────────────────────────────────────

function openLogin(message) {
  show($("view-capture"), false);
  show($("view-sync"), false);
  show($("view-login"));
  $("api-base").value = state.apiBase || "http://127.0.0.1:8050";
  $("web-base").value = state.webBase || "http://localhost:3250";
  const signedIn = !!state.token;
  show($("signed-in"), signedIn);
  show($("logout"), signedIn);
  $("signed-in").textContent = signedIn ? `Signed in as ${state.userName}.` : "";
  show($("login-error"), !!message);
  $("login-error").textContent = message || "";
}

async function login() {
  const apiBase = normalizeBase($("api-base").value);
  const webBase = normalizeBase($("web-base").value);
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const fail = (msg) => {
    show($("login-error"));
    $("login-error").textContent = msg;
  };
  let origin;
  try {
    const url = new URL(apiBase);
    origin = `${url.protocol}//${url.hostname}/*`;
  } catch (_) {
    return fail("Enter the API address, e.g. https://api.yourstore.com");
  }
  if (!email || !password) return fail("Enter your email and password.");

  // Lets the popup call the API without CORS rules getting in the way. Asked once per address.
  // The admin panel address too, so Price Compare's ↻ can hand blocked links to this browser.
  const origins = [origin];
  try {
    const web = new URL(webBase);
    origins.push(`${web.protocol}//${web.hostname}/*`);
  } catch (_) {
    /* no admin address — the ↻ fallback just stays off */
  }
  const granted = await chrome.permissions.request({ origins: [...new Set(origins)] });
  if (!granted) return fail("Allow access to the API address so the extension can save prices.");

  state.apiBase = apiBase;
  state.token = "";
  $("login").disabled = true;
  try {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    state.token = data.token;
    state.webBase = webBase;
    state.userName = (data.user && (data.user.name || data.user.email)) || email;
    await chrome.storage.local.set({
      apiBase, webBase, token: state.token, userName: state.userName,
    });
    $("login-password").value = "";
    startCapture();
  } catch (err) {
    fail(err.message);
  } finally {
    $("login").disabled = false;
  }
}

async function logout() {
  if (state.token) api("/auth/logout", { method: "POST" }).catch(() => {});
  state.token = "";
  await chrome.storage.local.remove("token");
  openLogin();
}

// ── capture view ───────────────────────────────────────────────────────────

const money = (n) => (n == null || n === "" ? "—" : `৳${Number(n).toLocaleString("en-US")}`);

function readError(message) {
  show($("reading"), false);
  show($("captured"), false);
  show($("read-error"));
  $("read-error").textContent = message;
}

async function startCapture() {
  show($("view-login"), false);
  show($("view-capture"));
  if ($("view-sync").hidden) openSync();
  show($("reading"));
  show($("read-error"), false);
  show($("captured"), false);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) {
    return readError("Open a product page on a shop's website, then click the extension again.");
  }
  const tabHost = new URL(tab.url).hostname;
  const ownHosts = [state.apiBase, state.webBase].map((u) => {
    try {
      return new URL(u).hostname;
    } catch (_) {
      return "";
    }
  });
  if (ownHosts.includes(tabHost) || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(tabHost)) {
    return readError(
      "This is your own AgainERP page. Open a competitor's product page (e.g. Techland, StarTech) to save its price — auto-sync below works from any page.",
    );
  }
  let page;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: againerpExtractProduct,
    });
    page = injection && injection.result;
  } catch (err) {
    return readError(`Couldn't read this page: ${err.message}`);
  }
  if (!page) return readError("Couldn't read this page.");
  if (page.challenge) {
    return readError("This site is still checking your browser. Wait until the product page shows, then click the extension again.");
  }
  state.page = page;

  show($("reading"), false);
  show($("captured"));
  $("page-title").textContent = page.title || "(no product name found)";
  $("page-domain").textContent = new URL(page.url).hostname.replace(/^www\./, "");
  $("page-source").textContent = page.price ? `price from ${page.source}` : "no price found — type it in";
  if (page.image) {
    $("page-image").src = page.image;
    show($("page-image"));
  }
  $("price").value = page.price ?? "";
  $("regular-price").value = page.regular_price ?? "";
  $("stock").value = page.in_stock == null ? "" : String(page.in_stock);

  $("competitor-box").textContent = "Checking…";
  try {
    state.lookup = await api("/plugins/price-update/capture/lookup", {
      method: "POST",
      body: { url: page.url, title: page.title, price: page.price },
    });
  } catch (err) {
    if (handleAuthError(err)) return;
    $("competitor-box").className = "card warn";
    $("competitor-box").textContent = err.message;
    return;
  }
  renderCompetitor();
  const lk = state.lookup;
  const rows = [
    ...lk.linked.map((p) => ({ ...p, badge: "Linked to this page" })),
    ...lk.suggestions.map((p) => ({ ...p, badge: p.likely ? "Good match" : "" })),
  ];
  const preselect = lk.linked[0] || lk.suggestions.find((p) => p.likely);
  state.selectedId = preselect ? preselect.id : "";
  renderProducts(rows, rows.length ? "" : "No similar product found — search above.");
}

function renderCompetitor() {
  const box = $("competitor-box");
  const { competitor, domain } = state.lookup;
  box.replaceChildren();
  if (competitor) {
    box.className = "card ok";
    box.textContent = `Competitor: ${competitor.label} (${competitor.domain})${competitor.enabled ? "" : " — switched off in Price Compare"}`;
    return;
  }
  box.className = "card warn";
  const line = document.createElement("div");
  line.textContent = `${domain} isn't a Price Compare competitor yet.`;
  const add = document.createElement("label");
  add.style.margin = "6px 0 0";
  add.style.fontWeight = "400";
  add.innerHTML = '<input id="add-competitor" type="checkbox" checked style="display:inline;width:auto;margin:0 6px 0 0"> Add it as a competitor, named';
  const name = document.createElement("input");
  name.id = "competitor-label";
  name.value = domain.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  box.append(line, add, name);
}

function renderProducts(rows, emptyText) {
  state.products = rows;
  const list = $("product-list");
  list.replaceChildren();
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = emptyText || "No products found.";
    list.append(p);
  }
  for (const product of rows) {
    const item = document.createElement("div");
    item.className = `item${product.id === state.selectedId ? " selected" : ""}`;
    const img = document.createElement("img");
    img.alt = "";
    if (product.thumbnail) img.src = /^https?:/.test(product.thumbnail) ? product.thumbnail : `${state.apiBase}${product.thumbnail}`;
    else img.style.visibility = "hidden";
    const name = document.createElement("div");
    name.className = "name";
    const title = document.createElement("div");
    title.textContent = product.name;
    const sub = document.createElement("div");
    sub.className = "muted small";
    sub.textContent = `${product.sku || ""} · our price ${money(product.price)}`;
    name.append(title, sub);
    item.append(img, name);
    if (product.badge) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = product.badge;
      item.append(badge);
    }
    item.addEventListener("click", () => {
      state.selectedId = product.id;
      renderProducts(state.products, emptyText);
    });
    list.append(item);
  }
  $("save").disabled = !state.selectedId;
}

let searchTimer;
function onSearch() {
  clearTimeout(searchTimer);
  const q = $("product-search").value.trim();
  searchTimer = setTimeout(async () => {
    if (!q) return startCapture();
    try {
      const data = await api(`/catalog/products?per_page=10&q=${encodeURIComponent(q)}`);
      renderProducts(
        (data.data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, thumbnail: p.thumbnail })),
        `No product matches “${q}”.`,
      );
    } catch (err) {
      if (!handleAuthError(err)) renderProducts([], err.message);
    }
  }, 300);
}

async function save() {
  const price = parseFloat($("price").value);
  const result = $("save-result");
  show(result);
  if (!(price > 0)) {
    result.className = "error";
    result.textContent = "Enter the price shown on the page.";
    return;
  }
  const regular = parseFloat($("regular-price").value);
  const stock = $("stock").value;
  const body = {
    product_id: state.selectedId,
    url: state.page.url,
    title: state.page.title,
    price,
    regular_price: regular > 0 ? regular : null,
    in_stock: stock === "" ? null : stock === "true",
    // Keep the shop's wording unless the admin changed the stock choice.
    stock_label: String(state.page.in_stock) === stock ? state.page.stock_label || null : null,
  };
  const add = $("add-competitor");
  if (!state.lookup.competitor) {
    if (!add || !add.checked) {
      result.className = "error";
      result.textContent = "Tick “Add it as a competitor” to save prices from this site.";
      return;
    }
    body.add_competitor_label = $("competitor-label").value.trim();
  }
  $("save").disabled = true;
  try {
    const match = await api("/plugins/price-update/capture", { method: "POST", body });
    const product = state.products.find((p) => p.id === state.selectedId);
    result.className = "ok";
    result.replaceChildren();
    result.append(`Saved ${money(match.price)} for ${product ? product.name : "the product"}. `);
    if (state.webBase) {
      const link = document.createElement("a");
      link.href = `${state.webBase}/website/price-compare`;
      link.target = "_blank";
      link.textContent = "Open Price Compare";
      result.append(link);
    }
    if (!state.lookup.competitor) startCapture(); // site is a competitor now
  } catch (err) {
    if (handleAuthError(err)) return;
    result.className = "error";
    result.textContent = err.message;
  } finally {
    $("save").disabled = !state.selectedId;
  }
}

// ── auto-sync ──────────────────────────────────────────────────────────────

const sync = { missing: [] }; // site access patterns not granted yet

async function renderBridgeStatus() {
  const el = $("bridge-status");
  let host = "";
  try {
    host = new URL(state.webBase).hostname;
  } catch (_) {
    /* no admin address */
  }
  const builtIn = /^(localhost|127\.0\.0\.1)$|(^|\.)againerp\.com$/.test(host);
  const registered = builtIn
    ? true
    : (await chrome.scripting.getRegisteredContentScripts({ ids: ["againerp-bridge"] }).catch(() => [])).length > 0;
  el.className = registered ? "ok small" : "error small";
  el.textContent = !host
    ? "Set the Admin panel address in Settings so Price Compare's ↻ can use this browser."
    : registered
      ? `Price Compare ↻ on ${host} can read blocked sites through this browser (reload that page once after updating the extension).`
      : `Price Compare ↻ on ${host} can't use this browser yet — click Allow above.`;
}

async function openSync() {
  show($("view-sync"));
  renderBridgeStatus();
  const { autoSync } = await chrome.storage.local.get("autoSync");
  $("sync-enabled").checked = !!(autoSync && autoSync.enabled);
  $("sync-hours").value = String((autoSync && autoSync.hours) || 3);
  $("sync-mode").value = (autoSync && autoSync.mode) || "blocked";
  const { syncTabs } = await chrome.storage.local.get("syncTabs");
  $("sync-tabs").value = String(syncTabs || 3);
  renderSyncReport();
  try {
    // Loaded now so "Allow" can ask Chrome straight from the click (it needs a user gesture).
    const { data } = await api("/plugins/price-update/competitors");
    // https and http spelled out — Chrome rejects a "*://" scheme for optional host permissions.
    const patterns = data
      .filter((c) => c.enabled)
      .flatMap((c) => [`https://*.${c.domain}/*`, `http://*.${c.domain}/*`]);
    if (state.webBase) {
      try {
        const web = new URL(state.webBase);
        patterns.push(`${web.protocol}//${web.hostname}/*`); // for Price Compare's ↻ fallback
      } catch (_) {
        /* ignore a malformed admin address */
      }
    }
    const granted = await Promise.all(patterns.map((origin) => chrome.permissions.contains({ origins: [origin] })));
    sync.missing = patterns.filter((_, i) => !granted[i]);
  } catch (err) {
    if (handleAuthError(err)) return;
  }
  renderSyncPermission();
}

function renderSyncPermission() {
  const n = new Set(sync.missing.map((o) => o.replace(/^https?:\/\/(\*\.)?/, "").replace(/\/\*$/, ""))).size;
  show($("sync-perm"), n > 0);
  $("sync-perm-text").textContent = `Auto-sync needs access to ${n} site${n === 1 ? "" : "s"} (competitors and your admin panel).`;
}

async function allowSites() {
  if (!sync.missing.length) return true;
  let ok = false;
  try {
    ok = await chrome.permissions.request({ origins: sync.missing });
  } catch (err) {
    $("sync-perm-text").textContent = `Chrome refused the request: ${err.message}`;
    return false;
  }
  if (ok) sync.missing = [];
  renderSyncPermission();
  setTimeout(renderBridgeStatus, 500); // the background re-registers the bridge on new access
  if (!ok) $("sync-status").textContent = "Access wasn't allowed — auto-sync and the ↻ fallback can't read those sites.";
  return ok;
}

async function saveSyncSettings() {
  await chrome.storage.local.set({
    autoSync: {
      enabled: $("sync-enabled").checked,
      hours: Number($("sync-hours").value),
      mode: $("sync-mode").value,
    },
    syncTabs: Number($("sync-tabs").value),
  });
}

async function onSyncToggle() {
  if ($("sync-enabled").checked && !(await allowSites())) {
    $("sync-enabled").checked = false;
  }
  await saveSyncSettings();
  renderSyncReport();
}

async function syncNow() {
  await allowSites();
  await chrome.runtime.sendMessage({ type: "sync-now" });
  $("sync-status").textContent = "Starting…";
}

const ago = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(ms).toLocaleString();
};

async function renderSyncReport() {
  const { syncReport: r, syncLock, autoSync } = await chrome.storage.local.get(["syncReport", "syncLock", "autoSync"]);
  const running = syncLock && Date.now() - syncLock < 60 * 60000;
  $("sync-now").disabled = !!running;
  const status = $("sync-status");
  const list = $("sync-items");
  list.replaceChildren();
  status.className = "muted small";
  if (!r) {
    status.textContent = autoSync && autoSync.enabled ? "First sync starts within a minute." : "Not run yet.";
    return;
  }
  if (running) {
    status.textContent = `Syncing… ${r.done} of ${r.total} links`;
  } else if (r.error) {
    status.className = "error small";
    status.textContent = r.error;
  } else {
    const parts = [`${r.updated} updated`];
    if (r.failed) parts.push(`${r.failed} failed`);
    if (r.skipped) parts.push(`${r.skipped} skipped`);
    status.textContent = r.total
      ? `Last sync ${ago(r.finishedAt)}: ${parts.join(", ")}.`
      : `Last sync ${ago(r.finishedAt)}: every link was already up to date.`;
  }
  // Problems first, so they're visible without scrolling.
  const rows = [...r.items].sort((a, b) => a.ok - b.ok);
  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = `${item.site}: ${item.name}`;
    name.title = item.url;
    const result = document.createElement("span");
    result.textContent = item.result;
    if (!item.ok) result.className = "bad";
    row.append(name, result);
    list.append(row);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.syncReport || changes.syncLock) renderSyncReport();
});

// ── wiring ─────────────────────────────────────────────────────────────────

$("open-settings").addEventListener("click", () => openLogin());
$("login").addEventListener("click", login);
$("login-password").addEventListener("keydown", (e) => e.key === "Enter" && login());
$("logout").addEventListener("click", logout);
$("product-search").addEventListener("input", onSearch);
$("save").addEventListener("click", save);
$("sync-enabled").addEventListener("change", onSyncToggle);
$("sync-hours").addEventListener("change", saveSyncSettings);
$("sync-mode").addEventListener("change", saveSyncSettings);
$("sync-tabs").addEventListener("change", saveSyncSettings);
$("sync-allow").addEventListener("click", allowSites);
$("sync-now").addEventListener("click", syncNow);

loadSettings().then(() => (state.token && state.apiBase ? startCapture() : openLogin()));
