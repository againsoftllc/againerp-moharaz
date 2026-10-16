"""Product SEO fields — focus keyphrase, meta title, meta description.

One writer for every path that fills them: the URL import (importer_service, so a new product
never lands without a focus keyphrase) and the chat tool add_product_seo. The LLM writes all
three from the product's own facts and specs, following the admin's `catalog.product.seo`
preset or, without one, DEFAULT_SEO_RULE. `default_seo` is the no-LLM fallback.
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.services.ai import preset_service
from app.services.catalog_ai import spec_profile_service

FIELDS = ("focus_keyphrase", "meta_title", "meta_description")

# SEO rule used when the admin has not set a `catalog.product.seo` preset.
DEFAULT_SEO_RULE = (
    "Focus keyphrase: the brand + model as shoppers search it (2-5 words, lowercase), e.g. "
    "'lenovo yoga 7 14ahp9' — never a generic category like 'lenovo laptops'. "
    "Meta title: the product name with its 1-2 most important specs, max 60 characters, no store name. "
    "Meta description: 140-155 characters naming the product, its key specs (processor, RAM, storage, "
    "display — whatever the product type has) and who it suits, ending with a short call to action. "
    "No prices, no 'best price' phrases, no other store's name."
)

_SCHEMA = {
    "type": "object",
    "properties": {
        "focus_keyphrase": {"type": "string", "description": "Focus keyphrase, a few words"},
        "meta_title": {"type": "string", "description": "Meta title"},
        "meta_description": {"type": "string", "description": "Meta description"},
    },
    "required": list(FIELDS),
}


def _clean(db: Session, company_id: Optional[str], product: CatalogProduct, text: str) -> str:
    """Scrub the source seller's name/domain out of copied text before it is used."""
    from app.services.catalog_ai.importer_service import _company_name, _sanitize_description

    our_company = _company_name(db, company_id)
    return _sanitize_description(text, seller_name=None, source_url=product.source_url, our_company=our_company) or text


def default_seo(db: Session, company_id: Optional[str], product: CatalogProduct) -> dict[str, str]:
    """Template values (no LLM) — only used when the LLM is unavailable."""
    phrase = " ".join(w for w in [product.brand, product.model] if w).strip()
    if not phrase or (product.brand and phrase.lower() == product.brand.lower()):
        phrase = product.name
    title = _clean(db, company_id, product, product.seo_title or product.name)[:70]
    desc = " ".join(
        _clean(db, company_id, product, product.seo_description or product.short_description or product.description or product.name).split()
    )
    return {
        "focus_keyphrase": " ".join(phrase.split()[:5]).lower(),
        "meta_title": title,
        "meta_description": (desc[:152] + "…") if len(desc) > 155 else desc,
    }


def write_seo(db: Session, company_id: Optional[str], product: CatalogProduct) -> dict[str, str]:
    """The three fields written by the LLM under the SEO preset (or DEFAULT_SEO_RULE).
    Returns only fields it produced; {} when the LLM is unavailable."""
    from app.services.catalog_ai.importer_service import _company_name
    from app.services.catalog_ai.llm_extractor import generate_structured

    rules = preset_service.active_rules(db, company_id, ["general", "catalog", "catalog.product.seo"])
    rules.setdefault("catalog.product.seo", DEFAULT_SEO_RULE)
    specs = "; ".join(
        f"{i['label']}: {i['value']}" for g in spec_profile_service.specs_from_product(product) for i in g["items"]
    )
    facts = "\n".join(
        f"{label}: {value}"
        for label, value in (
            ("Product name", product.name),
            ("Brand", product.brand),
            ("Category", product.category),
            ("Model", product.model),
            ("Short description", _clean(db, company_id, product, product.short_description or "")[:800]),
            ("Description", _clean(db, company_id, product, product.description or "")[:1500]),
            ("Key specifications", specs[:1500]),
            ("Our company", _company_name(db, company_id)),
        )
        if value
    )
    prompt = (
        "Write the SEO fields for this product of ours.\n\n"
        f"{facts}\n\n"
        + preset_service.field_rules_block(rules, {"catalog.product.seo": "focus_keyphrase / meta_title / meta_description"})
        + "\nUse only the facts above. Never name another store or website."
    )
    try:
        data = generate_structured(prompt, _SCHEMA, db=db, company_id=company_id)
    except HTTPException:
        return {}
    written = {k: str(data.get(k) or "").strip() for k in FIELDS}
    return {k: v for k, v in written.items() if v}


def fill_on_import(db: Session, company_id: Optional[str], product: CatalogProduct) -> dict[str, str]:
    """Import hook: give a new product all three SEO fields (LLM, falling back to templates so
    the focus keyphrase is never left empty). Never raises. Caller commits."""
    try:
        values = {**default_seo(db, company_id, product), **write_seo(db, company_id, product)}
    except Exception:  # noqa: BLE001 — SEO is a bonus, never a reason to fail an import
        db.rollback()
        return {}
    product.focus_keyphrase = values["focus_keyphrase"][:200]
    product.seo_title = values["meta_title"][:255]
    product.seo_description = values["meta_description"]
    return values
