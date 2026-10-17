"""Draft -> real catalog product.

Reuses the exact create-product sequence from app.routers.catalog_products
(brand/category resolution, ItemIdentityService, collaboration hooks,
ecommerce mirror, default variant) instead of re-implementing it a third
time — Elim and Amazon import already each rolled their own version of
this; a fourth copy is not warranted (SPEC-independent house rule: reuse
existing product-creation flow).
"""

from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_warranty import CatalogWarranty
from app.models.company import Company
from app.models.ecommerce_item import EcommerceItem
from app.routers.catalog_categories import _apply_path_depth, _next_sort_order
from app.routers.catalog_products import (
    _apply_create_payload,
    _apply_product_categories,
    _ensure_default_variant,
    _normalize_category_ids,
    _replace_media,
    _replace_variants,
    _resolve_brand_category,
)
from app.schemas.catalog_ai_import import CatalogAiExtractResponse, CatalogAiCreateRequest, ProductDraft, ProductDraftSpecGroup
from app.schemas.product import ProductCreate, dump_tags
from app.schemas.variant import VariantUpsert
from app.services.ai import preset_service
from app.services.catalog_ai.llm_extractor import CatalogContext, extract_product_draft
from app.services.catalog_ai import content_html, seo_writer, spec_profile_service
from app.services.catalog_ai.scraper import _image_signature, fetch_page
from app.services.catalog_ai import description_writer
from app.services.catalog_media_import import CatalogImportImagesRequest, import_catalog_images
from app.services.collaboration import on_item_created, on_item_published
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.item_identity_service import ItemIdentityService
from app.services.provider_mapping_service import slugify


# Brands/categories are split per channel (admin "catalog" vs "dropshipping" frontstore) and
# often exist under the same name in both — the admin product form only lists the catalog
# channel, so an import must match (and create) there, or the form shows "Select brand".
IMPORT_CHANNEL = "catalog"


def _catalog_brands(db: Session, company_id: str):
    return db.query(CatalogBrand).filter(
        CatalogBrand.company_id == company_id, CatalogBrand.channel == IMPORT_CHANNEL
    )


def _catalog_categories(db: Session, company_id: str):
    return db.query(CatalogCategory).filter(
        CatalogCategory.company_id == company_id, CatalogCategory.channel == IMPORT_CHANNEL
    )


# Admin preset target → the extracted field(s) it governs (app/services/ai/preset_service.py).
PRESET_FIELDS = {
    "catalog.product.name": "name",
    "catalog.product.short_description": "short_description",
    "catalog.product.description": "description",
    "catalog.product.category": "category_name / category_names",
    "catalog.product.tags": "tags",
    "catalog.product.warranty": "warranty",
    "catalog.product.seo": "seo_title / seo_description",
}


def _catalog_context(
    db: Session, company_id: str, rule_overrides: Optional[dict[str, Optional[str]]] = None
) -> CatalogContext:
    """The company's own brand/category/warranty names, so the model picks existing ones
    (several categories where they fit) instead of inventing near-duplicates."""
    cats = _catalog_categories(db, company_id).all()
    by_id = {c.id: c for c in cats}

    def label(c: CatalogCategory) -> str:
        parts, seen, node = [c.name], {c.id}, c
        while node.parent_id and node.parent_id in by_id and node.parent_id not in seen:
            node = by_id[node.parent_id]
            seen.add(node.id)
            parts.append(node.name)
        return " > ".join(reversed(parts))

    warranties: list[str] = []
    try:
        warranties = [w.name for w in db.query(CatalogWarranty).filter(CatalogWarranty.company_id == company_id).all()]
    except Exception:  # noqa: BLE001 — optional hint only
        db.rollback()
    rules = preset_service.active_rules(db, company_id, ["general", "catalog", *PRESET_FIELDS])
    # Unsaved editor text from AI → Settings → Presets → Test: replaces (or, when None,
    # switches off) the saved rule for that target for this one extraction only.
    for target, text in (rule_overrides or {}).items():
        if text and text.strip():
            rules[target] = text.strip()
        else:
            rules.pop(target, None)
    return CatalogContext(
        categories=sorted({label(c) for c in cats}),
        brands=sorted({b.name for b in _catalog_brands(db, company_id).all()}),
        warranties=sorted(set(warranties)),
        rules=preset_service.field_rules_block(rules, PRESET_FIELDS) if rules else "",
    )


_GALLERY_MAX = 20


def _apply_structured(draft: ProductDraft, data: dict) -> ProductDraft:
    """Fill what the LLM missed from the page's machine-readable product data (JSON-LD /
    embedded app state / meta): price, brand, SKU, name, description — and put the product's
    declared gallery first. Never overrides a value the LLM did find, except images, where
    the declared gallery is the more reliable list."""
    if not data:
        return draft
    update: dict = {}
    if not draft.price and data.get("price"):
        update["price"] = data["price"]
        if data.get("currency"):
            update["currency"] = str(data["currency"])[:3].upper()
    if not draft.brand_name and data.get("brand"):
        update["brand_name"] = str(data["brand"])[:100]
    if not draft.sku and (data.get("mpn") or data.get("sku")):
        update["sku"] = str(data.get("mpn") or data.get("sku"))[:100]
    if (not draft.name or not draft.name.strip()) and data.get("name"):
        update["name"] = str(data["name"])[:255]
    if not draft.description and data.get("description"):
        update["description"] = str(data["description"])
    # the page's own gallery block (scraper._extract_gallery), then the declared photos
    declared = list(dict.fromkeys(u for u in [*data.get("gallery", []), *data.get("images", [])] if u))
    if declared:
        update["images"] = list(dict.fromkeys([*declared, *draft.images]))[:_GALLERY_MAX]
    return draft.model_copy(update=update) if update else draft


def _complete_gallery(picked: list[str], candidates: list[str]) -> list[str]:
    """The LLM picks the product photos from the page's candidates, but often keeps just one
    (verified live on ryans.com: 1 of 6). Swap each pick for the largest rendition of the same
    photo, then add the remaining candidates from the same gallery — same folder and file-name
    stem as a pick (e.g. .../main/logitech-c920-pro-hd-webcam-2….webp) — never logos or
    'related products' images, which live elsewhere."""
    by_sig = {_image_signature(u)[0]: u for u in candidates}
    images = list(dict.fromkeys(by_sig.get(_image_signature(u)[0], u) for u in picked))

    def folder_and_stem(url: str) -> tuple[str, str]:
        folder, _, name = _image_signature(url)[0].rpartition("/")
        # drop only the trailing photo number + extension: "yoga-7-2-in-1-14ahp9-01.webp" → "yoga-7-2-in-1-14ahp9"
        return folder, re.sub(r"[-_]?\d*\.[A-Za-z0-9]+$", "", name)

    gallery = {folder_and_stem(u) for u in images}
    for url in candidates:
        if len(images) >= _GALLERY_MAX:
            break
        folder, stem = folder_and_stem(url)
        if url not in images and len(stem) >= 6 and (folder, stem) in gallery:
            images.append(url)
    return images[:_GALLERY_MAX]


def _match_category(db: Session, company_id: str, name: str) -> Optional[CatalogCategory]:
    leaf = name.split(">")[-1].strip()
    if not leaf:
        return None
    return _catalog_categories(db, company_id).filter(CatalogCategory.name.ilike(leaf)).first()


def extract_from_url(
    db: Session,
    url: str,
    *,
    company_id: Optional[str] = None,
    rule_overrides: Optional[dict[str, Optional[str]]] = None,
) -> CatalogAiExtractResponse:
    company_id = company_id or "default"
    page = fetch_page(url)
    draft = extract_product_draft(page, db=db, company_id=company_id, context=_catalog_context(db, company_id, rule_overrides))
    # The page's own og:site_name/application-name tag is a deterministic, free signal for
    # "whose name is this" — prefer it over the LLM's own (less reliably populated) guess.
    if page.site_name:
        draft = draft.model_copy(update={"seller_site_name": page.site_name})
    if draft.brand_name:
        # titles like "Crest T-Shirt | Gymshark" leak separators into the brand ("Gymshark |")
        draft = draft.model_copy(update={"brand_name": draft.brand_name.strip(" |-–—:·•/") or None})
    draft = _apply_structured(draft, page.structured)
    if page.image_urls and draft.images:
        draft = draft.model_copy(update={"images": _complete_gallery(draft.images, page.image_urls)})
    # The page's own highlights list is the short description — exact and one point per line,
    # where the LLM (seeing flattened text) often returned just the product name. An admin
    # short-description preset still wins: then the LLM wrote it to the rule on purpose.
    short_rule = preset_service.active_rules(db, company_id, ["catalog.product.short_description"])
    if page.highlights and not short_rule:
        draft = draft.model_copy(update={"short_description": "\n".join(page.highlights)})
    # Same for the spec table: parsed straight from the HTML (scraper._extract_spec_groups),
    # it is complete and exact, while the LLM only sees truncated page text and often returns
    # a partial table or none. The parsed table wins whenever the page has one.
    # …unless the parsed table is clearly a fragment of what the page lists (e.g. a small
    # comparison box on an unknown layout): then the LLM's fuller reading wins.
    parsed_count = sum(len(g["items"]) for g in page.spec_groups)
    llm_count = sum(len(g.items) for g in draft.specifications)
    if page.spec_groups and parsed_count * 2 >= llm_count:
        draft = draft.model_copy(
            update={"specifications": [ProductDraftSpecGroup.model_validate(g) for g in page.spec_groups]}
        )
        if not draft.warranty:
            warranty = next(
                (
                    i["value"]
                    for g in page.spec_groups
                    for i in g["items"]
                    if i["label"].strip().lower() == "warranty"
                ),
                None,
            )
            if warranty:
                draft = draft.model_copy(update={"warranty": warranty[:200]})

    # Price, offer and availability straight from the page, read the way Price Compare reads it (a shop with its own
    # price pattern — Star Tech, Ryans, Techland — is exact). With an offer on the page the OFFER price is the price and
    # the old / regular price becomes compare-at; the source's stock status is the product's.
    try:
        from app.services.plugins import price_update_service as pus

        key = pus._pattern_key(page.url, pus.SOURCE_ID)
        read = pus._read_page(page, key)
        upd: dict = {}
        if read.price and (key != pus.SOURCE_ID or not draft.price):
            upd["price"] = Decimal(str(read.price))
        price_now = upd.get("price", draft.price)
        if read.regular_price and price_now and Decimal(str(read.regular_price)) > Decimal(str(price_now)):
            upd["compare_at_price"] = Decimal(str(read.regular_price))
        if read.in_stock is not None:
            label = (read.stock_label or "").lower().replace("-", " ")
            upd["stock_status"] = (
                "pre_order" if "pre" in label and "order" in label
                else "coming_soon" if "coming" in label or "up coming" in label
                else "in_stock" if read.in_stock else "out_of_stock"
            )
        if upd:
            draft = draft.model_copy(update=upd)
    except Exception:  # noqa: BLE001 - a price read must never fail the import
        pass

    # Rule A10 (docs/AI/product-upload.md): with a `catalog.product.description` preset the description is WRITTEN
    # (original, >= 300 words, keyphrase in the first paragraph, 2 h2 + 3 h3) and checked — not copied from the page.
    try:
        written = description_writer.write_description(db, company_id, draft, source_text=(draft.description or page.text or ""))
    except Exception:  # noqa: BLE001 — the writer is an upgrade; on any failure the extracted text stays
        db.rollback()
        written = None
    if written:
        draft = draft.model_copy(update={"description": written})

    warnings: list[str] = []
    matched_brand_id = None

    if draft.brand_name:
        brand = _catalog_brands(db, company_id).filter(CatalogBrand.name.ilike(draft.brand_name)).first()
        if brand:
            matched_brand_id = brand.id
        else:
            warnings.append(f"Brand '{draft.brand_name}' does not exist yet — will be created on import.")

    # Primary category first, then every other fitting one the model chose.
    wanted = [n for n in [draft.category_name, *draft.category_names] if n and n.strip()]
    matched_category_ids: list[str] = []
    for name in wanted:
        category = _match_category(db, company_id, name)
        if category is None:
            if name == draft.category_name:
                warnings.append(f"Category '{name}' does not exist yet — will be created on import.")
            continue
        if category.id not in matched_category_ids:
            matched_category_ids.append(category.id)

    # Also file the product under each chosen category's parents (Monitors → Peripherals), so
    # it shows up when browsing the broader category too. Most specific stays first (primary).
    for cid in list(matched_category_ids):
        node = db.get(CatalogCategory, cid)
        seen: set[str] = set()
        while node is not None and node.parent_id and node.parent_id not in seen:
            seen.add(node.parent_id)
            node = db.get(CatalogCategory, node.parent_id)
            if node is not None and node.channel == IMPORT_CHANNEL and node.id not in matched_category_ids:
                matched_category_ids.append(node.id)

    if not draft.price:
        warnings.append("No price found on the page — set one before creating.")
    if not draft.images:
        warnings.append("No product images found.")

    return CatalogAiExtractResponse(
        draft=draft,
        matched_brand_id=matched_brand_id,
        matched_category_id=matched_category_ids[0] if matched_category_ids else None,
        matched_category_ids=matched_category_ids,
        warnings=warnings,
    )


def _slug_taken(db: Session, slug: str, company_id: str) -> bool:
    # A deleted product only archives its item — the ecommerce mirror row keeps the slug, and
    # its (company_id, slug) unique index would reject a new product reusing it.
    return bool(
        db.query(CatalogProduct.id).filter(CatalogProduct.slug == slug).first()
        or db.query(EcommerceItem.id)
        .filter(EcommerceItem.company_id == company_id, EcommerceItem.slug == slug)
        .first()
    )


def _unique_slug(db: Session, base: str, company_id: str = "default") -> str:
    slug = base
    n = 2
    while _slug_taken(db, slug, company_id):
        slug = f"{base}-{n}"
        n += 1
    return slug


def _unique_sku(db: Session, base: str, identity_svc: ItemIdentityService) -> str:
    sku = base
    n = 2
    while identity_svc.sku_taken(sku):
        sku = f"{base}-{n}"
        n += 1
    return sku


def _resolve_or_create_brand(db: Session, name: str, company_id: str) -> str:
    existing = _catalog_brands(db, company_id).filter(CatalogBrand.name.ilike(name)).first()
    if existing:
        return existing.id
    brand = CatalogBrand(
        name=name,
        slug=_unique_brand_slug(db, slugify(name) or "brand"),
        company_id=company_id,
        channel=IMPORT_CHANNEL,
    )
    db.add(brand)
    db.flush()
    return brand.id


def _unique_brand_slug(db: Session, base: str) -> str:
    slug = base
    n = 2
    while db.query(CatalogBrand).filter(CatalogBrand.slug == slug).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _resolve_or_create_category(db: Session, name: str, company_id: str) -> str:
    """Same reasoning as _resolve_or_create_brand: a URL import routinely names a category
    that does not exist yet ('Monitors', '4K TV', ...) — create it as a top-level category
    rather than leaving the product uncategorised. Uses the exact path/depth/sort-order
    convention the category create endpoint does (app.routers.catalog_categories)."""
    existing = _match_category(db, company_id, name)
    if existing:
        return existing.id
    name = name.split(">")[-1].strip() or name
    category = CatalogCategory(
        name=name[:255],
        caption=name[:255],
        slug=_unique_category_slug(db, slugify(name) or "category"),
        company_id=company_id,
        channel=IMPORT_CHANNEL,
    )
    db.add(category)
    db.flush()
    _apply_path_depth(category, None)
    category.sort_order = _next_sort_order(db, None)
    db.flush()
    return category.id


def _unique_category_slug(db: Session, base: str) -> str:
    slug = base
    n = 2
    while db.query(CatalogCategory).filter(CatalogCategory.slug == slug).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _specs_to_custom_json(draft: ProductDraft) -> str:
    """Same shape the catalog UI already renders (see elim_catalog_import.py)."""
    groups = [{"id": f"ai-{i}", "name": g.group} for i, g in enumerate(draft.specifications)]
    attrs = [
        {"id": f"ai-attr-{gi}-{ii}", "groupId": f"ai-{gi}", "name": item.label, "value": item.value}
        for gi, g in enumerate(draft.specifications)
        for ii, item in enumerate(g.items)
    ]
    return json.dumps({"customGroups": groups, "customAttrs": attrs})


_STOPWORDS = {"the", "a", "an", "with", "for", "and", "of", "in", "to", "by"}


def _short_sku_seed(draft: ProductDraft) -> str:
    """A real MPN/SKU from the page always wins (handled by the caller). When the page has
    none, build something short and legible instead of falling back to the whole slugified
    title (e.g. 'MSI-MP225-E12L-4821', not 'MSI-PRO-MP225-E12L-22-INCH-FHD-MONITOR-...')."""
    parts: list[str] = []
    if draft.brand_name:
        parts.append(re.sub(r"[^A-Za-z0-9]", "", draft.brand_name)[:10])
    if draft.model:
        parts.append(re.sub(r"[^A-Za-z0-9]+", "-", draft.model.strip())[:20])
    else:
        words = [w for w in re.findall(r"[A-Za-z0-9]+", draft.name) if w.lower() not in _STOPWORDS]
        parts.append("-".join(words[:3])[:24])
    base = "-".join(p for p in parts if p).upper().strip("-") or "PRODUCT"
    return f"{base}-{uuid.uuid4().hex[:4].upper()}"


def _company_name(db: Session, company_id: Optional[str]) -> Optional[str]:
    if not company_id:
        return None
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return None
    return (company.legal_name or company.name or "").strip() or None


def _sanitize_description(text: Optional[str], *, seller_name: Optional[str], source_url: Optional[str], our_company: Optional[str]) -> Optional[str]:
    """The scraped short description names the SOURCE store ('Star Tech...'), not us — swap
    every mention of it for our own registered company name (never leave the seller's name
    sitting in our own catalog copy). Longest candidate first so 'startech.com.bd' is consumed
    whole before the bare word 'startech' would otherwise chew into the TLD that follows it."""
    if not text:
        return text
    if not our_company:
        return text
    candidates: set[str] = set()
    if seller_name:
        full = seller_name.strip()
        candidates.add(full)
        # Drop a trailing legal suffix too ("Star Tech & Engineering Ltd." -> "Star Tech & Engineering")
        no_suffix = re.sub(r"\s*\b(ltd\.?|limited|inc\.?|llc|plc)\b\.?\s*$", "", full, flags=re.I).strip()
        candidates.add(no_suffix)
        # And the short brand-like lead-in before a connector/suffix ("Star Tech & Engineering
        # Ltd." / "Star Tech, Bangladesh" -> "Star Tech") — how people actually refer to it mid-sentence.
        short = re.split(r"\s*(?:&|,|\band\b)\s*", no_suffix, maxsplit=1, flags=re.I)[0].strip()
        if short:
            candidates.add(short)
    if source_url:
        host = re.sub(r"^https?://(www\.)?", "", source_url).split("/")[0].strip(".")
        if host:
            candidates.add(host)  # full hostname first — must out-rank the bare word below
        domain_word = host.split(".")[0]
        if domain_word:
            candidates.add(domain_word)
            candidates.add(domain_word.replace("-", " "))
    out = text
    for name in sorted((c for c in candidates if c and len(c) >= 3), key=len, reverse=True):
        out = re.sub(re.escape(name), our_company, out, flags=re.I)
    return out


def _variant_attributes_json(draft: ProductDraft) -> Optional[str]:
    """Product-level dimension list the Variants UI reads (product-variant-editor.tsx /
    lib/mock-data/variants.ts VariantDimension), built from every attribute key/value pair
    actually used across the extracted variants."""
    if not draft.variants:
        return None
    dims: dict[str, list[str]] = {}
    for v in draft.variants:
        for name, value in v.attributes.items():
            values = dims.setdefault(name.strip(), [])
            if value.strip() and value.strip() not in values:
                values.append(value.strip())
    if not dims:
        return None
    return json.dumps(
        [
            {"id": f"ai-dim-{i}", "name": name, "values": [{"value": v} for v in values]}
            for i, (name, values) in enumerate(dims.items())
        ]
    )


def create_product_from_draft(
    db: Session, payload: CatalogAiCreateRequest, user: AuthUser, existing: Optional[CatalogProduct] = None
) -> CatalogProduct:
    """Create the catalog product from a draft — or, with `existing`, fill that product in place (its id, SKU, slug,
    status and Price Compare links stay; every field the draft carries is written onto it)."""
    draft = payload.draft
    if not draft.name.strip():
        raise HTTPException(status_code=400, detail="Product name is required")

    identity_svc = ItemIdentityService(db)
    base_slug = slugify(draft.name) or "product"
    slug = existing.slug if existing is not None else _unique_slug(db, base_slug, getattr(user, "company_id", None) or "default")
    base_sku = re.sub(r"\s+", "-", draft.sku.strip()).upper()[:40] if draft.sku else _short_sku_seed(draft)
    sku = existing.sku if existing is not None else _unique_sku(db, base_sku, identity_svc)

    company_id = getattr(user, "company_id", None) or "default"

    brand_id = payload.brand_id
    if not brand_id and draft.brand_name and payload.create_brand_if_missing:
        brand_id = _resolve_or_create_brand(db, draft.brand_name, company_id)

    category_id = payload.category_id or (payload.category_ids[0] if payload.category_ids else None)
    if not category_id and draft.category_name and payload.create_category_if_missing:
        category_id = _resolve_or_create_category(db, draft.category_name, company_id)
    our_company = _company_name(db, company_id)
    # Long-form page text → description; the highlights block → short description (each falls
    # back to the other), with the seller's own name swapped for ours in both.
    description = _sanitize_description(draft.description or draft.short_description, seller_name=draft.seller_site_name, source_url=draft.source_url, our_company=our_company)
    short_description = _sanitize_description(draft.short_description or draft.description, seller_name=draft.seller_site_name, source_url=draft.source_url, our_company=our_company)
    is_variable = bool(draft.variants)

    create_payload = ProductCreate(
        name=draft.name[:255],
        slug=slug,
        sku=sku,
        model=draft.model[:200] if draft.model else None,
        # The product editor stores HTML: highlights as a bullet list, long copy as paragraphs.
        description=content_html.paragraphs_html(description),
        short_description=content_html.list_html(short_description),
        price=draft.price or Decimal("0"),
        compare_at_price=draft.compare_at_price,
        status=payload.status,
        product_type="variable" if is_variable else "simple",
        brand_id=brand_id,
        category_id=category_id,
        warranty=draft.warranty,
        origin=draft.origin,
        stock_status=draft.stock_status or "in_stock",
        track_quantity=False,
        seo_title=_sanitize_description(draft.seo_title, seller_name=draft.seller_site_name, source_url=draft.source_url, our_company=our_company),
        seo_description=_sanitize_description(draft.seo_description, seller_name=draft.seller_site_name, source_url=draft.source_url, our_company=our_company),
        tags=draft.tags,
        source_url=draft.source_url,
        custom_specs_json=_specs_to_custom_json(draft) if draft.specifications else None,
        variant_attributes_json=_variant_attributes_json(draft),
        gallery_json=json.dumps(draft.images) if draft.images else None,
        thumbnail=draft.images[0] if draft.images else None,
    )

    if existing is None and identity_svc.sku_taken(create_payload.sku):
        raise HTTPException(status_code=409, detail="Generated SKU already exists — retry")
    if existing is None and _slug_taken(db, create_payload.slug, company_id):
        raise HTTPException(status_code=409, detail="Generated slug already exists — retry")

    # Inventory / Item (barcode) / location fields are never set by an AI import draft.
    data, _inv_fields, _item_fields, _location_ids = _apply_create_payload(create_payload)
    data["company_id"] = company_id
    data = _resolve_brand_category(db, data)
    category_ids = _normalize_category_ids(db, category_ids=payload.category_ids, category_id=data.get("category_id"))
    if category_ids:
        data["category_id"] = category_ids[0]
        cat = db.get(CatalogCategory, category_ids[0])
        if cat:
            data["category"] = cat.name

    if existing is not None:
        row = existing
        keep = {"id", "company_id", "sku", "slug", "status", "visibility", "name"}
        for key, value in data.items():
            if key not in keep and value is not None:
                setattr(row, key, value)
        row.compare_at_price = draft.compare_at_price  # replaced, or cleared when the offer is over
        db.flush()
    else:
        row = CatalogProduct(**data)
        db.add(row)
        db.flush()
    identity_svc.persist_and_mirror(row)
    if is_variable:
        # items SSOT has no "variable" item_type (only physical/digital/service/bundle), so
        # mirror_identity_to_catalog() above just reset product_type back to "simple" from the
        # items row it wrote — a pre-existing gap in the identity bridge, not new here.
        # Re-assert the catalog-level distinction the variants we are about to create need.
        row.product_type = "variable"
        db.flush()
    item_id = row.item_id or row.id
    if existing is None:
        on_item_created(db, item_id, created_by=user.id, source="ai_import", company_id=row.company_id)
    if row.status == "published":
        on_item_published(db, item_id, performed_by=user.id, company_id=row.company_id)
    EcommerceItemService(db).sync_content_from_catalog(row, mirror_publish=(row.status == "published"))
    _apply_product_categories(db, row, category_ids)
    _ensure_default_variant(db, row)

    # Commit the product first: import_catalog_images does its own
    # commit-on-success / rollback-on-failure, and a rollback there must
    # never take the freshly created product down with it.
    db.commit()
    db.refresh(row)

    prev_media_ids: list[str] = []
    if existing is not None:
        from app.models.catalog_product_media import CatalogProductMedia as _CPM

        prev_media_ids = [l.media_id for l in db.query(_CPM).filter(_CPM.product_id == row.id).all()]
    url_to_media_id: dict[str, str] = {}
    if payload.import_images and draft.images:
        variant_image_urls = [v.image for v in draft.variants if v.image and v.image not in draft.images]
        combined = (draft.images + variant_image_urls)[:_GALLERY_MAX]
        # Rule A1: the ORIGINAL of every image, all of them in source order, as 500 x 500 px squares with SEO file names
        result = import_catalog_images(
            db,
            CatalogImportImagesRequest(urls=combined, alt_prefix=draft.name, name_prefix=row.slug, square=True),
            company_id=row.company_id,
        )
        row._image_warnings = list(result.warnings)  # type: ignore[attr-defined]
        row._images_reused = result.reused  # type: ignore[attr-defined]
        if result.items:
            url_to_media_id = dict(result.url_map) or {m.source_url: m.id for m in result.items if getattr(m, "source_url", None)}
            base_media_ids = [url_to_media_id[u] for u in draft.images if u in url_to_media_id]
            if base_media_ids:
                _replace_media(db, row, base_media_ids)
                db.commit()
                db.refresh(row)

    # Never keep another site's image address on our product (it would be hot-linked by the admin grid / editor and is
    # not ours to serve): the gallery and thumbnail are OUR media urls, in source order — or empty when none was stored.
    try:
        from app.models.catalog_product_media import CatalogProductMedia
        from app.models.media import Media

        own = [
            m.url
            for link in db.query(CatalogProductMedia).filter(CatalogProductMedia.product_id == row.id).order_by(CatalogProductMedia.sort_order).all()
            for m in [db.get(Media, link.media_id)]
            if m is not None and m.url
        ]
    except Exception:  # noqa: BLE001
        db.rollback()
        own = []
    row.gallery_json = json.dumps(own) if own else None
    row.thumbnail = own[0] if own else None
    EcommerceItemService(db).sync_content_from_catalog(row, mirror_publish=(row.status == "published"))
    db.commit()
    db.refresh(row)
    if prev_media_ids:
        from app.services.catalog_media_import import drop_replaced_media

        drop_replaced_media(db, owner=row, old_ids=prev_media_ids)

    if is_variable:
        variants = [
            VariantUpsert(
                sku=_unique_sku(db, f"{row.sku}-{re.sub(r'[^A-Za-z0-9]+', '', v.name)[:12] or i + 1}", identity_svc),
                name=v.name[:255],
                price=v.price if v.price is not None else (row.price or Decimal("0")),
                stock=0,
                status=row.status,
                is_default=(i == 0),
                sort_order=i,
                image_id=url_to_media_id.get(v.image) if v.image else None,
                options_json=json.dumps([{"name": k, "value": val} for k, val in v.attributes.items()], ensure_ascii=False),
            )
            for i, v in enumerate(draft.variants)
        ]
        _replace_variants(db, row, variants)
        db.commit()
        db.refresh(row)

    # Source spec table → the category's specification profile, when one exists. With no
    # profile the specs stay as custom specs; creating a profile needs the user's approval
    # (add_product_specs chat tool), so it never happens silently here.
    if draft.specifications:
        spec_profile_service.apply_from_source(db, company_id, row, spec_profile_service.specs_from_draft(draft))
        db.refresh(row)

    # Focus keyphrase / meta title / meta description — the page's own SEO tags are the
    # seller's ("… Price in BD"), and nothing set a focus keyphrase at all, so write all three
    # for our product (SEO preset or default rule; templates if the LLM is unavailable).
    if seo_writer.fill_on_import(db, company_id, row):
        db.commit()
        db.refresh(row)

    return row
