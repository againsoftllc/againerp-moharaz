"""Free competitor-link discovery from a site's sitemap.

Almost every shop publishes its whole catalogue as a sitemap for search engines (StarTech
27k product URLs in <1s, Ryans 44k in ~3s, Techland 42k in ~3s). We download it once per
site (cached), match each of our products to a URL by its slug — model codes weigh most,
then brand, then other words; accessories for the product are penalised — and then
**verify** the best candidates by opening the page: its own product name must carry our
brand + model code and its price must be plausible next to ours. Only a verified page is
saved as the product's link. No search API, no AI.
"""

from __future__ import annotations

import re
import threading
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.services.catalog_ai.scraper import _BROWSER_HEADERS

SITEMAP_TTL_SECONDS = 24 * 3600
MAX_SITEMAP_FILES = 80
MAX_URLS = 300_000
_NOT_PRODUCT = re.compile(
    r"/(category|categories|brand|brands|blog|blogs|tag|tags|page|pages|collections?|policy|news|author|"
    r"information|compare|search|account|cart|checkout)(/|$)",
    re.I,
)
_STOP = {"the", "and", "with", "for", "new", "official", "original", "price", "in", "bd", "bangladesh", "of",
         "a", "an", "by", "inch", "gb", "tb", "mhz", "ghz", "hz", "w", "bit", "pcs", "pack", "edition"}
# Things sold *for* a product — a slug carrying one of these (when our name doesn't) is an
# accessory, not the product: "keychron-resin-palm-rest-for-k2", "laptop-battery-for-hp-pavilion-14".
_ACCESSORY = {"battery", "batteries", "adapter", "charger", "keyboard", "keycap", "keycaps", "palm", "rest",
              "bag", "backpack", "sleeve", "case", "cover", "skin", "protector", "glass", "tempered", "stand",
              "mount", "bracket", "cable", "strap", "replacement", "spare", "parts", "screen", "display",
              "panel", "hinge", "fan", "cooler", "for", "compatible", "dock", "refill", "cartridge", "toner", "ink"}


def tokens(text: Optional[str]) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if t not in _STOP and len(t) > 1]


def is_code(token: str) -> bool:
    """A model code: letters with digits ("ge230", "14ahp9", "s2425h") or a long number."""
    return bool(re.search(r"\d", token)) and (bool(re.search(r"[a-z]", token)) or len(token) >= 4)


def _slug(url: str) -> set[str]:
    return set(tokens(urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].replace("_", "-")))


# ------------------------------------------------------------------------------ sitemap


def _get(url: str) -> str:
    try:
        with httpx.Client(headers=_BROWSER_HEADERS, follow_redirects=True, timeout=30,
                          transport=httpx.HTTPTransport(retries=2)) as client:
            r = client.get(url)
        if r.status_code in (403, 429, 503):
            from app.services.catalog_ai.scraper import is_bot_challenge

            note_refused(url, challenge=is_bot_challenge(r))
        return r.text if r.status_code == 200 else ""
    except httpx.HTTPError:
        return ""


def sitemap_urls(domain: str) -> list[str]:
    """All product-looking URLs from robots.txt → sitemap(s) (index files followed)."""
    base = f"https://{domain.strip().strip('/')}/"
    if not domain.startswith("www.") and not _get(urljoin(base, "/robots.txt")):
        base = f"https://www.{domain.strip().strip('/')}/"
    robots = _get(urljoin(base, "/robots.txt"))
    queue = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots) or [urljoin(base, "/sitemap.xml"), urljoin(base, "/sitemap_index.xml")]
    seen: set[str] = set()
    urls: list[str] = []
    while queue and len(seen) < MAX_SITEMAP_FILES and len(urls) < MAX_URLS:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        locs = re.findall(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*</loc>", _get(sm))
        subs = [u for u in locs if u.lower().endswith(".xml") or "sitemap" in u.lower()]
        subs.sort(key=lambda u: 0 if "product" in u.lower() else 1)  # product sitemaps first
        queue = subs + queue
        urls += [u for u in locs if u not in subs and not _NOT_PRODUCT.search(u)]
    return list(dict.fromkeys(urls))[:MAX_URLS]


class SiteIndex:
    def __init__(self, urls: list[str]):
        self.urls = urls
        self.slugs = [_slug(u) for u in urls]
        self.inverted: dict[str, set[int]] = defaultdict(set)
        for i, slug in enumerate(self.slugs):
            for t in slug:
                self.inverted[t].add(i)

    def candidates(self, name: str, brand: Optional[str], model: Optional[str], limit: int = 3) -> list[tuple[str, float]]:
        text = " ".join(x for x in [brand, name, model] if x)
        # An "80 PLUS"/"80+" rating would rank every 80-PLUS power supply above the right model.
        text = re.sub(r"\b80\s*(?:\+|plus\b)", " ", text, flags=re.I)
        words = list(dict.fromkeys(tokens(text)))
        if not words:
            return []
        codes = [w for w in words if is_code(w)]
        brand_words = set(tokens(brand))
        weight = {w: (3.0 if w in codes else 2.0 if w in brand_words else 1.0) for w in words}
        total = sum(weight.values())
        pool: set[int] = set()
        for key in codes or [w for w in words if w in brand_words] or words[:2]:
            pool |= self.inverted.get(key, set())
        scored = []
        for i in pool:
            slug = self.slugs[i]
            if codes and not any(c in slug for c in codes):
                continue
            score = sum(weight[w] for w in words if w in slug) / total
            extra = slug - set(words)
            score -= 0.25 * len(extra & _ACCESSORY) + 0.015 * len(extra)
            scored.append((score, i))
        scored.sort(reverse=True)
        return [(self.urls[i], round(s, 3)) for s, i in scored[:limit] if s >= 0.45]


_cache: dict[str, tuple[float, SiteIndex]] = {}
_lock = threading.Lock()

# Shops block what looks like a crawl (techlandbd.com answered 403 after a burst of page loads):
# keep page loads to one site ≥ MIN_GAP apart, and after a 403/429 leave that site alone for
# BACKOFF_SECONDS instead of hammering it.
MIN_GAP_SECONDS = 1.5
BACKOFF_SECONDS = 600
# A Cloudflare browser check is not cleared by waiting a few minutes — it is an IP reputation
# decision that usually lifts within hours. Retrying every 10 minutes only keeps it alive.
CHALLENGE_BACKOFF_SECONDS = 3600
_last_hit: dict[str, float] = {}
_blocked_until: dict[str, float] = {}
_block_reason: dict[str, str] = {}


def _host(url_or_domain: str) -> str:
    host = urlparse(url_or_domain).netloc or url_or_domain
    return host.lower().removeprefix("www.")


def blocked_for(url_or_domain: str) -> int:
    """Seconds left before we may contact this site again (0 = not blocked)."""
    return max(0, int(_blocked_until.get(_host(url_or_domain), 0) - time.time()))


def note_refused(url_or_domain: str, *, challenge: bool = False) -> None:
    host = _host(url_or_domain)
    _blocked_until[host] = time.time() + (CHALLENGE_BACKOFF_SECONDS if challenge else BACKOFF_SECONDS)
    _block_reason[host] = "challenge" if challenge else "rate"


def block_reason(url_or_domain: str) -> str:
    """"challenge" (Cloudflare browser check) or "rate" (403/429 for too many requests)."""
    return _block_reason.get(_host(url_or_domain), "rate")


def pace(url_or_domain: str) -> None:
    """Wait until MIN_GAP_SECONDS have passed since the last page load from this site."""
    host = _host(url_or_domain)
    with _lock:
        wait = _last_hit.get(host, 0) + MIN_GAP_SECONDS - time.time()
        _last_hit[host] = time.time() + max(0.0, wait)
    if wait > 0:
        time.sleep(wait)


def slug_name(url: str) -> str:
    """A URL's last path part as words — "tp-link-archer-ge230-router" → "tp link archer ge230 router"."""
    return re.sub(r"[-_]+", " ", urlparse(url).path.rstrip("/").rsplit("/", 1)[-1])


def cached_index(domain: str) -> Optional[SiteIndex]:
    key = domain.lower().removeprefix("www.")
    with _lock:
        hit = _cache.get(key)
    return hit[1] if hit and time.time() - hit[0] < SITEMAP_TTL_SECONDS else None


# A site that blocks this server (Cloudflare) can still be crawled through the admin's browser:
# the extension downloads robots.txt and sitemap files and hands us what's in them, a few at a
# time. This keeps the crawl's state between those requests.
_BROWSER_CRAWL_TTL = 30 * 60
_browser_crawls: dict[str, dict] = {}


def _split_locs(locs: list[str]) -> tuple[list[str], list[str]]:
    subs = [u for u in locs if u.lower().split("?")[0].endswith(".xml") or "sitemap" in u.lower()]
    subs.sort(key=lambda u: 0 if "product" in u.lower() else 1)  # product sitemaps first
    sub_set = set(subs)
    return subs, [u for u in locs if u not in sub_set and not _NOT_PRODUCT.search(u)]


def browser_crawl_step(domain: str, documents: list[dict]) -> tuple[list[str], Optional[SiteIndex]]:
    """Feed sitemap documents read by the browser; returns (more URLs to read, None) until the
    crawl is complete, then ([], index). documents: {"url", "kind": "robots"|"sitemap",
    "sitemaps": [...] (robots), "locs": [...] (sitemap), "failed": bool}."""
    key = domain.lower().removeprefix("www.")
    index = cached_index(key)
    if index is not None:
        return [], index
    with _lock:
        state = _browser_crawls.get(key)
        if not state or time.time() - state["started"] > _BROWSER_CRAWL_TTL:
            state = {"started": time.time(), "queue": None, "seen": set(), "urls": []}
            _browser_crawls[key] = state
        for doc in documents:
            url = str(doc.get("url") or "")
            state["seen"].add(url)
            if doc.get("kind") == "robots":
                found = [s for s in (doc.get("sitemaps") or []) if isinstance(s, str)]
                base = f"https://{urlparse(url).netloc or key}/"
                state["queue"] = found or [urljoin(base, "/sitemap.xml"), urljoin(base, "/sitemap_index.xml")]
            elif not doc.get("failed"):
                subs, products = _split_locs([u for u in (doc.get("locs") or []) if isinstance(u, str)])
                state["queue"] = subs + (state["queue"] or [])
                state["urls"] += products
        if state["queue"] is None:
            return [f"https://{key}/robots.txt"], None
        pending = [u for u in dict.fromkeys(state["queue"]) if u not in state["seen"]]
        if pending and len(state["seen"]) < MAX_SITEMAP_FILES and len(state["urls"]) < MAX_URLS:
            return pending[:4], None
        urls = list(dict.fromkeys(state["urls"]))[:MAX_URLS]
        _browser_crawls.pop(key, None)
    index = SiteIndex(urls)
    if index.urls:
        with _lock:
            _cache[key] = (time.time(), index)
    return [], index


def site_index(domain: str) -> SiteIndex:
    key = domain.lower().removeprefix("www.")
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < SITEMAP_TTL_SECONDS:
            return hit[1]
    index = SiteIndex(sitemap_urls(key))
    if index.urls:
        with _lock:
            _cache[key] = (time.time(), index)
    return index


# --------------------------------------------------------------------------- verification


@dataclass
class Verdict:
    ok: bool
    reason: str
    title: str = ""


# Words that make a different product of the same line: an RTX 4070 *Ti*, an MX Master 3S
# *Lite*, a G502 *Lightspeed*, a *refurbished* MacBook. On the page but not in our name → reject.
_VARIANT = {"ti", "super", "pro", "plus", "max", "ultra", "mini", "lite", "se", "lightspeed", "hero",
            "refurbished", "renewed", "used", "certified", "oem", "tray", "shift", "xl", "fe", "d4",
            # Colour editions are separate products ("RM750x White"). Black isn't listed: shops
            # often add it to the default model's name.
            "white", "pink", "purple", "red", "blue", "green", "grey", "gray", "silver", "yellow",
            "orange"}
# Spec values, not model codes — titles often leave them out ("100Hz", "32GB", "1600-DPI").
_SPEC_CODE = re.compile(r"^\d+(hz|khz|mhz|ghz|gb|tb|mb|w|kw|mah|dpi|mm|cm|kva|va|v|nm|inch|in|p|k|fps|mp|ms)(x\d+)?$")
# Generic words a page title may phrase differently — don't count them as name coverage.
_GENERIC = {"gaming", "laptop", "notebook", "monitor", "display", "mouse", "keyboard", "headphone", "headphones",
            "headset", "router", "processor", "cpu", "motherboard", "ssd", "nvme", "ram", "desktop", "case",
            "casing", "tower", "power", "supply", "psu", "smartphone", "phone", "tablet", "tv", "smart", "led",
            "camera", "webcam", "speaker", "printer", "ups", "wireless", "wired", "dual", "band", "black", "white",
            "silver", "grey", "gray", "blue", "red", "purple", "pink", "green", "series", "fhd", "hd", "uhd", "ips",
            "optical", "rgb", "argb", "mid", "fan", "cooler", "air", "internal", "external", "portable", "wi", "fi",
            "gigabit", "ethernet", "mesh", "touch", "inch", "vidaa", "google", "android", "official",
            "gold", "bronze", "platinum", "titanium", "modular", "atx"}


def _normalize(text: str) -> str:
    """Lowercase, drop "#960-000770"-style part numbers, keep a model code's short suffix with
    it ("Z790-P" → "z790p", so it can't match "Z790-A")."""
    t = re.sub(r"#\s*[\w-]+", " ", (text or "").lower())
    t = re.sub(r"\bwi[\s-]?fi\b", "wifi", t)
    # "80 PLUS Gold" / "80+" is a power-supply efficiency rating, not a "Plus" model variant —
    # and shops often leave it out of the name, so it shouldn't decide a match either way.
    # The whole rating goes, tier and "certified" included ("80 PLUS Gold Certified"), so neither
    # "silver" (a colour below) nor "certified" (refurbished stock) is misread.
    t = re.sub(
        r"\b80\s*(?:\+|plus\b)\s*(?:bronze|silver|gold|platinum|titanium)?\s*(?:certified\b)?", " ", t
    )
    return re.sub(r"\b([a-z]*\d[a-z0-9]*)[-\s]([a-z])\b(?![-\w])", r"\1\2", t)


def _all_tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", _normalize(text)) if t not in _STOP or t.isdigit()]


def _verify_codes(page: set[str], ours: list[str], brand_words: set[str], page_name: str) -> Verdict:
    model_codes = [c for c in ours if is_code(c) and not c.isdigit() and not _SPEC_CODE.match(c)]
    if model_codes and model_codes[0] not in page:
        return Verdict(False, f"model {model_codes[0]} not in name", page_name)
    variants = (page & _VARIANT) - set(ours)
    if variants:
        return Verdict(False, f"different variant ({', '.join(sorted(variants))})", page_name)
    return Verdict(True, "plausible", page_name)


_CAPACITY = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(gb|tb|mah|mhz|hz|kva|va|w)(?![a-z])")


def _capacity_mismatch(our_text: str, page_text: str) -> str:
    """32GB vs 64GB, 750W vs 650W, 100Hz vs 180Hz: when both names state a value in the same unit
    and ours isn't among the page's, it's another product. "16GB x2" still counts as 32GB."""
    ours: dict[str, set[float]] = {}
    page: dict[str, set[float]] = {}
    for text, into in ((our_text, ours), (page_text, page)):
        for value, unit in _CAPACITY.findall(text):
            into.setdefault(unit, set()).add(float(value))
    for unit, wanted in ours.items():
        found = page.get(unit)
        if not found:
            continue  # the page doesn't say — fine
        for v in wanted:
            if v not in found and not any(f * k == v for f in found for k in (2, 4)):
                return f"different {unit.upper()} ({', '.join(f'{x:g}{unit}' for x in sorted(found))} vs our {v:g}{unit})"
    return ""


def verify(page_name: str, page_price: Optional[float], *, name: str, brand: Optional[str],
           model: Optional[str], our_price: Optional[float], lenient: bool = False) -> Verdict:
    """Is this page our product? Compared the way a person would:
    1. our brand is on the page;
    2. every number in our name is on it (Slim 5 ≠ Slim 3, 27" ≠ 32", Anker 737);
    3. our main model code is on it exactly ("z790p" ≠ "z790a"); other model codes mostly,
       spec-like codes (100Hz, 32GB, 1600-DPI) optional;
    4. most of our distinctive words are on it (MacBook Air, ROG Strix, DeathAdder);
    5. no variant word we don't have (Ti, Super, Pro, Lite, Lightspeed, Refurbished, …);
    6. not an accessory, and the price is plausible next to ours.
    `lenient` (a URL's words, before spending a page load on it): only brand, model codes and
    variant words — URLs often leave out sizes and numbers ("…-odyssey-g5-curved-…")."""
    page = set(_all_tokens(page_name))
    ours = list(dict.fromkeys(_all_tokens(" ".join(x for x in [name, model] if x))))
    if not page or not ours:
        return Verdict(False, "no page name to compare", page_name)
    brand_words = set(tokens(brand))
    if brand_words and not brand_words & page:
        return Verdict(False, f"brand '{brand}' not in page name", page_name)
    capacity = _capacity_mismatch(_normalize(" ".join(x for x in [name, model] if x)), _normalize(page_name))
    if capacity:
        return Verdict(False, capacity, page_name)
    if lenient:
        return _verify_codes(page, ours, brand_words, page_name)
    our_text, page_text = _normalize(" ".join(x for x in [name, model] if x)), _normalize(page_name)
    page_numbers = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", page_text)]
    # Screen / size values (23.8", 32 inch) must match approximately: 23.8 ≈ 24, 27 ≠ 32.
    for size in re.findall(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(?:\"|”|''|inch|in\b)", our_text):
        if not any(abs(float(size) - n) <= 0.5 for n in page_numbers):
            return Verdict(False, f'size {size}" not on the page', page_name)
    # Other standalone numbers (Slim 5, Anker 737, 3-Pack) must appear exactly; spec values
    # (1600-DPI, 750W, 80+, 23.8) and digits inside model codes (fc120) are left to the codes.
    numbers = re.findall(
        r"(?<![\w.])(\d{1,4})(?![\d.\"”]|\s*(?:inch|in\b|hz|khz|mhz|ghz|gb|tb|mb|w\b|kw|mah|dpi|mm|cm|kva|va\b|v\b|nm|fps|mp|ms)|\+|-dpi)",
        our_text,
    )
    page_ints = {str(int(float(n))) for n in re.findall(r"(?<![a-z\d.])\d+(?:\.\d+)?", page_text) if float(n) == int(float(n))}
    missing_numbers = [n for n in dict.fromkeys(numbers) if str(int(n)) not in page_ints]
    if not missing_numbers:
        # "IdeaPad Slim 5" vs "Slim 3 … Intel Core 5 120U": the 5 must follow the same word.
        for m in re.finditer(r"([a-z]{2,})\s+(\d{1,4})(?![\d.\"”a-z])", our_text):
            word, num = m.group(1), m.group(2)
            if word in _GENERIC or word in _STOP or word in brand_words:
                continue
            if not re.search(rf"\b{word}\s*{num}(?![\d])", page_text):
                return Verdict(False, f"'{word} {num}' not in page name", page_name)
    if missing_numbers:
        return Verdict(False, f"number {', '.join(missing_numbers)} not in page name", page_name)
    codes = [w for w in ours if is_code(w) and not w.isdigit()]
    model_codes = [c for c in codes if not _SPEC_CODE.match(c)]
    if model_codes:
        if model_codes[0] not in page:
            return Verdict(False, f"model {model_codes[0]} not in page name", page_name)
        missing = [c for c in model_codes[1:] if c not in page]
        if len(missing) > len(model_codes[1:]) / 2:
            return Verdict(False, f"model {', '.join(missing)} not in page name", page_name)
    words = [w for w in ours if not any(ch.isdigit() for ch in w) and w not in _GENERIC and w not in brand_words and len(w) > 1]
    # A strong model code (32a4s, s2425h, 14ahp9, ge230, 7800x3d) already pins the product, so
    # descriptive words may differ; a weak one (m2, v3, k2, g5) needs our words to be there too.
    strong = bool(model_codes) and len(model_codes[0]) >= 4
    if words:
        covered = sum(1 for w in words if w in page) / len(words)
        if covered < (0.34 if strong else 0.6):
            return Verdict(False, f"name words missing ({', '.join(w for w in words if w not in page)})", page_name)
    if "wifi" in ours and "wifi" not in page:
        return Verdict(False, "ours has WiFi, the page's product doesn't", page_name)
    variants = (page & _VARIANT) - set(ours)
    if variants:
        return Verdict(False, f"different variant ({', '.join(sorted(variants))})", page_name)
    accessory = (page & _ACCESSORY) - set(ours) - _GENERIC
    if len(accessory) >= 2:
        return Verdict(False, f"looks like an accessory ({', '.join(sorted(accessory))})", page_name)
    if our_price and page_price and not (our_price * 0.4 <= page_price <= our_price * 2.5):
        return Verdict(False, f"price {page_price:,.0f} is far from ours {our_price:,.0f}", page_name)
    return Verdict(True, "verified", page_name)


# Rejections an AI check may overrule: the page name just words things differently ("number 750
# not in page name", "name words missing", a model code the shop left out). Never these: another
# brand, variant, colour, size, accessory, missing WiFi, a far-off price, or "Slim 3" vs "Slim 5".
_SOFT_REJECT = ("not in page name", "name words missing", "not in name")
_HARD_REJECT = ("brand ", "different variant", "size ", "accessory", "wifi", "price ", "no page name", "' not in page name")


def soft_reject(reason: str) -> bool:
    r = (reason or "").lower()
    if any(h in r for h in _HARD_REJECT):
        return False
    return any(s in r for s in _SOFT_REJECT)


AI_PRICE_MATCH = 0.85


def price_close(page_price, our_price, ratio: float = AI_PRICE_MATCH) -> bool:
    """The two prices agree to within `ratio` (cheaper ÷ dearer ≥ 0.85 by default). A page an
    AI check may accept must pass this — a price that far off usually means a different product."""
    try:
        a, b = float(page_price), float(our_price)
    except (TypeError, ValueError):
        return False
    if a <= 0 or b <= 0:
        return False
    return min(a, b) / max(a, b) >= ratio


def ai_check_candidate(reason: str, page_price, our_price) -> bool:
    """A page the AI check may look at: it failed the free rules only on wording — or looked like an
    accessory, which a same-price page rarely is ("Tempered Glass Window" on a PC case) — and its
    price is within 85% of ours."""
    r = (reason or "").lower()
    if not (soft_reject(reason) or "accessory" in r):
        return False
    return price_close(page_price, our_price)
