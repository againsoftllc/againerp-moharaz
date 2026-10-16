"""AI search for the storefront: a shopper's question (Bangla, Banglish or English) → catalogue filters.

GPT (the workspace OpenAI key, AI → Settings, or OPENAI_API_KEY) reads the question and answers with a small JSON
object: category, brands, price range, the one model/spec term worth searching for, stock and sort. Those are then
matched to the real catalogue (category and brand slugs) and checked with the normal product listing; when nothing
matches, the narrowest condition is dropped and the listing tried again. The storefront turns the result into its
ordinary listing URL, so every product shown is a real, filterable catalogue product.

No key → None, and the storefront falls back to its plain search.
"""
from __future__ import annotations

import difflib
import json
import logging
import re
import time
from decimal import Decimal
from threading import Lock
from typing import Any, Optional

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.ai.ai_key_service import resolve_openai_key
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

log = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
CACHE_TTL = 24 * 3600
CACHE_MAX = 2000
SORTS = {"relevance", "price-asc", "price-desc", "newest"}

_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = Lock()
_catalog: dict[str, Any] = {"at": 0.0}

SCHEMA = {
    "name": "shop_search",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "category": {"type": ["string", "null"], "description": "product type in English, e.g. Laptop, Monitor, Graphics Card"},
            "brands": {"type": "array", "items": {"type": "string"}},
            "price_min": {"type": ["number", "null"]},
            "price_max": {"type": ["number", "null"]},
            "keyword": {"type": ["string", "null"], "description": "one model/spec term as written in product names, e.g. RTX 4060"},
            "in_stock": {"type": "boolean"},
            "sort": {"type": "string", "enum": sorted(SORTS)},
            "summary": {"type": "string", "description": "what the shopper wants, max 12 words, in the shopper's language"},
        },
        "required": ["category", "brands", "price_min", "price_max", "keyword", "in_stock", "sort", "summary"],
    },
}

SYSTEM = """You turn a shopper's search on a Bangladeshi computer & electronics shop into catalogue filters.
The question may be English, Bangla (বাংলা) or Banglish. Prices are in BDT (৳, taka, tk).
- 1 lakh / লাখ = 100000; 1 hazar / হাজার / k = 1000; Bangla digits ০-৯ are 0-9.
- "under / er moddhe / এর মধ্যে / below / within X" → price_max X; "above / over / er beshi" → price_min X; "around X" → X±15%.
- category: the product type as a short English shop category name, chosen from the list when one fits; null when unclear.
- brands: only brands the shopper names, spelled as in the list.
- keyword: at most ONE specific model or spec term that appears in product names (e.g. "RTX 4060", "i5-12400",
  "27 inch", "DDR5", "1TB"); never generic words like gaming, best, cheap, laptop; null when there is none.
- in_stock true only when the shopper asks for available / in stock items. sort: price-asc for cheap/budget/সস্তা,
  price-desc for best/premium/high-end, newest for latest/new, else relevance.
- summary: a short restatement of the request in the shopper's language."""


def _norm(q: str) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())[:200]


def _load_catalog(db: Session) -> dict[str, Any]:
    """Category and brand names (with product counts), refreshed every 10 minutes."""
    if time.time() - _catalog["at"] < 600:
        return _catalog
    cats = db.execute(text(
        """
        SELECT c.slug, c.name, coalesce(p.name, '') AS parent, count(eic.id) AS n
        FROM catalog_categories c
        LEFT JOIN catalog_categories p ON p.id = c.parent_id
        LEFT JOIN ecommerce_item_categories eic ON eic.category_id = c.id
        WHERE coalesce(c.channel, 'catalog') = 'catalog' AND coalesce(c.is_active, true)
        GROUP BY c.slug, c.name, p.name
        HAVING count(eic.id) > 0
        """
    )).fetchall()
    brands = db.execute(text(
        "SELECT slug, name FROM catalog_brands WHERE coalesce(channel, 'catalog') = 'catalog' AND coalesce(is_active, true)"
    )).fetchall()
    _catalog.update(
        at=time.time(),
        cats=[{"slug": r[0], "name": r[1], "parent": r[2], "n": int(r[3])} for r in cats],
        brands=[{"slug": r[0], "name": r[1]} for r in brands],
    )
    return _catalog


def _ask_gpt(key: str, base_url: str, query: str, catalog: dict[str, Any]) -> Optional[dict]:
    top = sorted(catalog["cats"], key=lambda c: -c["n"])
    # top-level-ish names only, to keep the prompt small
    names = sorted({c["name"].strip() for c in top if not c["parent"] or c["n"] > 30})[:220]
    brand_names = sorted({b["name"].strip() for b in catalog["brands"]})
    user = (
        f"Categories: {', '.join(names)}\n"
        f"Brands: {', '.join(brand_names)}\n\n"
        f"Shopper's search: {query}"
    )
    try:
        res = httpx.post(
            f"{base_url.rstrip('/')}/chat/completions" if base_url else OPENAI_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": get_settings().openai_model or "gpt-4o-mini",
                "temperature": 0,
                "max_tokens": 200,
                "response_format": {"type": "json_schema", "json_schema": SCHEMA},
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            },
            timeout=15,
        )
        if res.status_code != 200:
            log.warning("AI search: OpenAI HTTP %s %s", res.status_code, res.text[:200])
            return None
        return json.loads(res.json()["choices"][0]["message"]["content"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        log.warning("AI search: %s", exc)
        return None


def _best(term: Optional[str], options: list[dict], *, field: str = "name", cutoff: float = 0.72) -> Optional[dict]:
    """The option whose name matches the term best (exact, then plural-insensitive, then fuzzy); bigger first."""
    if not term:
        return None
    t = term.strip().lower()
    singular = lambda s: re.sub(r"(es|s)$", "", s)  # noqa: E731
    exact = [o for o in options if o[field].strip().lower() == t or singular(o[field].strip().lower()) == singular(t)]
    if exact:
        return max(exact, key=lambda o: o.get("n", 0))
    names = {o[field].strip().lower(): o for o in options}
    hit = difflib.get_close_matches(t, list(names), n=1, cutoff=cutoff)
    return names[hit[0]] if hit else None


def _count(db: Session, f: dict) -> int:
    return StorefrontCatalogService(db).list_products(
        page=1,
        per_page=1,
        search=f.get("keyword"),
        category_slug=f.get("category_slug"),
        brand_slugs=f.get("brand_slugs") or None,
        price_min=Decimal(str(f["price_min"])) if f.get("price_min") else None,
        price_max=Decimal(str(f["price_max"])) if f.get("price_max") else None,
        in_stock=f.get("in_stock") or None,
    ).total


def ai_search(db: Session, company_id: str, query: str) -> Optional[dict]:
    """Filters for the question, or None when AI search is not available (no key / OpenAI error)."""
    q = _norm(query)
    if len(q) < 3:
        return None
    with _cache_lock:
        hit = _cache.get(q)
        if hit and time.time() - hit[0] < CACHE_TTL:
            return hit[1]
    key, _ = resolve_openai_key(db, company_id)
    if not key:
        return None
    base_url = ""
    try:
        from app.services.ai.ai_key_service import get_openai_connection

        conn = get_openai_connection(db, company_id)
        base_url = (getattr(conn, "base_url", "") or "").strip() if conn else ""
    except Exception:  # noqa: BLE001 — base_url is optional
        base_url = ""
    catalog = _load_catalog(db)
    parsed = _ask_gpt(key, base_url, query.strip()[:200], catalog)
    if parsed is None:
        return None

    cat = _best(parsed.get("category"), catalog["cats"])
    brands = [b for b in (_best(n, catalog["brands"], cutoff=0.85) for n in parsed.get("brands") or []) if b]
    pmin = parsed.get("price_min") if isinstance(parsed.get("price_min"), (int, float)) and parsed["price_min"] > 0 else None
    pmax = parsed.get("price_max") if isinstance(parsed.get("price_max"), (int, float)) and parsed["price_max"] > 0 else None
    if pmin and pmax and pmin > pmax:
        pmin, pmax = pmax, pmin
    keyword = (parsed.get("keyword") or "").strip()[:60] or None
    filters: dict[str, Any] = {
        "category_slug": cat["slug"] if cat else None,
        "category_name": cat["name"] if cat else None,
        "brand_slugs": [b["slug"] for b in brands],
        "brand_names": [b["name"] for b in brands],
        "price_min": round(pmin) if pmin else None,
        "price_max": round(pmax) if pmax else None,
        "keyword": keyword,
        "in_stock": bool(parsed.get("in_stock")),
        "sort": parsed.get("sort") if parsed.get("sort") in SORTS else "relevance",
    }

    # drop the narrowest condition until something matches (keyword, stock, brands, price, category)
    relaxed: list[str] = []
    total = _count(db, filters)
    for field, empty in (("keyword", None), ("in_stock", False), ("brand_slugs", []), ("price_min", None),
                         ("price_max", None), ("category_slug", None)):
        if total:
            break
        if filters.get(field):
            filters[field] = empty
            if field == "brand_slugs":
                filters["brand_names"] = []
            if field == "category_slug":
                filters["category_name"] = None
            relaxed.append(field)
            total = _count(db, filters)

    result = {
        "query": query.strip()[:200],
        "summary": (parsed.get("summary") or "").strip()[:160],
        "filters": filters,
        "relaxed": relaxed,
        "total": total,
    }
    with _cache_lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[q] = (time.time(), result)
    return result
