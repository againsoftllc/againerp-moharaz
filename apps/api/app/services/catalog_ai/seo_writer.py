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
    "'lenovo yoga 7 14ahp9' — never a generic category like 'lenovo laptops'. It MUST also appear in the URL slug. "
    "Meta title: 30-60 characters, STARTS with the focus keyphrase, ends with 'Price in BD', no store name. "
    "Meta description: 120-160 characters (aim 150-155) that contains the focus keyphrase, names the key specs "
    "(whatever the product type has) and ends with a short call to action. "
    "No other store's name."
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
            ("URL slug (the focus keyphrase must be inside it)", product.slug),
            ("Short description", _clean(db, company_id, product, product.short_description or "")[:400]),
            ("Description", _clean(db, company_id, product, product.description or "")[:700]),
            ("Key specifications", specs[:800]),
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


# ---- the SEO checklist (docs/AI/product-upload.md A13): whatever the model wrote, these hold afterwards

TITLE_MIN, TITLE_MAX = 30, 60
DESC_MIN, DESC_MAX = 120, 160
TITLE_SUFFIX = " Price in BD"


def _slug_key(text: str) -> str:
    from app.services.provider_mapping_service import slugify

    return slugify(text or "")


def _keyphrase_for_slug(product: CatalogProduct, keyphrase: str) -> str:
    """Keyphrase in the URL slug: keep the keyphrase when its slug form is inside the product's slug, else the first
    candidate that is (brand + model, model, the leading words of the name), else the slug's leading words."""
    slug = product.slug or _slug_key(product.name)
    cands = [keyphrase, " ".join(w for w in [product.brand, product.model] if w), product.model or "", *(
        " ".join((product.name or "").split()[:n]) for n in (4, 3, 2)
    )]
    for c in cands:
        k = _slug_key(c)
        if c.strip() and k and k in slug:
            return " ".join(c.split()[:5]).lower()
    return " ".join(slug.split("-")[:4])


def _cased(product: CatalogProduct, kp: str) -> str:
    """The keyphrase written the way the product name writes it (TL-WR940N, not Tl-Wr940N)."""
    name = product.name or ""
    i = name.lower().find(kp.lower())
    return name[i : i + len(kp)] if i >= 0 else kp.title()


def _fit_title(product: CatalogProduct, keyphrase: str, title: str) -> str:
    ok = TITLE_MIN <= len(title) <= TITLE_MAX and keyphrase.lower() in title.lower() and "price in b" in title.lower()
    if ok:
        return title
    room = TITLE_MAX - len(TITLE_SUFFIX)
    base = (product.name or keyphrase).strip()
    if keyphrase.lower() not in base.lower():
        base = f"{_cased(product, keyphrase)} {base}"
    if len(base) > room:
        base = base[:room].rsplit(" ", 1)[0].rstrip(" -,|")
    out = base + TITLE_SUFFIX
    if len(out) < TITLE_MIN and product.category:
        out = f"{base} {product.category}"[:room].rstrip() + TITLE_SUFFIX
    return out


def _fit_description(product: CatalogProduct, keyphrase: str, text: str) -> str:
    text = " ".join((text or "").split())
    if keyphrase.lower() not in text.lower():
        text = f"{_cased(product, keyphrase)} - {text}" if text else _cased(product, keyphrase)
    filler = " Order online with fast delivery across Bangladesh and genuine warranty."
    if len(text) < DESC_MIN:
        text = (text.rstrip(".") + "." + filler)
    if len(text) < DESC_MIN:
        text += " Check price, specs and availability."
    if len(text) > DESC_MAX:
        cut = text[: DESC_MAX - 1].rsplit(" ", 1)[0].rstrip(" ,;-")
        text = (cut if len(cut) >= DESC_MIN else text[: DESC_MAX - 1]) + "."
    return text


def enforce_checklist(product: CatalogProduct, values: dict[str, str], *, touch_description: bool = True) -> dict[str, str]:
    """Focus keyphrase inside the slug, meta title 30-60 chars with the keyphrase and "Price in BD", meta description
    120-160 chars with the keyphrase, and the keyphrase in the product description's first paragraph."""
    kp = _keyphrase_for_slug(product, values.get("focus_keyphrase") or product.name or "")
    out = {
        "focus_keyphrase": kp,
        "meta_title": _fit_title(product, kp, values.get("meta_title") or ""),
        "meta_description": _fit_description(product, kp, values.get("meta_description") or ""),
    }
    html = product.description or ""
    if touch_description and html and kp.lower() not in html.lower():
        i = html.lower().find("<p")
        j = html.find(">", i) + 1 if i >= 0 else 0
        product.description = html[:j] + f"<strong>{_cased(product, kp)}</strong>: " + html[j:]
    return out


def fill_on_import(db: Session, company_id: Optional[str], product: CatalogProduct) -> dict[str, str]:
    """Import hook: give a new product all three SEO fields (LLM, falling back to templates so
    the focus keyphrase is never left empty). Never raises. Caller commits."""
    try:
        values = {**default_seo(db, company_id, product), **write_seo(db, company_id, product)}
        values = enforce_checklist(product, values)
    except Exception:  # noqa: BLE001 — SEO is a bonus, never a reason to fail an import
        db.rollback()
        return {}
    product.focus_keyphrase = values["focus_keyphrase"][:200]
    product.seo_title = values["meta_title"][:255]
    product.seo_description = values["meta_description"]
    return values
