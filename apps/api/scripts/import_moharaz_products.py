#!/usr/bin/env python3
"""Replace AgainERP catalog products with MOHARAZ (business_id=2) products.

Deletes existing catalog_products (and their linked items / demo order lines),
then imports brands, categories, products, sell/purchase price, and on-hand qty.

  products.name / sku / description     → catalog_products + items
  products.brand_id / category_id       → catalog_brands / catalog_categories
  products.warranty_id                  → warranty text (6 months / 1 year)
  variations.default_sell_price         → price
  variations.default_purchase_price     → purchase_price / stock unit_cost
  variation_location_details.qty_available → stock + inventory_stock_levels
"""
from __future__ import annotations

import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import func, text
from sqlalchemy.orm import Session

import scripts.init_db  # noqa: F401 — register catalog/item FK mappers

from app.database import SessionLocal
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.items.item_identity_service import ItemIdentityService
from app.services.provider_mapping_service import slugify

BUSINESS_ID = "2"
COMPANY_ID = "default"
DEFAULT_DUMP = Path("/tmp/erpmoharaz_main.sql")
MAP_PATH = Path("/app/uploads/moharaz_product_map.json")

WARRANTIES = {
    "1": "6 months",
    "2": "1 year",
}

RESTRICT_ITEM_TABLES = (
    "pos_cart_lines",
    "purchase_order_lines",
    "purchase_receipt_lines",
    "sales_order_lines",
    "sales_quotation_lines",
    "vendor_order_request_items",
    "vendor_quotation_items",
    "inventory_stock_transfer_lines",
    "inventory_stock_adjustment_lines",
    "purchase_return_lines",
)


def split_sql_tuple(raw: str) -> list[str]:
    s = raw.strip()
    if s.startswith("("):
        s = s[1:]
    if s.endswith(")"):
        s = s[:-1]
    out: list[str] = []
    cur: list[str] = []
    in_s = False
    i = 0
    while i < len(s):
        ch = s[i]
        if in_s:
            if ch == "\\" and i + 1 < len(s):
                cur.append(ch)
                cur.append(s[i + 1])
                i += 2
                continue
            if ch == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    cur.append("''")
                    i += 2
                    continue
                in_s = False
                cur.append(ch)
            else:
                cur.append(ch)
            i += 1
            continue
        if ch == "'":
            in_s = True
            cur.append(ch)
        elif ch == ",":
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
        i += 1
    if cur:
        out.append("".join(cur).strip())
    return out


def unquote(value: str | None) -> str | None:
    if value is None:
        return None
    if value.upper() == "NULL":
        return None
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1].replace("''", "'").replace("\\'", "'")
    return value


def parse_table(dump_text: str, table: str) -> list[dict[str, str | None]]:
    header = re.search(rf"INSERT INTO `{table}` \(([^)]+)\) VALUES", dump_text)
    if not header:
        return []
    cols = [c.strip().strip("`") for c in header.group(1).split(",")]
    rows: list[dict[str, str | None]] = []
    for match in re.finditer(rf"INSERT INTO `{table}` \(([^)]+)\) VALUES\s*", dump_text):
        start = match.end()
        end = dump_text.find(";\n", start)
        blob = dump_text[start:end] if end != -1 else dump_text[start:]
        for line in blob.splitlines():
            line = line.strip().rstrip(",")
            if not line.startswith("("):
                continue
            fields = split_sql_tuple(line)
            rows.append(
                {
                    cols[i]: unquote(fields[i]) if i < len(fields) else None
                    for i in range(len(cols))
                }
            )
    return rows


def clean(value: str | None) -> str:
    return (value or "").strip()


def as_decimal(value: str | None) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def as_int(value: str | None) -> int:
    try:
        return int(Decimal(str(value or "0")))
    except (InvalidOperation, ValueError, TypeError):
        return 0


def unique_slug(db: Session, base: str, source_id: str) -> str:
    slug = (base or f"product-{source_id}")[:200]
    candidate = f"{slug}-{source_id}"
    n = 2
    while db.query(CatalogProduct.id).filter(CatalogProduct.slug == candidate).first():
        candidate = f"{slug}-{source_id}-{n}"
        n += 1
    return candidate[:255]


def unique_sku(db: Session, sku: str, source_id: str) -> str:
    raw = (sku or f"MHZ-{source_id}").strip()[:100]
    candidate = raw
    n = 2
    while (
        db.query(CatalogProduct.id).filter(CatalogProduct.sku == candidate).first()
        or db.query(Item.id).filter(Item.company_id == COMPANY_ID, Item.sku == candidate).first()
    ):
        suffix = f"-{source_id}" if n == 2 else f"-{source_id}-{n}"
        candidate = f"{raw[: 100 - len(suffix)]}{suffix}"
        n += 1
    return candidate


def default_warehouse_id(db: Session) -> str | None:
    row = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == COMPANY_ID,
            InventoryWarehouse.is_default.is_(True),
        )
        .first()
    )
    if row:
        return row.id
    fallback = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.company_id == COMPANY_ID, InventoryWarehouse.is_active.is_(True))
        .first()
    )
    return fallback.id if fallback else None


def clear_catalog_products(db: Session) -> int:
    item_ids = [
        row[0]
        for row in db.query(CatalogProduct.item_id).filter(CatalogProduct.item_id.isnot(None)).all()
        if row[0]
    ]
    item_ids.extend(
        row[0]
        for row in db.query(Item.id).filter(Item.sku.ilike("ELIM-%")).all()
        if row[0] not in item_ids
    )
    product_count = db.query(func.count(CatalogProduct.id)).scalar() or 0
    if item_ids:
        quoted = ", ".join(f"'{item_id}'" for item_id in item_ids)
        for table in RESTRICT_ITEM_TABLES:
            db.execute(text(f"DELETE FROM {table} WHERE item_id IN ({quoted})"))
    db.execute(text("DELETE FROM catalog_products"))
    if item_ids:
        quoted = ", ".join(f"'{item_id}'" for item_id in item_ids)
        db.execute(text(f"DELETE FROM items WHERE id IN ({quoted})"))
    db.flush()
    return int(product_count)


def ensure_brand(db: Session, source_id: str, name: str, cache: dict[str, str]) -> str:
    key = name.strip().lower()
    if key in cache:
        return cache[key]
    existing = (
        db.query(CatalogBrand)
        .filter(func.lower(CatalogBrand.name) == key, CatalogBrand.company_id == COMPANY_ID)
        .order_by(CatalogBrand.channel.asc())
        .first()
    )
    if existing:
        cache[key] = existing.id
        return existing.id
    slug_base = slugify(name) or f"brand-{source_id}"
    slug = slug_base
    n = 2
    while db.query(CatalogBrand.id).filter(CatalogBrand.slug == slug).first():
        slug = f"{slug_base}-{n}"
        n += 1
    row = CatalogBrand(
        id=f"mhz-brand-{source_id}",
        company_id=COMPANY_ID,
        name=name.strip(),
        slug=slug[:255],
        channel="catalog",
        is_active=True,
        sort_order=as_int(source_id),
    )
    db.add(row)
    db.flush()
    cache[key] = row.id
    return row.id


def ensure_category(db: Session, source_id: str, name: str, cache: dict[str, str]) -> str:
    key = name.strip().lower()
    if key in cache:
        return cache[key]
    existing = (
        db.query(CatalogCategory)
        .filter(
            func.lower(CatalogCategory.name) == key,
            CatalogCategory.company_id == COMPANY_ID,
            CatalogCategory.channel == "catalog",
        )
        .first()
    )
    if existing:
        cache[key] = existing.id
        return existing.id
    slug_base = slugify(name) or f"category-{source_id}"
    slug = slug_base
    n = 2
    while db.query(CatalogCategory.id).filter(CatalogCategory.slug == slug).first():
        slug = f"{slug_base}-{n}"
        n += 1
    row = CatalogCategory(
        id=f"mhz-cat-{source_id}",
        company_id=COMPANY_ID,
        name=name.strip(),
        caption=name.strip(),
        slug=slug[:255],
        path=f"/{slug}",
        depth=0,
        channel="catalog",
        is_active=True,
        sort_order=as_int(source_id),
    )
    db.add(row)
    db.flush()
    cache[key] = row.id
    return row.id


def import_products(dump_path: Path) -> dict[str, int]:
    dump_text = dump_path.read_text(encoding="utf-8", errors="replace")
    products = [p for p in parse_table(dump_text, "products") if p.get("business_id") == BUSINESS_ID]
    brands = {
        b["id"]: b
        for b in parse_table(dump_text, "brands")
        if b.get("business_id") == BUSINESS_ID and not b.get("deleted_at")
    }
    categories = {
        c["id"]: c
        for c in parse_table(dump_text, "categories")
        if c.get("business_id") == BUSINESS_ID and not c.get("deleted_at")
    }
    variations = {v["product_id"]: v for v in parse_table(dump_text, "variations") if not v.get("deleted_at")}
    stock_by_product: dict[str, int] = {}
    for row in parse_table(dump_text, "variation_location_details"):
        pid = row.get("product_id") or ""
        stock_by_product[pid] = stock_by_product.get(pid, 0) + as_int(row.get("qty_available"))

    db = SessionLocal()
    stats = {
        "cleared_catalog": 0,
        "brands_linked": 0,
        "categories_linked": 0,
        "products_created": 0,
        "stocked": 0,
    }
    mapping: dict[str, dict[str, str]] = {}
    try:
        stats["cleared_catalog"] = clear_catalog_products(db)
        db.commit()

        brand_cache: dict[str, str] = {}
        category_cache: dict[str, str] = {}
        warehouse_id = default_warehouse_id(db)
        identity = ItemIdentityService(db)
        inventory = InventoryItemService(db)
        ecommerce = EcommerceItemService(db)

        for rec in products:
            source_id = rec.get("id") or ""
            name = clean(rec.get("name")) or f"Product {source_id}"
            variation = variations.get(source_id) or {}
            sell = as_decimal(variation.get("default_sell_price") or variation.get("sell_price_inc_tax"))
            cost = as_decimal(variation.get("default_purchase_price") or variation.get("dpp_inc_tax"))
            qty = stock_by_product.get(source_id, 0)
            sku = unique_sku(db, clean(rec.get("sku")) or f"MHZ-{source_id}", source_id)
            slug = unique_slug(db, slugify(name), source_id)

            brand_id = None
            brand_name = None
            brand_src = rec.get("brand_id")
            if brand_src and brand_src in brands:
                brand_name = clean(brands[brand_src].get("name"))
                if brand_name:
                    brand_id = ensure_brand(db, brand_src, brand_name, brand_cache)
                    stats["brands_linked"] += 1

            category_id = None
            category_name = None
            cat_src = rec.get("category_id")
            if cat_src and cat_src in categories:
                category_name = clean(categories[cat_src].get("name"))
                if category_name:
                    category_id = ensure_category(db, cat_src, category_name, category_cache)
                    stats["categories_linked"] += 1

            product = CatalogProduct(
                id=f"mhz-prod-{source_id}",
                company_id=COMPANY_ID,
                name=name,
                slug=slug,
                sku=sku,
                description=clean(rec.get("product_description")) or None,
                price=sell,
                purchase_price=cost,
                last_selling_price=sell,
                stock=qty,
                track_quantity=True,
                stock_status="in_stock" if qty > 0 else "out_of_stock",
                status="published",
                product_type="simple",
                visibility="public",
                brand=brand_name,
                category=category_name,
                brand_id=brand_id,
                category_id=category_id,
                warranty=WARRANTIES.get(rec.get("warranty_id") or ""),
                tags_json=json.dumps(["moharaz", f"mhz:{source_id}"]),
            )
            db.add(product)
            db.flush()
            identity.persist_and_mirror(product)
            inventory.ensure_for_catalog_product(product, track_stock=True)
            ecommerce.sync_content_from_catalog(product, mirror_publish=True)

            variant = CatalogProductVariant(
                id=f"mhz-var-{variation.get('id') or source_id}",
                company_id=COMPANY_ID,
                product_id=product.id,
                sku=sku,
                name="Default",
                price=sell,
                stock=qty,
                status="published",
                is_default=True,
                sort_order=0,
            )
            db.add(variant)
            db.flush()

            if warehouse_id:
                stock_row = InventoryStockLevel(
                    company_id=COMPANY_ID,
                    warehouse_id=warehouse_id,
                    variant_id=variant.id,
                    product_id=product.id,
                    item_id=product.item_id,
                    sku=sku,
                    name=name,
                    on_hand=qty,
                    reserved=0,
                    incoming=0,
                    unit_cost=cost,
                    status="in_stock" if qty > 0 else "out_of_stock",
                )
                db.add(stock_row)
                if qty > 0:
                    stats["stocked"] += 1

            stats["products_created"] += 1
            mapping[source_id] = {
                "product_id": product.id,
                "item_id": product.item_id or "",
                "variant_id": variant.id,
                "sku": sku,
            }
            if stats["products_created"] % 50 == 0:
                db.commit()
                print(f"… {stats['products_created']}/{len(products)} products", flush=True)

        db.commit()
        MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
        MAP_PATH.write_text(json.dumps({"business_id": 2, "map": mapping}, indent=2))
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    dump_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DUMP
    if not dump_path.exists():
        raise SystemExit(f"Dump not found: {dump_path}")
    print(f"Replacing catalog products from {dump_path}", flush=True)
    stats = import_products(dump_path)
    print(json.dumps(stats, indent=2))
    print(f"ID map written to {MAP_PATH}")


if __name__ == "__main__":
    main()
