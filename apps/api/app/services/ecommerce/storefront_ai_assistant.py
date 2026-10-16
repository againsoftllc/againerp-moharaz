"""AI shopping assistant for the storefront: answers a shopper's question from the shop's own database.

GPT (the workspace OpenAI key) gets read-only tools over the live catalogue — search products (category, brands,
price range, a model/spec term, stock, sort), read one product's full specifications, list categories — and calls
them as often as it needs (up to MAX_ROUNDS). Its final answer is JSON: the reply in the shopper's language, the
products it recommends (slugs it actually read) and follow-up questions. Prices, stock and specs in the reply come
only from the tool results; the product cards are the catalogue rows themselves.

No key → None (the storefront hides the assistant).
"""
from __future__ import annotations

import html
import json
import logging
import re
from decimal import Decimal
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.ai.ai_key_service import get_openai_connection, resolve_openai_key
from app.services.ecommerce.storefront_ai_search import _best, _load_catalog
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

log = logging.getLogger(__name__)

MAX_ROUNDS = 5
MAX_HISTORY = 8
SORTS = {"relevance": None, "price-asc": "price_asc", "price-desc": "price_desc", "newest": "newest"}

SYSTEM = """You are the shopping assistant of Moharaz, a computer and electronics shop in
Bangladesh. Answer the shopper using ONLY data returned by your tools — never invent products, prices, stock or specs.
- Reply in the shopper's language (Bangla, Banglish or English). Prices in BDT as ৳1,23,456 (Bangladeshi grouping).
- Search the catalogue before recommending; open product details when the question depends on specifications
  (RAM, GPU, panel, warranty …). Compare a few good options and say briefly why each fits.
- Prefer products in stock; say so when something is out of stock or "call for price" (price 0).
- 1 lakh = 100000, 1 hazar/k = 1000. Keep it short: 2-6 sentences or a compact list; no markdown tables.
- If the shop has nothing suitable, say so and suggest the closest alternatives the tools returned.
- Never answer questions unrelated to shopping at this store; politely steer back.
Finish with JSON: answer, product_slugs (up to 4, only slugs your tools returned, in recommendation order),
follow_ups (up to 3 short next questions the shopper might ask, in their language)."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search the shop's catalogue. Returns up to `limit` products with price, stock, brand, category, rating and key specs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "product type, e.g. Laptop, Monitor, Graphics Card, Processor — a category also holds its sub-categories (Laptop includes laptop accessories and coolers), so add a keyword or price_min when the results drift"},
                    "brands": {"type": "array", "items": {"type": "string"}},
                    "keyword": {"type": "string", "description": "one model/spec term found in product names, e.g. RTX 4060, i5-13400, 27 inch"},
                    "price_min": {"type": "number"},
                    "price_max": {"type": "number"},
                    "in_stock": {"type": "boolean"},
                    "sort": {"type": "string", "enum": list(SORTS)},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Full specifications, description and reviews summary of one product (by slug from search_products).",
            "parameters": {
                "type": "object",
                "properties": {"slug": {"type": "string"}},
                "required": ["slug"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": "The shop's product categories with how many products each has (largest first).",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
]

ANSWER_SCHEMA = {
    "name": "assistant_answer",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "answer": {"type": "string"},
            "product_slugs": {"type": "array", "items": {"type": "string"}},
            "follow_ups": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["answer", "product_slugs", "follow_ups"],
    },
}


def _plain(markup: Optional[str], limit: int) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", markup or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _card(p: Any) -> dict[str, Any]:
    """The catalogue row as the storefront's list product (for the product cards)."""
    return json.loads(p.model_dump_json()) if hasattr(p, "model_dump_json") else dict(p)


def _brief(c: dict[str, Any]) -> dict[str, Any]:
    """What GPT sees of a listed product: compact, no image urls."""
    price = float(c.get("price") or 0)
    return {
        "slug": c["slug"],
        "name": c["name"],
        "price": price if price > 0 else "call for price",
        **({"regular_price": float(c["compare_at_price"])} if c.get("compare_at_price") else {}),
        "brand": c.get("brand"),
        "category": c.get("category"),
        "stock": c.get("stock_status") or ("in_stock" if c.get("in_stock") else "out_of_stock"),
        **({"rating": c["rating"], "reviews": c.get("review_count")} if c.get("rating") else {}),
        **({"highlights": _plain(c["short_description"], 240)} if c.get("short_description") else {}),
        **({"specs": dict(list((c.get("filter_attributes") or {}).items())[:8])} if c.get("filter_attributes") else {}),
    }


class _Tools:
    def __init__(self, db: Session):
        self.db = db
        self.catalog = _load_catalog(db)
        self.seen: dict[str, dict[str, Any]] = {}

    def search_products(self, category=None, brands=None, keyword=None, price_min=None, price_max=None,
                        in_stock=None, sort="relevance", limit=8) -> dict[str, Any]:
        # the listing's own sort names and its rows-with-ratings, as the product list endpoint returns them
        from app.routers.storefront_products import _attach_review_stats, _normalize_sort

        cat = _best(category, self.catalog["cats"]) if category else None
        brand_rows = [b for b in (_best(n, self.catalog["brands"], cutoff=0.85) for n in brands or []) if b]
        res = StorefrontCatalogService(self.db).list_products(
            page=1,
            per_page=max(1, min(int(limit or 8), 12)),
            search=(keyword or "").strip()[:60] or None,
            category_slug=cat["slug"] if cat else None,
            brand_slugs=[b["slug"] for b in brand_rows] or None,
            price_min=Decimal(str(price_min)) if price_min else None,
            price_max=Decimal(str(price_max)) if price_max else None,
            in_stock=True if in_stock else None,
            sort=_normalize_sort(SORTS.get(sort or "relevance") or "availability"),
        )
        items = [_card(p) for p in _attach_review_stats(self.db, res.items)]
        for c in items:
            self.seen[c["slug"]] = c
        return {
            "matched_category": cat["name"] if cat else None,
            "matched_brands": [b["name"] for b in brand_rows],
            "total_matching": res.total,
            "products": [_brief(c) for c in items],
        }

    def get_product_details(self, slug: str) -> dict[str, Any]:
        from app.routers.storefront_products import _detail_from_ec  # the product page's own read

        svc = StorefrontCatalogService(self.db)
        view, ec = svc.get_by_slug(slug), svc.get_ec_by_slug(slug)
        if not view or not ec:
            return {"error": f"no product with slug {slug!r}"}
        d = _card(_detail_from_ec(view, ec, self.db))
        self.seen[slug] = d
        specs = [
            f"{g.get('name') or g.get('group') or ''}: {s.get('name') or s.get('label')}: {s.get('value')}".strip(": ")
            for g in d.get("specifications") or []
            for s in (g.get("items") or g.get("specs") or g.get("attributes") or [])
        ][:60]
        reviews = d.get("reviews") or []
        return {
            **_brief(d),
            "specifications": specs,
            "description": _plain(d.get("full_description") or d.get("short_description"), 900),
            **({"recent_reviews": [_plain(r.get("body"), 160) for r in reviews[:3]]} if reviews else {}),
        }

    def list_categories(self) -> dict[str, Any]:
        top = sorted(self.catalog["cats"], key=lambda c: -c["n"])[:80]
        return {"categories": [{"name": c["name"], "products": c["n"]} for c in top]}

    def call(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        try:
            if name == "search_products":
                return self.search_products(**args)
            if name == "get_product_details":
                return self.get_product_details(str(args.get("slug", "")))
            if name == "list_categories":
                return self.list_categories()
        except Exception as exc:  # noqa: BLE001 — a tool error goes back to the model, not the shopper
            log.warning("AI assistant tool %s failed: %s", name, exc)
            self.db.rollback()
            return {"error": "lookup failed"}
        return {"error": f"unknown tool {name}"}


def ai_assistant(db: Session, company_id: str, messages: list[dict[str, str]]) -> Optional[dict[str, Any]]:
    """The assistant's reply to the conversation (last message = the shopper's question), or None without a key."""
    key, _ = resolve_openai_key(db, company_id)
    if not key:
        return None
    conn = get_openai_connection(db, company_id)
    base = ((getattr(conn, "base_url", "") or "").strip().rstrip("/") if conn else "") or "https://api.openai.com/v1"
    tools = _Tools(db)
    convo: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM}] + [
        {"role": m["role"], "content": m["content"][:600]} for m in messages[-MAX_HISTORY:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    model = get_settings().openai_model or "gpt-4o-mini"
    for _ in range(MAX_ROUNDS):
        try:
            res = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model,
                    "temperature": 0.2,
                    "messages": convo,
                    "tools": TOOLS,
                    "response_format": {"type": "json_schema", "json_schema": ANSWER_SCHEMA},
                },
                timeout=40,
            )
        except httpx.HTTPError as exc:
            log.warning("AI assistant: %s", exc)
            return None
        if res.status_code != 200:
            log.warning("AI assistant: OpenAI HTTP %s %s", res.status_code, res.text[:200])
            return None
        msg = res.json()["choices"][0]["message"]
        calls = msg.get("tool_calls") or []
        if not calls:
            try:
                out = json.loads(msg.get("content") or "{}")
            except ValueError:
                out = {"answer": msg.get("content") or "", "product_slugs": [], "follow_ups": []}
            slugs = [s for s in out.get("product_slugs", []) if s in tools.seen][:4]
            return {
                "answer": (out.get("answer") or "").strip(),
                "products": [tools.seen[s] for s in slugs],
                "follow_ups": [f for f in out.get("follow_ups", []) if isinstance(f, str)][:3],
            }
        convo.append({"role": "assistant", "content": msg.get("content"), "tool_calls": calls})
        for call in calls:
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except ValueError:
                args = {}
            result = tools.call(call["function"]["name"], args)
            convo.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False, default=str)[:12000]})
    return {"answer": "", "products": [], "follow_ups": []}
