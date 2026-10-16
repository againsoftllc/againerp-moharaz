"""Aladin catalog import — turn a product page URL into a real catalog product.

Wraps the existing URL → product pipeline (`app.services.catalog_ai`, already used by the
Catalog → Import → From URL admin page): fetch the page, extract structured product data
with an LLM, then create the product through the same code path `catalog_products.py` itself
uses (brand/category resolution, item identity, ecommerce mirror, default variant, image
import). Nothing new is invented here — this tool just gives that pipeline a chat front end.

Two-step like every other action tool:

1. **Preview** (`confirm` absent/false): fetch + extract, but create nothing. Shows the
   model what was found — name, price, brand/category (and whether each already exists or
   will be created new), images, specs, warnings — so the user can check it before anything
   is written.
2. **Execute** (`confirm=true`, only after the user agrees): re-runs the same extraction
   (the page is fetched fresh — cheap, and avoids trusting a stale draft from a separate
   request) and creates the product as a **draft**, auto-creating a missing brand and/or
   category exactly as the user asked ("category create kora na thakle category create korbe,
   brand na thakleo same").
"""

from __future__ import annotations

import time
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.schemas.catalog_ai_import import CatalogAiCreateRequest, CatalogAiExtractResponse
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.services.ai.image_service import find_product
from app.services.catalog_ai import seo_writer, spec_profile_service
from app.services.catalog_ai.importer_service import (
    _company_name,
    _sanitize_description,
    create_product_from_draft,
    extract_from_url,
)
from app.services.rbac import has_permission, is_system_manager

CONFIRM_NOTE = (
    "Nothing was created. Show this preview to the user and ask them to confirm; call again "
    "with confirm=true only after they explicitly agree."
)

# Extraction is a real network fetch + LLM call — non-deterministic, unlike a DB lookup.
# Re-running it on confirm could silently create a product that drifts from the preview the
# user actually approved (a field present in one extraction, blank in the next). Cache the
# extracted draft by URL for a short window so confirm reuses exactly what was shown; only
# falls back to a fresh extraction if the cache entry is gone (process restart, TTL expiry,
# or a different worker process — this cache is in-process only).
_EXTRACT_CACHE_TTL_SECONDS = 900
_extract_cache: dict[str, tuple[float, CatalogAiExtractResponse]] = {}
# Same idea for SEO fields written from an admin preset (LLM, non-deterministic): product id →
# the values shown in the preview, reused on confirm.
_seo_cache: dict[str, tuple[float, dict]] = {}
# add_product_specs: "<product id>|<profile name>" → the profile plan + mapped values shown in
# the preview (LLM mapping), reused on confirm.
_spec_cache: dict[str, tuple[float, dict]] = {}

def _cache_get(url: str) -> Optional[CatalogAiExtractResponse]:
    entry = _extract_cache.get(url)
    if not entry:
        return None
    cached_at, extracted = entry
    if time.time() - cached_at > _EXTRACT_CACHE_TTL_SECONDS:
        _extract_cache.pop(url, None)
        return None
    return extracted


def _cache_set(url: str, extracted: CatalogAiExtractResponse) -> None:
    # Bound the cache — this is a convenience for one URL reviewed then confirmed, not a store.
    if len(_extract_cache) > 200:
        _extract_cache.clear()
    _extract_cache[url] = (time.time(), extracted)


def _f(v: Optional[Decimal]) -> Optional[float]:
    return float(v) if v is not None else None


def _can_write_catalog(db: Session, user: Any) -> bool:
    if db is None or user is None:
        return False
    role = str(getattr(user, "role", "") or "").lower()
    if role in ("admin", "system_manager"):
        return True
    try:
        return is_system_manager(db, user) or has_permission(db, user, "catalog", "write")
    except Exception:
        return False


def _preview(db: Session, company_id: Optional[str], extracted: CatalogAiExtractResponse) -> dict:
    d = extracted.draft
    our_company = _company_name(db, company_id)
    description = _sanitize_description(d.description or d.short_description, seller_name=d.seller_site_name, source_url=d.source_url, our_company=our_company)
    warnings = list(extracted.warnings)
    # This exact URL was imported before — without this check, confirming silently creates a
    # second, near-identical product (verified live: it also broke add_product_seo's
    # name-based lookup afterward, "matches several products"). Surface it as a warning so the
    # model tells the user before they confirm, instead of finding out from a broken lookup later.
    existing = db.query(CatalogProduct).filter(CatalogProduct.source_url == d.source_url).first() if d.source_url else None
    if existing is not None:
        warnings.append(
            f"This exact URL was already imported as '{existing.name}' (SKU {existing.sku}, doc://product/{existing.id}). "
            "Confirming will create a SEPARATE duplicate product, not update the existing one — tell the user this and "
            "ask whether they really want a duplicate before calling confirm=true."
        )
    return {
        "action": "Import product from URL (draft)",
        "source_url": d.source_url,
        "name": d.name,
        "sku": d.sku or "(none on page — a short one will be generated)",
        "model": d.model,
        "price": _f(d.price),
        "currency": d.currency,
        "stock_status": "in_stock",
        "warranty": d.warranty,
        "origin": d.origin,
        "short_description": _sanitize_description(d.short_description, seller_name=d.seller_site_name, source_url=d.source_url, our_company=our_company),
        "description": description,
        "brand": {
            "name": d.brand_name,
            "status": "existing" if extracted.matched_brand_id else ("will be created" if d.brand_name else "not found on page"),
        },
        "category": {
            "name": d.category_name,
            "status": "existing" if extracted.matched_category_id else ("will be created" if d.category_name else "not found on page"),
        },
        "all_categories": [
            c.name
            for cid in extracted.matched_category_ids
            if (c := db.get(CatalogCategory, cid)) is not None
        ],
        "images_found": len(d.images),
        "sample_images": d.images[:3],
        "specifications": _spec_preview(db, extracted),
        "variants": [{"name": v.name, "attributes": v.attributes, "price": _f(v.price)} for v in d.variants] if d.variants else None,
        "product_type": "variable" if d.variants else "simple",
        "tags": d.tags,
        "warnings": warnings,
    }


def _spec_preview(db: Session, extracted: CatalogAiExtractResponse) -> dict:
    """What happens to the page's spec table on import: filled into the category's existing
    specification profile, or (no profile) kept as custom specs until the user approves a new one."""
    d = extracted.draft
    specs = spec_profile_service.specs_from_draft(d)
    count = spec_profile_service.spec_item_count(specs)
    if not count:
        return {"found_on_page": 0}
    names = [c.name for cid in extracted.matched_category_ids if (c := db.get(CatalogCategory, cid)) is not None]
    profile = spec_profile_service.find_profile(db, category_names=[*names, d.category_name or "", *d.category_names])
    if profile is not None:
        return {
            "found_on_page": count,
            "groups": [g.group for g in d.specifications],
            "profile": profile.name,
            "plan": f"Will be filled into the existing '{profile.name}' specification profile.",
        }
    return {
        "found_on_page": count,
        "groups": [g.group for g in d.specifications],
        "profile": None,
        "plan": (
            f"No specification profile exists for '{d.category_name or 'this product'}'. The specs are kept as "
            "custom specs; after import I will ask for approval to create a profile from them."
        ),
    }


def build_catalog_import_tools(*, db: Session | None, company_id: str | None, user: Any | None) -> list[OrchestratorTool]:
    def import_product_from_url(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Importing products needs catalog write permission."}
        url = str(inp.get("url") or "").strip()
        if not url.lower().startswith(("http://", "https://")):
            return {"error": "A full product page URL (starting with http:// or https://) is required."}

        confirming = bool(inp.get("confirm"))
        extracted = _cache_get(url) if confirming else None
        if extracted is None:
            try:
                extracted = extract_from_url(db, url, company_id=company_id)  # type: ignore[arg-type]
            except HTTPException as exc:
                db.rollback()  # type: ignore[union-attr]
                return {"error": exc.detail}
            except Exception as exc:  # noqa: BLE001 — network/parse failures should not crash the turn
                db.rollback()  # type: ignore[union-attr]
                return {"error": f"Could not read that page: {exc}"}

            if not extracted.draft.name.strip():
                return {"error": "Could not find a product name on that page — it may not be a product page, or the layout is unsupported.", "warnings": extracted.warnings}

        if not confirming:
            preview = _preview(db, company_id, extracted)  # type: ignore[arg-type]
            _cache_set(url, extracted)
            return {"status": "preview", "preview": preview, "note": CONFIRM_NOTE}

        payload = CatalogAiCreateRequest(
            draft=extracted.draft,
            brand_id=extracted.matched_brand_id,
            category_id=extracted.matched_category_id,
            category_ids=extracted.matched_category_ids,
            create_brand_if_missing=True,
            create_category_if_missing=True,
            import_images=True,
            status="draft",
        )
        _extract_cache.pop(url, None)
        try:
            row = create_product_from_draft(db, payload, user)  # type: ignore[arg-type]
        except HTTPException as exc:
            db.rollback()  # type: ignore[union-attr] — undo any partial flush (e.g. a resolved/created brand or category) before the gateway's own end-of-turn commit would otherwise persist it
            return {"error": exc.detail}
        except Exception as exc:  # noqa: BLE001
            db.rollback()  # type: ignore[union-attr]
            return {"error": f"Could not create the product: {exc}"}

        specs_info = _spec_result(row, extracted)
        return {
            "status": "created",
            "document": "Product",
            "id": row.id,
            "sku": row.sku,
            "name": row.name,
            "model": row.model,
            "origin": row.origin,
            "product_status": row.status,
            "product_type": row.product_type,
            "variant_count": len(extracted.draft.variants),
            "brand_created": bool(extracted.draft.brand_name and not extracted.matched_brand_id),
            "category_created": bool(extracted.draft.category_name and not extracted.matched_category_id),
            "images_imported": len(extracted.draft.images[:8]),
            "doc_link": f"doc://product/{row.id}",
            "path": f"/website/products?edit={row.id}",
            "specifications": specs_info,
            "seo": {"focus_keyphrase": row.focus_keyphrase, "meta_title": row.seo_title, "meta_description": row.seo_description},
            "note": (
                "Created as a draft — publish it from the product page once reviewed. "
                + (
                    "No specification profile exists for this product's category: first ask the user in plain text "
                    "(no tool call) whether to create one from the page's specs — if yes, call add_product_specs "
                    "(preview first). Then ask "
                    if specs_info.get("needs_profile")
                    else (
                        "Some storefront filter fields are still empty (specifications.filters_not_set) — tell the "
                        "user and offer add_product_specs to fill them (it can propose new filter options). Then ask "
                        if specs_info.get("filters_not_set")
                        else "Now ask "
                    )
                )
                + "the user in plain text (no tool call) whether anything else needs changing. SEO (Focus "
                "Keyphrase, Meta title, Meta description) was already written on import — show it (result 'seo'); "
                "only call add_product_seo if the user wants it rewritten."
            ),
        }

    def _spec_result(row: CatalogProduct, extracted: CatalogAiExtractResponse) -> dict:
        count = spec_profile_service.spec_item_count(spec_profile_service.specs_from_draft(extracted.draft))
        if not count:
            return {"found_on_page": 0}
        if row.attribute_profile_id:
            profile = db.get(CatalogAttributeProfile, row.attribute_profile_id)  # type: ignore[union-attr]
            gaps = spec_profile_service.filter_gaps(db, row)  # type: ignore[arg-type]
            return {
                "found_on_page": count,
                "profile": profile.name if profile else None,
                "fields_filled": spec_profile_service.filled_count(db, row.id),  # type: ignore[arg-type]
                "filters_not_set": gaps or None,
            }
        return {"found_on_page": count, "profile": None, "saved_as": "custom specs", "needs_profile": True}

    def _resolve_product(ref: str) -> dict:
        found = find_product(db, company_id, ref) if db is not None else None
        if found is None:
            return {"error": f"No product matches '{ref}'."}
        if isinstance(found, list):
            return {"error": f"'{ref}' matches several products — ask the user which one.", "candidates": [{"id": p.id, "name": p.name, "sku": p.sku} for p in found]}
        return {"ok": found}

    def _preset_seo(product: CatalogProduct) -> dict:
        """seo_writer.write_seo, cached per product for the confirm window so the values saved
        on confirm are exactly the ones the user was shown in the preview."""
        cached = _seo_cache.get(product.id)
        if cached and time.time() - cached[0] <= _EXTRACT_CACHE_TTL_SECONDS:
            return cached[1]
        written = seo_writer.write_seo(db, company_id, product)  # type: ignore[arg-type]
        if written:
            if len(_seo_cache) > 200:
                _seo_cache.clear()
            _seo_cache[product.id] = (time.time(), written)
        return written

    def add_product_seo(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Updating SEO fields needs catalog write permission."}
        res = _resolve_product(str(inp.get("product") or ""))
        if "ok" not in res:
            return res
        product: CatalogProduct = res["ok"]
        given = {k: str(inp.get(k) or "").strip() for k in ("focus_keyphrase", "meta_title", "meta_description")}
        written = {} if all(given.values()) else _preset_seo(product)
        fallback = seo_writer.default_seo(db, company_id, product)  # type: ignore[arg-type]
        focus_keyphrase = given["focus_keyphrase"] or written.get("focus_keyphrase") or fallback["focus_keyphrase"]
        meta_title = given["meta_title"] or written.get("meta_title") or fallback["meta_title"]
        meta_description = given["meta_description"] or written.get("meta_description") or fallback["meta_description"]
        summary = {
            "action": "Set SEO fields",
            "product": {"id": product.id, "name": product.name},
            "focus_keyphrase": focus_keyphrase,
            "meta_title": meta_title,
            "meta_description": meta_description,
        }
        if not inp.get("confirm"):
            return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
        _seo_cache.pop(product.id, None)
        product.focus_keyphrase = focus_keyphrase[:200]
        product.seo_title = meta_title[:255]
        product.seo_description = meta_description
        db.commit()  # type: ignore[union-attr]
        return {
            "status": "updated",
            "document": "Product SEO",
            "id": product.id,
            "name": product.name,
            "focus_keyphrase": product.focus_keyphrase,
            "meta_title": product.seo_title,
            "meta_description": product.seo_description,
            "doc_link": f"doc://product/{product.id}",
            "path": f"/website/products?edit={product.id}",
        }

    def _source_specs(product: CatalogProduct) -> list[dict]:
        specs = spec_profile_service.specs_from_product(product)
        if specs or not product.source_url:
            return specs
        # Older product without stored custom specs: read them from its source page again.
        extracted = _cache_get(product.source_url)
        if extracted is None:
            try:
                extracted = extract_from_url(db, product.source_url, company_id=company_id)  # type: ignore[arg-type]
            except Exception:  # noqa: BLE001
                db.rollback()  # type: ignore[union-attr]
                return []
            _cache_set(product.source_url, extracted)
        return spec_profile_service.specs_from_draft(extracted.draft)

    def _spec_key(product: CatalogProduct, profile_name: str) -> str:
        # profile_name only matters when a new profile would be created — models add or drop it
        # freely between preview and confirm, which must not force a fresh (LLM) mapping.
        if spec_profile_service.find_profile(db, product=product) is not None:  # type: ignore[arg-type]
            return f"{product.id}|"
        return f"{product.id}|{profile_name.strip().lower()}"

    def _spec_plan(product: CatalogProduct, profile_name: str) -> dict:
        """Profile (existing or proposed) + mapped values — cached per product for the confirm
        window so confirm saves exactly what the preview showed (the mapping uses an LLM)."""
        key = _spec_key(product, profile_name)
        cached = _spec_cache.get(key)
        if cached and time.time() - cached[0] <= _EXTRACT_CACHE_TTL_SECONDS:
            return cached[1]
        specs = _source_specs(product)
        if not spec_profile_service.spec_item_count(specs):
            return {"error": "This product has no source specifications to add (no imported spec table and no source page)."}
        profile = spec_profile_service.find_profile(db, product=product)  # type: ignore[arg-type]
        if profile is not None:
            fields = spec_profile_service.profile_fields(db, profile.id)  # type: ignore[arg-type]
            values, off = spec_profile_service.map_values_detailed(db, company_id, specs, fields)  # type: ignore[arg-type]
            plan = {"profile_id": profile.id, "profile": profile.name, "fields": fields, "values": values, "off": off}
        else:
            name = profile_name.strip() or product.category or "General"
            proposal = spec_profile_service.propose_profile(name, specs)
            if not proposal["groups"]:
                return {"error": "The source specifications are empty — nothing to build a profile from."}
            plan = {"profile_id": None, "proposal": proposal, "specs": specs}
        if len(_spec_cache) > 200:
            _spec_cache.clear()
        _spec_cache[key] = (time.time(), plan)
        return plan

    def add_product_specs(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Adding specifications needs catalog write permission."}
        res = _resolve_product(str(inp.get("product") or ""))
        if "ok" not in res:
            return res
        product: CatalogProduct = res["ok"]
        profile_name = str(inp.get("profile_name") or "")
        plan = _spec_plan(product, profile_name)
        if "error" in plan:
            return plan
        key = _spec_key(product, profile_name)

        if plan["profile_id"]:
            names = {f["id"]: f"{f['group']} > {f['name']}" for f in plan["fields"]}
            # Fields that already have a value keep it (fill_product never overwrites), so the
            # preview must show those as they are — not a source value that would not be saved.
            existing = spec_profile_service.current_values(db, product.id)  # type: ignore[arg-type]
            new_values = {k: v for k, v in plan["values"].items() if k not in existing}
            off = {k: v for k, v in (plan.get("off") or {}).items() if k not in existing}
            add_options = bool(inp.get("add_missing_options")) and bool(off)
            filters = spec_profile_service.filter_report(plan["fields"], {**existing, **new_values}, off)
            values = {**new_values, **(off if add_options else {})}
            summary = {
                "action": "Add specifications" + (" and new dropdown/filter options" if add_options else ""),
                "product": {"id": product.id, "name": product.name},
                "profile": f"{plan['profile']} (existing)",
                "will_fill": {names[k]: v for k, v in values.items() if k in names} or None,
                "already_set_kept": {names[k]: v for k, v in existing.items() if k in names} or None,
                "fields_filled_after_save": f"{len(existing) + len(values)} of {len(plan['fields'])}",
                "storefront_filters": {
                    "set": filters["set"],
                    "not_an_option_yet": filters["need_new_option"] or None,
                    "no_data_on_source_page": filters["no_data_on_page"] or None,
                },
                "new_options_to_add": {names[k]: v for k, v in off.items()} if add_options else None,
            }
            if not values:
                return {"status": "unchanged", "preview": summary, "note": "Nothing new to fill — every field the source answers is already set."}
            if not inp.get("confirm"):
                note = CONFIRM_NOTE
                if off and not add_options:
                    note += (
                        " Some values from the source page are not existing dropdown options (listed in "
                        "storefront_filters.not_an_option_yet, plus any non-filter dropdowns), so those filters "
                        "would stay empty. Tell the user, and offer to add them as new options — that changes "
                        "the profile for all products; if they want it, preview again with add_missing_options=true."
                    )
                return {"status": "preview", "preview": summary, "note": note}
            profile = db.get(CatalogAttributeProfile, plan["profile_id"])  # type: ignore[union-attr]
            if profile is None:
                _spec_cache.pop(key, None)
                return {"error": "That specification profile no longer exists — preview again."}
            if add_options:
                spec_profile_service.add_options(db, off)  # type: ignore[arg-type]
            written = spec_profile_service.fill_product(db, product, profile, values)  # type: ignore[arg-type]
        else:
            proposal = plan["proposal"]
            category_labels = [c for c in [product.category] if c]
            summary = {
                "action": "Create specification profile (needs approval) and add specifications",
                "product": {"id": product.id, "name": product.name},
                "new_profile": proposal["name"],
                "applies_to_categories": category_labels or ["(set later in Website → Specifications)"],
                "groups": {g["name"]: g["attributes"] for g in proposal["groups"]},
                "fields": sum(len(g["attributes"]) for g in proposal["groups"]),
                "note": "Creates a new specification profile for everyone; all fields are text and not filterable — adjust them later in Website → Specifications → Profiles.",
            }
            if not inp.get("confirm"):
                return {"status": "preview", "preview": summary, "note": CONFIRM_NOTE}
            existing = spec_profile_service.find_profile(db, product=product)  # type: ignore[arg-type]
            if existing is not None:
                _spec_cache.pop(key, None)
                return {"error": f"A '{existing.name}' profile now exists for this product — preview again to fill it instead."}
            try:
                profile = spec_profile_service.create_profile(
                    db,  # type: ignore[arg-type]
                    company_id=product.company_id or company_id or "default",
                    proposal=proposal,
                    category_labels=category_labels,
                )
            except HTTPException as exc:
                db.rollback()  # type: ignore[union-attr]
                return {"error": exc.detail}
            # The profile was built from these same specs, so labels match its fields exactly.
            fields = spec_profile_service.profile_fields(db, profile.id)  # type: ignore[arg-type]
            values = spec_profile_service.exact_values(plan["specs"], fields)
            written = spec_profile_service.fill_product(db, product, profile, values)  # type: ignore[arg-type]
        _spec_cache.pop(key, None)
        db.commit()  # type: ignore[union-attr]
        return {
            "status": "saved",
            "product": {"id": product.id, "name": product.name},
            "profile": profile.name,
            "profile_created": not plan["profile_id"],
            "fields_filled": written,
            "doc_link": f"doc://product/{product.id}",
            "path": f"/website/products?edit={product.id}",
        }

    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="import_product_from_url",
                description=(
                    "Import a product into the catalog from its page on another website (e.g. a link from "
                    "startech.com.bd, ryans.com, any store product page). Reads the page, extracts name, price, "
                    "brand, category, images, specs and warranty, and creates it as a draft product — auto-creating "
                    "the brand and/or category if they do not already exist. CALL THIS FIRST (without confirm) the "
                    "moment the user gives a product URL to import — it returns a preview; nothing is created until "
                    "confirm=true. If the preview's 'warnings' list says this URL was already imported, tell the user "
                    "plainly and ask whether they still want a duplicate before calling confirm=true — do not silently "
                    "proceed. Use for 'import this product', 'upload this from the link', 'add this to our "
                    "catalog'."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "Full product page URL"},
                        "confirm": {
                            "type": "boolean",
                            "description": "false/omitted = preview only (nothing written). true = create — ONLY after the user has explicitly confirmed the preview in this conversation.",
                        },
                    },
                    "required": ["url"],
                },
            ),
            handler=import_product_from_url,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="add_product_seo",
                description=(
                    "Set a product's on-page SEO fields — Focus Keyphrase, Meta title, Meta description. Call this "
                    "only after asking the user whether they want SEO generated and they said yes (e.g. right after "
                    "import_product_from_url creates a product). Omit any of focus_keyphrase/meta_title/"
                    "meta_description (always, unless the user typed the exact value they want) — the tool writes them from the "
                    "product's specs following the company's SEO rule; values you make up yourself are ignored. "
                    "CALL THIS FIRST without confirm to preview the values, then confirm=true "
                    "once the user agrees."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "product": {"type": "string", "description": "Product name, SKU or id"},
                        "focus_keyphrase": {"type": "string", "description": "Optional — auto-generated from brand/category if omitted"},
                        "meta_title": {"type": "string", "description": "Optional — auto-generated from the product name if omitted"},
                        "meta_description": {"type": "string", "description": "Optional — auto-generated from the short description if omitted"},
                        "confirm": {
                            "type": "boolean",
                            "description": "false/omitted = preview only (nothing written). true = save — ONLY after the user has explicitly confirmed.",
                        },
                    },
                    "required": ["product"],
                },
            ),
            handler=add_product_seo,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
        OrchestratorTool(
            definition=AIToolDefinition(
                name="add_product_specs",
                description=(
                    "Add a product's specifications from its source data (the spec table imported from its source "
                    "page) into the structured specification profile. If the product's category already has a "
                    "profile, the preview shows the values that will be filled. If no profile exists, the preview "
                    "proposes creating one from the source spec groups — creating a profile needs the user's "
                    "explicit approval. Use after import_product_from_url says no profile exists and the user agreed, "
                    "or when the user asks to add/fill specifications for a product. CALL FIRST without confirm, show "
                    "the preview, then call again with the same arguments and confirm=true only after the user agrees."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "product": {"type": "string", "description": "Product name, SKU or id"},
                        "profile_name": {
                            "type": "string",
                            "description": "Only when creating a new profile and the user named it — defaults to the product's category",
                        },
                        "add_missing_options": {
                            "type": "boolean",
                            "description": "true only after the user agreed to add the source values that are not existing dropdown/filter options as new options (changes the profile for all products)",
                        },
                        "confirm": {
                            "type": "boolean",
                            "description": "false/omitted = preview only (nothing written). true = save — ONLY after the user has explicitly confirmed.",
                        },
                    },
                    "required": ["product"],
                },
            ),
            handler=add_product_specs,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
    ]
