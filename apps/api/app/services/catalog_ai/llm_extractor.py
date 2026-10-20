"""LLM product-data extraction — scraped page → ProductDraft.

Uses Anthropic tool-use with a forced tool choice so the model's response
is always well-formed JSON matching ProductDraft, not free text to parse.
When no ANTHROPIC_API_KEY is set, falls back to the company's Aladin (OpenAI)
key — the same one AI → Settings saves for chat — via JSON-schema structured
output against the identical schema, so a workspace with only an OpenAI key can
still import products.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.schemas.catalog_ai_import import ProductDraft
from app.services.catalog_ai.page_distiller import _key, _tokens, grounded
from app.services.catalog_ai.scraper import ScrapedPage


@dataclass
class CatalogContext:
    """The importing company's own catalog vocabulary, shown to the model so it picks existing
    entries (exact names) rather than inventing near-duplicates."""

    categories: list[str] = field(default_factory=list)  # "Parent > Child" paths
    brands: list[str] = field(default_factory=list)
    warranties: list[str] = field(default_factory=list)
    # Admin preset rules for the fields this extraction fills (preset_service.field_rules_block).
    rules: str = ""
    # the description is WRITTEN afterwards (catalog.product.description preset): the model need not copy it
    skip_description: bool = False
    # a short-description preset is active (then the model writes it; otherwise the page's highlights block is used)
    has_short_rule: bool = False

EXTRACT_TOOL_NAME = "extract_product"

EXTRACT_TOOL_SCHEMA = {
    "name": EXTRACT_TOOL_NAME,
    "description": "Record the structured product data found on this page.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Product name / title"},
            "sku": {"type": "string", "description": "Manufacturer part number or SKU, if shown"},
            "model": {"type": "string", "description": "Model number/name, if shown separately from the product title (e.g. 'MP225 E12L')"},
            "short_description": {
                "type": "string",
                "description": (
                    "Copied VERBATIM from the page — never written or summarized by you. Use the page's own "
                    "short highlights block if it has one (e.g. 'Key Features', 'Highlights', 'Overview' bullet "
                    "lines near the price — one feature per line, joined with newlines); otherwise copy the first "
                    "1-2 sentences of the description text exactly as written. NEVER use the page's meta "
                    "description / 'Buy X at best price…' SEO blurb here."
                ),
            },
            "description": {
                "type": "string",
                "description": (
                    "The page's own full product description/overview text, copied VERBATIM — same words, same "
                    "sentences, same order as written on the page (usually the long text under a 'Description' "
                    "heading/tab, after the specification table). Do not paraphrase, summarize, reword, or "
                    "write your own description; copy-paste the actual description text found on the page. "
                    "Keep its paragraph breaks: separate paragraphs (and a heading from the text after it) with "
                    "a blank line, and put list items on their own lines. "
                    "NEVER use the page's meta description / 'Buy X at best price…' SEO blurb as the description."
                ),
            },
            "brand_name": {
                "type": "string",
                "description": "Brand or manufacturer name — if it matches one of OUR existing brands listed below, use that exact spelling",
            },
            "category_name": {
                "type": "string",
                "description": (
                    "Best single (most specific) product category, e.g. 'Laptops'. Use the exact name of one of OUR "
                    "existing categories listed below when one fits; only give a new name when none fits."
                ),
            },
            "category_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "EVERY one of OUR existing categories (exact names from the list below, leaf name only) that "
                    "this product belongs in — the product can sit in several, e.g. both 'Monitors' and 'Gaming "
                    "Monitors'. Include category_name too. Only names from the list."
                ),
            },
            "price": {"type": "number", "description": "Numeric selling price, no currency symbol"},
            "currency": {"type": "string", "description": "ISO currency code, e.g. BDT, USD"},
            "warranty": {
                "type": "string",
                "description": "Warranty terms if mentioned, e.g. '1 Year Official Warranty' — if it means the same as one of OUR existing warranty options listed below, use that exact option",
            },
            "origin": {"type": "string", "description": "Country of origin/manufacture if stated, e.g. 'China', 'Made in Bangladesh'"},
            "seller_site_name": {
                "type": "string",
                "description": "The display name of the website/store selling this product, exactly as shown on the page (site title, header logo text, or footer copyright line) — e.g. 'Star Tech & Engineering Ltd.'. Used only to remove the seller's own name from the imported description.",
            },
            "images": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Product image URLs, chosen from the candidate list given — real product photos only, not logos/icons/banners",
            },
            "specifications": {
                "type": "array",
                "description": "Technical specifications grouped by category",
                "items": {
                    "type": "object",
                    "properties": {
                        "group": {"type": "string"},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "value": {"type": "string"},
                                },
                                "required": ["label", "value"],
                            },
                        },
                    },
                    "required": ["group", "items"],
                },
            },
            "tags": {"type": "array", "items": {"type": "string"}, "description": "Up to 8 short search tags"},
            "seo_title": {"type": "string", "description": "SEO title, under 70 characters"},
            "seo_description": {"type": "string", "description": "SEO meta description, under 160 characters"},
            "variants": {
                "type": "array",
                "description": (
                    "Only if the page offers this exact product in more than one buyable option (color, size, storage, "
                    "etc. — each with its own selectable button/swatch/dropdown on the page). Leave this out entirely for "
                    "a single-option product — do not invent variants that are not actually selectable on the page."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Display name for this option combo, e.g. 'Black' or 'Black / 256GB'"},
                        "sku": {"type": "string", "description": "This variant's own SKU/part number, if shown"},
                        "price": {"type": "number", "description": "This variant's price, if it differs from the base price"},
                        "attributes": {
                            "type": "object",
                            "description": "One entry per option dimension, e.g. {\"Color\": \"Black\", \"Storage\": \"256GB\"}",
                            "additionalProperties": {"type": "string"},
                        },
                        "image": {"type": "string", "description": "Image URL specific to this option, copied from the candidate list, if shown"},
                    },
                    "required": ["name", "attributes"],
                },
            },
            "confidence_notes": {
                "type": "string",
                "description": "Anything uncertain or guessed — e.g. 'price not clearly visible, inferred from nearby text'",
            },
        },
        "required": ["name"],
    },
}


def _context_block(context: Optional[CatalogContext], hint: str = "") -> str:
    if context is None:
        return ""

    def listing(items: list[str], limit: int) -> str:
        return "\n".join(f"- {x}" for x in items[:limit]) or "(none yet)"

    def relevant(items: list[str], hint: str, cap: int) -> list[str]:
        """Only the entries that share a word with the page's title / breadcrumb / start of text - the full lists
        (hundreds of names) were resent on every import."""
        words = {w for w in re.findall(r"[a-z0-9]{3,}", hint.lower())}
        hit = [x for x in items if words & set(re.findall(r"[a-z0-9]{3,}", x.lower()))]
        return (hit or items)[:cap]

    rules = f"\n\n{context.rules}\n" if context.rules else ""
    return f"""{rules}

OUR existing categories (Parent > Child) — pick every one that fits for category_names:
{listing(relevant(context.categories, hint, 40), 40)}

OUR existing brands (use one of these exact names when it is the product's brand):
{listing(relevant(context.brands, hint, 12), 12)}

OUR existing warranty options:
{listing(context.warranties, 100)}
"""


def _skip_fields(page: ScrapedPage, context: Optional[CatalogContext]) -> set[str]:
    """Fields the model does not have to produce because the code gets them anyway (output tokens are the dear ones):
    the spec table and the highlights block are parsed from the HTML, the description is written afterwards."""
    skip: set[str] = set()
    if sum(len(g.get("items") or []) for g in page.spec_groups or []) >= 3:
        skip.add("specifications")
    if page.highlights and not (context and context.has_short_rule):
        skip.add("short_description")
    if context and context.skip_description:
        skip.add("description")
    return skip


def _schema_for(page: ScrapedPage, context: Optional[CatalogContext]) -> dict:
    schema = json.loads(json.dumps(EXTRACT_TOOL_SCHEMA["input_schema"]))
    for k in _skip_fields(page, context):
        schema["properties"].pop(k, None)
    return schema


def _build_prompt(page: ScrapedPage, context: Optional[CatalogContext] = None) -> str:
    # the machine-readable product data is already given below in `structured`; JSON-LD would repeat it
    json_ld_excerpt = "(see the product data above)" if page.structured else (str(page.json_ld)[:3000] if page.json_ld else "(none found)")
    slim = bool(_skip_fields(page, context))
    # the page read line by line with its structure (tables as rows, "label: value", bullets) beats one flattened, cut-off line
    page_text = page.view if page.view else page.text
    page_text = page_text[:10000] if slim else page_text
    hint = " ".join([page.title or "", " ".join(page.structured.get("breadcrumb") or []) if page.structured else "", page.text[:1500]])
    structured = {k: (str(v) if k == "price" else v) for k, v in (page.structured or {}).items()}
    structured_text = json.dumps(structured, ensure_ascii=False, default=str)[:5000] if structured else "(none found)"
    images_list = "\n".join(f"- {u}" for u in page.image_urls[:20]) or "(none found)"
    return f"""Extract product data from this page for an e-commerce catalog import.

URL: {page.url}
Page title: {page.title}
Meta description: {page.meta_description}

Product data the page declares for machines (schema.org / the store's own app data) — TRUSTED
for name, price, brand, SKU and images; use it whenever the visible text is thin or missing:
{structured_text}

JSON-LD structured data found on page (may be partial or absent):
{json_ld_excerpt}

Candidate image URLs found on page (pick the real product photos, skip logos/icons/banners/tracking pixels):
{images_list}

Page content - the whole page source written out in reading order, structure kept: '#' headings, 'label | value' table rows, 'label: value' rows, '- ' bullet items (menus, footers and other products were left out):
{page_text}
{_context_block(context, hint)}
Call {EXTRACT_TOOL_NAME} with the product data. Leave fields out entirely if genuinely not present on the page — do not invent data. `description` and `short_description` must be copied VERBATIM from the page text above — the exact same wording the page uses, not your own summary or rewrite of it. For images, return only URLs copied exactly from the candidate list above — the list has already been de-duplicated, so treat each URL as a distinct photo. Only fill 'variants' when the page genuinely offers multiple selectable options for this same product; a single-option product should have no variants at all."""


def _norm(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _first_sentences(text: str, n: int = 2) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n]).strip()


def _finalize(data: dict, page: ScrapedPage) -> ProductDraft:
    """Shared by both providers: drop nulls, then make sure the page's meta description (an
    SEO "Buy X at best price…" blurb) never ends up as the product's description copy —
    smaller models fall back to it even when the page has a real description section."""
    data = {k: v for k, v in dict(data or {}).items() if v is not None}
    meta = _norm(page.meta_description)
    if meta:
        if _norm(data.get("description")) == meta:
            data.pop("description", None)
        if _norm(data.get("short_description")) == meta:
            data.pop("short_description", None)
            if data.get("description"):
                data["short_description"] = _first_sentences(data["description"])
    # A copied highlights block often starts with the page's own section heading.
    short = data.get("short_description")
    if short:
        data["short_description"] = re.sub(
            r"^\s*(key features|highlights|overview|features)\s*:?\s*\n", "", short, flags=re.I
        ).strip() or short
    data["source_url"] = page.url
    _ground(data, page)
    return ProductDraft.model_validate(data)


def _ground(data: dict, page: ScrapedPage) -> None:
    """Whatever the model returned must be on the page: a specification value that appears nowhere in the page source (and
    its declared data) is dropped - never an invented spec - and images are only the page's own candidates."""
    source = " ".join([page.view or page.text or "", json.dumps(page.structured or {}, ensure_ascii=False, default=str), page.title or ""])
    hay_key, hay_tokens = _key(source), _tokens(source)
    groups = []
    for g in data.get("specifications") or []:
        items = [i for i in (g.get("items") or []) if grounded(str(i.get("value") or ""), hay_key, hay_tokens)]
        if items:
            groups.append({**g, "items": items})
    if "specifications" in data:
        data["specifications"] = groups
    if data.get("images"):
        allowed = set(page.image_urls) | {u for u in (page.structured or {}).get("images", []) if isinstance(u, str)}
        data["images"] = [u for u in data["images"] if u in allowed]


def _extract_with_openai(page: ScrapedPage, api_key: str, context: Optional[CatalogContext] = None) -> ProductDraft:
    from app.services.ai.providers.base import AIMessage, ProviderError
    from app.services.ai.providers.openai_provider import OpenAIProvider

    try:
        data = OpenAIProvider(api_key=api_key).structured_output(
            [AIMessage(role="user", content=_build_prompt(page, context))],
            _schema_for(page, context),
            system="You extract product data from scraped web pages into the given JSON schema.",
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI extraction failed: {exc}") from exc
    # Non-strict JSON schema output may send null for fields absent on the page — _finalize
    # drops them so ProductDraft's own defaults apply (e.g. images/specifications default to []).
    return _finalize(data, page)


def extract_product_draft(
    page: ScrapedPage,
    *,
    db: Optional[Session] = None,
    company_id: Optional[str] = None,
    context: Optional[CatalogContext] = None,
) -> ProductDraft:
    settings = get_settings()
    if not settings.anthropic_api_key:
        from app.services.ai.ai_key_service import resolve_openai_key

        openai_key, _source = resolve_openai_key(db, company_id)
        if openai_key:
            return _extract_with_openai(page, openai_key, context)
        raise HTTPException(
            status_code=501,
            detail=(
                "AI catalog import is not configured — add the Aladin API key in AI → Settings, "
                "or set ANTHROPIC_API_KEY on the API service."
            ),
        )

    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        message = client.messages.create(
            model=settings.ai_catalog_import_model,
            max_tokens=4096,
            tools=[{**EXTRACT_TOOL_SCHEMA, "input_schema": _schema_for(page, context)}],
            tool_choice={"type": "tool", "name": EXTRACT_TOOL_NAME},
            messages=[{"role": "user", "content": _build_prompt(page, context)}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"AI extraction failed: {exc}") from exc

    tool_use = next((b for b in message.content if b.type == "tool_use"), None)
    if not tool_use:
        raise HTTPException(status_code=502, detail="AI did not return structured product data")

    return _finalize(dict(tool_use.input), page)


def generate_structured(
    prompt: str,
    json_schema: dict,
    *,
    db: Optional[Session] = None,
    company_id: Optional[str] = None,
    system: str = "You write catalog content into the given JSON schema.",
) -> dict:
    """One structured LLM call with the same provider choice as product extraction:
    ANTHROPIC_API_KEY → Claude (forced tool), else the company's Aladin (OpenAI) key.
    Used by tools that write a field following an admin preset (e.g. add_product_seo)."""
    settings = get_settings()
    if settings.anthropic_api_key:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        try:
            message = client.messages.create(
                model=settings.ai_catalog_import_model,
                max_tokens=2048,
                system=system,
                tools=[{"name": "write_fields", "description": "Record the written fields.", "input_schema": json_schema}],
                tool_choice={"type": "tool", "name": "write_fields"},
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.APIError as exc:
            raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}") from exc
        tool_use = next((b for b in message.content if b.type == "tool_use"), None)
        if not tool_use:
            raise HTTPException(status_code=502, detail="AI did not return structured data")
        return dict(tool_use.input)

    from app.services.ai.ai_key_service import resolve_openai_key
    from app.services.ai.providers.base import AIMessage, ProviderError
    from app.services.ai.providers.openai_provider import OpenAIProvider

    key, _source = resolve_openai_key(db, company_id)
    if not key:
        raise HTTPException(status_code=501, detail="AI is not configured — add the Aladin API key in AI → Settings.")
    try:
        data = OpenAIProvider(api_key=key).structured_output(
            [AIMessage(role="user", content=prompt)], json_schema, system=system
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}") from exc
    return {k: v for k, v in dict(data or {}).items() if v is not None}
