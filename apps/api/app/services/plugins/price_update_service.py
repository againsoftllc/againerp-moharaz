"""Price Update plugin — finds and re-checks competitor prices for our catalog
products on Startech, Ryans, and Techland.

Discovery (search) uses Google Custom Search JSON API when a key is configured;
a match can also be entered/pasted manually and skips search entirely. Price
extraction reuses the existing catalog_ai scraper (httpx + BeautifulSoup, the
same fetcher already proven against startech.com.bd for product import) and
tries each competitor's known price-label pattern, falling back to a generic
currency-symbol scan so a new competitor can be added with just a domain.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
from urllib.parse import quote_plus, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.price_update_plugin import PriceUpdateCompetitorSite, PriceUpdateMatch, PriceUpdatePlugin
from app.services.catalog_ai.scraper import fetch_page
from app.services.plugins.sitemap_matcher import (
    block_reason,
    blocked_for,
    note_refused,
    pace,
    site_index,
    ai_check_candidate,
    slug_name,
    verify,
)


class SiteRefusing(Exception):
    """The competitor answered 403/429 — we're paused on it (sitemap_matcher.BACKOFF_SECONDS)."""

    def __init__(self, domain: str):
        super().__init__(domain)
        self.domain = domain
from app.services.plugins.price_update_ai import (
    confirm_same_product,
    extract_price_with_ai,
    pick_best_candidate,
    search_and_extract_via_web_search,
)

DEFAULT_ID = "price-update-default"
SEARCH_TIMEOUT = 15.0
COMPETITOR_FETCH_TIMEOUT = 40.0  # competitor sites run noticeably slower/heavier than our own.

# Seeded into PriceUpdateCompetitorSite the first time a company touches this plugin — after
# that, the DB table is the source of truth and any of these (or user-added sites) can be
# disabled or removed freely. Kept as a plain list (not a hardcoded lookup used elsewhere) so
# adding/removing a competitor is purely data, not a code change.
DEFAULT_COMPETITORS: list[dict[str, str]] = [
    {"id": "startech", "label": "Startech", "domain": "startech.com.bd"},
    {"id": "ryans", "label": "Ryans", "domain": "ryans.com"},
    {"id": "techland", "label": "Techland", "domain": "techlandbd.com"},
]


def _clean_number(raw: str) -> Optional[Decimal]:
    digits = raw.replace(",", "").strip()
    if not digits:
        return None
    try:
        return Decimal(digits)
    except InvalidOperation:
        return None


# One pattern per competitor, captures (current_price, regular_price?) — each verified live
# against several real single-product pages on that site (never guessed). Deliberately NOT a
# fallback chain tried in a fixed order across all sites: an earlier version tried every
# pattern on every page, and on a page where the "home" competitor's pattern didn't match, it
# would silently pick up whatever the NEXT competitor's pattern matched elsewhere on the page —
# e.g. a Techland "Related Products" price grabbed by a generic ৳-suffix scan. Each competitor
# only ever tries its own pattern; no match on that page means no_price, not "guess".
_COMPETITOR_PRICE_PATTERNS: dict[str, re.Pattern[str]] = {
    # Startech: "Price 124,000৳ Regular Price 135,080৳"
    "startech": re.compile(r"(?:Special\s+)?Price\s+([\d,]{3,})\s*৳(?:\s*Regular\s+Price\s+([\d,]{3,})\s*৳)?"),
    # Ryans: "Special Price Tk 64,500 Regular Price Tk 69,980" — confirmed present on every
    # real product page checked (not just discounted ones; "Regular Price" == "Special Price"
    # when there's no discount, but the label is always there).
    "ryans": re.compile(r"Special\s+Price\s+Tk\.?\s*([\d,]{3,})(?:\s*Regular\s+Price\s+Tk\.?\s*([\d,]{3,}))?"),
    # Techland: "Product Pricing Discount Price ৳6,190 ৳6,490 + Available" — verified against
    # 3 real product pages. A whole-page text scan on this site is otherwise dominated by a
    # "Related Products" rail (10+ other products' prices) that appears BEFORE this marker.
    # The label after "Product Pricing" varies by promo ("Discount Price", "Night Offer Price
    # Ends in 00:00:00", ...) — verified on a 4th real page — so it's matched loosely rather
    # than pinned to one literal label; "Product Pricing" itself is the reliable anchor.
    "techland": re.compile(r"Product\s+Pricing\s+.{0,60}?৳\s*([\d,]{3,})(?:\s*৳\s*([\d,]{3,}))?"),
}

# Only used for a competitor not in the dict above (future-proofing a new site added without
# a verified pattern yet) — never mixed with a known competitor's own pattern.
_GENERIC_PRICE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"([\d,]{3,})\s*৳"),
    re.compile(r"(?:Tk\.?|BDT)\s*([\d,]{3,})"),
]

_STOCK_WORDS = r"In Stock|Out of Stock|Stock Out|Sold Out|Pre[- ]?Order|Up ?Coming|Coming Soon|Discontinued|Call for Price|Available|Unavailable"
# The product's own status label first ("Status Up Coming" on startech.com.bd, "Availability:
# In Stock" elsewhere) — a bare first match could be a related product's badge.
_STOCK_LABEL_RE = re.compile(rf"\b(?:Status|Availability|Stock(?: Status)?)\s*:?\s*({_STOCK_WORDS})\b", re.IGNORECASE)
_STOCK_RE = re.compile(rf"\b({_STOCK_WORDS})\b", re.IGNORECASE)
_NOT_AVAILABLE = re.compile(r"out|sold|up ?coming|coming soon|discontinued|unavailable", re.IGNORECASE)


def _stock_status(text: str) -> tuple[Optional[bool], Optional[str]]:
    """(in_stock, label as the site wrote it). Pre-order / call-for-price stay unknown (None)."""
    m = _STOCK_LABEL_RE.search(text) or _STOCK_RE.search(text)
    if not m:
        return None, None
    label = re.sub(r"\s+", " ", m.group(1)).strip()
    if re.match(r"in stock|available$", label, re.IGNORECASE):
        return True, label
    if _NOT_AVAILABLE.search(label):
        return False, label
    return None, label

# A URL path shaped like this is a listing/category/brand page, not a single product — search
# sometimes ranks one above the real product page (e.g. Google matched "site:ryans.com UGREEN
# wifi adapter" to /category/wifi-adapter-ugreen). Extracting "a price" from such a page would
# be some arbitrary listed item's price, not the product being compared — reject it outright
# rather than guess.
_LISTING_PATH_RE = re.compile(r"/(categor(?:y|ies)|collections?|brands?|search|tags?)(?:/|$|\?)", re.IGNORECASE)


def _looks_like_listing_url(url: str) -> bool:
    return bool(_LISTING_PATH_RE.search(url))


@dataclass
class ExtractedPrice:
    price: Optional[Decimal]
    regular_price: Optional[Decimal]
    in_stock: Optional[bool]
    title: str
    fetch_failed: bool = False
    # Kept even on a failed/no-match extraction so a caller can hand the same already-fetched
    # text to the AI fallback without a second network fetch.
    page_text: str = ""
    # The site's own wording ("Up Coming", "Out Of Stock", "Pre Order") for the status message.
    stock_label: Optional[str] = None
    # The page's own product name (structured data, else <title>) — used to verify a match.
    page_name: str = ""
    # The site answered 403/429 (or we're still backing off from that) — not a missing page.
    refused: bool = False
    # Shown as the match's status message when set (e.g. "Matched by AI check").
    note: Optional[str] = None


def _extract_price(text: str, title: str, competitor: str) -> ExtractedPrice:
    patterns = (
        [_COMPETITOR_PRICE_PATTERNS[competitor]]
        if competitor in _COMPETITOR_PRICE_PATTERNS
        else _GENERIC_PRICE_PATTERNS
    )
    for pattern in patterns:
        m = pattern.search(text)
        if not m:
            continue
        price = _clean_number(m.group(1))
        regular = _clean_number(m.group(2)) if m.lastindex and m.lastindex >= 2 else None
        if price is not None:
            in_stock, stock_label = _stock_status(text)
            return ExtractedPrice(
                price=price, regular_price=regular, in_stock=in_stock, title=title, page_text=text,
                stock_label=stock_label,
            )
    in_stock, stock_label = _stock_status(text)
    return ExtractedPrice(
        price=None, regular_price=None, in_stock=in_stock, title=title, page_text=text, stock_label=stock_label,
    )


def get_or_create_settings(db: Session, company_id: str = "default") -> PriceUpdatePlugin:
    row = db.get(PriceUpdatePlugin, DEFAULT_ID)
    if row:
        return row
    row = PriceUpdatePlugin(id=DEFAULT_ID, company_id=company_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def key_hint(key: str) -> str:
    key = (key or "").strip()
    return key[-4:] if len(key) >= 8 else ""


def _ensure_default_competitors(db: Session, company_id: str) -> None:
    existing = (
        db.query(PriceUpdateCompetitorSite.id)
        .filter(PriceUpdateCompetitorSite.company_id == company_id)
        .count()
    )
    if existing:
        return
    for c in DEFAULT_COMPETITORS:
        db.add(PriceUpdateCompetitorSite(company_id=company_id, id=c["id"], label=c["label"], domain=c["domain"]))
    db.commit()


SOURCE_ID = "source"


def ensure_source_site(db: Session, company_id: str) -> None:
    """The "Source" column: the page a product was copied from (catalog_products.source_url). It is a site with no
    domain (any host is fine), always present, and the first column of the grid. Product Draft's AI import reads it."""
    if not get_competitor_site(db, company_id=company_id, competitor_id=SOURCE_ID):
        db.add(PriceUpdateCompetitorSite(company_id=company_id, id=SOURCE_ID, label="Source", domain="", enabled=True))
        db.commit()


def list_competitor_sites(db: Session, company_id: str) -> list[PriceUpdateCompetitorSite]:
    _ensure_default_competitors(db, company_id)
    ensure_source_site(db, company_id)
    from sqlalchemy import case

    return (
        db.query(PriceUpdateCompetitorSite)
        .filter(PriceUpdateCompetitorSite.company_id == company_id)
        .order_by(case((PriceUpdateCompetitorSite.id == SOURCE_ID, 0), else_=1), PriceUpdateCompetitorSite.created_at)
        .all()
    )


def get_competitor_site(db: Session, *, company_id: str, competitor_id: str) -> Optional[PriceUpdateCompetitorSite]:
    return db.get(PriceUpdateCompetitorSite, (company_id, competitor_id))


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify_domain(domain: str) -> str:
    core = domain.lower().split(".")[0]
    slug = _SLUG_RE.sub("-", core).strip("-")
    return slug or "site"


def add_competitor_site(db: Session, *, company_id: str, domain: str, label: str) -> PriceUpdateCompetitorSite:
    domain = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix) :]
    domain = domain.removeprefix("www.").split("/")[0]
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Enter a valid website domain, e.g. pickaboo.com")

    _ensure_default_competitors(db, company_id)
    base_slug = _slugify_domain(domain)
    slug = base_slug
    i = 2
    while get_competitor_site(db, company_id=company_id, competitor_id=slug) is not None:
        slug = f"{base_slug}-{i}"
        i += 1
    row = PriceUpdateCompetitorSite(
        company_id=company_id, id=slug, label=label.strip() or domain, domain=domain, enabled=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def remove_competitor_site(db: Session, *, company_id: str, competitor_id: str) -> None:
    if competitor_id == SOURCE_ID:
        raise HTTPException(status_code=400, detail="The Source column cannot be removed")
    row = get_competitor_site(db, company_id=company_id, competitor_id=competitor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Competitor site not found")
    db.query(PriceUpdateMatch).filter(
        PriceUpdateMatch.company_id == company_id, PriceUpdateMatch.competitor == competitor_id,
    ).delete()
    db.delete(row)
    db.commit()


def set_competitor_enabled(
    db: Session, *, company_id: str, competitor_id: str, enabled: bool,
) -> PriceUpdateCompetitorSite:
    row = get_competitor_site(db, company_id=company_id, competitor_id=competitor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Competitor site not found")
    row.enabled = enabled
    db.commit()
    db.refresh(row)
    return row


def enabled_competitors(db: Session, company_id: str) -> list[PriceUpdateCompetitorSite]:
    return [c for c in list_competitor_sites(db, company_id) if c.enabled]


class GoogleSearchError(Exception):
    """Raised when the Custom Search API call itself fails (bad key, API not enabled,
    quota, referer restriction, etc.) — distinct from a clean "no results" response."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def google_search(query: str, site_domain: str, api_key: str, cx: str, num: int = 5) -> list[dict]:
    """Up to `num` Custom Search results for `query` scoped to `site_domain`, in Google's
    ranking order. Empty list if no key/engine configured, or the API returned zero results.
    Raises GoogleSearchError if the API call itself failed, so the real reason can reach the UI.
    Returns several candidates (not just the top hit) because the top result is sometimes a
    category/listing page rather than the actual product — the caller picks the first one that
    doesn't look like a listing page."""
    if not api_key or not cx:
        return []
    try:
        with httpx.Client(timeout=SEARCH_TIMEOUT) as client:
            resp = client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={"key": api_key, "cx": cx, "q": f"{query} site:{site_domain}", "num": num},
            )
    except httpx.HTTPError as exc:
        raise GoogleSearchError(f"Request failed: {exc}") from exc
    if resp.status_code != 200:
        try:
            detail = resp.json().get("error", {}).get("message") or resp.text[:200]
        except Exception:
            detail = resp.text[:200]
        raise GoogleSearchError(f"HTTP {resp.status_code}: {detail}")
    items = resp.json().get("items") or []
    return [
        {"url": it.get("link", ""), "title": it.get("title", ""), **_pagemap_offer(it.get("pagemap") or {})}
        for it in items
    ]


def _pagemap_offer(pagemap: dict) -> dict:
    """The price/availability Google stored for a result from the page's own structured data
    (pagemap.offer / product / metatags) — {"g_price", "g_in_stock", "g_name"} when present."""
    out: dict = {}
    offers = pagemap.get("offer") or pagemap.get("aggregateoffer") or []
    metatags = (pagemap.get("metatags") or [{}])[0]
    for offer in offers:
        for key in ("price", "lowprice"):
            amount = _clean_number(str(offer.get(key) or "").replace("৳", "").replace("Tk", "").strip())
            if amount:
                out["g_price"] = amount
                break
        availability = str(offer.get("availability") or "").lower()
        if availability:
            out["g_in_stock"] = "instock" in availability or "in_stock" in availability
        if "g_price" in out:
            break
    if "g_price" not in out:
        for key in ("product:price:amount", "og:price:amount"):
            amount = _clean_number(str(metatags.get(key) or "").strip())
            if amount:
                out["g_price"] = amount
                break
    product = (pagemap.get("product") or [{}])[0]
    if product.get("name"):
        out["g_name"] = product["name"]
    return out


def google_price_fallback(
    settings: PriceUpdatePlugin, domain: str, product: CatalogProduct, saved_url: Optional[str],
    our_price: Optional[float], *, exact_only: bool = False,
) -> Optional[dict]:
    """When a shop blocks direct reading (Cloudflare check, 403/429): the price Google stored for
    the product's page on that shop. Takes the result that IS our saved link, else one whose
    name passes the full product check. One Custom Search query (Google API quota)."""
    if not settings.google_api_key or not settings.google_search_engine_id:
        return None
    try:
        results = google_search(
            _product_search_query(product), domain, settings.google_api_key, settings.google_search_engine_id
        )
    except GoogleSearchError:
        return None
    norm = lambda u: (u or "").split("?")[0].rstrip("/").lower().replace("://www.", "://")  # noqa: E731
    priced = [r for r in results if r.get("g_price")]
    chosen = next((r for r in priced if saved_url and norm(r["url"]) == norm(saved_url)), None)
    if chosen is None and not exact_only:
        for r in priced:
            name = r.get("g_name") or re.split(r"\s+[|–-]\s+", r.get("title", ""))[0]
            if verify(name, float(r["g_price"]), name=product.name, brand=product.brand,
                      model=product.model, our_price=our_price).ok:
                chosen = r
                break
    if chosen is None:
        return None
    return {
        "url": chosen["url"],
        "price": chosen["g_price"],
        "in_stock": chosen.get("g_in_stock"),
        "title": chosen.get("g_name") or chosen.get("title", ""),
    }


def _apply_google_fallback(
    db: Session, match: PriceUpdateMatch, site: PriceUpdateCompetitorSite, product: CatalogProduct,
    settings: PriceUpdatePlugin, our_price: Optional[float], use_google_price: bool,
) -> PriceUpdateMatch:
    """Blocked shop: try Google's stored price (if switched on), else report the block."""
    found = (
        google_price_fallback(
            settings, site.domain, product, match.matched_url, our_price, exact_only=bool(match.verified),
        )
        if use_google_price
        else None
    )
    if not found:
        result = _site_refusing(db, match, site.label, site.domain)
        if not use_google_price:
            result.status_message += (
                " — “Check competitor prices” can use Google's copy of the page meanwhile"
                if settings.use_google_price
                else " — or turn on “Google price fallback” to use Google's copy of the page"
            )
            db.commit()
        return result
    if not match.matched_url:
        match.matched_url = found["url"]
        match.manual_url = False
    match.matched_title = clean_page_title(found["title"] or "") or match.matched_title
    match.price = found["price"]
    match.regular_price = None
    match.in_stock = found["in_stock"]
    match.stock_label = None
    match.status = "matched"
    match.status_message = (
        f"via Google — {site.label} is blocking direct reading right now, so this is the price from "
        f"Google's copy of the page (may be a few hours or days old)"
    )
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


def _non_listing_candidates(candidates: list[dict]) -> list[dict]:
    return [c for c in candidates if c.get("url") and not _looks_like_listing_url(c["url"])]


# Verified live: startech.com.bd/product/search?search=... renders real result links in the
# plain server HTML (no JS needed). Ryans and Techland's own search UIs render results
# client-side via JS — a plain httpx fetch gets an empty results shell — so they're left out
# here; those two stay dependent on Google Search / a manually pasted URL.
_SITE_SEARCH_URL: dict[str, str] = {
    "startech": "https://www.startech.com.bd/product/search?search={query}",
}

_STOPWORDS = {"the", "and", "for", "with", "of", "a", "an"}


def _significant_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z0-9]+", text.lower()) if len(w) > 1 and w not in _STOPWORDS}


def _pick_candidate_free(product: CatalogProduct, candidates: list[dict]) -> Optional[int]:
    """No-AI choice between search results: the one whose title shares the most words with our
    product name (+ model), when that clearly beats the others and covers ≥60% of our words."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return 0
    ours = _significant_words(" ".join(x for x in [product.name, product.model or ""] if x))
    if not ours:
        return None
    scores = [len(ours & _significant_words(c.get("title", ""))) / len(ours) for c in candidates]
    best = max(range(len(scores)), key=lambda i: scores[i])
    ranked = sorted(scores, reverse=True)
    if scores[best] >= 0.6 and (len(ranked) == 1 or ranked[0] - ranked[1] >= 0.15):
        return best
    return None


def site_search(query: str, competitor: str, base_domain: str) -> list[dict]:
    """Free, quota-less alternative to Google Custom Search — scrapes the competitor's own
    on-site search results page directly. Only wired up for competitors in
    _SITE_SEARCH_URL; returns [] for everyone else so the caller falls through to Google."""
    url_template = _SITE_SEARCH_URL.get(competitor)
    if not url_template:
        return []
    url = url_template.format(query=quote_plus(query))
    try:
        with httpx.Client(
            timeout=SEARCH_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "AgainERP-CatalogBot/1.0 (+https://againerp.com)", "Accept": "text/html"},
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
    except httpx.HTTPError:
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    query_words = _significant_words(query)
    min_hits = min(2, len(query_words)) or 1
    seen: set[str] = set()
    candidates: list[dict] = []
    for a in soup.find_all("a", href=True):
        href = urljoin(str(resp.url), a["href"])
        if base_domain not in href or href in seen:
            continue
        text = a.get_text(strip=True)
        # A result's product-name link is long enough to be meaningful; short generic nav/menu
        # labels ("Anker", "Desktop") get filtered out here rather than by CSS class, since
        # those aren't stable across themes/site updates.
        if len(text) < 12:
            continue
        if len(query_words & _significant_words(text)) < min_hits:
            continue
        seen.add(href)
        candidates.append({"url": href, "title": text})
    return candidates


_ANY_PRICE = re.compile(
    r"(?:৳|Tk\.?|BDT|Taka|\$|USD|€|£|₹)\s*([\d,]{2,}(?:\.\d{1,2})?)|([\d,]{3,}(?:\.\d{1,2})?)\s*(?:৳|Tk\b|BDT|Taka)",
    re.IGNORECASE,
)


def _price_after_title(text: str, name: str) -> Optional[Decimal]:
    """First price written right after the product's own name on the page — menus and the
    cart come before it, related products after. Any common form: ৳1,490 · 1,490৳ · Tk 1,490."""
    key = re.sub(r"\s+", " ", (name or "")).strip()[:30]
    if len(key) < 8:
        return None
    pos = text.lower().find(key.lower())
    if pos < 0:
        return None
    m = _ANY_PRICE.search(text, pos, pos + 1500)
    return _clean_number(m.group(1) or m.group(2)) if m else None


def fetch_competitor_price(url: str, competitor: str) -> ExtractedPrice:
    """Read price + stock from a competitor page for free (no AI):
    - StarTech / Ryans / Techland: their hand-verified price pattern, then the page's
      structured data;
    - any other (newly added) site: the price the page declares for machines (schema.org
      Product → the store's app data → meta tags) first, then the first price written right
      after the product name, and only as a last resort the first ৳/Tk amount on the page."""
    if blocked_for(url):
        return ExtractedPrice(price=None, regular_price=None, in_stock=None, title="", fetch_failed=True, refused=True)
    pace(url)
    try:
        page = fetch_page(url, timeout=COMPETITOR_FETCH_TIMEOUT)
    except HTTPException as exc:
        refused = bool(re.search(r"\b(403|429)\b|Cloudflare", str(exc.detail)))
        if refused:
            note_refused(url, challenge="Cloudflare" in str(exc.detail))
        return ExtractedPrice(price=None, regular_price=None, in_stock=None, title="", fetch_failed=True, refused=refused)
    return _read_page(page, _pattern_key(url, competitor))


def _pattern_key(url: str, competitor: str) -> str:
    """A Source link can be any shop; when it is one we know (Star Tech, Ryans, Techland) read it with that shop's own
    price pattern, otherwise with the generic reader."""
    if competitor != SOURCE_ID:
        return competitor
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for c in DEFAULT_COMPETITORS:
        if host == c["domain"] or host.endswith("." + c["domain"]):
            return c["id"]
    return competitor


def _read_page(page, competitor: str) -> ExtractedPrice:
    """fetch_competitor_price() on an already-fetched page."""
    if competitor in _COMPETITOR_PRICE_PATTERNS:
        extracted = _extract_price(page.text, page.title, competitor)
    else:
        declared = page.structured.get("price")
        near_title = None if declared else _price_after_title(page.text, page.structured.get("name") or page.title)
        if declared or near_title:
            in_stock, stock_label = _stock_status(page.text)
            extracted = ExtractedPrice(
                price=Decimal(str(declared)) if declared else near_title,
                regular_price=None,
                in_stock=in_stock,
                title=page.title,
                page_text=page.text,
                stock_label=stock_label,
            )
        else:
            extracted = _extract_price(page.text, page.title, competitor)  # whole-page scan, last resort
    availability = str(page.structured.get("availability") or "")
    if extracted.in_stock is None and availability:
        # No stock wording in the text (ryans.com) — use the schema.org availability.
        if availability.lower() in ("instock", "limitedavailability", "instoreonly", "onlineonly"):
            extracted.in_stock, extracted.stock_label = True, "In Stock"
        elif availability.lower() in ("outofstock", "soldout", "discontinued"):
            extracted.in_stock, extracted.stock_label = False, re.sub(r"(?<!^)(?=[A-Z])", " ", availability)
    if extracted.price is None and page.structured.get("price"):
        # Free second reading before any AI: the price the page declares for machines
        # (schema.org Product / embedded app data / meta tags — catalog_ai.structured_data).
        extracted = ExtractedPrice(
            price=Decimal(str(page.structured["price"])),
            regular_price=None,
            in_stock=extracted.in_stock,
            title=page.title,
            page_text=page.text,
            stock_label=extracted.stock_label,
        )
    extracted.page_name = clean_page_title(str(page.structured.get("name") or page.title or ""))
    return extracted


AI_CHECK_NOTE = "Matched by AI check — the page names this product differently"


def _discover_via_sitemap(
    domain: str, competitor: str, product: CatalogProduct, our_price: Optional[float],
    ai_check=None,
) -> tuple[Optional[str], Optional[ExtractedPrice], Optional[str]]:
    """(verified url, its already-read price, closest unverified url) — free: the site's
    sitemap, then the candidates' URL words are checked first and only a URL that already
    looks right is opened (normally 0-1 page loads per product, paced per site)."""
    if blocked_for(domain):
        raise SiteRefusing(domain)
    try:
        index = site_index(domain)
    except Exception:  # noqa: BLE001 — a missing sitemap just means no free match
        return None, None, None
    if not index.urls and blocked_for(domain):
        raise SiteRefusing(domain)  # the sitemap itself was refused (403/429)
    candidates = index.candidates(product.name, product.brand, product.model)
    closest = candidates[0][0] if candidates else None
    near_misses: list[tuple[str, ExtractedPrice]] = []  # failed only on wording — for the AI check
    for url, _score in candidates:
        # The URL words must pass the same checks (minus price) before we spend a page load.
        if not verify(slug_name(url), None, name=product.name, brand=product.brand,
                      model=product.model, our_price=None, lenient=True).ok:
            continue
        if blocked_for(url):
            raise SiteRefusing(domain)
        pace(url)
        try:
            page = fetch_page(url, timeout=COMPETITOR_FETCH_TIMEOUT)
        except HTTPException as exc:
            if re.search(r"\b(403|429)\b|Cloudflare", str(exc.detail)):
                note_refused(url, challenge="Cloudflare" in str(exc.detail))
                raise SiteRefusing(domain) from exc
            continue
        extracted = _read_page(page, competitor)
        verdict = verify(
            extracted.page_name,
            float(extracted.price) if extracted.price is not None else None,
            name=product.name, brand=product.brand, model=product.model, our_price=our_price,
        )
        if verdict.ok:
            return url, extracted, None
        # Near miss for the AI check: failed only on wording, and priced within 85% of ours —
        # a further-off price usually means a different product, so that stays Not found.
        if ai_check is not None and ai_check_candidate(verdict.reason, extracted.price, our_price):
            near_misses.append((url, extracted))
    if ai_check is not None and near_misses:
        pick = ai_check([{"title": e.page_name, "price": float(e.price)} for _u, e in near_misses])
        if pick is not None:
            url, extracted = near_misses[pick]
            extracted.note = AI_CHECK_NOTE
            return url, extracted, None
    return None, None, closest


def _site_refusing(db: Session, match: PriceUpdateMatch, label: str, domain: str) -> PriceUpdateMatch:
    minutes = max(1, round(blocked_for(domain) / 60))
    match.status = "error"
    if block_reason(domain) == "challenge":
        match.status_message = (
            f"{label}'s Cloudflare protection is asking this server for a browser check, so automatic "
            f"reading isn't possible right now. It usually clears within a few hours — we'll retry after "
            f"about {minutes} min; prices stay at the last successful check until then."
        )
    else:
        match.status_message = (
            f"{label} is temporarily refusing our requests (too many in a short time) — "
            f"paused for about {minutes} min, then try again"
        )
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


def _product_search_query(product: CatalogProduct) -> str:
    parts = [p for p in [product.brand, product.model, product.name] if p]
    # Prefer brand+model (short, specific) over the full marketing name when both exist.
    if product.brand and product.model:
        return f"{product.brand} {product.model}"
    return " ".join(dict.fromkeys(parts)) or product.name


def _apply_web_search_result(match: PriceUpdateMatch, result: dict, our_price: Optional[float]) -> None:
    """Writes an AI web-search result onto `match`, applying the same "does this look
    like our product's price" guard used for regex/site-fetched results — an AI browsing
    session can also land on the wrong product's page."""
    price = float(result["price"])
    if our_price and not (our_price * 0.1 <= price <= our_price * 8):
        match.status = "no_price"
        match.status_message = (
            f"AI found ৳{price:,.0f} but it doesn't look related to our price "
            f"(৳{our_price:,.0f}) — treating as not matched"
        )
        return
    match.status = "matched"
    match.status_message = None
    match.price = result["price"]
    match.regular_price = result.get("regular_price")
    match.in_stock = result.get("in_stock")
    match.stock_label = None
    if result.get("url") and not match.verified:
        match.matched_url = result["url"]
    if result.get("title"):
        match.matched_title = clean_page_title(result["title"])


def _url_on_site(url: str, domain: str) -> bool:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    domain = (domain or "").lower().removeprefix("www.")
    return not domain or host == domain or host.endswith("." + domain)


_TITLE_TAIL = re.compile(
    r"\s*(?:[|\u2013-]\s*(?:star\s*tech|ryans|techland|pickaboo|daraz)\b.*"
    r"|(?:best\s+)?price\s+in\s+(?:bangladesh|bd|bag\w*desh)\b.*)$",
    re.I,
)


def clean_page_title(title: str) -> str:
    """A shop's <title> → the product name: drops tails like "Price in Bangladesh | Star Tech"
    (StarTech even misspells it "Bagnladesh"), so names saved or shown from it read cleanly."""
    name = re.sub(r"\s+", " ", title.replace("\xa0", " ")).strip()
    for _ in range(2):
        name = _TITLE_TAIL.sub("", name).strip()
    return name


def refresh_product_competitor(
    db: Session,
    *,
    company_id: str,
    product: CatalogProduct,
    competitor: str,
    settings: PriceUpdatePlugin,
    allow_ai: bool = True,
) -> PriceUpdateMatch:
    """Re-check one product on one competitor. `allow_ai=False` is the free sync (a cell's
    sync button): re-read the saved link with the site's price pattern and the page's
    structured data only — no Google Search, no AI, no AI web search. Without a saved link
    it does nothing and says so. Otherwise each paid method runs only when its switch in the
    plugin settings is on (use_google_search / use_ai_pick / use_ai_price_read /
    use_ai_web_search); free on-site search follows use_site_search."""
    use_google = allow_ai and bool(settings.use_google_search)
    use_ai_pick = allow_ai and bool(settings.use_ai_pick)
    use_ai_price = allow_ai and bool(settings.use_ai_price_read)
    use_ai_web = allow_ai and bool(settings.use_ai_web_search)
    use_google_price = allow_ai and bool(settings.use_google_price)
    site = get_competitor_site(db, company_id=company_id, competitor_id=competitor)
    if not site:
        raise HTTPException(status_code=400, detail=f"Unknown competitor: {competitor}")

    match = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id == product.id,
            PriceUpdateMatch.competitor == competitor,
        )
        .first()
    )
    if not match:
        match = PriceUpdateMatch(company_id=company_id, product_id=product.id, competitor=competitor)
        db.add(match)

    our_price = float(product.price) if product.price is not None else None

    if competitor == SOURCE_ID:
        src = (product.source_url or "").strip()
        if not src:
            match.matched_url = None
            match.manual_url = True
            match.status = "not_found"
            match.status_message = "No source URL — add the source link"
            match.last_checked_at = datetime.utcnow()
            db.commit()
            db.refresh(match)
            return match
        match.matched_url = src
        match.manual_url = True

    url = match.matched_url
    if not url and match.manual_url:
        # An admin removed this link on purpose — don't search it back in (it was likely wrong).
        match.status = "not_found"
        match.status_message = match.status_message or REMOVED_LINK_MESSAGE
        match.last_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(match)
        return match
    if url and not _url_on_site(url, site.domain):
        # Saved under the wrong competitor (e.g. the brand's own site under "Ryans") — reading it
        # would show another shop's price in this column.
        host = (urlparse(url).hostname or "").removeprefix("www.")
        match.status = "no_price"
        match.status_message = f"The saved link is on {host}, not {site.domain} — fix the link"
        match.last_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(match)
        return match
    preloaded: Optional[ExtractedPrice] = None
    closest: Optional[str] = None
    if not url and settings.use_sitemap_match:
        # Free: the competitor's sitemap → best slug matches → open and verify (sitemap_matcher).
        try:
            ai_check = (
                (lambda pages: confirm_same_product(
                    db, company_id, product_name=product.name, brand=product.brand,
                    our_price=our_price, pages=pages,
                ))
                if use_ai_pick
                else None
            )
            found, preloaded, closest = _discover_via_sitemap(
                site.domain, competitor, product, our_price, ai_check=ai_check,
            )
        except SiteRefusing:
            return _apply_google_fallback(db, match, site, product, settings, our_price, use_google_price)
        if found:
            url = found
            match.matched_url = found
            match.matched_title = clean_page_title(preloaded.page_name if preloaded else "") or None
            match.manual_url = False
    if not url and not allow_ai:
        match.status = "not_found"
        match.status_message = (
            f"Not confirmed automatically — closest page found: {closest} (paste it if it's the right product)"
            if closest
            else "No link found for this site — paste the product link"
        )
        match.last_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(match)
        return match
    if not url:
        # Full discovery (Google/site-search -> AI candidate pick -> AI web-search last
        # resort) runs ONLY when we don't have a URL yet for this product/competitor pair.
        # Previously this re-ran on every single "Check competitor prices" click for any
        # non-manual match — meaning a repeat click re-spent the same search + AI cost
        # discovering a product it had already found correctly before. Once a URL is
        # cached (manual or auto-discovered — the distinction no longer matters here), all
        # later refreshes just re-fetch that same URL below, which is free/regex-based.
        query = _product_search_query(product)
        domain = site.domain
        candidates: list[dict] = []
        google_error: Optional[str] = None
        if use_google and settings.google_api_key and settings.google_search_engine_id:
            try:
                candidates = google_search(query, domain, settings.google_api_key, settings.google_search_engine_id)
            except GoogleSearchError as exc:
                google_error = exc.reason
        used_site_search = False
        if not candidates and settings.use_site_search:
            # Covers three cases with one fallback: no Google key configured, Google Search
            # erroring (quota exceeded, key misconfigured, etc.), or Google genuinely finding
            # nothing — free and quota-less, though only implemented for competitors in
            # _SITE_SEARCH_URL (currently Startech; see site_search's docstring).
            candidates = site_search(query, competitor, domain)
            used_site_search = bool(candidates)

        usable = _non_listing_candidates(candidates)
        # AI only gets called here when there's genuine ambiguity (2+ plausible candidates) —
        # a single candidate is used as-is, zero cost, same as before this fallback existed.
        picked_idx = (
            pick_best_candidate(
                db, company_id,
                product_name=product.name, brand=product.brand, model=product.model, candidates=usable,
            )
            if use_ai_pick
            else _pick_candidate_free(product, usable)
        )
        picked = usable[picked_idx] if picked_idx is not None else None
        if picked:
            url = picked["url"]
            match.matched_url = url
            match.matched_title = clean_page_title(picked["title"])
            match.manual_url = False
        else:
            # Discovery came up completely empty (Google failed/not configured, and
            # either no on-site search exists for this site or it also found nothing) —
            # last resort before giving up: let AI search the site with its own
            # web-search tool rather than relying only on our Google Search call.
            ai_web_result = (
                search_and_extract_via_web_search(
                    db, company_id,
                    product_name=product.name, brand=product.brand, model=product.model,
                    competitor_domain=domain, our_price=our_price,
                )
                if use_ai_web
                else None
            )
            if ai_web_result:
                _apply_web_search_result(match, ai_web_result, our_price)
                match.last_checked_at = datetime.utcnow()
                db.commit()
                db.refresh(match)
                return match

            match.status = "not_found"
            if closest and not usable:
                match.status_message = f"Not confirmed automatically — closest page found: {closest} (paste it if it's the right product)"
            elif google_error and not used_site_search:
                match.status_message = f"Google Search failed ({google_error}); no on-site search available for this site either"
            elif not (use_google or settings.use_site_search or settings.use_sitemap_match):
                match.status_message = "All search methods are off — paste this product's link, or turn a method on in the plugin settings"
            elif candidates and not usable:
                match.status_message = "Only category/listing pages found, not a single product"
            elif usable:
                match.status_message = (
                    "Found results but none confidently matched this product"
                    + ("" if use_ai_pick else " — paste the link, or turn on “AI result picking”")
                )
            elif not use_google:
                match.status_message = (
                    "Not found in this site's sitemap or on-site search — paste the product link"
                    if competitor not in _SITE_SEARCH_URL or not settings.use_site_search
                    else "On-site search found nothing — paste the product link, or turn on Google Search"
                )
            elif not settings.google_api_key or not settings.google_search_engine_id:
                match.status_message = "Google Search is on but no API key / search engine ID is saved"
            else:
                match.status_message = "No match found"
            match.last_checked_at = datetime.utcnow()
            db.commit()
            db.refresh(match)
            return match

    extracted = preloaded or fetch_competitor_price(url, competitor)
    if extracted.price is None and not extracted.fetch_failed and use_ai_price:
        # The site-specific regex found nothing (often a promo-label variant no one has
        # written a pattern for yet) — hand the same already-fetched text to AI rather than
        # give up. Costs nothing when AI isn't configured; extract_price_with_ai just returns
        # None immediately in that case.
        ai_result = extract_price_with_ai(
            db, company_id,
            product_name=product.name, page_text=extracted.page_text, page_title=extracted.title,
        )
        if ai_result:
            extracted = ExtractedPrice(
                price=ai_result["price"],
                regular_price=ai_result.get("regular_price"),
                in_stock=ai_result.get("in_stock"),
                title=extracted.title,
                page_text=extracted.page_text,
            )

    if extracted.fetch_failed and use_ai_web and not match.verified:
        # Our own fetch couldn't reach the page at all — most often a Cloudflare-style
        # bot-challenge on the competitor's side, not a transient network blip. Last
        # resort: let AI search and browse the site itself (see docstring on
        # search_and_extract_via_web_search for why that isn't blocked the same way).
        ai_web_result = search_and_extract_via_web_search(
            db, company_id,
            product_name=product.name, brand=product.brand, model=product.model,
            competitor_domain=site.domain, our_price=our_price,
        )
        if ai_web_result:
            extracted = ExtractedPrice(
                price=ai_web_result["price"],
                regular_price=ai_web_result.get("regular_price"),
                in_stock=ai_web_result.get("in_stock"),
                title=ai_web_result.get("title") or "",
                page_text="",
            )
            if ai_web_result.get("url") and not match.verified:
                match.matched_url = ai_web_result["url"]

    implausible = (
        extracted.price is not None
        and our_price
        and not (our_price * 0.1 <= float(extracted.price) <= our_price * 8)
    )
    if extracted.refused and extracted.price is None:
        return _apply_google_fallback(db, match, site, product, settings, our_price, use_google_price)
    if extracted.fetch_failed and extracted.price is None:
        match.status = "error"
        match.status_message = "Could not load the competitor page"
    elif extracted.price is None and extracted.in_stock is False:
        # e.g. startech.com.bd "Price To be announced · Status Up Coming" — not a reading
        # failure: the product simply isn't sold right now.
        match.status = "no_price"
        match.in_stock = False
        match.stock_label = extracted.stock_label
        match.status_message = f"{extracted.stock_label or 'Not available'} on this site — no price listed right now"
    elif extracted.price is None:
        match.status = "no_price"
        match.status_message = (
            "Page loaded but no price could be confidently read"
            if use_ai_price
            else "No price could be read for free on this page — turn on “AI price reading” to try with AI"
        )
    elif implausible:
        # A price this far from ours on the matched page is more likely a mis-extraction
        # (wrong element, unrelated "related product" price) than a genuine outlier — treat
        # it as not matched rather than show a number that can't be trusted.
        match.status = "no_price"
        match.status_message = (
            f"Found ৳{extracted.price:,.0f} on the page but it doesn't look related to our "
            f"price (৳{our_price:,.0f}) — treating as not matched"
        )
    else:
        match.status = "matched"
        match.status_message = extracted.note
        match.price = extracted.price
        match.regular_price = extracted.regular_price
        match.in_stock = extracted.in_stock
        match.stock_label = extracted.stock_label
        if extracted.title:
            match.matched_title = clean_page_title(extracted.title)
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


REMOVED_LINK_MESSAGE = "Link removed by an admin — paste a link to compare this site again"


def remove_match_link(db: Session, *, company_id: str, product_id: str, competitor: str) -> PriceUpdateMatch:
    """Clear a saved competitor link (and what was read from it). The pair stays "manual" with no
    link, so search won't bring the removed page straight back."""
    if not get_competitor_site(db, company_id=company_id, competitor_id=competitor):
        raise HTTPException(status_code=400, detail=f"Unknown competitor: {competitor}")
    if competitor == SOURCE_ID:
        owner = db.get(CatalogProduct, product_id)
        if owner is not None:
            owner.source_url = None
    match = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id == product_id,
            PriceUpdateMatch.competitor == competitor,
        )
        .first()
    )
    if not match:
        match = PriceUpdateMatch(company_id=company_id, product_id=product_id, competitor=competitor)
        db.add(match)
    match.matched_url = None
    match.matched_title = None
    match.manual_url = True
    match.price = None
    match.regular_price = None
    match.in_stock = None
    match.stock_label = None
    set_verified(match, False, None)
    match.status = "not_found"
    match.status_message = REMOVED_LINK_MESSAGE
    match.last_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


def set_verified(match: PriceUpdateMatch, verified: bool, by: Optional[str]) -> None:
    match.verified = verified
    match.verified_at = datetime.utcnow() if verified else None
    match.verified_by = (by or None) if verified else None


def set_manual_match(
    db: Session, *, company_id: str, product_id: str, competitor: str, url: str,
    verified: bool = False, verified_by: Optional[str] = None,
) -> PriceUpdateMatch:
    if not get_competitor_site(db, company_id=company_id, competitor_id=competitor):
        raise HTTPException(status_code=400, detail=f"Unknown competitor: {competitor}")
    match = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id == product_id,
            PriceUpdateMatch.competitor == competitor,
        )
        .first()
    )
    if not match:
        match = PriceUpdateMatch(company_id=company_id, product_id=product_id, competitor=competitor)
        db.add(match)
    url = url.strip()
    if competitor == SOURCE_ID:
        owner = db.get(CatalogProduct, product_id)
        if owner is not None:
            owner.source_url = url[:1000] or None
    if match.verified and match.matched_url == url and not verified:
        pass  # same link saved again without re-ticking Verify — it stays verified
    else:
        set_verified(match, verified and bool(url), verified_by)
    match.matched_url = url
    match.manual_url = True
    match.status = "not_found"
    match.status_message = "Not refreshed yet"
    db.commit()
    db.refresh(match)
    return match


def list_matches(db: Session, *, company_id: str, product_ids: list[str]) -> list[PriceUpdateMatch]:
    if not product_ids:
        return []
    rows = (
        db.query(PriceUpdateMatch)
        .filter(
            PriceUpdateMatch.company_id == company_id,
            PriceUpdateMatch.product_id.in_(product_ids),
        )
        .all()
    )
    ensure_source_site(db, company_id)
    have = {r.product_id: r for r in rows if r.competitor == SOURCE_ID}
    changed = False
    for pid, src in (
        db.query(CatalogProduct.id, CatalogProduct.source_url)
        .filter(CatalogProduct.id.in_(product_ids), CatalogProduct.source_url.isnot(None), CatalogProduct.source_url != "")
        .all()
    ):
        src = src.strip()
        row = have.get(pid)
        if row is None:
            row = PriceUpdateMatch(
                company_id=company_id, product_id=pid, competitor=SOURCE_ID, matched_url=src, manual_url=True,
                status="not_found", status_message="Not refreshed yet",
            )
            set_verified(row, True, "source link")
            db.add(row)
            rows.append(row)
            changed = True
        elif row.matched_url != src:  # the product's source URL was edited: the old reading no longer applies
            row.matched_url = src
            row.price = row.regular_price = row.in_stock = row.stock_label = None
            row.status = "not_found"
            row.status_message = "Not refreshed yet"
            changed = True
    if changed:
        db.commit()
        for r in rows:
            db.refresh(r)
    return rows
