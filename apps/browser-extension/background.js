/* global againerpExtractProduct */
// Auto-sync and Price Compare's ↻ fallback: read competitor pages in the admin's own browser, in
// a minimized window with a small pool of tabs, and send price/stock to AgainERP. Sites that
// block servers (Cloudflare browser checks) see a normal visitor.
importScripts("extract.js");

const ALARM = "againerp-autosync";
const MAX_PER_RUN = 100;
const PAGE_LOAD_TIMEOUT = 45000;
const LOCK_MINUTES = 60;
const MAX_TABS = 5;
const PER_SITE_MAX = 3; // tabs on one site at once
const SITE_GAP_MS = 1500; // between starting two page requests on one site

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── scheduling ─────────────────────────────────────────────────────────────

async function schedule() {
  const { autoSync } = await chrome.storage.local.get("autoSync");
  if (!autoSync || !autoSync.enabled) {
    await chrome.alarms.clear(ALARM);
    return;
  }
  const period = Math.max(1, Number(autoSync.hours) || 3) * 60;
  const existing = await chrome.alarms.get(ALARM);
  if (existing && existing.periodInMinutes === period) return;
  await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: period });
}

// ── bridge to the AgainERP admin pages ─────────────────────────────────────
// bridge.js runs on the admin panel so Price Compare's ↻ can fall back to this browser when the
// server's check fails. Built in for localhost / *.againerp.com; registered here for any other
// admin address set in the popup.

const BRIDGE_ID = "againerp-bridge";

function originPattern(base) {
  try {
    const url = new URL(base);
    return `${url.protocol}//${url.hostname}/*`;
  } catch (_) {
    return "";
  }
}

async function registerBridge() {
  const { webBase } = await chrome.storage.local.get("webBase");
  await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] }).catch(() => {});
  const pattern = originPattern(webBase);
  if (!pattern || !(await chrome.permissions.contains({ origins: [pattern] }))) return;
  // Already covered by the manifest's built-in bridge.
  if (/^http:\/\/(localhost|127\.0\.0\.1)\/|\.againerp\.com\/|\/\/againerp\.com\//.test(pattern)) return;
  await chrome.scripting.registerContentScripts([
    { id: BRIDGE_ID, matches: [pattern], js: ["bridge.js"], runAt: "document_start", persistAcrossSessions: true },
  ]);
}

// config.json is written into the zip by the admin it was downloaded from (the API + admin address of THAT AgainERP). When it
// carries addresses the extension is pre-connected to them: nobody types them, nobody can point it somewhere else. It holds
// addresses only - never a password or a token; every person signs in with their own account.
async function applyConfig() {
  try {
    const config = await (await fetch(chrome.runtime.getURL("config.json"))).json();
    const apiBase = String(config.apiBase || "").replace(/\/+$/, "");
    const webBase = String(config.webBase || apiBase).replace(/\/+$/, "");
    if (!apiBase) return;
    const saved = await chrome.storage.local.get(["apiBase", "webBase"]);
    if (saved.apiBase !== apiBase || saved.webBase !== webBase) {
      // a different AgainERP than the one a saved session belongs to: that session is no use here
      await chrome.storage.local.set({ apiBase, webBase });
      if (saved.apiBase && saved.apiBase !== apiBase) await chrome.storage.local.remove(["token", "userName"]);
    }
  } catch (_) {
    /* no config.json - the popup asks for the addresses */
  }
}

// The admin page "Log in" lands on (/extension-connect) hands over a session made for this extension. Accepted only from the admin
// address this extension is connected to - never from another site.
async function connectFromAdmin(item, sender) {
  const { webBase } = await chrome.storage.local.get("webBase");
  let from = "";
  try {
    from = new URL(sender && sender.tab && sender.tab.url ? sender.tab.url : "").origin;
  } catch (_) {
    from = "";
  }
  let expected = "";
  try {
    expected = new URL(webBase).origin;
  } catch (_) {
    expected = "";
  }
  if (!expected || from !== expected) return { ok: false, error: "This page is not the admin the extension is connected to" };
  if (!item || !item.token) return { ok: false, error: "No session received" };
  await chrome.storage.local.set({ token: String(item.token), userName: String(item.name || "") });
  return { ok: true };
}

async function onBoot() {
  await applyConfig();
  schedule();
  registerBridge();
}

chrome.runtime.onInstalled.addListener(onBoot);
chrome.runtime.onStartup.addListener(onBoot);
chrome.permissions.onAdded.addListener(registerBridge);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoSync) schedule();
  if (changes.webBase) registerBridge();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runSync("scheduled");
});
// A request that comes from an admin page's bridge carries that tab; the popup and the schedule have none.
function pageContext(sender) {
  return sender && sender.tab && sender.tab.id != null ? { tabId: sender.tab.id } : null;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message && message.type === "sync-now") {
    runSync("manual");
    reply({ started: true });
  }
  if (message && message.type === "sync-one") {
    syncOne(message.item, pageContext(sender)).then(reply, (err) => reply({ ok: false, error: err.message }));
    return true; // answer asynchronously
  }
  if (message && message.type === "connect") {
    connectFromAdmin(message.item, sender).then(reply, (err) => reply({ ok: false, error: err.message }));
    return true;
  }
  if (message && message.type === "read-html") {
    readHtml(message.item && message.item.url).then(reply, (err) => reply({ ok: false, error: err.message }));
    return true;
  }
  if (message && message.type === "discover-one") {
    discoverOne(message.item, pageContext(sender)).then(reply, (err) => reply({ ok: false, error: err.message }));
    return true;
  }
});

// ── API ────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = "GET", body } = {}, ctx) {
  if (ctx && ctx.tabId != null) {
    // Asked from an admin page: save through that page's own API (see bridge.js "page-api").
    let answer;
    try {
      answer = await chrome.tabs.sendMessage(ctx.tabId, { type: "page-api", path, method, body });
    } catch (_) {
      throw new ApiError("The admin page was closed or reloaded — reload it and try again", 0);
    }
    if (!answer || !answer.ok) {
      const detail = answer && answer.data && typeof answer.data.detail === "string" ? answer.data.detail : "";
      throw new ApiError(detail || `Request failed (${(answer && answer.status) || 0})`, (answer && answer.status) || 0);
    }
    return answer.data;
  }
  const { apiBase, token } = await chrome.storage.local.get(["apiBase", "token"]);
  let response;
  try {
    response = await fetch(`${apiBase}/api/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError(`Can't reach AgainERP at ${apiBase}`, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof data.detail === "string" ? data.detail : `Request failed (${response.status})`, response.status);
  }
  return data;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

// A page in AgainERP asked for a shop the extension has no access to yet. Chrome only grants that from a click on an
// extension page, so open the small Allow tab (once) instead of failing with a hint nobody can follow.
async function promptAccess(url) {
  const host = hostOf(url);
  try {
    const existing = await chrome.tabs.query({ url: chrome.runtime.getURL("allow.html*") });
    if (existing.length) {
      await chrome.tabs.update(existing[0].id, { active: true });
      return;
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL(`allow.html?host=${encodeURIComponent(host)}`), active: true });
  } catch (_) {
    /* the error message below still tells the admin what to do */
  }
}

const accessNeeded = (host) =>
  `Chrome needs your OK before the extension can read ${host}: a small “Allow” tab just opened — click Allow there, then click here again.`;

async function hasAccess(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return await chrome.permissions.contains({ origins: [`${protocol}//${hostname}/*`] });
  } catch (_) {
    return false;
  }
}

// ── the sync window: a small pool of background tabs ───────────────────────
// Up to N tabs at once (popup setting, default 3), at most 3 on one site, pages on one site
// started ≥3s apart. A site that starts showing bot checks drops to one tab for the rest of the
// session so it doesn't escalate; other sites carry on.

let syncWindowId = null;
let windowPromise = null;
const freeTabs = [];
const busyTabs = new Set();
const brokenTabs = new Set();
const tabWaiters = [];
let creatingTabs = 0;
// Which site each pooled tab currently has open. A tab already on a site is that site's "anchor":
// later products there are fetched from inside it (same site, same cookies, so bot checks pass)
// instead of loading each page in the tab — nothing visible changes and it's ~10× faster.
const tabSite = new Map();
const siteActive = new Map();
const siteLimit = new Map();
const siteLastStart = new Map();
const siteWaiters = new Map();
let idleCloseTimer = null;
let runActive = false;

async function tabLimit() {
  const { syncTabs } = await chrome.storage.local.get("syncTabs");
  return Math.min(MAX_TABS, Math.max(1, Number(syncTabs) || 3));
}

function resetPool() {
  syncWindowId = null;
  freeTabs.length = 0;
  busyTabs.clear();
  brokenTabs.clear();
  tabSite.clear();
}

async function ensureWindow() {
  if (syncWindowId != null) {
    try {
      await chrome.windows.get(syncWindowId);
      return;
    } catch (_) {
      resetPool(); // the admin closed it
    }
  }
  if (!windowPromise) {
    windowPromise = chrome.windows
      .create({ url: "about:blank", state: "minimized", focused: false })
      .then((win) => {
        syncWindowId = win.id;
        freeTabs.push(win.tabs[0].id);
      })
      .finally(() => {
        windowPromise = null;
      });
  }
  await windowPromise;
}

async function acquireTab(host) {
  clearTimeout(idleCloseTimer);
  for (;;) {
    await ensureWindow();
    if (freeTabs.length) {
      // Prefer a tab that's already on this site (its anchor), then an unused one.
      let at = freeTabs.findIndex((t) => tabSite.get(t) === host);
      if (at < 0) at = freeTabs.findIndex((t) => !tabSite.has(t));
      if (at < 0) at = freeTabs.length - 1;
      const id = freeTabs.splice(at, 1)[0];
      busyTabs.add(id);
      return id;
    }
    if (busyTabs.size + creatingTabs < (await tabLimit())) {
      creatingTabs += 1;
      try {
        const tab = await chrome.tabs.create({ windowId: syncWindowId, url: "about:blank", active: false });
        busyTabs.add(tab.id);
        return tab.id;
      } catch (_) {
        resetPool(); // window vanished between the check and the create — start over
        continue;
      } finally {
        creatingTabs -= 1;
      }
    }
    await new Promise((resolve) => tabWaiters.push(resolve));
  }
}

function releaseTab(id) {
  busyTabs.delete(id);
  if (brokenTabs.has(id)) {
    brokenTabs.delete(id);
    tabSite.delete(id);
  } else freeTabs.push(id);
  const next = tabWaiters.shift();
  if (next) next();
  scheduleIdleClose();
}

function scheduleIdleClose() {
  clearTimeout(idleCloseTimer);
  // Keep the window a few seconds so a run of ↻ clicks reuses it.
  idleCloseTimer = setTimeout(() => {
    if (!busyTabs.size && !runActive && !tabWaiters.length) closeSyncWindow();
  }, 4000);
}

async function closeSyncWindow() {
  const id = syncWindowId;
  resetPool();
  if (id != null) await chrome.windows.remove(id).catch(() => {});
}

async function acquireSite(host) {
  for (;;) {
    const limit = siteLimit.get(host) || PER_SITE_MAX;
    const active = siteActive.get(host) || 0;
    const wait = (siteLastStart.get(host) || 0) + SITE_GAP_MS - Date.now();
    if (active < limit && wait <= 0) {
      siteActive.set(host, active + 1);
      siteLastStart.set(host, Date.now());
      return;
    }
    if (active < limit) {
      await sleep(wait);
      continue;
    }
    await new Promise((resolve) => {
      const queue = siteWaiters.get(host) || [];
      queue.push(resolve);
      siteWaiters.set(host, queue);
    });
  }
}

function releaseSite(host) {
  siteActive.set(host, Math.max(0, (siteActive.get(host) || 1) - 1));
  const queue = siteWaiters.get(host);
  const next = queue && queue.shift();
  if (next) next();
}

/** Run fn(tabId) on a pooled tab, within the site's limits. */
async function withPage(url, fn) {
  const host = hostOf(url);
  await acquireSite(host);
  let tabId = null;
  try {
    tabId = await acquireTab(host);
    return await fn(tabId);
  } finally {
    if (tabId != null) releaseTab(tabId);
    releaseSite(host);
  }
}

function waitForLoad(tabId, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") done();
    }
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function navigate(tabId, url) {
  const loaded = waitForLoad(tabId, PAGE_LOAD_TIMEOUT);
  try {
    await chrome.tabs.update(tabId, { url });
  } catch (err) {
    brokenTabs.add(tabId); // closed by the admin
    throw err;
  }
  await loaded;
  tabSite.set(tabId, hostOf(url));
}

// Fetch a product page from inside a tab already on that site and read it there, without
// loading it in the tab. Returns {page}, {challenge}, {error} or {fallback} (read it normally).
async function readViaAnchor(tabId, url) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [url],
      func: async (pageUrl) => {
        let response;
        try {
          response = await fetch(pageUrl, { credentials: "include" });
        } catch (err) {
          return { fallback: `fetch failed: ${err.message}` };
        }
        const html = await response.text();
        if (/just a moment|cf-chl|challenge-platform|attention required/i.test(html.slice(0, 3000))) {
          return { challenge: true };
        }
        if (response.status === 404 || response.status === 410) return { notFound: true };
        if (!response.ok) return { fallback: `HTTP ${response.status}` };
        const finalUrl = response.url || pageUrl;
        const doc = new DOMParser().parseFromString(html, "text/html");
        // eslint-disable-next-line no-undef
        const page = againerpExtractProduct(doc, finalUrl);
        return { page, finalUrl };
      },
    });
    return (injection && injection.result) || { fallback: "no result" };
  } catch (err) {
    return { fallback: err.message };
  }
}

// ── reading one product page ───────────────────────────────────────────────

const pathOf = (u) => {
  try {
    return new URL(u).pathname.replace(/\/+$/, "");
  } catch (_) {
    return "";
  }
};

// The tab a site's pages can be fetched from (already open on that site and not mid-navigation).
const navigatingTabs = new Set();
const warming = new Map(); // host -> promise while the site's first page loads
function anchorTab(host) {
  for (const [tabId, site] of tabSite) {
    if (site === host && !navigatingTabs.has(tabId) && !brokenTabs.has(tabId)) return tabId;
  }
  return null;
}

async function readPage(url) {
  const host = hostOf(url);
  await acquireSite(host);
  try {
    // A site's first page loads on its own (that's where any bot check gets passed); the rest
    // wait for it and then use the tab it leaves behind.
    if (anchorTab(host) == null && warming.has(host)) await warming.get(host);
    const anchor = anchorTab(host);
    if (anchor != null) {
      const quick = await readViaAnchor(anchor, url);
      if (quick.notFound) return { error: "the page says not found — the product may be removed" };
      if (quick.page && !quick.page.challenge) {
        if (pathOf(url) && !pathOf(quick.finalUrl)) {
          return { error: "the link now opens the site's home page — the product may be removed" };
        }
        // A price, or a clear "can't buy" — otherwise the page may fill in its price with
        // JavaScript, so load it properly below.
        if (quick.page.price || quick.page.in_stock === false || quick.page.stock_label) return { page: quick.page };
      }
    }
    let finishWarm = null;
    if (anchorTab(host) == null && !warming.has(host)) {
      warming.set(host, new Promise((resolve) => (finishWarm = resolve)));
    }
    try {
      return await loadAndRead(url, host);
    } finally {
      if (finishWarm) {
        warming.delete(host);
        finishWarm();
      }
    }
  } finally {
    releaseSite(host);
  }
}

// Load the page in a pooled tab and read it (the slow path; also makes that tab the anchor).
async function loadAndRead(url, host) {
  const tabId = await acquireTab(host);
  navigatingTabs.add(tabId);
  try {
    try {
      await navigate(tabId, url);
    } catch (_) {
      return { error: "the browser tab was closed — try again" };
    }
    let result = await readLoadedPage(tabId);
    if (result.challenge) {
      // The first bot check in a fresh (minimized) window often doesn't finish; by now the
      // clearance usually has, so one reload gets through.
      const loaded = waitForLoad(tabId, PAGE_LOAD_TIMEOUT);
      await chrome.tabs.reload(tabId).catch(() => {});
      await loaded;
      result = await readLoadedPage(tabId);
    }
    if (result.challenge) {
      siteLimit.set(host, 1); // back off on this site
      tabSite.delete(tabId); // not a usable anchor
      return { error: "the site's browser check didn't clear — open the link once and save it from the popup" };
    }
    if (result.error) return result;
    const tab = await chrome.tabs.get(tabId);
    if (pathOf(url) && !pathOf(tab.url)) return { error: "the link now opens the site's home page — the product may be removed" };
    if (/\b404\b|not\s+found/i.test(result.page.title || "") && !result.page.price) return { error: "the page says not found — the product may be removed" };
    return result;
  } finally {
    navigatingTabs.delete(tabId);
    releaseTab(tabId);
  }
}

async function readLoadedPage(tabId) {
  let last = null;
  // Give client-rendered pages time to settle (~35s); a bot check gets up to ~70s — the first
  // one in a fresh window is slow, later pages reuse the clearance cookie.
  for (let attempt = 0; attempt < (last && last.challenge ? 16 : 8); attempt++) {
    await sleep(attempt === 0 ? 2500 : 4500);
    let page;
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: againerpExtractProduct });
      page = injection && injection.result;
    } catch (err) {
      last = { error: `couldn't read the page (${err.message})` };
      continue;
    }
    if (!page) continue;
    last = page;
    if (page.challenge) continue;
    if (page.price || page.in_stock === false) break;
  }
  if (!last) return { error: "the page didn't load" };
  if (last.error) return last;
  if (last.challenge) return { challenge: true };
  return { page: last };
}

// ── a page's raw HTML (for the AI fill on shops that block the server) ────────────────────────────

// Reads the page the way a price read does — the first page on a site loads in a tab (that is where a bot check
// gets passed) and every later one is fetched from inside that tab — but returns the page's HTML instead of a price.
async function readHtml(url) {
  if (!url) return { ok: false, error: "No page to read" };
  const host = hostOf(url);
  if (!(await hasAccess(url))) {
    await promptAccess(url);
    return { ok: false, error: accessNeeded(host) };
  }
  return withKeepAlive(async () => {
    try {
      let anchor = anchorTab(host);
      if (anchor == null) {
        const warm = await readPage(url); // loads the page in a tab, which then becomes the site's anchor
        if (warm.error) return { ok: false, error: warm.error };
        anchor = anchorTab(host);
      }
      if (anchor == null) return { ok: false, error: "Couldn't open a browser tab on the site" };
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: anchor },
        args: [url],
        func: async (pageUrl) => {
          try {
            const response = await fetch(pageUrl, { credentials: "include" });
            const html = await response.text();
            if (/just a moment|cf-chl|challenge-platform|attention required/i.test(html.slice(0, 3000))) return { challenge: true };
            if (!response.ok) return { error: `HTTP ${response.status}` };
            return { html, url: response.url || pageUrl };
          } catch (err) {
            return { error: err.message };
          }
        },
      });
      const result = (injection && injection.result) || {};
      if (result.challenge) return { ok: false, error: "The site's browser check didn't clear — open the link once in this browser and try again" };
      if (!result.html) return { ok: false, error: result.error || "The page came back empty" };
      return { ok: true, html: result.html, page_url: result.url };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ── one saved link ─────────────────────────────────────────────────────────

const priceSummary = (match) =>
  `৳${Number(match.price).toLocaleString("en-US")}${match.in_stock === false ? " · out of stock" : ""}`;

async function syncItem(item, ctx) {
  const host = hostOf(item.url);
  const domain = (item.competitor_domain || "").replace(/^www\./, "");
  if (domain && host !== domain && !host.endsWith(`.${domain}`)) {
    // Saved under the wrong competitor — say so in AgainERP instead of reading another site.
    const match = await api(
      "/plugins/price-update/capture/auto",
      { method: "POST", body: { match_id: item.match_id, error: `the saved link is on ${host}, not ${domain}` } },
      ctx,
    );
    return { ok: false, match, summary: `Link is on ${host}, not ${item.competitor_label || domain} — fix the link` };
  }
  if (!(await hasAccess(item.url))) {
    if (ctx) await promptAccess(item.url); // asked from an admin page: ask now (a scheduled run cannot)
    return {
      ok: false,
      skipped: true,
      summary: ctx
        ? accessNeeded(host)
        : `The extension has no access to ${host} yet — open the extension and click “Allow all websites”`,
    };
  }
  const read = await readPage(item.url);
  const body = { match_id: item.match_id };
  if (read.error) {
    body.error = read.error;
  } else {
    Object.assign(body, {
      page_url: read.page.url,
      title: read.page.title,
      price: read.page.price,
      regular_price: read.page.regular_price,
      in_stock: read.page.in_stock,
      stock_label: read.page.stock_label,
    });
  }
  const match = await api("/plugins/price-update/capture/auto", { method: "POST", body }, ctx);
  const ok = match.status === "matched";
  return { ok, match, summary: ok ? priceSummary(match) : match.status_message || match.status };
}

// ── finding a missing link through this browser ────────────────────────────
// For sites that block the server, AgainERP can't read their sitemap either. The extension
// reads robots.txt / sitemap files here and AgainERP matches our product against them, then the
// extension opens the best pages and AgainERP checks each one (brand, model, size, colour, price).

const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
const looksChallenged = (text) => /just a moment|cf-chl|challenge-platform|attention required/i.test(text.slice(0, 3000));

function parseDocument(url, text) {
  if (/\/robots\.txt$/i.test(new URL(url).pathname)) {
    const sitemaps = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    return { url, kind: "robots", sitemaps };
  }
  return { url, kind: "sitemap", locs: [...text.matchAll(LOC_RE)].map((m) => m[1].trim()) };
}

// A sitemap file: a plain request first (sends this browser's cookies, so a passed Cloudflare
// check usually carries over); if the site still wants a browser check, load it in a tab.
async function readSitemapDocument(url) {
  try {
    const response = await fetch(url, { credentials: "include" });
    const text = await response.text();
    if (response.ok && !looksChallenged(text)) return parseDocument(response.url || url, text);
  } catch (_) {
    /* fall through to a tab */
  }
  return withPage(url, async (tabId) => {
    try {
      await navigate(tabId, url);
    } catch (_) {
      return { url, kind: /robots\.txt$/i.test(url) ? "robots" : "sitemap", failed: true };
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(attempt === 0 ? 1500 : 4000);
      try {
        // Sitemaps styled with XSL render as an HTML table in a tab, so re-request the raw file
        // from inside the page (same site, same cookies → passes the bot check like the page did).
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          func: async () => {
            const title = document.title || "";
            const shown = (document.body && document.body.innerText) || "";
            let raw = "";
            try {
              const response = await fetch(location.href, { credentials: "include" });
              if (response.ok) raw = await response.text();
            } catch (_) {
              /* use what's shown */
            }
            return { title, url: location.href, raw, shown };
          },
        });
        const page = injection && injection.result;
        if (!page || looksChallenged(`${page.title} ${page.shown}`)) continue;
        if (page.raw && !looksChallenged(page.raw)) {
          const doc = parseDocument(page.url || url, page.raw);
          if (doc.kind === "robots" || doc.locs.length) return doc;
        }
        // Last resort: the URLs visible in the rendered table.
        const doc = parseDocument(page.url || url, page.shown);
        if (doc.kind === "sitemap" && !doc.locs.length) {
          doc.locs = [...new Set(page.shown.match(/https?:\/\/[^\s"'<>]+/g) || [])];
        }
        return doc;
      } catch (_) {
        /* page still loading */
      }
    }
    return { url, kind: /robots\.txt$/i.test(url) ? "robots" : "sitemap", failed: true };
  });
}

// One sitemap crawl per site at a time: parallel "find link" requests for the same site wait for
// the first, then find AgainERP's cached index and skip straight to candidates.
const crawlLocks = new Map();
function withCrawlLock(domain, fn) {
  const previous = crawlLocks.get(domain) || Promise.resolve();
  const run = previous.then(fn, fn);
  crawlLocks.set(domain, run.catch(() => {}));
  return run;
}

function withKeepAlive(fn) {
  // Extension API calls keep the service worker alive during long waits.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  return fn().finally(() => clearInterval(keepAlive));
}

const signInError = (err) =>
  err.status === 401 ? "The extension's AgainERP sign-in expired — open it and sign in again" : err.message;

async function discoverOne(item, ctx) {
  if (!item || !item.product_id || !item.competitor) return { ok: false, error: "Nothing to look for" };
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  if (!ctx && (!token || !apiBase)) return { ok: false, error: "Sign in to the Send to AgainERP extension first" };
  const call = (path, options) => api(path, options, ctx);
  const domain = (item.competitor_domain || "").replace(/^www\./, "");
  const label = item.competitor_label || domain;
  if (domain && !(await hasAccess(`https://www.${domain}/`)) && !(await hasAccess(`https://${domain}/`))) {
    if (ctx) await promptAccess(`https://${domain}/`);
    return {
      ok: false,
      error: ctx ? accessNeeded(domain) : `The extension has no access to ${domain} yet — open the extension and click “Allow all websites”`,
    };
  }
  const base = { product_id: item.product_id, competitor: item.competitor };
  return withKeepAlive(async () => {
    try {
      // 1. Sitemap → candidate pages (AgainERP caches the site's sitemap for a day after this).
      const step = await withCrawlLock(domain || item.competitor, async () => {
        let s = await call("/plugins/price-update/capture/discover", { method: "POST", body: { ...base, documents: [] } });
        for (let round = 0; s.need && s.need.length && round < 40; round++) {
          const documents = await Promise.all(s.need.map((url) => readSitemapDocument(url)));
          s = await call("/plugins/price-update/capture/discover", { method: "POST", body: { ...base, documents } });
        }
        return s;
      });
      const candidates = step.candidates || [];
      if (!candidates.length) {
        const done = await call("/plugins/price-update/capture/discover/confirm", { method: "POST", body: { ...base, url: null } });
        return { ok: false, match: done.match, error: step.message || `No matching page found on ${label}` };
      }
      // 2. Open the best pages until one passes AgainERP's product check.
      const reasons = [];
      for (const url of candidates.slice(0, 4)) {
        const read = await readPage(url);
        if (read.error) {
          reasons.push(read.error);
          continue;
        }
        const page = read.page;
        const result = await call("/plugins/price-update/capture/discover/confirm", {
          method: "POST",
          body: {
            ...base,
            url: page.url || url,
            title: page.title,
            price: page.price,
            regular_price: page.regular_price,
            in_stock: page.in_stock,
            stock_label: page.stock_label,
          },
        });
        if (result.ok) {
          const matched = result.match.status === "matched";
          return { ok: matched, match: result.match, error: matched ? "" : result.match.status_message, found: true };
        }
        reasons.push(`${page.title || url}: ${result.reason}`);
      }
      const done = await call("/plugins/price-update/capture/discover/confirm", {
        method: "POST",
        body: { ...base, url: null, closest: candidates[0] },
      });
      if (done.ok) {
        // AgainERP's AI check picked one of the near misses (only with "AI result picking" on).
        const matched = done.match.status === "matched";
        return { ok: matched, match: done.match, error: matched ? "" : done.match.status_message, found: true };
      }
      return { ok: false, match: done.match, error: `No page on ${label} matched closely enough (${reasons[0] || "checked the closest pages"})` };
    } catch (err) {
      return { ok: false, error: signInError(err) };
    }
  });
}

// Price Compare's ↻ fallback: the server couldn't read this link, so read it here, now.
async function syncOne(item, ctx) {
  if (!item || !item.match_id || !item.url) return { ok: false, error: "No saved link to read" };
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);
  // from an admin page the extension needs no sign-in of its own: it saves through that page
  if (!ctx && (!token || !apiBase)) return { ok: false, error: "Sign in to the Send to AgainERP extension first" };
  return withKeepAlive(async () => {
    try {
      const result = await syncItem(item, ctx);
      return { ok: result.ok, match: result.match || null, error: result.ok ? "" : result.summary };
    } catch (err) {
      return { ok: false, error: signInError(err) };
    }
  });
}

// ── auto-sync run ──────────────────────────────────────────────────────────

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function runSync(trigger) {
  const { token, apiBase, autoSync, syncLock } = await chrome.storage.local.get(["token", "apiBase", "autoSync", "syncLock"]);
  if (syncLock && Date.now() - syncLock < LOCK_MINUTES * 60000) return;
  const report = {
    trigger,
    startedAt: Date.now(),
    finishedAt: null,
    total: 0,
    done: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    error: "",
    items: [],
  };
  const save = () => chrome.storage.local.set({ syncReport: report });
  if (!token || !apiBase) {
    report.error = "Sign in to AgainERP in the extension first.";
    report.finishedAt = Date.now();
    await save();
    return;
  }

  await chrome.storage.local.set({ syncLock: Date.now() });
  runActive = true;
  await setBadge("…", "#2563eb");
  await withKeepAlive(async () => {
    try {
      const hours = Math.max(1, Number(autoSync && autoSync.hours) || 3);
      // Default: only what the server can't read (blocked sites); "all" re-reads every site here.
      const onlyFailed = !autoSync || autoSync.mode !== "all";
      // Slightly less than the interval, so a link checked last run is due again this run.
      const queue = await api(
        `/plugins/price-update/capture/queue?stale_hours=${hours * 0.8}&limit=${MAX_PER_RUN}&only_failed=${onlyFailed}`,
      );
      const items = queue.data || [];
      report.total = items.length;
      await save();

      // Several tabs at once; the pool keeps each site within its own limits.
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          const item = items[next++];
          const row = { name: item.product_name, site: item.competitor_label, url: item.url, result: "", ok: false };
          report.items.push(row);
          let result;
          try {
            result = await syncItem(item);
          } catch (err) {
            if (err.status === 401) throw err;
            result = { ok: false, summary: err.message };
          }
          if (result.skipped) report.skipped++;
          else if (result.ok) report.updated++;
          else report.failed++;
          row.ok = result.ok;
          row.result = result.summary;
          report.done += 1;
          await save();
        }
      };
      const workers = Math.min(await tabLimit(), Math.max(1, items.length));
      await Promise.all(Array.from({ length: workers }, worker));
    } catch (err) {
      report.error = err.status === 401 ? "Your AgainERP sign-in expired — open the extension and sign in again." : err.message;
    } finally {
      runActive = false;
      scheduleIdleClose();
      report.finishedAt = Date.now();
      await save();
      await chrome.storage.local.set({ syncLock: 0 });
      const problems = report.failed + report.skipped + (report.error ? 1 : 0);
      await setBadge(problems ? String(problems) : "", "#d97706");
    }
  });
}
