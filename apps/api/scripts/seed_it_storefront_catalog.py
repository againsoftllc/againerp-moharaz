"""Seed a Star Tech–style IT catalog for local storefront testing.

- Upsert catalog-channel IT category tree (menu-ready, show_in_top_menu)
- Reparent brand categories under sensible IT parents
- Unpublish non-IT (fashion) dropshipping demo products
- Ensure every catalog category has >= MIN_LIVE in-stock products + images
- Ensure filterable IT attributes + catalog_filters wiring

Usage (API container):
  python scripts/seed_it_storefront_catalog.py
"""

from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile  # noqa: F401
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_filter import CatalogFilter
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.ecommerce_item import EcommerceItem
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product

MIN_LIVE = 3

# (slug, name, parent_slug|None, sort_order, show_in_top_menu)
IT_CATEGORY_TREE: list[tuple[str, str, Optional[str], int, bool]] = [
    # —— Top menu ——
    ("laptop", "Laptop", None, 10, True),
    ("desktop", "Desktop", None, 20, True),
    ("pc-component", "Component", None, 30, True),
    ("monitor", "Monitor", None, 40, True),
    ("ups", "UPS", None, 50, True),
    ("tablet-pc", "Tablet", None, 60, True),
    ("office", "Office Equipment", None, 70, True),
    ("camera-drone", "Camera", None, 80, True),
    ("security-system", "Security", None, 90, True),
    ("network", "Networking", None, 100, True),
    ("pc-accessory", "Accessories", None, 110, True),
    ("it-gadget", "Gadget", None, 120, True),
    ("gaming", "Gaming", None, 130, True),
    ("tv-home", "TV", None, 140, True),
    ("power", "Power", None, 150, True),
    # —— Laptop ——
    ("all-laptop", "All Laptop", "laptop", 0, False),
    ("gaming-laptop", "Gaming Laptop", "laptop", 1, False),
    ("ultrabook", "Ultrabook", "laptop", 2, False),
    ("lenovo", "Lenovo", "all-laptop", 0, False),
    ("acer", "Acer", "all-laptop", 1, False),
    ("hp", "HP", "all-laptop", 2, False),
    ("dell", "Dell", "all-laptop", 3, False),
    ("asus", "ASUS", "all-laptop", 4, False),
    ("msi", "MSI", "all-laptop", 5, False),
    # —— Desktop ——
    ("brand-pc", "Brand PC", "desktop", 0, False),
    ("gaming-pc", "Gaming PC", "desktop", 1, False),
    ("all-in-one-pc", "All-in-One PC", "desktop", 2, False),
    # —— Component ——
    ("processor-cpu", "Processor", "pc-component", 0, False),
    ("motherboard", "Motherboard", "pc-component", 1, False),
    ("desktop-ram", "RAM", "pc-component", 2, False),
    ("graphics-card", "Graphics Card", "pc-component", 3, False),
    ("ssd-storage", "SSD", "pc-component", 4, False),
    ("hdd-storage", "HDD", "pc-component", 5, False),
    ("power-supply", "Power Supply", "pc-component", 6, False),
    ("casing", "Casing", "pc-component", 7, False),
    ("cpu-cooler", "CPU Cooler", "pc-component", 8, False),
    # —— Monitor ——
    ("gaming-monitor", "Gaming Monitor", "monitor", 0, False),
    ("portable-monitor", "Portable Monitor", "monitor", 1, False),
    ("walton", "Walton", "monitor", 10, False),
    ("gigasonic-monitor", "Gigasonic", "monitor", 11, False),
    ("lg-monitor", "LG Monitor", "monitor", 12, False),
    ("samsung-monitor", "Samsung Monitor", "monitor", 13, False),
    # —— UPS ——
    ("offline-ups", "Offline UPS", "ups", 0, False),
    ("online-ups", "Online UPS", "ups", 1, False),
    # —— Tablet ——
    ("android-tablet", "Android Tablet", "tablet-pc", 0, False),
    ("ipad-tablet", "iPad", "tablet-pc", 1, False),
    ("graphics-tablet", "Graphics Tablet", "tablet-pc", 2, False),
    # —— Office ——
    ("office-printer", "Printer", "office", 0, False),
    ("office-scanner", "Scanner", "office", 1, False),
    ("projector", "Projector", "office", 2, False),
    ("toner-cartridge", "Toner / Cartridge", "office", 3, False),
    # —— Camera ——
    ("action-camera", "Action Camera", "camera-drone", 0, False),
    ("dslr-camera", "DSLR / Mirrorless", "camera-drone", 1, False),
    ("drone", "Drone", "camera-drone", 2, False),
    # —— Security ——
    ("cc-camera", "CC Camera", "security-system", 0, False),
    ("dvr-nvr", "DVR / NVR", "security-system", 1, False),
    ("smart-lock", "Smart Lock", "security-system", 2, False),
    # —— Network ——
    ("router", "Router", "network", 0, False),
    ("network-switch", "Switch", "network", 1, False),
    ("access-point", "Access Point", "network", 2, False),
    ("lan-card", "LAN Card", "network", 3, False),
    # —— Accessories ——
    ("keyboard", "Keyboard", "pc-accessory", 0, False),
    ("mouse", "Mouse", "pc-accessory", 1, False),
    ("headphone", "Headphone", "pc-accessory", 2, False),
    ("speaker", "Speaker", "pc-accessory", 3, False),
    ("webcam", "Webcam", "pc-accessory", 4, False),
    ("pen-drive", "Pen Drive", "pc-accessory", 5, False),
    ("hub-dock", "Hub / Dock", "pc-accessory", 6, False),
    # —— Gadget ——
    ("smartwatch-gadget", "Smart Watch", "it-gadget", 0, False),
    ("earbuds-gadget", "Earbuds", "it-gadget", 1, False),
    ("powerbank-gadget", "Power Bank", "it-gadget", 2, False),
    ("bluetooth-speaker", "Bluetooth Speaker", "it-gadget", 3, False),
    # —— Gaming ——
    ("gaming-console", "Console", "gaming", 0, False),
    ("gaming-chair", "Gaming Chair", "gaming", 1, False),
    ("controller", "Controller", "gaming", 2, False),
    # —— TV ——
    ("smart-tv", "Smart TV", "tv-home", 0, False),
    ("led-tv", "LED TV", "tv-home", 1, False),
    # —— Power ——
    ("portable-power-station", "Portable Power Station", "power", 0, False),
    ("ecoflow", "EcoFlow", "portable-power-station", 0, False),
    ("charger-adapter", "Charger / Adapter", "power", 1, False),
]

# Category-specific demo product blueprints (extras beyond generic fillers)
PRODUCT_BLUEPRINTS: dict[str, list[dict]] = {
    "laptop": [
        {
            "slug": "it-lenovo-ideapad-slim-3",
            "name": "Lenovo IdeaPad Slim 3 15 AMD Ryzen 5 Laptop",
            "brand": "Lenovo",
            "price": "64900",
            "compare": "69900",
            "attrs": {
                "processor_brand": "AMD",
                "ram": "16GB",
                "storage": "512GB SSD",
                "display_size": "15.6 Inch",
                "screen_size": "15.6 Inch",
            },
        },
        {
            "slug": "it-hp-15s-intel-i5",
            "name": "HP 15s Intel Core i5 12th Gen Laptop",
            "brand": "HP",
            "price": "78900",
            "compare": "84900",
            "attrs": {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "512GB SSD",
                "display_size": "15.6 Inch",
                "screen_size": "15.6 Inch",
            },
        },
        {
            "slug": "it-asus-vivobook-14",
            "name": "ASUS VivoBook 14 OLED Laptop",
            "brand": "ASUS",
            "price": "85900",
            "compare": None,
            "attrs": {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "1TB SSD",
                "display_size": "14 Inch",
                "screen_size": "14 Inch",
            },
        },
    ],
    "gaming-laptop": [
        {
            "slug": "it-msi-katana-15",
            "name": "MSI Katana 15 RTX 4050 Gaming Laptop",
            "brand": "MSI",
            "price": "145900",
            "compare": "155900",
            "attrs": {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 4050",
                "display_size": "15.6 Inch",
                "screen_size": "15.6 Inch",
            },
        },
        {
            "slug": "it-asus-tuf-a15",
            "name": "ASUS TUF Gaming A15 RTX 4060 Laptop",
            "brand": "ASUS",
            "price": "159900",
            "compare": "169900",
            "attrs": {
                "processor_brand": "AMD",
                "ram": "16GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
                "display_size": "15.6 Inch",
                "screen_size": "15.6 Inch",
            },
        },
        {
            "slug": "it-acer-nitro-v15",
            "name": "Acer Nitro V 15 Gaming Laptop",
            "brand": "Acer",
            "price": "119900",
            "compare": None,
            "attrs": {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 3050",
                "display_size": "15.6 Inch",
                "screen_size": "15.6 Inch",
            },
        },
    ],
    "monitor": [
        {
            "slug": "it-lg-24-ips-monitor",
            "name": "LG 24\" Full HD IPS Monitor",
            "brand": "LG",
            "price": "18900",
            "compare": "21900",
            "attrs": {"display_size": "24 Inch", "screen_size": "24 Inch"},
        },
        {
            "slug": "it-samsung-27-monitor",
            "name": "Samsung 27\" IPS Monitor",
            "brand": "Samsung",
            "price": "28900",
            "compare": "31900",
            "attrs": {"display_size": "27 Inch", "screen_size": "27 Inch"},
        },
        {
            "slug": "it-gigasonic-22-monitor",
            "name": "Gigasonic 22\" LED Monitor",
            "brand": "Gigasonic",
            "price": "9900",
            "compare": None,
            "attrs": {"display_size": "21.45 Inch", "screen_size": "21.45 Inch"},
        },
    ],
    "graphics-card": [
        {
            "slug": "it-rtx-4060-8gb",
            "name": "NVIDIA GeForce RTX 4060 8GB Graphics Card",
            "brand": "ASUS",
            "price": "42900",
            "compare": "45900",
            "attrs": {"graphics_card": "RTX 4060"},
        },
        {
            "slug": "it-rtx-3050-6gb",
            "name": "Gigabyte RTX 3050 6GB Graphics Card",
            "brand": "Gigasonic",
            "price": "28900",
            "compare": None,
            "attrs": {"graphics_card": "RTX 3050"},
        },
        {
            "slug": "it-rx-7600",
            "name": "AMD Radeon RX 7600 8GB Graphics Card",
            "brand": "ASUS",
            "price": "38900",
            "compare": "41900",
            "attrs": {"graphics_card": "RX 7600", "processor_brand": "AMD"},
        },
    ],
    "desktop-ram": [
        {
            "slug": "it-corsair-16gb-ddr5",
            "name": "Corsair Vengeance 16GB DDR5 5600MHz RAM",
            "brand": "Corsair",
            "price": "6900",
            "compare": "7900",
            "attrs": {"ram": "16GB"},
        },
        {
            "slug": "it-corsair-32gb-ddr5",
            "name": "Corsair Vengeance 32GB (2x16) DDR5 RAM",
            "brand": "Corsair",
            "price": "12900",
            "compare": None,
            "attrs": {"ram": "32GB"},
        },
        {
            "slug": "it-kingston-8gb-ddr4",
            "name": "Kingston Fury 8GB DDR4 3200MHz RAM",
            "brand": "Samsung",
            "price": "2900",
            "compare": "3400",
            "attrs": {"ram": "8GB"},
        },
    ],
    "ssd-storage": [
        {
            "slug": "it-samsung-980-512",
            "name": "Samsung 980 512GB NVMe SSD",
            "brand": "Samsung",
            "price": "5900",
            "compare": "6900",
            "attrs": {"storage": "512GB SSD"},
        },
        {
            "slug": "it-wd-1tb-nvme",
            "name": "WD Black SN770 1TB NVMe SSD",
            "brand": "Samsung",
            "price": "9900",
            "compare": None,
            "attrs": {"storage": "1TB SSD"},
        },
        {
            "slug": "it-crucial-256-ssd",
            "name": "Crucial BX500 256GB SATA SSD",
            "brand": "Samsung",
            "price": "2900",
            "compare": "3400",
            "attrs": {"storage": "256GB SSD"},
        },
    ],
    "keyboard": [
        {
            "slug": "it-logitech-k380",
            "name": "Logitech K380 Multi-Device Bluetooth Keyboard",
            "brand": "Logitech",
            "price": "3900",
            "compare": "4500",
            "attrs": {},
        },
        {
            "slug": "it-keychron-k2",
            "name": "Keychron K2 Mechanical Keyboard",
            "brand": "Keychron",
            "price": "9900",
            "compare": None,
            "attrs": {},
        },
        {
            "slug": "it-razer-huntsman",
            "name": "Razer Huntsman Mini Gaming Keyboard",
            "brand": "Razer",
            "price": "12900",
            "compare": "14900",
            "attrs": {},
        },
    ],
    "router": [
        {
            "slug": "it-tp-link-ax1800",
            "name": "TP-Link Archer AX1800 Wi-Fi 6 Router",
            "brand": "TP-Link",
            "price": "4900",
            "compare": "5500",
            "attrs": {},
        },
        {
            "slug": "it-tp-link-ax3000",
            "name": "TP-Link Archer AX3000 Dual Band Router",
            "brand": "TP-Link",
            "price": "7900",
            "compare": None,
            "attrs": {},
        },
        {
            "slug": "it-xiaomi-ax3000",
            "name": "Xiaomi Router AX3000T",
            "brand": "Xiaomi",
            "price": "4500",
            "compare": "5200",
            "attrs": {},
        },
    ],
}

ATTR_DEFS = [
    ("processor_brand", "Processor Brand", ["AMD", "Intel", "Apple", "Qualcomm"]),
    ("ram", "RAM", ["4GB", "8GB", "16GB", "32GB", "64GB"]),
    ("storage", "Storage", ["256GB SSD", "512GB SSD", "1TB SSD", "2TB SSD", "1TB HDD"]),
    ("display_size", "Display Size", ["14 Inch", "15.6 Inch", "21.45 Inch", "24 Inch", "27 Inch", "32 Inch"]),
    ("screen_size", "Screen Size", ["14 Inch", "15.6 Inch", "21.45 Inch", "24 Inch", "27 Inch", "32 Inch"]),
    ("graphics_card", "Graphics Card", ["Integrated", "GTX 1650", "RTX 3050", "RTX 4050", "RTX 4060", "RX 7600"]),
]


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _image_for(slug: str) -> str:
    seed = _slugify(slug)[:40] or "againcart-it"
    return f"https://picsum.photos/seed/{seed}/600/600"


def _apply_path_depth(row: CatalogCategory, parent: Optional[CatalogCategory]) -> None:
    if parent:
        row.parent_id = parent.id
        row.depth = parent.depth + 1
        row.path = f"{parent.path}{row.id}/"
    else:
        row.parent_id = None
        row.depth = 0
        row.path = f"/{row.id}/"


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
        product.stock = max(int(product.stock or 0), 25)
        product.stock_status = "in_stock"
        product.track_quantity = True
        if not product.thumbnail and ec.thumbnail_url:
            product.thumbnail = ec.thumbnail_url


def ensure_it_attributes(db: Session) -> int:
    group = (
        db.query(CatalogAttributeGroup)
        .order_by(CatalogAttributeGroup.sort_order.asc())
        .first()
    )
    if group is None:
        group = CatalogAttributeGroup(
            id=str(uuid.uuid4()),
            name="IT Specs",
            code="it_specs",
            sort_order=0,
            is_active=True,
        )
        db.add(group)
        db.flush()

    existing = _attr_map(db)
    created = 0
    for i, (code, name, values) in enumerate(ATTR_DEFS):
        row = existing.get(code)
        if row is None:
            row = CatalogAttribute(
                id=str(uuid.uuid4()),
                group_id=group.id,
                name=name,
                code=code,
                field_type="select",
                sort_order=10 + i,
                is_filterable=True,
                is_comparable=True,
                is_searchable=True,
                is_visible=True,
                is_active=True,
                filter_display_type="multi_select",
                storefront_filter_visible=True,
                predefined_values=json.dumps(values),
            )
            db.add(row)
            existing[code] = row
            created += 1
        else:
            row.is_filterable = True
            row.is_active = True
            row.storefront_filter_visible = True
            if not row.predefined_values or row.predefined_values == "[]":
                row.predefined_values = json.dumps(values)
    return created


def wire_filters(db: Session) -> int:
    attrs = _attr_map(db)
    n = 0
    desired = [
        ("Brand", "brand", None, "built_in", 0),
        ("Price", "price", None, "built_in", 1),
        ("In stock only", "in_stock", None, "built_in", 2),
        ("Processor Brand", "processor_brand", "processor_brand", "attribute", 10),
        ("RAM", "ram", "ram", "attribute", 11),
        ("Storage", "storage", "storage", "attribute", 12),
        ("Graphics Card", "graphics_card", "graphics_card", "attribute", 13),
        ("Display Size", "display_size", "display_size", "attribute", 14),
        ("Screen Size", "screen_size", "screen_size", "attribute", 15),
    ]
    by_param = {f.param_key: f for f in db.query(CatalogFilter).all()}
    for name, param_key, attr_code, source, sort_order in desired:
        attr = attrs.get(attr_code) if attr_code else None
        row = by_param.get(param_key)
        if row is None:
            row = CatalogFilter(
                id=str(uuid.uuid4()),
                name=name,
                param_key=param_key,
                display_type="multi_select" if source == "attribute" else "toggle",
                source=source,
                attribute_id=attr.id if attr else None,
                attribute_name=attr.name if attr else name,
                sort_order=sort_order,
                is_active=True,
                storefront_visible=True,
                url_example=f"?{param_key}=example",
            )
            db.add(row)
            by_param[param_key] = row
            n += 1
        else:
            changed = False
            if attr and row.attribute_id != attr.id:
                row.attribute_id = attr.id
                row.attribute_name = attr.name
                changed = True
            if not row.is_active or not row.storefront_visible:
                row.is_active = True
                row.storefront_visible = True
                changed = True
            if row.source != source:
                row.source = source
                changed = True
            if changed:
                n += 1
    return n


def ensure_it_categories(db: Session) -> tuple[int, int]:
    by_slug = {c.slug: c for c in db.query(CatalogCategory).all()}
    created = updated = 0

    # First pass: create missing rows (parents may not exist yet — two passes)
    for _ in range(2):
        for slug, name, parent_slug, sort_order, show_top in IT_CATEGORY_TREE:
            parent = by_slug.get(parent_slug) if parent_slug else None
            if parent_slug and parent is None:
                continue
            row = by_slug.get(slug)
            if row is None:
                row = CatalogCategory(
                    id=str(uuid.uuid4()),
                    name=name,
                    caption=name,
                    slug=slug,
                    sort_order=sort_order,
                    is_active=True,
                    show_in_top_menu=show_top,
                    channel="catalog",
                    description=f"Shop {name} at Againcart — IT & computer store.",
                    meta_title=f"{name} Price in Bangladesh | Againcart",
                    meta_description=f"Buy {name} online from Againcart. Genuine products, in stock.",
                )
                db.add(row)
                db.flush()
                _apply_path_depth(row, parent)
                by_slug[slug] = row
                created += 1
            else:
                row.name = name
                row.caption = name
                row.channel = "catalog"
                row.is_active = True
                row.sort_order = sort_order
                row.show_in_top_menu = show_top
                desired_parent = parent.id if parent else None
                if row.parent_id != desired_parent:
                    _apply_path_depth(row, parent)
                updated += 1
    return created, updated


def unpublish_non_it_demos(db: Session) -> int:
    """Hide fashion / non-IT dropshipping demo products from storefront."""
    fashionish = (
        db.query(EcommerceItem)
        .join(CatalogCategory, CatalogCategory.id == EcommerceItem.primary_category_id)
        .filter(
            CatalogCategory.channel == "dropshipping",
            EcommerceItem.slug.like("demo-%"),
        )
        .all()
    )
    n = 0
    for ec in fashionish:
        if ec.publish_status == "published" or ec.visibility == "public":
            ec.publish_status = "draft"
            ec.visibility = "private"
            ec.is_active = False
            n += 1
    return n


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
            db.add(
                CatalogProductAttributeValue(
                    id=str(uuid.uuid4()),
                    product_id=product_id,
                    attribute_id=attr.id,
                    value=value,
                    sort_order=n,
                )
            )
        else:
            row.value = value
        n += 1
    return n


def _default_attrs_for(slug: str, index: int) -> dict[str, str]:
    laptopish = {
        "laptop",
        "all-laptop",
        "gaming-laptop",
        "ultrabook",
        "lenovo",
        "acer",
        "hp",
        "dell",
        "asus",
        "msi",
        "brand-pc",
        "gaming-pc",
        "all-in-one-pc",
        "tablet-pc",
        "android-tablet",
        "ipad-tablet",
    }
    monitorish = {
        "monitor",
        "gaming-monitor",
        "portable-monitor",
        "walton",
        "gigasonic-monitor",
        "lg-monitor",
        "samsung-monitor",
        "smart-tv",
        "led-tv",
    }
    if slug in laptopish or "laptop" in slug:
        return {
            "processor_brand": "AMD" if index % 2 == 0 else "Intel",
            "ram": ["8GB", "16GB", "32GB"][index % 3],
            "storage": ["256GB SSD", "512GB SSD", "1TB SSD"][index % 3],
            "display_size": "15.6 Inch" if index % 2 == 0 else "14 Inch",
            "screen_size": "15.6 Inch" if index % 2 == 0 else "14 Inch",
            "graphics_card": ["Integrated", "RTX 3050", "RTX 4050"][index % 3]
            if "gaming" in slug
            else "Integrated",
        }
    if slug in monitorish or "monitor" in slug or "tv" in slug:
        return {
            "display_size": ["21.45 Inch", "24 Inch", "27 Inch"][index % 3],
            "screen_size": ["21.45 Inch", "24 Inch", "27 Inch"][index % 3],
        }
    if slug in {"desktop-ram"} or slug.endswith("-ram"):
        return {"ram": ["8GB", "16GB", "32GB"][index % 3]}
    if "ssd" in slug or "hdd" in slug or "storage" in slug or "pen-drive" in slug:
        return {"storage": ["256GB SSD", "512GB SSD", "1TB SSD"][index % 3]}
    if "graphics" in slug:
        return {"graphics_card": ["RTX 3050", "RTX 4050", "RTX 4060"][index % 3]}
    if "processor" in slug:
        return {"processor_brand": "AMD" if index % 2 == 0 else "Intel"}
    return {}


def _product_name(cat: CatalogCategory, index: int) -> str:
    return f"Againcart {cat.name} Model {index}"


def ensure_products(db: Session) -> tuple[int, int]:
    brands = _brand_map(db)
    attrs = _attr_map(db)
    svc = EcommerceItemService(db)
    created = published = 0

    categories = (
        db.query(CatalogCategory)
        .filter(CatalogCategory.channel == "catalog", CatalogCategory.is_active.is_(True))
        .order_by(CatalogCategory.sort_order.asc(), CatalogCategory.name.asc())
        .all()
    )

    for cat in categories:
        demos = list(PRODUCT_BLUEPRINTS.get(cat.slug, []))
        while len(demos) < MIN_LIVE:
            i = len(demos) + 1
            brand = (
                brands.get(cat.name.lower())
                or brands.get(cat.slug.lower())
                or brands.get("walton")
            )
            demos.append(
                {
                    "slug": f"it-{cat.slug}-product-{i}",
                    "name": _product_name(cat, i),
                    "brand": brand.name if brand else "Walton",
                    "price": str(4500 + i * 2500 + (cat.sort_order or 0) * 100),
                    "compare": str(5500 + i * 2500 + (cat.sort_order or 0) * 100),
                    "attrs": _default_attrs_for(cat.slug, i - 1),
                }
            )

        for demo in demos:
            slug = demo["slug"]
            product = db.query(CatalogProduct).filter(CatalogProduct.slug == slug).first()
            brand_name = demo.get("brand") or cat.name
            brand = (
                brands.get(brand_name.lower())
                or brands.get(_slugify(brand_name))
                or brands.get("walton")
            )
            thumb = _image_for(slug)
            price = Decimal(str(demo["price"]))
            compare = Decimal(str(demo["compare"])) if demo.get("compare") else None

            if product is None:
                product_id = str(uuid.uuid4())
                product = CatalogProduct(
                    id=product_id,
                    name=demo["name"],
                    slug=slug,
                    sku=f"IT-{product_id[:8].upper()}",
                    description=(
                        f"<h2>{demo['name']}</h2>"
                        f"<p>Genuine IT product for <strong>{cat.name}</strong> at Againcart.</p>"
                        f"<p>In stock — buy {demo['name']} online from Againcart Bangladesh.</p>"
                    ),
                    short_description=f"{demo['name']} — in stock at Againcart.",
                    price=price,
                    compare_at_price=compare,
                    stock=40,
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
                            {"group": "General", "field": "Availability", "value": "In Stock"},
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
                product.stock = max(int(product.stock or 0), 25)
                product.stock_status = "in_stock"
                product.track_quantity = True

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

        # Top-up attrs on other live products in this category
        live_products = (
            db.query(CatalogProduct)
            .join(EcommerceItem, EcommerceItem.catalog_product_id == CatalogProduct.id)
            .filter(
                EcommerceItem.primary_category_id == cat.id,
                EcommerceItem.publish_status == "published",
            )
            .limit(12)
            .all()
        )
        for i, product in enumerate(live_products):
            sample = _default_attrs_for(cat.slug, i)
            if sample:
                _set_attrs(db, product.id, sample, attrs)
            product.stock = max(int(product.stock or 0), 10)
            product.stock_status = "in_stock"

    return created, published


def publish_existing_catalog(db: Session) -> int:
    cats = {
        c.id
        for c in db.query(CatalogCategory)
        .filter(CatalogCategory.channel == "catalog", CatalogCategory.is_active.is_(True))
        .all()
    }
    n = 0
    for ec in db.query(EcommerceItem).filter(EcommerceItem.primary_category_id.in_(cats)).all():
        product = db.get(CatalogProduct, ec.catalog_product_id) if ec.catalog_product_id else None
        if not ec.thumbnail_url:
            ec.thumbnail_url = (product.thumbnail if product else None) or _image_for(ec.slug)
        if product and not product.thumbnail:
            product.thumbnail = ec.thumbnail_url
        _publish_ec(ec, product)
        n += 1
    return n


def main() -> None:
    db = SessionLocal()
    try:
        attrs_created = ensure_it_attributes(db)
        cat_created, cat_updated = ensure_it_categories(db)
        filters_wired = wire_filters(db)
        unpublished = unpublish_non_it_demos(db)
        published_existing = publish_existing_catalog(db)
        created, published = ensure_products(db)
        db.commit()

        print(f"IT attributes created/ensured: {attrs_created}")
        print(f"IT categories created: {cat_created}, updated: {cat_updated}")
        print(f"Filters wired: {filters_wired}")
        print(f"Unpublished non-IT demos: {unpublished}")
        print(f"Published existing catalog ecommerce: {published_existing}")
        print(f"Created IT products: {created}")
        print(f"Ensured/published IT ecommerce: {published}")

        cats = (
            db.query(CatalogCategory)
            .filter(CatalogCategory.channel == "catalog", CatalogCategory.is_active.is_(True))
            .order_by(CatalogCategory.sort_order.asc(), CatalogCategory.name.asc())
            .all()
        )
        print(f"\nCatalog categories: {len(cats)}")
        empty = 0
        for cat in cats:
            n = _live_count(db, cat.id)
            if n < MIN_LIVE:
                empty += 1
            top = "TOP" if cat.show_in_top_menu else "   "
            print(f"  [{top}] {cat.slug:28} live={n}")
        print(f"\nBelow MIN_LIVE={MIN_LIVE}: {empty}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
