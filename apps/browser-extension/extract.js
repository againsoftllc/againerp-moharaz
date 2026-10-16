// Runs inside the shop's product page (injected with chrome.scripting.executeScript).
// Reads the product the same way the server does — structured data first (schema.org JSON-LD,
// microdata, meta tags), then the visible page — but in the admin's real browser, so bot checks
// like Cloudflare's never get in the way. Must stay self-contained: it is serialized and injected.
function againerpExtractProduct(sourceDoc, sourceUrl) {
  // Reads the page it's injected into, or — with arguments — a page fetched in the background and
  // parsed with DOMParser (no layout there, so the "visible price" fallback simply finds nothing).
  const doc = sourceDoc || document;
  const pageUrl = sourceUrl || location.href;
  const win = doc.defaultView || window;
  const scrollTop = doc.defaultView ? doc.defaultView.scrollY : 0;
  const clean = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();

  function money(value) {
    if (value == null) return null;
    if (typeof value === "number") return value > 0 ? value : null;
    let s = clean(value).replace(/[৳$€£₹]|\b(?:tk|bdt|taka|usd|inr)\b\.?/gi, "").trim();
    // Bengali digits → ASCII
    s = s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
    const m = s.match(/\d[\d,]*(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function stockFromText(text) {
    const t = clean(text).toLowerCase();
    if (!t) return null;
    if (/out\s*of\s*stock|stock\s*out|sold\s*out|unavailable|not\s*available|discontinued|upcoming|up\s*coming|coming\s*soon/.test(t)) return false;
    if (/in\s*stock|available|pre[\s-]*order|add\s*to\s*cart|buy\s*now/.test(t)) return true;
    return null;
  }

  function stockFromSchema(value) {
    const t = clean(value).toLowerCase();
    if (!t) return null;
    if (/instock|in_stock|limitedavailability|preorder|presale|onlineonly|instoreonly/.test(t.replace(/\s/g, ""))) return true;
    if (/outofstock|out_of_stock|soldout|discontinued|backorder/.test(t.replace(/\s/g, ""))) return false;
    return null;
  }

  // Still on a bot check ("Just a moment…")? Nothing to read until the browser passes it.
  if (/just a moment|attention required|checking your browser/i.test(doc.title) || doc.querySelector("#challenge-form, #cf-challenge-running, .cf-turnstile")) {
    return { challenge: true, url: pageUrl };
  }

  const pageTitle = clean((doc.querySelector("h1") || {}).textContent) || clean(doc.title);
  const result = {
    url: pageUrl.split("#")[0],
    title: pageTitle,
    price: null,
    regular_price: null,
    in_stock: null,
    stock_label: "",
    currency: "",
    image: "",
    sku: "",
    source: "",
  };

  // ── 1. schema.org JSON-LD (walk every nested object; prefer the Product whose name fits the page)
  const products = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = [].concat(node["@type"] || []).map(String);
    if (type.some((t) => /^(Product|ProductGroup|IndividualProduct|ProductModel)$/i.test(t))) products.push(node);
    for (const key of Object.keys(node)) if (typeof node[key] === "object") walk(node[key]);
  }
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      walk(JSON.parse(el.textContent));
    } catch (_) {
      /* malformed JSON-LD is common — skip it */
    }
  });

  function offerOf(product) {
    let offers = product.offers || (product.hasVariant && [].concat(product.hasVariant).map((v) => v.offers).filter(Boolean));
    offers = [].concat(offers || []).flat();
    for (const o of offers) {
      if (!o || typeof o !== "object") continue;
      const spec = [].concat(o.priceSpecification || [])[0] || {};
      const price = money(o.price ?? o.lowPrice ?? spec.price);
      if (price) return { price, offer: o, high: money(o.highPrice) };
    }
    return null;
  }

  const words = (s) => new Set(clean(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const titleWords = words(pageTitle);
  const fit = (p) => {
    const w = words(p.name);
    let hit = 0;
    w.forEach((x) => titleWords.has(x) && hit++);
    return w.size ? hit / w.size : 0;
  };
  const priced = products.map((p) => ({ p, o: offerOf(p) })).filter((x) => x.o);
  priced.sort((a, b) => fit(b.p) - fit(a.p));
  if (priced.length) {
    const { p, o } = priced[0];
    result.price = o.price;
    result.currency = clean(o.offer.priceCurrency);
    result.in_stock = stockFromSchema(o.offer.availability);
    result.stock_label = clean(String(o.offer.availability || "").split("/").pop()).replace(/([a-z])([A-Z])/g, "$1 $2");
    result.title = clean(p.name) || result.title;
    result.sku = clean(p.sku || p.mpn);
    const img = [].concat(p.image || [])[0];
    result.image = typeof img === "string" ? img : clean(img && (img.url || img.contentUrl));
    result.source = "schema.org data";
  } else if (products.length) {
    // No usable price (e.g. Ryans lists out-of-stock items with "price": 0) — the offer's
    // availability is still the most reliable stock signal on the page.
    const best = [...products].sort((a, b) => fit(b) - fit(a))[0];
    const offer = [].concat(best.offers || []).flat().find((o) => o && o.availability);
    if (offer) {
      result.in_stock = stockFromSchema(offer.availability);
      result.stock_label = clean(String(offer.availability).split("/").pop()).replace(/([a-z])([A-Z])/g, "$1 $2");
    }
  }

  // ── 2. microdata (itemprop) and meta tags
  const meta = (names) => {
    for (const n of names) {
      const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      if (el && el.content) return el.content;
    }
    return "";
  };
  if (!result.price) {
    const el = doc.querySelector('[itemprop="price"], [itemprop="lowPrice"]');
    const value = el && (el.getAttribute("content") || el.textContent);
    if (money(value)) {
      result.price = money(value);
      result.source = "page microdata";
    }
  }
  if (!result.price) {
    const value = meta(["product:price:amount", "og:price:amount", "twitter:data1"]);
    if (money(value)) {
      result.price = money(value);
      result.currency = meta(["product:price:currency", "og:price:currency"]);
      result.source = "page meta tags";
    }
  }
  if (result.in_stock == null) {
    const av = doc.querySelector('[itemprop="availability"]');
    result.in_stock = stockFromSchema((av && (av.getAttribute("href") || av.getAttribute("content"))) || meta(["product:availability", "og:availability"]));
  }
  if (!result.image) result.image = meta(["og:image", "twitter:image"]);

  // ── 3. visible page: price-looking elements near the title (works on any theme)
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const isStruck = (el) =>
    !!el.closest("del, s, strike, [class*='old' i], [class*='regular' i], [class*='was' i], [class*='compare' i], [class*='line-through' i]") ||
    win.getComputedStyle(el).textDecorationLine.includes("line-through");
  // Skip related/recommended product cards and EMI/instalment boxes.
  const isNoise = (el) =>
    !!el.closest(
      "[class*='related' i], [class*='similar' i], [class*='recommend' i], [class*='upsell' i], [class*='cross-sell' i], [class*='carousel' i], [class*='emi' i], [class*='installment' i], [class*='instalment' i], footer, header nav",
    );

  const h1 = doc.querySelector("h1");
  const h1Top = h1 ? h1.getBoundingClientRect().top + scrollTop : 0;
  const candidates = [];
  doc.querySelectorAll("[class*='price' i], [id*='price' i], ins, .amount, [data-price]").forEach((el) => {
    if (!visible(el) || isNoise(el) || el.children.length > 6) return;
    const text = clean(el.getAttribute("data-price") || el.textContent);
    if (text.length > 60) return;
    const n = money(text);
    if (!n || n < 10) return;
    const top = el.getBoundingClientRect().top + scrollTop;
    candidates.push({ n, struck: isStruck(el), dist: Math.abs(top - h1Top), hasCurrency: /৳|tk|bdt|\$|€|£|₹/i.test(text) });
  });
  candidates.sort((a, b) => a.dist - b.dist || b.hasCurrency - a.hasCurrency);
  const near = candidates.filter((c) => c.dist < 900);
  if (!result.price) {
    const live = near.find((c) => !c.struck) || candidates.find((c) => !c.struck);
    if (live) {
      result.price = live.n;
      result.source = "visible page";
    }
  }
  const struck = near.find((c) => c.struck && result.price && c.n > result.price && c.n < result.price * 3);
  if (struck) result.regular_price = struck.n;

  // ── 4. stock label on the page ("Status: In Stock", "Availability: Out of Stock", …)
  if (result.in_stock == null) {
    const nodes = doc.querySelectorAll(
      "[class*='stock' i], [class*='availability' i], [class*='status' i], [id*='stock' i], [id*='availability' i]",
    );
    for (const el of nodes) {
      if (!visible(el) || isNoise(el)) continue;
      const text = clean(el.textContent);
      if (!text || text.length > 80) continue;
      const s = stockFromText(text);
      if (s != null) {
        result.in_stock = s;
        result.stock_label = text;
        break;
      }
    }
  }
  if (result.in_stock == null) {
    const body = clean(doc.body.innerText).slice(0, 20000);
    const m = body.match(/(?:status|availability|stock)\s*:?\s*(in\s*stock|out\s*of\s*stock|stock\s*out|pre[\s-]*order|up\s*coming|sold\s*out)/i);
    if (m) {
      result.in_stock = stockFromText(m[1]);
      result.stock_label = m[1];
    }
  }
  // No price: the product block usually says why ("Coming Soon", "Price To be announced ·
  // Up Coming", "Out of Stock") — that beats a schema "InStock" left on a price-0 offer.
  if (!result.price && h1) {
    let block = h1;
    for (let i = 0; i < 4 && block.parentElement; i++) block = block.parentElement;
    const text = clean(block.innerText).slice(0, 3000);
    const m = text.match(/coming\s*soon|up\s*coming|upcoming|to\s*be\s*announced|price\s*tba|call\s*for\s*price|out\s*of\s*stock|stock\s*out|sold\s*out|discontinued|pre[\s-]*order/i);
    if (m) {
      // "Call for price" says nothing about stock; the others mean it can't be bought now.
      result.in_stock = /call\s*for\s*price/i.test(m[0]) ? null : /pre[\s-]*order/i.test(m[0]);
      result.stock_label = m[0].replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  if (result.image && !/^https?:/i.test(result.image)) {
    try {
      result.image = new URL(result.image, pageUrl).href;
    } catch (_) {
      result.image = "";
    }
  }
  return result;
}
