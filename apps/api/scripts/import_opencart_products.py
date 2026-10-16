"""Import OpenCart products (Moharaz) — core fields (docs/DATA_MIGRATION.md, step 4).

Input: JSON lines from the staging OpenCart DB (one product per line): product_id,
model, sku, mpn, quantity, subtract, stock_status_id, price, status,
manufacturer_id, name, description, tag, meta_title, meta_description,
meta_keyword, focus_keyword, keyword (SEO URL), short_description, category_ids,
special (the special price OpenCart would show today).

Writes through the service layer (item identity, ecommerce listing, category
links, default variant, opening stock ledger) — same path as the admin "create
product" endpoint. Deterministic id ``oc-prod-{product_id}``; re-runs update the
fields in place and never add stock twice.

``--reset`` removes the products that did not come from OpenCart from the
catalog and storefront (product, variants, listing, links, stock levels,
reviews). Their ``items`` identity rows are referenced by sales/purchase
documents (RESTRICT), so those rows are only archived, never deleted.

Attributes, filters, options and images are later steps.

Usage (api container):
    python -m scripts.import_opencart_products /tmp/oc_products.jsonl --reset
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.ecommerce_item import EcommerceItem
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.provider_entity_mapping import ProviderEntityMapping
from app.routers.catalog_products import _upsert_product_inventory
from app.schemas.product import ProductInventoryUpsert
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.items.catalog_item_bridge import ensure_default_variant
from app.services.items.item_identity_service import ItemIdentityService
from scripts.opencart_common import COMPANY_ID, PROVIDER, clean_html, clean_text, record_mapping, slugify

ID_PREFIX = "oc-prod-"
BATCH = 100

# OpenCart stock_status_id → (ERP stock_status, storefront visibility).
# The live site's stock-status module hides price + buy button for everything
# except In Stock / 2-3 Days, and hides Discontinued from search/category lists.
STOCK_STATUS = {
    7: ("in_stock", "public", "In Stock"),
    6: ("coming_soon", "public", "Upcoming"),  # Moharaz: 6 = Upcoming 
    5: ("out_of_stock", "public", "Out Of Stock"),
    8: ("pre_order", "public", "Pre-Order"),
    9: ("coming_soon", "public", "Up Coming"),
    10: ("out_of_stock", "public", "Call For Price"),
    11: ("out_of_stock", "private", "Discontinued"),
}
SKU_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/+-]{1,63}$")


def money(value) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return Decimal("0.00")


def split_keywords(*values: str | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        for part in re.split(r"[,\n\r]+", clean_text(value)):
            word = part.strip()
            if word and word.lower() not in seen and len(word) <= 100:
                seen.add(word.lower())
                out.append(word)
    return out[:50]


def reset_old_products(db) -> dict[str, int]:
    old = [r[0] for r in db.execute(text("SELECT id FROM catalog_products WHERE id NOT LIKE :p"), {"p": f"{ID_PREFIX}%"})]
    if not old:
        return {"old_products_removed": 0}
    items = [
        r[0]
        for r in db.execute(
            text("SELECT item_id FROM catalog_products WHERE id = ANY(:ids) AND item_id IS NOT NULL"), {"ids": old}
        )
    ]
    db.execute(
        text("DELETE FROM ecommerce_items WHERE item_id = ANY(:items) OR catalog_product_id = ANY(:ids)"),
        {"items": items, "ids": old},
    )
    db.execute(text("DELETE FROM catalog_product_reviews WHERE product_id = ANY(:ids)"), {"ids": old})
    db.execute(text("DELETE FROM catalog_products WHERE id = ANY(:ids)"), {"ids": old})
    archived = db.execute(
        text("UPDATE items SET status = 'archived' WHERE id = ANY(:items)"), {"items": items}
    ).rowcount
    db.commit()
    return {"old_products_removed": len(old), "old_items_archived": archived}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl_path")
    parser.add_argument("--reset", action="store_true", help="remove non-OpenCart products first")
    parser.add_argument("--limit", type=int, default=0, help="import only the first N (testing)")
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="import only OpenCart products that are not in catalog_products (e.g. deleted by hand)",
    )
    parser.add_argument("--id-from", type=int, default=0, help="only OpenCart product_id >= this")
    parser.add_argument("--id-to", type=int, default=0, help="only OpenCart product_id <= this")
    args = parser.parse_args()

    with open(args.jsonl_path, encoding="utf-8") as fh:
        all_rows = [json.loads(line) for line in fh if line.strip()]
    rows = all_rows[: args.limit] if args.limit else all_rows
    if args.id_from or args.id_to:
        hi = args.id_to or 10**12
        rows = [r for r in rows if args.id_from <= r["product_id"] <= hi]

    db = SessionLocal()
    if args.only_missing:
        present = {r[0] for r in db.execute(text("SELECT id FROM catalog_products WHERE id LIKE :p"), {"p": f"{ID_PREFIX}%"})}
        rows = [r for r in rows if f"{ID_PREFIX}{r['product_id']}" not in present]
        print(f"only-missing: {len(rows)} to import", flush=True)
    stats: dict[str, int] = defaultdict(int)
    try:
        if args.reset:
            stats.update(reset_old_products(db))

        # --- lookups ------------------------------------------------------
        brand_map = {
            m.provider_entity_id: m.erp_entity_id
            for m in db.query(ProviderEntityMapping).filter_by(provider=PROVIDER, entity_type="brand")
        }
        brands = {b.id: b for b in db.query(CatalogBrand)}
        cats = {c.id: c for c in db.query(CatalogCategory)}
        top_roots = {c.id for c in cats.values() if c.parent_id is None and c.show_in_top_menu and c.is_active}

        def root_of(cat: CatalogCategory) -> str:
            return cat.path.strip("/").split("/")[0]

        def pick_primary(cat_ids: list[str]) -> str | None:
            # The real taxonomy lives under the header-menu roots; promo/landing
            # trees are secondary links. Then the most specific (deepest) node.
            if not cat_ids:
                return None
            return max(
                cat_ids,
                key=lambda cid: (root_of(cats[cid]) in top_roots, cats[cid].is_active, cats[cid].depth, -int(cid.rsplit("-", 1)[1])),
            )

        warehouse = (
            db.query(InventoryWarehouse)
            .filter_by(company_id=COMPANY_ID, is_default=True, is_active=True)
            .first()
            or db.query(InventoryWarehouse).filter_by(company_id=COMPANY_ID, is_active=True).first()
        )

        # --- slugs: live keyword for its owner; never a category/brand URL ------
        own_ids = {f"{ID_PREFIX}{r['product_id']}" for r in rows}
        foreign = {c.slug for c in cats.values()} | {b.slug for b in brands.values()}
        used = {
            s
            for (pid, s) in db.execute(text("SELECT id, slug FROM catalog_products")).all()
            if pid not in own_ids
        } | {
            # A listing outlives an admin "delete" (its catalog_product_id goes NULL) —
            # match on item_id too, or a re-import loses its own live URL.
            s
            for (pid, iid, s) in db.execute(
                text("SELECT catalog_product_id, item_id, slug FROM ecommerce_items")
            ).all()
            if pid not in own_ids and iid not in own_ids
        }
        taken = lambda s: s in used or s in foreign  # noqa: E731
        slug_for: dict[int, str] = {}
        for r in sorted(rows, key=lambda x: x["product_id"]):
            kw = slugify(r.get("keyword") or "")
            if kw and not taken(kw):
                slug_for[r["product_id"]] = kw
                used.add(kw)
        for r in rows:
            pid = r["product_id"]
            if pid in slug_for:
                continue
            base = slugify(clean_text(r.get("name")) or r.get("model") or "") or f"product-{pid}"
            slug = base if not taken(base) else f"{base}-{pid}"
            used.add(slug)
            slug_for[pid] = slug
            stats["slug_generated"] += 1

        # --- SKUs: the OpenCart SKU when clean and unique, else UT-{id} ---------
        other_skus = {
            s.lower()
            for (pid, s) in db.execute(text("SELECT id, sku FROM catalog_products")).all()
            if pid not in own_ids and s
        } | {s.lower() for (iid, s) in db.execute(text("SELECT id, sku FROM items")).all() if iid not in own_ids and s}
        sku_for: dict[int, str] = {}
        for r in sorted(rows, key=lambda x: x["product_id"]):
            raw = (r.get("sku") or "").strip()
            if raw and SKU_OK.match(raw) and raw.upper() != "N/A" and raw.lower() not in other_skus:
                sku_for[r["product_id"]] = raw
                other_skus.add(raw.lower())
            else:
                sku_for[r["product_id"]] = f"MZ-{r['product_id']}"
                stats["sku_generated"] += 1

        identity = ItemIdentityService(db)
        inventory = InventoryItemService(db)
        ecommerce = EcommerceItemService(db)

        for n, r in enumerate(rows, start=1):
            pid = r["product_id"]
            row_id = f"{ID_PREFIX}{pid}"
            name = clean_text(r.get("name")) or clean_text(r.get("model")) or f"Product {pid}"
            stock_status, visibility, status_label = STOCK_STATUS.get(
                int(r.get("stock_status_id") or 0),
                ("in_stock" if int(r.get("quantity") or 0) > 0 else "out_of_stock", "public", "(none)"),
            )

            # Price: OpenCart shows the active special (struck-through regular price).
            regular = money(r.get("price"))
            special = money(r.get("special")) if r.get("special") is not None else None
            price, compare_at = regular, None
            if special and special > 0:
                price = special
                if special < regular:
                    compare_at = regular
                    stats["on_sale"] += 1

            brand_id = brand_map.get(str(r.get("manufacturer_id") or ""))
            cat_ids = [
                f"oc-cat-{c}" for c in (r.get("category_ids") or "").split(",") if c and f"oc-cat-{c}" in cats
            ]
            primary = pick_primary(cat_ids)

            product = db.get(CatalogProduct, row_id)
            is_new = product is None
            if is_new:
                product = CatalogProduct(id=row_id, company_id=COMPANY_ID, product_type="simple")
                db.add(product)

            product.name = name[:255]
            product.slug = slug_for[pid]
            product.sku = sku_for[pid]
            product.model = clean_text(r.get("model"))[:200] or None
            product.description = clean_html(r.get("description"))
            product.short_description = clean_html(r.get("short_description"))
            product.seo_title = clean_text(r.get("meta_title"))[:255] or None
            product.seo_description = clean_text(r.get("meta_description")) or None
            product.focus_keyphrase = clean_text(r.get("focus_keyword"))[:200] or None
            # ERP keeps one keyword list (tags_json = storefront SEO keywords): tags first, then meta keywords.
            product.tags_json = json.dumps(split_keywords(r.get("tag"), r.get("meta_keyword")), ensure_ascii=False)
            product.price = price
            product.compare_at_price = compare_at
            product.last_selling_price = price
            product.stock_status = stock_status
            product.track_quantity = bool(r.get("subtract"))
            product.status = "published" if int(r.get("status") or 0) == 1 else "draft"
            product.visibility = visibility
            product.brand_id = brand_id
            product.brand = brands[brand_id].name[:100] if brand_id in brands else None
            product.category_id = primary
            product.category = cats[primary].name[:100] if primary else None
            product.dropship_meta_json = None
            if is_new:
                product.stock = 0
            db.flush()

            identity.persist_and_mirror(product)
            inventory.ensure_for_catalog_product(product, track_stock=product.track_quantity)
            ecommerce.sync_content_from_catalog(product, mirror_publish=True)
            if cat_ids:
                ordered = [primary] + [c for c in cat_ids if c != primary]
                ecommerce.replace_categories(
                    product.item_id, ordered, primary_category_id=primary, company_id=COMPANY_ID
                )
            variant = ensure_default_variant(db, product)
            variant.price = price
            variant.status = product.status

            qty = max(0, int(r.get("quantity") or 0))
            # Opening stock only when the item has no stock level yet. A product
            # deleted by hand loses its stock levels (cascade), so a re-import
            # restores the quantity; an existing level is never topped up twice.
            already_stocked = db.execute(
                text("SELECT 1 FROM inventory_stock_levels WHERE item_id = :i LIMIT 1"),
                {"i": product.item_id},
            ).first()
            if is_new and qty > 0 and warehouse and not already_stocked:
                _upsert_product_inventory(
                    db, product, variant, ProductInventoryUpsert(warehouse_id=warehouse.id, on_hand=qty, min_qty=0)
                )
                stats["opening_stock_rows"] += 1

            record_mapping(
                db,
                "product",
                pid,
                row_id,
                name=name,
                metadata={
                    "oc_sku": r.get("sku") or "",
                    "oc_model": r.get("model") or "",
                    "oc_mpn": r.get("mpn") or "",
                    "oc_stock_status": status_label,
                    "oc_quantity": int(r.get("quantity") or 0),
                    "oc_price": str(regular),
                    "oc_special": str(special) if special else None,
                    "oc_keyword": r.get("keyword") or "",
                },
            )
            stats["inserted" if is_new else "updated"] += 1
            stats["no_category"] += 0 if cat_ids else 1
            stats["no_brand"] += 0 if brand_id else 1
            stats[f"status_{stock_status}_{visibility}"] += 1

            if n % BATCH == 0:
                db.commit()
                print(f"… {n}/{len(rows)}", flush=True)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(json.dumps(dict(stats), indent=1))


if __name__ == "__main__":
    main()
