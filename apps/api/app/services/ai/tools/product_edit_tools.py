"""update_product — change an existing catalog product from chat ("description ta niyom onujayi
notun kore likho", "price 149,500 koro", "publish koro", "category Gaming o add koro").

Two kinds of change, combinable in one call:

* `changes` — values the admin dictated (price, status, categories, …).
* `rewrite` — fields the AI writes itself from the product's own facts (name, specs, source
  content), following the admin presets for that field (preset_service) — the same rules the
  URL import uses. Values are generated at preview time and cached, so confirm saves exactly
  what was shown.

Saving goes through the real PATCH /catalog/products/{id} handler (catalog_products.update_product)
so item identity, the storefront mirror and publish events all run exactly as when the
product form saves. Two-step like every action tool: preview first, confirm=true saves.
"""

from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.schemas.product import ProductUpdate, load_tags
from app.services.ai import preset_service
from app.services.ai.image_service import find_product
from app.services.ai.orchestrator import OrchestratorTool, RiskTier
from app.services.ai.providers.base import AIToolDefinition
from app.services.catalog_ai import content_html, spec_profile_service

CONFIRM_NOTE = (
    "Nothing was saved. Show the user every field's new value from this preview and ask them to "
    "confirm; call again with the same arguments and confirm=true only after they explicitly agree."
)
_CACHE_TTL = 900
_rewrite_cache: dict[str, tuple[float, dict]] = {}

# Field → preset target that governs how the AI writes it.
REWRITABLE = {
    "name": "catalog.product.name",
    "short_description": "catalog.product.short_description",
    "description": "catalog.product.description",
    "tags": "catalog.product.tags",
    "warranty": "catalog.product.warranty",
}
_REWRITE_SCHEMA = {
    "name": {"type": "string", "description": "Product name"},
    "short_description": {"type": "string", "description": "Short description: 4-8 key points, one per line (shown as a bullet list)"},
    "description": {"type": "string", "description": "Full product description (plain text paragraphs)"},
    "tags": {"type": "array", "items": {"type": "string"}, "description": "Product tags"},
    "warranty": {"type": "string", "description": "Warranty text"},
}
_TEXT_FIELDS = ("name", "short_description", "description", "warranty", "origin")


def _can_write_catalog(db: Optional[Session], user: Any) -> bool:
    if db is None or user is None:
        return False
    if str(getattr(user, "role", "") or "").lower() in ("admin", "system_manager"):
        return True
    from app.services.rbac import has_permission, is_system_manager

    try:
        return is_system_manager(db, user) or has_permission(db, user, "catalog", "write")
    except Exception:  # noqa: BLE001
        return False


def _money(value: Any) -> Optional[Decimal]:
    try:
        amount = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return None
    return amount if amount >= 0 else None


def _short(text: Optional[str], limit: int = 1500) -> Optional[str]:
    if text is None:
        return None
    text = str(text)
    return text if len(text) <= limit else text[:limit] + "…"


def build_product_edit_tools(
    *, db: Session | None = None, company_id: str | None = None, user: Any | None = None
) -> list[OrchestratorTool]:
    def _facts(product: CatalogProduct) -> str:
        specs = "; ".join(
            f"{i['label']}: {i['value']}" for g in spec_profile_service.specs_from_product(product) for i in g["items"]
        )
        rows = (
            ("Current name", product.name),
            ("Brand", product.brand),
            ("Category", product.category),
            ("Model", product.model),
            ("Warranty", product.warranty),
            ("Current short description", (product.short_description or "")[:1500]),
            ("Current description", (product.description or "")[:4000]),
            ("Specifications", specs[:3000]),
        )
        return "\n".join(f"{label}: {value}" for label, value in rows if value)

    def _rewrite(product: CatalogProduct, fields: list[str], instruction: str) -> dict:
        key = f"{product.id}|{','.join(sorted(fields))}|{instruction.strip().lower()}"
        cached = _rewrite_cache.get(key)
        if cached and time.time() - cached[0] <= _CACHE_TTL:
            return cached[1]
        from app.services.catalog_ai.importer_service import _company_name
        from app.services.catalog_ai.llm_extractor import generate_structured

        targets = {REWRITABLE[f]: f for f in fields}
        rules = preset_service.active_rules(db, company_id, ["general", "catalog", *targets])
        prompt = (
            f"Rewrite these fields of our product: {', '.join(fields)}.\n\n{_facts(product)}\n"
            f"Our company: {_company_name(db, company_id)}\n\n"  # type: ignore[arg-type]
            + preset_service.field_rules_block(rules, targets)
            + (f"\nThe administrator also asked: {instruction.strip()}" if instruction.strip() else "")
            + "\nUse only facts above — never invent specs, prices or warranty terms. Never name another "
            "store or website. Plain text, no HTML, no markdown."
        )
        schema = {
            "type": "object",
            "properties": {f: _REWRITE_SCHEMA[f] for f in fields},
            "required": fields,
        }
        data = generate_structured(prompt, schema, db=db, company_id=company_id)
        out: dict[str, Any] = {}
        for f in fields:
            value = data.get(f)
            if f == "tags":
                tags = [str(t).strip() for t in (value or []) if str(t).strip()]
                if tags:
                    out[f] = tags[:20]
            elif value and str(value).strip():
                out[f] = str(value).strip()
        if len(_rewrite_cache) > 200:
            _rewrite_cache.clear()
        _rewrite_cache[key] = (time.time(), out)
        return out

    def update_product(inp: dict) -> dict:
        if not _can_write_catalog(db, user):
            return {"error": "Changing products needs catalog write permission."}
        found = find_product(db, company_id, str(inp.get("product") or "")) if db is not None else None  # type: ignore[arg-type]
        if found is None:
            return {"error": f"No product matches '{inp.get('product')}'."}
        if isinstance(found, list):
            return {
                "error": f"'{inp.get('product')}' matches several products — ask the user which one.",
                "candidates": [{"id": p.id, "name": p.name, "sku": p.sku} for p in found],
            }
        product: CatalogProduct = found
        changes = dict(inp.get("changes") or {})
        rewrite = [f for f in (inp.get("rewrite") or []) if f in REWRITABLE]
        rewrite = [f for f in dict.fromkeys(rewrite) if f not in changes]
        if not changes and not rewrite:
            return {"error": "Nothing to change — say which fields to set or rewrite."}

        update: dict[str, Any] = {}
        before: dict[str, Any] = {}
        after: dict[str, Any] = {}
        notes: list[str] = []

        for f in _TEXT_FIELDS:
            if f in changes and str(changes[f] or "").strip():
                update[f] = str(changes[f]).strip()
        for f in ("price", "compare_at_price"):
            if f in changes and changes[f] not in (None, ""):
                amount = _money(changes[f])
                if amount is None:
                    return {"error": f"{f} must be a number."}
                update[f] = amount
        for f, allowed in (
            ("status", ("draft", "published", "archived")),
            ("stock_status", ("in_stock", "out_of_stock", "pre_order", "coming_soon")),
            ("visibility", ("public", "private")),
        ):
            if f in changes and changes[f]:
                if changes[f] not in allowed:
                    return {"error": f"{f} must be one of {', '.join(allowed)}."}
                update[f] = changes[f]
        if "tags" in changes and changes["tags"]:
            update["tags"] = [str(t).strip() for t in changes["tags"] if str(t).strip()][:20]

        from app.services.catalog_ai.importer_service import _catalog_brands, _match_category

        new_categories: list[str] = []
        if changes.get("categories"):
            ids: list[str] = []
            for name in changes["categories"]:
                cat = _match_category(db, company_id, str(name))  # type: ignore[arg-type]
                if cat is None:
                    new_categories.append(str(name).strip())
                elif cat.id not in ids:
                    ids.append(cat.id)
            if new_categories:
                notes.append(f"Will create new categories: {', '.join(new_categories)}")
            update["category_names"] = [str(n).strip() for n in changes["categories"]]
            update["_category_ids"] = ids
        if changes.get("brand"):
            from app.models.catalog_brand import CatalogBrand

            brand = (
                _catalog_brands(db, company_id)  # type: ignore[arg-type]
                .filter(CatalogBrand.name.ilike(str(changes["brand"]).strip()))
                .first()
            )
            if brand is None:
                notes.append(f"Will create new brand: {changes['brand']}")
            update["brand_name"] = str(changes["brand"]).strip()

        if rewrite:
            try:
                written = _rewrite(product, rewrite, str(inp.get("instruction") or ""))
            except HTTPException as exc:
                return {"error": f"Could not write {', '.join(rewrite)}: {exc.detail}"}
            missing = [f for f in rewrite if f not in written]
            if missing:
                notes.append(f"The AI returned nothing for: {', '.join(missing)}")
            update.update(written)

        # The product editor stores HTML: short description as a bullet list, description as paragraphs.
        if "short_description" in update:
            update["short_description"] = content_html.list_html(update["short_description"])
        if "description" in update:
            update["description"] = content_html.paragraphs_html(update["description"])

        for f, value in update.items():
            if f.startswith("_"):
                continue
            if f == "category_names":
                before["categories"], after["categories"] = product.category, value
            elif f == "brand_name":
                before["brand"], after["brand"] = product.brand, value
            elif f == "tags":
                before["tags"], after["tags"] = load_tags(product.tags_json), value
            else:
                current = getattr(product, f, None)
                before[f] = _short(str(current)) if current is not None else None
                after[f] = str(value) if isinstance(value, Decimal) else value

        preview = {
            "action": "Update product",
            "product": {"id": product.id, "name": product.name, "sku": product.sku},
            "new_values": after,
            "current_values": before,
            "written_by_ai": rewrite or None,
            "notes": notes or None,
        }
        if not inp.get("confirm"):
            return {"status": "preview", "preview": preview, "note": CONFIRM_NOTE}

        from app.routers.catalog_products import update_product as patch_product
        from app.services.catalog_ai.importer_service import _resolve_or_create_brand, _resolve_or_create_category

        cid = product.company_id or company_id or "default"
        payload: dict[str, Any] = {k: v for k, v in update.items() if not k.startswith("_") and k not in ("category_names", "brand_name")}
        try:
            if "category_names" in update:
                ids = list(update["_category_ids"])
                for name in new_categories:
                    ids.append(_resolve_or_create_category(db, name, cid))  # type: ignore[arg-type]
                payload["category_ids"] = ids
            if "brand_name" in update:
                payload["brand_id"] = _resolve_or_create_brand(db, update["brand_name"], cid)  # type: ignore[arg-type]
            for key in [k for k in _rewrite_cache if k.startswith(f"{product.id}|")]:
                _rewrite_cache.pop(key, None)
            patch_product(product.id, ProductUpdate(**payload), db=db, user=user, company_id=cid)  # type: ignore[arg-type]
        except HTTPException as exc:
            db.rollback()  # type: ignore[union-attr]
            return {"error": exc.detail}
        db.refresh(product)  # type: ignore[union-attr]
        return {
            "status": "updated",
            "document": "Product",
            "id": product.id,
            "name": product.name,
            "updated_fields": sorted(after),
            "product_status": product.status,
            "doc_link": f"doc://product/{product.id}",
            "path": f"/website/products?edit={product.id}",
        }

    rewritable = ", ".join(REWRITABLE)
    return [
        OrchestratorTool(
            definition=AIToolDefinition(
                name="update_product",
                description=(
                    "Change an existing catalog product: set fields the user dictates in `changes` (name, price, "
                    "compare_at_price, short_description, description, tags, warranty, origin, status draft/"
                    "published/archived, stock_status, visibility, brand, categories), and/or have the AI write "
                    f"fields itself with `rewrite` ({rewritable}) — it writes them from the product's own content "
                    "and specs following the company's preset rules. Use `rewrite` (not `changes`) whenever the user "
                    "asks you to write/rewrite/improve a field; put only values the user actually typed in "
                    "`changes`. Never invent prices. CALL FIRST without confirm, show the preview, then call again "
                    "with the same arguments and confirm=true only after the user agrees. SEO fields → "
                    "add_product_seo; specifications → add_product_specs; images → attach_image_to_product."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "product": {"type": "string", "description": "Product name, SKU or id"},
                        "changes": {
                            "type": "object",
                            "description": "Only values the user gave",
                            "properties": {
                                "name": {"type": "string"},
                                "price": {"type": "number"},
                                "compare_at_price": {"type": "number"},
                                "short_description": {"type": "string"},
                                "description": {"type": "string"},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "warranty": {"type": "string"},
                                "origin": {"type": "string"},
                                "status": {"type": "string", "enum": ["draft", "published", "archived"]},
                                "stock_status": {"type": "string", "enum": ["in_stock", "out_of_stock", "pre_order", "coming_soon"]},
                                "visibility": {"type": "string", "enum": ["public", "private"]},
                                "brand": {"type": "string"},
                                "categories": {"type": "array", "items": {"type": "string"}, "description": "Category names; the first is the primary"},
                            },
                        },
                        "rewrite": {
                            "type": "array",
                            "items": {"type": "string", "enum": list(REWRITABLE)},
                            "description": "Fields the AI should write itself, following the presets",
                        },
                        "instruction": {"type": "string", "description": "Extra wording the user asked for this rewrite, if any"},
                        "confirm": {"type": "boolean", "description": "true only after the user approved the preview"},
                    },
                    "required": ["product"],
                },
            ),
            handler=update_product,
            risk_tier=RiskTier.WRITE,
            module="catalog",
        ),
    ]
