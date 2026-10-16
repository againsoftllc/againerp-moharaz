"""AI fallback for the Price Update plugin.

Deliberately last-resort, not first-line: the regex/heuristic path in price_update_service
handles the common case for free and instantly. This module is only reached when that path
is genuinely ambiguous (multiple plausible search candidates) or came up empty (a page loaded
but no price pattern matched — e.g. a promo label variant no one has written a regex for yet).

Uses Aladin (this app's branded OpenAI integration) via the same key resolution as the rest
of the app (app.services.ai.ai_key_service) — a per-company Workspace-configured key first,
OPENAI_API_KEY env var second — rather than a separate plugin-level key to manage.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.services.ai.ai_key_service import resolve_openai_key
from app.services.ai.providers.base import AIMessage, AIToolDefinition
from app.services.ai.providers.openai_provider import OpenAIProvider

REPORT_PRICE_TOOL = AIToolDefinition(
    name="report_price",
    description="Report the current price and stock status found for this product on the competitor's website.",
    input_schema={
        "type": "object",
        "properties": {
            "found": {
                "type": "boolean",
                "description": "True only if you found this specific product's own page on the target site.",
            },
            "url": {"type": "string", "description": "The exact product page URL you found."},
            "title": {"type": "string", "description": "The product title as shown on that page."},
            "price": {"type": "number", "description": "Current/selling price as a plain number, no currency symbol."},
            "regular_price": {"type": "number", "description": "Original/regular/MSRP price before discount, if shown separately."},
            "in_stock": {"type": "boolean", "description": "Whether the page shows this in stock. Omit if not stated."},
        },
        "required": ["found"],
    },
)

PICK_SCHEMA = {
    "type": "object",
    "properties": {
        "index": {
            "type": "integer",
            "description": (
                "0-based index into the candidate list that is the SAME product — same "
                "brand and model/variant, not just a similar or related item. -1 if none "
                "of them are a confident match."
            ),
        },
        "reason": {"type": "string", "description": "One short sentence why."},
    },
    "required": ["index"],
}

EXTRACT_PRICE_SCHEMA = {
    "type": "object",
    "properties": {
        "found": {
            "type": "boolean",
            "description": "True only if you found THIS product's own price on the page — not a related/other product's price.",
        },
        "price": {"type": "number", "description": "Current/selling price as a plain number, no currency symbol."},
        "regular_price": {"type": "number", "description": "Original/regular/MSRP price before discount, if shown separately."},
        "in_stock": {"type": "boolean", "description": "Whether the page shows this in stock. Omit if not stated."},
    },
    "required": ["found"],
}


def _provider(db: Optional[Session], company_id: Optional[str]) -> Optional[OpenAIProvider]:
    key, _source = resolve_openai_key(db, company_id)
    if not key:
        return None
    return OpenAIProvider(api_key=key)


def pick_best_candidate(
    db: Session,
    company_id: str,
    *,
    product_name: str,
    brand: Optional[str],
    model: Optional[str],
    candidates: list[dict],
) -> Optional[int]:
    """Index into `candidates` that is confidently the same product, or None if genuinely
    none of them are (or AI said so). With 0-1 candidates there's nothing to disambiguate,
    so this never spends an AI call. When AI isn't configured, trusts the top search
    result (index 0) — identical to the pre-AI behavior, so this is a pure enhancement."""
    if not candidates:
        return None
    if len(candidates) == 1:
        return 0
    provider = _provider(db, company_id)
    if provider is None:
        return 0

    listing = "\n".join(
        f"{i}. {c.get('title', '')} — {c.get('url', '')}" for i, c in enumerate(candidates)
    )
    detail = f" (brand: {brand})" if brand else ""
    detail += f" (model: {model})" if model else ""
    prompt = (
        f'Our product: "{product_name}"{detail}\n\n'
        f"Competitor site search results:\n{listing}\n\n"
        f"Which result (if any) is this EXACT same product — same brand and model, not just "
        f"a similar or related item?"
    )
    try:
        data = provider.structured_output(
            [AIMessage(role="user", content=prompt)], PICK_SCHEMA, max_tokens=256,
        )
    except Exception:
        return 0  # AI call failed — don't block the check, fall back to the top search result

    idx = data.get("index")
    if not isinstance(idx, int) or idx < 0 or idx >= len(candidates):
        return None
    return idx


def extract_price_with_ai(
    db: Session, company_id: str, *, product_name: str, page_text: str, page_title: str,
) -> Optional[dict]:
    """Reads a price off already-fetched page text when the site's regex pattern didn't
    match (e.g. an unseen promo-label variant). Returns None if AI isn't configured, the
    call fails, or the AI also can't confidently find this product's price on the page."""
    if not page_text:
        return None
    provider = _provider(db, company_id)
    if provider is None:
        return None

    prompt = (
        f'Our product: "{product_name}"\n\n'
        f"Competitor page title: {page_title}\n"
        f"Competitor page text:\n{page_text[:8000]}\n\n"
        f"Find this specific product's current selling price on this page — not a related "
        f"or other product's price."
    )
    try:
        data = provider.structured_output(
            [AIMessage(role="user", content=prompt)], EXTRACT_PRICE_SCHEMA, max_tokens=256,
        )
    except Exception:
        return None

    if not data.get("found") or data.get("price") is None:
        return None
    try:
        price = Decimal(str(data["price"]))
    except Exception:
        return None
    regular = None
    if data.get("regular_price") is not None:
        try:
            regular = Decimal(str(data["regular_price"]))
        except Exception:
            regular = None
    return {"price": price, "regular_price": regular, "in_stock": data.get("in_stock")}


def search_and_extract_via_web_search(
    db: Session,
    company_id: str,
    *,
    product_name: str,
    brand: Optional[str],
    model: Optional[str],
    competitor_domain: str,
    our_price: Optional[float],
) -> Optional[dict]:
    """Last resort when OUR OWN fetch can't reach the competitor site at all (Cloudflare
    bot-challenge, DNS failure, timeout — see fetch_failed in price_update_service). Asks
    the AI to search and browse the site with its own web-search tool, which runs
    server-side from OpenAI's network rather than ours, so a block aimed at scrapers
    calling from our IP/User-Agent doesn't apply to it. Returns None if AI isn't
    configured, the call fails, or it can't confidently find this product on that site."""
    provider = _provider(db, company_id)
    if provider is None:
        return None

    detail = f" (brand: {brand})" if brand else ""
    detail += f" (model: {model})" if model else ""
    price_hint = f" Our own price is ৳{our_price:,.0f}, for reference." if our_price else ""
    prompt = (
        f'Search {competitor_domain} for this exact product: "{product_name}"{detail}.{price_hint}\n\n'
        f"Find its current product page on {competitor_domain}, then report its price, "
        f"regular/MSRP price if shown separately, and stock status. Call report_price when "
        f"done — set found=false if you can't find this specific product on that site."
    )
    try:
        response = provider.tool_call(
            [AIMessage(role="user", content=prompt)],
            [REPORT_PRICE_TOOL],
            server_tools=[{"name": "web_search"}],
            max_tokens=1024,
        )
    except Exception:
        return None

    call = next((c for c in response.tool_calls if c.name == "report_price"), None)
    if not call or not call.input.get("found") or call.input.get("price") is None:
        return None
    try:
        price = Decimal(str(call.input["price"]))
    except Exception:
        return None
    regular = None
    if call.input.get("regular_price") is not None:
        try:
            regular = Decimal(str(call.input["regular_price"]))
        except Exception:
            regular = None
    return {
        "price": price,
        "regular_price": regular,
        "in_stock": call.input.get("in_stock"),
        "url": call.input.get("url") or None,
        "title": call.input.get("title") or None,
    }


def confirm_same_product(
    db: Session,
    company_id: str,
    *,
    product_name: str,
    brand: Optional[str],
    our_price: Optional[float],
    pages: list[dict],
) -> Optional[int]:
    """AI check for near-misses: competitor pages that passed every hard rule (brand, variant,
    colour, size, accessory, price range) but whose name is worded differently from ours.
    Returns the index of the page that is exactly our product, or None. One small call
    (~300 tokens); never called when AI isn't configured."""
    if not pages:
        return None
    provider = _provider(db, company_id)
    if provider is None:
        return None
    listing = "\n".join(
        f"{i}. {p.get('title', '')}" + (f" — ৳{float(p['price']):,.0f}" if p.get("price") else "")
        for i, p in enumerate(pages)
    )
    ours = f'"{product_name}"' + (f" (brand: {brand})" if brand else "") + (f" — our price ৳{our_price:,.0f}" if our_price else "")
    prompt = (
        f"Our product: {ours}\n\nProduct pages found on a competitor's website:\n{listing}\n\n"
        "Which page is this EXACT same product — same brand, same model, same capacity/size/"
        "speed/wattage and same edition or colour? Shop names often add or drop words (\"Gaming\", "
        "\"Price in BD\", a part number) — that's fine. A different model number, a bundle, a newer "
        "or older generation, or an accessory for it is NOT the same. Answer -1 if unsure."
    )
    try:
        data = provider.structured_output([AIMessage(role="user", content=prompt)], PICK_SCHEMA, max_tokens=200)
    except Exception:
        return None
    idx = data.get("index")
    if not isinstance(idx, int) or idx < 0 or idx >= len(pages):
        return None
    return idx
