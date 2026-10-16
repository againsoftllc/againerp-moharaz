"""Seed demo storefront catalog coverage for local API testing.

- Publish existing draft/hidden ecommerce rows that belong to catalog categories
- Ensure every active catalog category has >= MIN_LIVE live products (with images)
- Attach filterable attribute values (processor_brand, RAM, display/screen size)
- Wire catalog_filters.attribute_id for storefront facets

Usage (API container):
  python scripts/seed_storefront_demo_catalog.py
"""

from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_profile import CatalogAttributeProfile  # noqa: F401 — FK metadata
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_filter import CatalogFilter
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.ecommerce_item import EcommerceItem
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product

MIN_LIVE = 2

# Stable demo SKUs — idempotent by slug
CATEGORY_DEMO: dict[str, list[dict]] = {
    "laptop": [
        {
            "slug": "demo-againcart-everyday-15-laptop",
            "name": "Againcart Everyday 15 Laptop",
            "brand": "Lenovo",
            "price": "64900",
            "compare": "69900",
            "attrs": {"processor_brand": "AMD", "ram": "16GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
        {
            "slug": "demo-againcart-ultrabook-14-laptop",
            "name": "Againcart UltraBook 14 Laptop",
            "brand": "HP",
            "price": "78900",
            "compare": "84900",
            "attrs": {"processor_brand": "Intel", "ram": "16GB", "display_size": "14 Inch", "screen_size": "14 Inch"},
        },
    ],
    "all-laptop": [
        {
            "slug": "demo-againcart-all-laptop-bundle-a",
            "name": "Againcart All-Laptop Pick A",
            "brand": "ASUS",
            "price": "55900",
            "compare": None,
            "attrs": {"processor_brand": "AMD", "ram": "8GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
        {
            "slug": "demo-againcart-all-laptop-bundle-b",
            "name": "Againcart All-Laptop Pick B",
            "brand": "Dell",
            "price": "91900",
            "compare": "99900",
            "attrs": {"processor_brand": "Intel", "ram": "32GB", "display_size": "14 Inch", "screen_size": "14 Inch"},
        },
    ],
    "monitor": [
        {
            "slug": "demo-againcart-24-fhd-monitor",
            "name": "Againcart 24\" FHD IPS Monitor",
            "brand": "LG",
            "price": "18900",
            "compare": "21900",
            "attrs": {"display_size": "24 Inch", "screen_size": "24 Inch"},
        },
    ],
    "power": [
        {
            "slug": "demo-againcart-65w-gan-charger",
            "name": "Againcart 65W GaN Fast Charger",
            "brand": "Anker",
            "price": "3900",
            "compare": "4500",
            "attrs": {},
        },
        {
            "slug": "demo-againcart-100w-power-bank",
            "name": "Againcart 100W Power Bank 20000mAh",
            "brand": "Anker",
            "price": "8900",
            "compare": None,
            "attrs": {},
        },
    ],
    "portable-power-station": [
        {
            "slug": "demo-againcart-portable-station-600",
            "name": "Againcart Portable Station 600W",
            "brand": "EcoFlow",
            "price": "45900",
            "compare": "49900",
            "attrs": {},
        },
        {
            "slug": "demo-againcart-portable-station-300",
            "name": "Againcart Portable Station 300W",
            "brand": "EcoFlow",
            "price": "28900",
            "compare": None,
            "attrs": {},
        },
    ],
    "acer": [
        {
            "slug": "demo-acer-aspire-lite-15-laptop",
            "name": "Acer Aspire Lite 15 Demo Laptop",
            "brand": "Acer",
            "price": "52900",
            "compare": "56900",
            "attrs": {"processor_brand": "Intel", "ram": "8GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
    ],
    "asus": [
        {
            "slug": "demo-asus-vivobook-14-laptop",
            "name": "ASUS VivoBook 14 Demo Laptop",
            "brand": "ASUS",
            "price": "61900",
            "compare": None,
            "attrs": {"processor_brand": "AMD", "ram": "16GB", "display_size": "14 Inch", "screen_size": "14 Inch"},
        },
    ],
    "dell": [
        {
            "slug": "demo-dell-inspiron-15-demo-laptop",
            "name": "Dell Inspiron 15 Demo Laptop",
            "brand": "Dell",
            "price": "67900",
            "compare": "72900",
            "attrs": {"processor_brand": "Intel", "ram": "16GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
    ],
    "hp": [
        {
            "slug": "demo-hp-15s-fq-demo-laptop",
            "name": "HP 15s-fq Demo Laptop",
            "brand": "HP",
            "price": "58900",
            "compare": None,
            "attrs": {"processor_brand": "Intel", "ram": "8GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
    ],
    "walton": [
        {
            "slug": "demo-walton-wd240-fhd-monitor",
            "name": "Walton WD240 24\" FHD Monitor",
            "brand": "Walton",
            "price": "15900",
            "compare": "17900",
            "attrs": {"display_size": "24 Inch", "screen_size": "24 Inch"},
        },
    ],
    "ecoflow": [
        {
            "slug": "demo-ecoflow-river-mini-station",
            "name": "EcoFlow RIVER Mini Demo Station",
            "brand": "EcoFlow",
            "price": "32900",
            "compare": "35900",
            "attrs": {},
        },
    ],
    "gigasonic-monitor": [
        {
            "slug": "demo-gigasonic-g24-ips-monitor",
            "name": "Gigasonic G24 IPS Demo Monitor",
            "brand": "Gigasonic",
            "price": "12900",
            "compare": None,
            "attrs": {"display_size": "24 Inch", "screen_size": "24 Inch"},
        },
    ],
    "msi": [
        {
            "slug": "demo-msi-modern-14-laptop",
            "name": "MSI Modern 14 Demo Laptop",
            "brand": "MSI",
            "price": "74900",
            "compare": "79900",
            "attrs": {"processor_brand": "Intel", "ram": "16GB", "display_size": "14 Inch", "screen_size": "14 Inch"},
        },
    ],
    "lenovo": [
        {
            "slug": "demo-lenovo-v15-g4-laptop",
            "name": "Lenovo V15 G4 Demo Laptop",
            "brand": "Lenovo",
            "price": "49900",
            "compare": "53900",
            "attrs": {"processor_brand": "AMD", "ram": "8GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"},
        },
    ],
}


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _image_for(slug: str) -> str:
    seed = _slugify(slug)[:40] or "againcart"
    return f"https://picsum.photos/seed/{seed}/600/600"


def _brand_map(db: Session) -> dict[str, CatalogBrand]:
    out: dict[str, CatalogBrand] = {}
    for b in db.query(CatalogBrand).all():
        out[b.name.lower()] = b
        out[b.slug.lower()] = b
    return out


def _attr_map(db: Session) -> dict[str, CatalogAttribute]:
    rows = (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.is_active.is_(True))
        .order_by(CatalogAttribute.is_filterable.desc())
        .all()
    )
    out: dict[str, CatalogAttribute] = {}
    for row in rows:
        # Prefer filterable row when duplicate codes exist
        if row.code not in out or row.is_filterable:
            out[row.code] = row
    return out


def _live_count(db: Session, category_id: str) -> int:
    return (
        db.query(EcommerceItem)
        .filter(
            EcommerceItem.primary_category_id == category_id,
            EcommerceItem.publish_status == "published",
            EcommerceItem.visibility == "public",
        )
        .count()
    )


def _publish_ec(ec: EcommerceItem, product: CatalogProduct | None = None) -> None:
    ec.publish_status = "published"
    ec.visibility = "public"
    ec.is_active = True
    if product:
        product.status = "active"
        product.visibility = "public"
        if not product.thumbnail and ec.thumbnail_url:
            product.thumbnail = ec.thumbnail_url


def _set_attrs(
    db: Session,
    product_id: str,
    attrs: dict[str, str],
    attr_by_code: dict[str, CatalogAttribute],
) -> int:
    n = 0
    for code, value in attrs.items():
        attr = attr_by_code.get(code)
        if not attr or not value:
            continue
        row = (
            db.query(CatalogProductAttributeValue)
            .filter(
                CatalogProductAttributeValue.product_id == product_id,
                CatalogProductAttributeValue.attribute_id == attr.id,
            )
            .first()
        )
        if row is None:
            row = CatalogProductAttributeValue(
                id=str(uuid.uuid4()),
                product_id=product_id,
                attribute_id=attr.id,
                value=value,
                sort_order=n,
            )
            db.add(row)
        else:
            row.value = value
        n += 1
    return n


def publish_existing_catalog_drafts(db: Session) -> int:
    cats = {
        c.id
        for c in db.query(CatalogCategory)
        .filter(
            CatalogCategory.channel.in_(("catalog", "dropshipping")),
            CatalogCategory.is_active.is_(True),
        )
        .all()
    }
    rows = (
        db.query(EcommerceItem)
        .filter(EcommerceItem.primary_category_id.in_(cats))
        .all()
    )
    n = 0
    for ec in rows:
        if ec.publish_status == "published" and ec.visibility == "public":
            continue
        product = db.get(CatalogProduct, ec.catalog_product_id) if ec.catalog_product_id else None
        if product and not product.thumbnail:
            product.thumbnail = ec.thumbnail_url or _image_for(ec.slug)
            ec.thumbnail_url = product.thumbnail
        elif not ec.thumbnail_url:
            ec.thumbnail_url = _image_for(ec.slug)
        _publish_ec(ec, product)
        n += 1
    return n


def ensure_demo_products(db: Session) -> tuple[int, int]:
    brands = _brand_map(db)
    attrs = _attr_map(db)
    svc = EcommerceItemService(db)
    created = 0
    published = 0

    categories = (
        db.query(CatalogCategory)
        .filter(
            CatalogCategory.channel.in_(("catalog", "dropshipping")),
            CatalogCategory.is_active.is_(True),
        )
        .order_by(CatalogCategory.sort_order.asc(), CatalogCategory.name.asc())
        .all()
    )

    for cat in categories:
        demos = list(CATEGORY_DEMO.get(cat.slug, []))
        # Generic fillers if still short after publishing demos
        while len(demos) < MIN_LIVE:
            i = len(demos) + 1
            demos.append(
                {
                    "slug": f"demo-{cat.slug}-product-{i}",
                    "name": f"{cat.name} Demo Product {i}",
                    "brand": (
                        cat.name
                        if brands.get(cat.name.lower()) or brands.get(cat.slug.lower())
                        else "Walton"
                    ),
                    "price": str(15000 + i * 3500),
                    "compare": str(17000 + i * 3500),
                    "attrs": {"ram": "8GB", "display_size": "15.6 Inch", "screen_size": "15.6 Inch"}
                    if "laptop" in cat.slug or cat.slug in {"acer", "asus", "dell", "hp", "lenovo", "msi"}
                    else {"display_size": "24 Inch", "screen_size": "24 Inch"}
                    if "monitor" in cat.slug or cat.slug in {"walton", "gigasonic-monitor"}
                    else {},
                }
            )

        for demo in demos:
            if _live_count(db, cat.id) >= MIN_LIVE:
                break
            slug = demo["slug"]
            product = db.query(CatalogProduct).filter(CatalogProduct.slug == slug).first()
            brand_name = demo.get("brand") or cat.name
            brand = (
                brands.get(brand_name.lower())
                or brands.get(_slugify(brand_name))
                or brands.get("walton")
            )
            thumb = _image_for(slug)
            price = Decimal(demo["price"])
            compare = Decimal(demo["compare"]) if demo.get("compare") else None

            if product is None:
                product_id = str(uuid.uuid4())
                product = CatalogProduct(
                    id=product_id,
                    name=demo["name"],
                    slug=slug,
                    sku=f"DEMO-{product_id[:8].upper()}",
                    description=(
                        f"<h2>{demo['name']}</h2>"
                        f"<p>Demo product for <strong>{cat.name}</strong> category API testing at Againcart.</p>"
                        f"<p>Buy {demo['name']} from Againcart.</p>"
                    ),
                    short_description=f"Demo listing for {cat.name} — API / filter testing.",
                    price=price,
                    compare_at_price=compare,
                    stock=25,
                    track_quantity=True,
                    stock_status="in_stock",
                    status="active",
                    visibility="public",
                    brand=brand.name if brand else brand_name,
                    category=cat.name,
                    brand_id=brand.id if brand else None,
                    category_id=cat.id,
                    thumbnail=thumb,
                    custom_specs_json=json.dumps(
                        [
                            {"group": "General", "field": "Category", "value": cat.name},
                            {"group": "General", "field": "Brand", "value": brand_name},
                        ]
                    ),
                )
                db.add(product)
                db.flush()
                created += 1
            else:
                product.name = demo["name"]
                product.price = price
                product.compare_at_price = compare
                product.category_id = cat.id
                product.category = cat.name
                product.brand = brand.name if brand else brand_name
                product.brand_id = brand.id if brand else product.brand_id
                product.thumbnail = product.thumbnail or thumb
                product.status = "active"
                product.visibility = "public"
                product.stock = max(product.stock or 0, 10)

            ensure_item_for_catalog_product(db, product)
            ec = svc.ensure_draft_for_catalog_product(product)
            ec.thumbnail_url = product.thumbnail or thumb
            ec.primary_category_id = cat.id
            ec.brand_id = product.brand_id
            ec.selling_price = product.price
            ec.compare_at_price = product.compare_at_price
            ec.short_description = product.short_description
            ec.full_description = product.description
            _publish_ec(ec, product)
            published += 1
            _set_attrs(db, product.id, demo.get("attrs") or {}, attrs)

        # Top up attrs on already-live products in this category (for filter testing)
        live_products = (
            db.query(CatalogProduct)
            .join(EcommerceItem, EcommerceItem.catalog_product_id == CatalogProduct.id)
            .filter(
                EcommerceItem.primary_category_id == cat.id,
                EcommerceItem.publish_status == "published",
            )
            .limit(8)
            .all()
        )
        for i, product in enumerate(live_products):
            if "laptop" in (cat.slug or "") or cat.slug in {
                "acer",
                "asus",
                "dell",
                "hp",
                "lenovo",
                "msi",
                "all-laptop",
            }:
                sample = {
                    "processor_brand": "AMD" if i % 2 == 0 else "Intel",
                    "ram": ["8GB", "16GB", "32GB"][i % 3],
                    "display_size": "15.6 Inch" if i % 2 == 0 else "14 Inch",
                    "screen_size": "15.6 Inch" if i % 2 == 0 else "14 Inch",
                }
            elif "monitor" in (cat.slug or "") or cat.slug in {"walton", "gigasonic-monitor", "monitor"}:
                sample = {
                    "display_size": ["21.45 Inch", "24 Inch", "27 Inch"][i % 3],
                    "screen_size": ["21.45 Inch", "24 Inch", "27 Inch"][i % 3],
                }
            else:
                sample = {}
            if sample:
                _set_attrs(db, product.id, sample, attrs)

    return created, published


def wire_filter_attribute_ids(db: Session) -> int:
    """Link catalog_filters rows to attribute ids by name/code when missing."""
    attrs = _attr_map(db)
    n = 0
    mapping = {
        "processor brand": "processor_brand",
        "processor": "processor_brand",
        "ram": "ram",
        "display size": "display_size",
        "screen size": "screen_size",
        "screen": "screen_size",
    }
    for row in db.query(CatalogFilter).filter(CatalogFilter.source == "attribute").all():
        key = (row.name or "").strip().lower()
        param = (row.param_key or "").strip().lower()
        code = mapping.get(key) or mapping.get(param) or (
            param if param in attrs else None
        )
        attr = attrs.get(code) if code else None
        if not attr:
            continue
        changed = False
        if row.attribute_id != attr.id:
            row.attribute_id = attr.id
            changed = True
        if (row.attribute_name or "—") in {"—", "", None}:
            row.attribute_name = attr.name
            changed = True
        if not row.is_active:
            row.is_active = True
            changed = True
        if not row.storefront_visible:
            row.storefront_visible = True
            changed = True
        if changed:
            n += 1
    return n


def main() -> None:
    db = SessionLocal()
    try:
        published_existing = publish_existing_catalog_drafts(db)
        created, published_demo = ensure_demo_products(db)
        filters_wired = wire_filter_attribute_ids(db)
        db.commit()

        print(f"Published existing drafts/hidden: {published_existing}")
        print(f"Created demo catalog products: {created}")
        print(f"Ensured/published demo ecommerce rows: {published_demo}")
        print(f"Wired filter attribute ids: {filters_wired}")

        print("\nLive products per category:")
        cats = (
            db.query(CatalogCategory)
            .filter(
                CatalogCategory.channel.in_(("catalog", "dropshipping")),
                CatalogCategory.is_active.is_(True),
            )
            .order_by(CatalogCategory.channel.asc(), CatalogCategory.name.asc())
            .all()
        )
        empty = 0
        for cat in cats:
            n = _live_count(db, cat.id)
            if n < MIN_LIVE:
                empty += 1
            print(f"  [{cat.channel:12}] {cat.slug:28} {n}")
        print(f"\nCategories below MIN_LIVE={MIN_LIVE}: {empty}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
