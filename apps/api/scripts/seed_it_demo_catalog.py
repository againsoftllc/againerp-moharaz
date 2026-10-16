"""Rebuild the storefront catalog as a presentable IT-store demo.

The catalog had drifted: fashion / beauty / baby leftovers from an older
dropshipping seed, duplicate category trees (network vs networking, monitor vs
monitors), and ~400 filler products all named "Againcart <Category> Model 2".
None of that demos well.

This script keeps one focused IT tree where every section a presenter can click
is stocked with real-world product names, and puts everything else out of the
way:

  * non-IT categories and their products are deleted outright
  * duplicate / unstocked categories are deleted too, along with any product
    left outside the demo tree
  * the stocked sections below get hand-written products, replacing the
    "Model N" fillers that lived there

Thumbnails start on the shared placeholder; run `seed_it_demo_images.py` afterwards
to draw a per-product image, or attach real photos from Admin → Media. Products
referenced by an order are never deleted, only retired,
so order history keeps resolving.

Usage (API container):
  python scripts/seed_it_demo_catalog.py
"""

from __future__ import annotations

import json
import re
import uuid
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_profile import CatalogAttributeProfile  # noqa: F401  (FK target)
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.ecommerce_item import EcommerceItem
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product

PLACEHOLDER_IMAGE = "/images/products/placeholder.svg"

# Roots that have no place in an IT store — removed with everything under them.
NON_IT_ROOTS = [
    "baby-items",
    "bags",
    "beauty",
    "eyewear",
    "jewelry",
    "mens-wear",
    "shoes",
    "watches",
    "women-wear",
]

# (slug, name, parent_slug, sort_order, show_in_top_menu)
CATEGORY_TREE: list[tuple[str, str, Optional[str], int, bool]] = [
    ("laptop", "Laptop", None, 10, True),
    ("desktop", "Desktop", None, 20, True),
    ("pc-component", "Component", None, 30, True),
    ("monitor", "Monitor", None, 40, True),
    ("pc-accessory", "Accessories", None, 50, True),
    ("tablet-pc", "Tablet", None, 60, True),
    ("network", "Networking", None, 70, True),
    ("security-system", "Security", None, 80, True),
    ("ups", "UPS", None, 90, True),
    ("it-gadget", "Gadget", None, 100, True),
    ("office", "Office Equipment", None, 110, True),
    ("all-laptop", "All Laptop", "laptop", 0, False),
    ("gaming-laptop", "Gaming Laptop", "laptop", 1, False),
    ("ultrabook", "Ultrabook", "laptop", 2, False),
    ("brand-pc", "Brand PC", "desktop", 0, False),
    ("gaming-pc", "Gaming PC", "desktop", 1, False),
    ("processor-cpu", "Processor", "pc-component", 0, False),
    ("motherboard", "Motherboard", "pc-component", 1, False),
    ("desktop-ram", "RAM", "pc-component", 2, False),
    ("graphics-card", "Graphics Card", "pc-component", 3, False),
    ("ssd-storage", "SSD", "pc-component", 4, False),
    ("gaming-monitor", "Gaming Monitor", "monitor", 0, False),
    ("keyboard", "Keyboard", "pc-accessory", 0, False),
    ("mouse", "Mouse", "pc-accessory", 1, False),
    ("headphone", "Headphone", "pc-accessory", 2, False),
    ("android-tablet", "Android Tablet", "tablet-pc", 0, False),
    ("router", "Router", "network", 0, False),
    ("cc-camera", "CC Camera", "security-system", 0, False),
    ("offline-ups", "Offline UPS", "ups", 0, False),
    ("smartwatch-gadget", "Smart Watch", "it-gadget", 0, False),
    ("office-printer", "Printer", "office", 0, False),
]

STOCKED_SLUGS = {
    "all-laptop",
    "gaming-laptop",
    "ultrabook",
    "brand-pc",
    "gaming-pc",
    "processor-cpu",
    "motherboard",
    "desktop-ram",
    "graphics-card",
    "ssd-storage",
    "gaming-monitor",
    "keyboard",
    "mouse",
    "headphone",
    "android-tablet",
    "router",
    "cc-camera",
    "offline-ups",
    "smartwatch-gadget",
    "office-printer",
}

# name, brand, price, compare_at (None = no discount), spec attributes
Product = tuple[str, str, int, Optional[int], dict[str, str]]

LAPTOP_KEYS = ("processor_brand", "ram", "storage", "display_size", "screen_size")

CATALOG: dict[str, list[Product]] = {
    "all-laptop": [
        (
            "Lenovo IdeaPad Slim 3 15IAU7 Core i5 12th Gen 15.6\" FHD Laptop",
            "Lenovo",
            72500,
            79000,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "512GB SSD", "display_size": "15.6 Inch"},
        ),
        (
            "HP 15s-fq5289TU Core i3 12th Gen 15.6\" FHD Laptop",
            "HP",
            58900,
            63500,
            {"processor_brand": "Intel", "ram": "8GB", "storage": "512GB SSD", "display_size": "15.6 Inch"},
        ),
        (
            "ASUS VivoBook 15 X1504VA Core i5 13th Gen Laptop",
            "ASUS",
            84900,
            None,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "512GB SSD", "display_size": "15.6 Inch"},
        ),
        (
            "Acer Aspire 3 A315-24P Ryzen 5 7520U Laptop",
            "Acer",
            54900,
            59900,
            {"processor_brand": "AMD", "ram": "8GB", "storage": "512GB SSD", "display_size": "15.6 Inch"},
        ),
        (
            "Dell Inspiron 15 3520 Core i7 12th Gen Laptop",
            "Dell",
            98500,
            105000,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "1TB SSD", "display_size": "15.6 Inch"},
        ),
        (
            "Lenovo V15 G4 Ryzen 3 7320U Business Laptop",
            "Lenovo",
            46900,
            None,
            {"processor_brand": "AMD", "ram": "8GB", "storage": "256GB SSD", "display_size": "15.6 Inch"},
        ),
    ],
    "gaming-laptop": [
        (
            "ASUS TUF Gaming A15 FA507NU Ryzen 7 RTX 4050 Laptop",
            "ASUS",
            152900,
            164900,
            {
                "processor_brand": "AMD",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 4050",
                "display_size": "15.6 Inch",
            },
        ),
        (
            "MSI Katana 15 B13V Core i7 RTX 4060 Gaming Laptop",
            "MSI",
            179900,
            189900,
            {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
                "display_size": "15.6 Inch",
            },
        ),
        (
            "Acer Nitro V 15 ANV15-51 Core i5 RTX 3050 Laptop",
            "Acer",
            118900,
            126500,
            {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 3050",
                "display_size": "15.6 Inch",
            },
        ),
        (
            "Lenovo LOQ 15IRH8 Core i7 RTX 4060 Gaming Laptop",
            "Lenovo",
            186500,
            None,
            {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
                "display_size": "15.6 Inch",
            },
        ),
        (
            "HP Victus 15 fa1124TX Core i5 RTX 3050 Laptop",
            "HP",
            124900,
            132900,
            {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 3050",
                "display_size": "15.6 Inch",
            },
        ),
        (
            "ASUS ROG Strix G16 Core i9 RTX 4070 Gaming Laptop",
            "ASUS",
            289000,
            305000,
            {
                "processor_brand": "Intel",
                "ram": "32GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
                "display_size": "15.6 Inch",
            },
        ),
    ],
    "ultrabook": [
        (
            "ASUS Zenbook 14 OLED UX3405MA Core Ultra 7 Laptop",
            "ASUS",
            168900,
            179000,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "1TB SSD", "display_size": "14 Inch"},
        ),
        (
            "Lenovo Yoga Slim 7 Ryzen 7 14\" 2.8K OLED Laptop",
            "Lenovo",
            145900,
            None,
            {"processor_brand": "AMD", "ram": "16GB", "storage": "512GB SSD", "display_size": "14 Inch"},
        ),
        (
            "HP Pavilion Aero 13 Ryzen 5 Ultra Light Laptop",
            "HP",
            112500,
            119900,
            {"processor_brand": "AMD", "ram": "16GB", "storage": "512GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Dell XPS 13 9315 Core i5 12th Gen Laptop",
            "Dell",
            158900,
            172000,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "512GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Acer Swift Go 14 Core i5 13th Gen OLED Laptop",
            "Acer",
            104900,
            None,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "512GB SSD", "display_size": "14 Inch"},
        ),
    ],
    "brand-pc": [
        (
            "HP ProDesk 400 G9 Core i5 12th Gen Desktop PC",
            "HP",
            84900,
            91500,
            {"processor_brand": "Intel", "ram": "8GB", "storage": "512GB SSD"},
        ),
        (
            "Dell OptiPlex 3000 Core i3 12th Gen Desktop PC",
            "Dell",
            62900,
            None,
            {"processor_brand": "Intel", "ram": "8GB", "storage": "256GB SSD"},
        ),
        (
            "Lenovo ThinkCentre neo 50t Core i7 Desktop PC",
            "Lenovo",
            118900,
            125000,
            {"processor_brand": "Intel", "ram": "16GB", "storage": "1TB SSD"},
        ),
        (
            "ASUS ExpertCenter D500 Ryzen 5 Desktop PC",
            "ASUS",
            72900,
            78500,
            {"processor_brand": "AMD", "ram": "16GB", "storage": "512GB SSD"},
        ),
        (
            "Office Pro Desktop PC Core i3 12th Gen",
            "Againcart",
            42900,
            46900,
            {"processor_brand": "Intel", "ram": "8GB", "storage": "256GB SSD"},
        ),
    ],
    "gaming-pc": [
        (
            "Raptor Gaming PC RTX 4060 Core i5-13400F",
            "Againcart",
            139900,
            149900,
            {
                "processor_brand": "Intel",
                "ram": "16GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
            },
        ),
        (
            "Striker Gaming PC RTX 3050 Ryzen 5 5600",
            "Againcart",
            98900,
            105900,
            {
                "processor_brand": "AMD",
                "ram": "16GB",
                "storage": "512GB SSD",
                "graphics_card": "RTX 3050",
            },
        ),
        (
            "Titan Gaming PC RTX 4070 Core i7-13700F",
            "Againcart",
            219000,
            234000,
            {
                "processor_brand": "Intel",
                "ram": "32GB",
                "storage": "1TB SSD",
                "graphics_card": "RTX 4060",
            },
        ),
        (
            "Starter Gaming PC GTX 1650 Core i3-12100F",
            "Againcart",
            64900,
            None,
            {
                "processor_brand": "Intel",
                "ram": "8GB",
                "storage": "512GB SSD",
                "graphics_card": "GTX 1650",
            },
        ),
        (
            "Creator Workstation PC RX 7600 Ryzen 7 5700X",
            "Againcart",
            156900,
            168000,
            {
                "processor_brand": "AMD",
                "ram": "32GB",
                "storage": "1TB SSD",
                "graphics_card": "RX 7600",
            },
        ),
    ],
    "processor-cpu": [
        ("Intel Core i5-13400F 13th Gen Processor", "Intel", 21900, 23900, {"processor_brand": "Intel"}),
        ("Intel Core i7-13700K 13th Gen Processor", "Intel", 46900, 49900, {"processor_brand": "Intel"}),
        ("Intel Core i3-12100F 12th Gen Processor", "Intel", 10900, None, {"processor_brand": "Intel"}),
        ("AMD Ryzen 5 5600 6 Core Processor", "AMD", 15900, 17500, {"processor_brand": "AMD"}),
        ("AMD Ryzen 7 5700X 8 Core Processor", "AMD", 24900, 26900, {"processor_brand": "AMD"}),
        ("AMD Ryzen 5 7600 AM5 Processor", "AMD", 28900, None, {"processor_brand": "AMD"}),
    ],
    "motherboard": [
        ("ASUS PRIME B760M-K D4 Intel Motherboard", "ASUS", 14900, 16500, {"processor_brand": "Intel"}),
        ("MSI PRO B650M-A WiFi AMD Motherboard", "MSI", 21900, 23900, {"processor_brand": "AMD"}),
        ("Gigabyte H610M H DDR4 Intel Motherboard", "Gigabyte", 9900, None, {"processor_brand": "Intel"}),
        ("ASUS TUF Gaming B550M-Plus AMD Motherboard", "ASUS", 17900, 19500, {"processor_brand": "AMD"}),
        ("MSI MAG Z790 Tomahawk WiFi Motherboard", "MSI", 42900, None, {"processor_brand": "Intel"}),
    ],
    "desktop-ram": [
        ("Corsair Vengeance 16GB DDR5 5600MHz Desktop RAM", "Corsair", 7200, 8200, {"ram": "16GB"}),
        ("Corsair Vengeance LPX 16GB DDR4 3200MHz RAM", "Corsair", 4900, 5600, {"ram": "16GB"}),
        ("Kingston FURY Beast 8GB DDR4 3200MHz RAM", "Kingston", 2600, None, {"ram": "8GB"}),
        ("G.Skill Trident Z5 32GB (2x16) DDR5 RAM", "G.Skill", 14900, 16500, {"ram": "32GB"}),
        ("Adata XPG Gammix D30 8GB DDR4 3200MHz RAM", "Adata", 2400, 2900, {"ram": "8GB"}),
    ],
    "graphics-card": [
        ("ASUS Dual GeForce RTX 4060 8GB OC Graphics Card", "ASUS", 44900, 47900, {"graphics_card": "RTX 4060"}),
        ("MSI GeForce RTX 4070 Ventus 2X 12GB Graphics Card", "MSI", 82900, 88500, {"graphics_card": "RTX 4060"}),
        ("Gigabyte GeForce RTX 3050 Eagle 6GB Graphics Card", "Gigabyte", 26900, None, {"graphics_card": "RTX 3050"}),
        ("ASUS TUF Gaming GeForce RTX 4050 6GB Graphics Card", "ASUS", 33900, 36500, {"graphics_card": "RTX 4050"}),
        ("Sapphire Pulse Radeon RX 7600 8GB Graphics Card", "Sapphire", 38900, 41900, {"graphics_card": "RX 7600"}),
        ("MSI GeForce GTX 1650 Ventus XS 4GB Graphics Card", "MSI", 19900, None, {"graphics_card": "GTX 1650"}),
    ],
    "ssd-storage": [
        ("Samsung 990 EVO 1TB NVMe M.2 SSD", "Samsung", 11900, 13500, {"storage": "1TB SSD"}),
        ("Samsung 980 500GB NVMe M.2 SSD", "Samsung", 6200, 6900, {"storage": "512GB SSD"}),
        ("WD Black SN770 1TB NVMe Gaming SSD", "Western Digital", 12500, None, {"storage": "1TB SSD"}),
        ("Crucial BX500 480GB SATA SSD", "Crucial", 4200, 4800, {"storage": "512GB SSD"}),
        ("Kingston NV2 250GB NVMe SSD", "Kingston", 2900, None, {"storage": "256GB SSD"}),
        ("Adata Legend 800 2TB NVMe Gen4 SSD", "Adata", 21900, 23900, {"storage": "2TB SSD"}),
    ],
    "gaming-monitor": [
        (
            "Samsung Odyssey G5 27\" 165Hz QHD Curved Gaming Monitor",
            "Samsung",
            38900,
            42900,
            {"display_size": "27 Inch", "screen_size": "27 Inch"},
        ),
        (
            "LG UltraGear 24GN60R 24\" 144Hz IPS Gaming Monitor",
            "LG",
            24900,
            27500,
            {"display_size": "24 Inch", "screen_size": "24 Inch"},
        ),
        (
            "ASUS TUF Gaming VG249Q1A 24\" 165Hz Monitor",
            "ASUS",
            22900,
            None,
            {"display_size": "24 Inch", "screen_size": "24 Inch"},
        ),
        (
            "MSI G274F 27\" 180Hz Rapid IPS Gaming Monitor",
            "MSI",
            29900,
            32900,
            {"display_size": "27 Inch", "screen_size": "27 Inch"},
        ),
        (
            "Gigabyte G32QC A 32\" 165Hz Curved QHD Monitor",
            "Gigabyte",
            48900,
            52900,
            {"display_size": "32 Inch", "screen_size": "32 Inch"},
        ),
        (
            "Walton WD215G01 21.45\" 100Hz Gaming Monitor",
            "Walton",
            11900,
            None,
            {"display_size": "21.45 Inch", "screen_size": "21.45 Inch"},
        ),
    ],
    "keyboard": [
        ("Logitech K380 Multi-Device Bluetooth Keyboard", "Logitech", 3900, 4500, {}),
        ("Keychron K2 V2 Hot-Swappable Mechanical Keyboard", "Keychron", 11900, 12900, {}),
        ("Razer Huntsman Mini 60% Optical Gaming Keyboard", "Razer", 13900, 15900, {}),
        ("Logitech MX Keys S Wireless Illuminated Keyboard", "Logitech", 14500, None, {}),
        ("A4Tech KRS-85 USB Standard Keyboard", "A4Tech", 950, 1200, {}),
        ("Redragon K552 Kumara RGB Mechanical Keyboard", "Redragon", 4900, 5600, {}),
    ],
    "mouse": [
        ("Logitech MX Master 3S Wireless Performance Mouse", "Logitech", 12900, 14500, {}),
        ("Logitech G102 Lightsync RGB Gaming Mouse", "Logitech", 2450, 2900, {}),
        ("Razer DeathAdder V3 Ergonomic Gaming Mouse", "Razer", 8900, None, {}),
        ("A4Tech FG12 Wireless Optical Mouse", "A4Tech", 1150, 1400, {}),
        ("Logitech M331 Silent Plus Wireless Mouse", "Logitech", 2200, None, {}),
        ("Redragon M711 Cobra RGB Gaming Mouse", "Redragon", 2900, 3400, {}),
    ],
    "headphone": [
        ("Logitech G335 Wired Gaming Headset", "Logitech", 7900, 8900, {}),
        ("Razer BlackShark V2 X Gaming Headset", "Razer", 6900, None, {}),
        ("Sony WH-CH720N Wireless Noise Cancelling Headphone", "Sony", 16900, 18900, {}),
        ("JBL Tune 520BT Wireless On-Ear Headphone", "JBL", 5900, 6500, {}),
        ("Havit H2002d Wired Gaming Headphone", "Havit", 2450, None, {}),
    ],
    "android-tablet": [
        (
            "Samsung Galaxy Tab A9+ 8/128GB Wi-Fi Tablet",
            "Samsung",
            29900,
            32900,
            {"ram": "8GB", "storage": "256GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Xiaomi Redmi Pad SE 8/256GB Tablet",
            "Xiaomi",
            25900,
            None,
            {"ram": "8GB", "storage": "256GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Lenovo Tab M11 4/128GB Wi-Fi Tablet",
            "Lenovo",
            21900,
            23900,
            {"ram": "4GB", "storage": "256GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Samsung Galaxy Tab S6 Lite 2024 Edition",
            "Samsung",
            42900,
            46500,
            {"ram": "8GB", "storage": "256GB SSD", "display_size": "14 Inch"},
        ),
        (
            "Walton Walpad G8i 4/64GB Tablet",
            "Walton",
            14900,
            None,
            {"ram": "4GB", "storage": "256GB SSD", "display_size": "14 Inch"},
        ),
    ],
    "router": [
        ("TP-Link Archer AX23 AX1800 Dual Band Wi-Fi 6 Router", "TP-Link", 5200, 5900, {}),
        ("TP-Link Archer C6 AC1200 Gigabit Router", "TP-Link", 3200, 3700, {}),
        ("Xiaomi Router AX3000T Wi-Fi 6 Router", "Xiaomi", 4600, None, {}),
        ("Tenda AC10 AC1200 Dual Band Router", "Tenda", 2650, 2990, {}),
        ("ASUS RT-AX53U AX1800 Wi-Fi 6 Router", "ASUS", 9900, 10900, {}),
    ],
    "cc-camera": [
        ("Hikvision DS-2CE16D0T 2MP Bullet CC Camera", "Hikvision", 2350, 2700, {}),
        ("Dahua HAC-HFW1200TH 2MP HDCVI Camera", "Dahua", 2150, None, {}),
        ("Hikvision DS-2CD1043G2 4MP IP Network Camera", "Hikvision", 6900, 7600, {}),
        ("TP-Link Tapo C210 Pan/Tilt Wi-Fi Camera", "TP-Link", 3900, 4400, {}),
        ("Xiaomi Smart Camera C400 360° Wi-Fi Camera", "Xiaomi", 4900, None, {}),
    ],
    "offline-ups": [
        ("Ensysco Digital 650VA Offline UPS", "Ensysco", 4900, 5500, {}),
        ("Power Guard 1200VA Offline UPS", "Power Guard", 7900, None, {}),
        ("Mercury Elite 650VA UPS with AVR", "Mercury", 4500, 4990, {}),
        ("APC BX600C-IN 600VA Backup UPS", "APC", 8900, 9600, {}),
    ],
    "smartwatch-gadget": [
        ("Amazfit GTS 4 Mini AMOLED Smart Watch", "Amazfit", 12900, 14500, {}),
        ("Xiaomi Redmi Watch 4 Smart Watch", "Xiaomi", 9900, None, {}),
        ("Haylou Solar Plus RT3 Smart Watch", "Haylou", 4900, 5600, {}),
        ("Samsung Galaxy Watch6 40mm Bluetooth", "Samsung", 32900, 35900, {}),
        ("Amazfit Bip 5 Smart Watch", "Amazfit", 8900, None, {}),
    ],
    "office-printer": [
        ("HP LaserJet M141w Multifunction Laser Printer", "HP", 24900, 27500, {}),
        ("Canon PIXMA G3020 Ink Tank Wireless Printer", "Canon", 21900, 23900, {}),
        ("Epson EcoTank L3250 All-in-One Ink Tank Printer", "Epson", 23500, None, {}),
        ("Brother DCP-B7535DW Mono Laser Printer", "Brother", 34900, 37900, {}),
        ("HP DeskJet 2820 All-in-One Colour Printer", "HP", 8900, 9900, {}),
    ],
}

CATEGORY_ICONS = {
    "laptop": "/images/categories/it/laptop.svg",
    "desktop": "/images/categories/it/desktop.svg",
    "pc-component": "/images/categories/it/component.svg",
    "monitor": "/images/categories/it/monitor.svg",
    "pc-accessory": "/images/categories/it/accessories.svg",
    "tablet-pc": "/images/categories/it/tablet.svg",
    "network": "/images/categories/it/network.svg",
    "security-system": "/images/categories/it/security.svg",
    "ups": "/images/categories/it/ups.svg",
    "it-gadget": "/images/categories/it/gadget.svg",
    "office": "/images/categories/it/office.svg",
}

WARRANTY_BY_SLUG = {
    "all-laptop": "2 Years Official Warranty",
    "gaming-laptop": "2 Years Official Warranty",
    "ultrabook": "2 Years Official Warranty",
    "brand-pc": "3 Years Warranty",
    "gaming-pc": "3 Years Assembly Warranty",
    "processor-cpu": "3 Years Warranty",
    "motherboard": "3 Years Warranty",
    "desktop-ram": "Lifetime Warranty",
    "graphics-card": "3 Years Warranty",
    "ssd-storage": "5 Years Warranty",
    "gaming-monitor": "3 Years Warranty",
    "office-printer": "1 Year Warranty",
}
DEFAULT_WARRANTY = "1 Year Warranty"


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _product_slug(name: str) -> str:
    """Short, readable slug — the storefront serves these from the domain root."""
    words = _slugify(name).split("-")
    return "-".join(words[:8])


def _descendant_ids(db: Session, root_slugs: Iterable[str]) -> set[str]:
    roots = (
        db.query(CatalogCategory)
        .filter(CatalogCategory.slug.in_(list(root_slugs)))
        .all()
    )
    ids = {r.id for r in roots}
    frontier = list(ids)
    while frontier:
        children = (
            db.query(CatalogCategory)
            .filter(CatalogCategory.parent_id.in_(frontier))
            .all()
        )
        frontier = [c.id for c in children if c.id not in ids]
        ids.update(frontier)
    return ids


def _protected_product_ids(db: Session) -> set[str]:
    """Products that appear in an order — retire these instead of deleting."""
    rows = db.execute(
        text(
            """
            select distinct p.id
            from catalog_products p
            join ecommerce_items e on e.catalog_product_id = p.id
            join commerce_order_items oi on oi.item_id = e.id
            """
        )
    ).all()
    return {r[0] for r in rows}


def _delete_products(db: Session, product_ids: set[str]) -> tuple[int, int]:
    """Remove products and their dependants; retire the ones orders still need."""
    if not product_ids:
        return 0, 0

    protected = _protected_product_ids(db) & product_ids
    removable = product_ids - protected

    for product in db.query(CatalogProduct).filter(CatalogProduct.id.in_(protected)).all():
        product.status = "archived"
        product.visibility = "private"
    for ec in (
        db.query(EcommerceItem)
        .filter(EcommerceItem.catalog_product_id.in_(protected))
        .all()
    ):
        ec.publish_status = "draft"
        ec.visibility = "private"
        ec.is_active = False

    if removable:
        ids = list(removable)
        item_ids = [
            r[0]
            for r in db.execute(
                text("select id from ecommerce_items where catalog_product_id = any(:ids)"),
                {"ids": ids},
            ).all()
        ]
        for table in ("storefront_cart_items", "website_wishlist_items"):
            db.execute(
                text(f"delete from {table} where product_id = any(:ids)"), {"ids": ids}
            )
        if item_ids:
            db.execute(
                text("delete from ecommerce_item_categories where item_id = any(:ids)"),
                {"ids": item_ids},
            )
            db.execute(
                text("delete from ecommerce_items where id = any(:ids)"), {"ids": item_ids}
            )

        for table in (
            "catalog_product_attribute_values",
            "catalog_product_digital_files",
            "catalog_product_media",
            "catalog_product_variants",
            "catalog_product_reviews",
            "catalog_product_qa",
            "blog_post_products",
            "inventory_stock_levels",
        ):
            db.execute(
                text(f"delete from {table} where product_id = any(:ids)"), {"ids": ids}
            )
        db.execute(text("delete from catalog_products where id = any(:ids)"), {"ids": ids})

    return len(removable), len(protected)


def purge_non_it(db: Session) -> tuple[int, int, int]:
    """Drop the fashion / beauty / lifestyle tree left over from older seeds."""
    category_ids = _descendant_ids(db, NON_IT_ROOTS)
    if not category_ids:
        return 0, 0, 0

    ids = list(category_ids)
    product_ids = {
        r[0]
        for r in db.execute(
            text("select id from catalog_products where category_id = any(:ids)"),
            {"ids": ids},
        ).all()
    }
    product_ids |= {
        r[0]
        for r in db.execute(
            text(
                """
                select distinct p.id
                from catalog_products p
                join ecommerce_items e on e.catalog_product_id = p.id
                where e.primary_category_id = any(:ids)
                """
            ),
            {"ids": ids},
        ).all()
    }

    deleted, retired = _delete_products(db, product_ids)
    db.execute(
        text("delete from ecommerce_item_categories where category_id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(
        text("update ecommerce_items set primary_category_id = null where primary_category_id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(
        text("update catalog_products set category_id = null where category_id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(text("delete from catalog_categories where id = any(:ids)"), {"ids": ids})
    return len(ids), deleted, retired


def drop_filler_products(db: Session) -> tuple[int, int]:
    """Remove products from earlier seeds.

    Covers both the "Againcart <Category> Model N" fillers and the thinner
    `it-*` blueprints, whose titles this script now re-issues with full model
    numbers — keeping them would show the same product twice.
    """
    ids = {
        r[0]
        for r in db.execute(
            text(
                """
                select id from catalog_products
                where slug like 'it-%'
                   or slug like 'demo-%'
                   or slug like 'againcart-%'
                   or name ~ '^Againcart .* Model [0-9]+$'
                """
            )
        ).all()
    }
    return _delete_products(db, ids)


def drop_outside_demo(db: Session) -> tuple[int, int]:
    """Delete every product that no longer sits in a visible category.

    Older dropshipping demos linger in the deactivated tree. Hiding them was
    not enough — they still cluttered the admin product list — so they go.
    """
    keep = {slug for slug, *_ in CATEGORY_TREE}
    visible_ids = {
        r.id
        for r in db.query(CatalogCategory).filter(CatalogCategory.slug.in_(list(keep))).all()
    }
    ids = {
        p.id
        for p in db.query(CatalogProduct).all()
        if p.category_id not in visible_ids
    }
    for ec in db.query(EcommerceItem).all():
        if ec.catalog_product_id and ec.primary_category_id not in visible_ids:
            ids.add(ec.catalog_product_id)
    return _delete_products(db, ids)


def _apply_path_depth(row: CatalogCategory, parent: Optional[CatalogCategory]) -> None:
    if parent:
        row.parent_id = parent.id
        row.depth = parent.depth + 1
        row.path = f"{parent.path}{row.id}/"
    else:
        row.parent_id = None
        row.depth = 0
        row.path = f"/{row.id}/"


def ensure_categories(db: Session) -> tuple[int, int]:
    by_slug = {c.slug: c for c in db.query(CatalogCategory).all()}
    created = updated = 0

    # Two passes so a child can find a parent created in the same run.
    for _ in range(2):
        for slug, name, parent_slug, sort_order, show_top in CATEGORY_TREE:
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
                    icon_url=CATEGORY_ICONS.get(slug),
                    description=(
                        f"<p>Buy {name} from Againcart — genuine products, official warranty "
                        f"and nationwide delivery across Bangladesh.</p>"
                    ),
                    meta_title=f"{name} Price in Bangladesh | Againcart",
                    meta_description=f"Buy {name} online at the best price from Againcart.",
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
                if CATEGORY_ICONS.get(slug):
                    row.icon_url = CATEGORY_ICONS[slug]
                if not row.description:
                    row.description = (
                        f"<p>Buy {name} from Againcart — genuine products, official warranty "
                        f"and nationwide delivery across Bangladesh.</p>"
                    )
                # Always recompute: reparenting in earlier seeds left stale
                # materialised paths, which break branch lookups.
                _apply_path_depth(row, parent)
                updated += 1
    return created, updated


def purge_unused_categories(db: Session) -> int:
    """Delete every category outside the demo tree.

    What is left over is the older duplicate tree plus brand-name leaves the
    Brand filter already covers — hiding them still left them in the admin
    category list.
    """
    keep = {slug for slug, *_ in CATEGORY_TREE}
    ids = [r.id for r in db.query(CatalogCategory).all() if r.slug not in keep]
    if not ids:
        return 0

    # Parent links inside the doomed set would fail the FK check row by row.
    db.execute(
        text("update catalog_categories set parent_id = null where id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(
        text("delete from ecommerce_item_categories where category_id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(
        text(
            "update ecommerce_items set primary_category_id = null"
            " where primary_category_id = any(:ids)"
        ),
        {"ids": ids},
    )
    db.execute(
        text("update catalog_products set category_id = null where category_id = any(:ids)"),
        {"ids": ids},
    )
    db.execute(text("delete from catalog_categories where id = any(:ids)"), {"ids": ids})
    return len(ids)


def pin_homepage_categories(db: Session) -> int:
    """Point the homepage category strip at the demo sections.

    Auto-pinning walks the dropshipping channel, so it cannot find this tree —
    the pins are written here instead.
    """
    from app.models.website_homepage import WebsiteHomepage
    from app.services.website_homepage_service import DEFAULT_WEBSITE_HOMEPAGE_ID

    row = db.get(WebsiteHomepage, DEFAULT_WEBSITE_HOMEPAGE_ID)
    if row is None:
        return 0

    roots = [slug for slug, _name, parent, *_ in CATEGORY_TREE if parent is None]
    by_slug = {
        c.slug: c
        for c in db.query(CatalogCategory).filter(CatalogCategory.slug.in_(roots)).all()
    }
    items = [
        {
            "id": f"c{i + 1}",
            "category_id": by_slug[slug].id,
            "image_url": "",
            "href": "",
            "hidden": False,
        }
        for i, slug in enumerate(roots)
        if slug in by_slug
    ]
    if not items:
        return 0

    content = json.loads(row.content_json or "{}")
    section = content.get("categories") if isinstance(content.get("categories"), dict) else {}
    content["categories"] = {"hidden": bool(section.get("hidden", False)), "items": items}
    row.content_json = json.dumps(content)
    return len(items)


def _brand(db: Session, name: str, cache: dict[str, CatalogBrand]) -> CatalogBrand:
    key = name.lower()
    if key in cache:
        return cache[key]
    slug = _slugify(name)
    row = (
        db.query(CatalogBrand)
        .filter((CatalogBrand.slug == slug) | (CatalogBrand.name.ilike(name)))
        .first()
    )
    if row is None:
        row = CatalogBrand(
            id=str(uuid.uuid4()),
            name=name,
            slug=slug,
            is_active=True,
        )
        db.add(row)
        db.flush()
    cache[key] = row
    return row


def _attr_map(db: Session) -> dict[str, CatalogAttribute]:
    out: dict[str, CatalogAttribute] = {}
    for row in (
        db.query(CatalogAttribute)
        .filter(CatalogAttribute.is_active.is_(True))
        .order_by(CatalogAttribute.is_filterable.desc())
        .all()
    ):
        if row.code not in out or row.is_filterable:
            out[row.code] = row
    return out


def _set_attrs(
    db: Session,
    product_id: str,
    attrs: dict[str, str],
    attr_by_code: dict[str, CatalogAttribute],
) -> None:
    # Display size and screen size are separate filters but always agree.
    values = dict(attrs)
    if "display_size" in values:
        values.setdefault("screen_size", values["display_size"])

    for i, (code, value) in enumerate(values.items()):
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
                    sort_order=i,
                )
            )
        else:
            row.value = value


SPEC_LABELS = {
    "processor_brand": "Processor Brand",
    "ram": "RAM",
    "storage": "Storage",
    "display_size": "Display Size",
    "graphics_card": "Graphics",
}


def _specs_json(cat_name: str, brand: str, warranty: str, attrs: dict[str, str]) -> str:
    specs = [
        {"group": "General", "field": "Brand", "value": brand},
        {"group": "General", "field": "Category", "value": cat_name},
        {"group": "General", "field": "Warranty", "value": warranty},
    ]
    for code, label in SPEC_LABELS.items():
        if attrs.get(code):
            specs.append({"group": "Key Specification", "field": label, "value": attrs[code]})
    specs.append({"group": "General", "field": "Availability", "value": "In Stock"})
    return json.dumps(specs)


def _description(name: str, cat_name: str, brand: str, warranty: str, attrs: dict[str, str]) -> str:
    bullets = "".join(
        f"<li><strong>{SPEC_LABELS[code]}:</strong> {attrs[code]}</li>"
        for code in SPEC_LABELS
        if attrs.get(code)
    )
    spec_block = f"<h3>Key Specification</h3><ul>{bullets}</ul>" if bullets else ""
    return (
        f"<h2>{name}</h2>"
        f"<p>{name} is available at Againcart with {warranty.lower()}. "
        f"Genuine {brand} product from the official channel, ready to ship across Bangladesh.</p>"
        f"{spec_block}"
        f"<p>Order online or visit our showroom to buy {cat_name.lower()} at the best price in Bangladesh.</p>"
    )


def seed_products(db: Session) -> tuple[int, int]:
    brands: dict[str, CatalogBrand] = {}
    attr_by_code = _attr_map(db)
    svc = EcommerceItemService(db)
    created = updated = 0

    for cat_slug, items in CATALOG.items():
        cat = db.query(CatalogCategory).filter(CatalogCategory.slug == cat_slug).first()
        if cat is None:
            continue
        warranty = WARRANTY_BY_SLUG.get(cat_slug, DEFAULT_WARRANTY)

        for index, (name, brand_name, price, compare, attrs) in enumerate(items):
            slug = _product_slug(name)
            brand = _brand(db, brand_name, brands)
            product = db.query(CatalogProduct).filter(CatalogProduct.slug == slug).first()
            is_new = product is None

            if is_new:
                product = CatalogProduct(id=str(uuid.uuid4()), slug=slug)
                product.sku = f"AGC-{_slugify(brand_name)[:4].upper()}-{product.id[:6].upper()}"
                db.add(product)
                created += 1
            else:
                updated += 1

            product.name = name
            product.model = name.split(" ", 3)[-1][:200]
            product.price = Decimal(price)
            product.compare_at_price = Decimal(compare) if compare else None
            product.stock = 25 + index * 3
            product.track_quantity = True
            product.stock_status = "in_stock"
            product.status = "active"
            product.visibility = "public"
            product.brand = brand.name
            product.brand_id = brand.id
            product.category = cat.name
            product.category_id = cat.id
            product.warranty = warranty
            product.thumbnail = product.thumbnail or PLACEHOLDER_IMAGE
            product.short_description = f"{name} — {warranty}, in stock at Againcart."
            product.description = _description(name, cat.name, brand.name, warranty, attrs)
            product.seo_title = f"{name} Price in Bangladesh | Againcart"
            product.seo_description = (
                f"Buy {name} at the best price in Bangladesh from Againcart. {warranty}."
            )
            product.custom_specs_json = _specs_json(cat.name, brand.name, warranty, attrs)
            db.flush()

            ensure_item_for_catalog_product(db, product)
            ec = svc.ensure_draft_for_catalog_product(product)
            ec.thumbnail_url = product.thumbnail
            ec.primary_category_id = cat.id
            ec.brand_id = brand.id
            ec.selling_price = product.price
            ec.compare_at_price = product.compare_at_price
            ec.short_description = product.short_description
            ec.full_description = product.description
            ec.publish_status = "published"
            ec.visibility = "public"
            ec.is_active = True

            _set_attrs(db, product.id, attrs, attr_by_code)

    return created, updated


def _money(value: Decimal) -> str:
    return f"{int(value):,}৳"


def refresh_site_cms(db: Session) -> str:
    """Rewrite the live-edit snapshot so the homepage matches the new catalog.

    Menu, category strip and Featured Products are stored as materialised
    content, so they keep showing removed products (and Star Tech era menu
    links) until they are rewritten from the catalog.
    """
    from app.models.workspace_site import WorkspaceSite

    tree_order = [slug for slug, *_ in CATEGORY_TREE]
    cats = {
        c.slug: c
        for c in db.query(CatalogCategory).filter(CatalogCategory.slug.in_(tree_order)).all()
    }
    children: dict[str, list[str]] = {}
    for slug, _name, parent, *_ in CATEGORY_TREE:
        if parent:
            children.setdefault(parent, []).append(slug)

    menu_items = []
    for i, slug in enumerate([s for s, _n, p, *_ in CATEGORY_TREE if p is None]):
        cat = cats.get(slug)
        if not cat:
            continue
        menu_items.append(
            {
                "id": f"m{i + 1}-{slug}",
                "name": cat.name,
                "href": f"/{slug}",
                "enabled": True,
                "children": [
                    {
                        "id": f"m{i + 1}-{j + 1}-{child}",
                        "name": cats[child].name,
                        "href": f"/{child}",
                        "enabled": True,
                    }
                    for j, child in enumerate(children.get(slug, []))
                    if child in cats
                ],
            }
        )

    strip_items = [
        {
            "id": f"cat-{i + 1}",
            "categoryId": cats[slug].id,
            "name": cats[slug].name,
            "image": CATEGORY_ICONS.get(slug, ""),
            "href": f"/{slug}",
            "hidden": False,
        }
        for i, slug in enumerate([s for s, _n, p, *_ in CATEGORY_TREE if p is None])
        if slug in cats
    ]

    demo_slugs = {_product_slug(name) for items in CATALOG.values() for name, *_ in items}
    picks = (
        db.query(CatalogProduct)
        .filter(
            CatalogProduct.slug.in_(list(demo_slugs)),
            CatalogProduct.compare_at_price.isnot(None),
        )
        .order_by(CatalogProduct.price.desc())
        .limit(12)
        .all()
    )
    product_items = []
    for product in picks:
        old = product.compare_at_price or product.price
        save = old - product.price
        discount = int(round(save / old * 100)) if old else 0
        product_items.append(
            {
                "id": f"p-{product.id}",
                "productId": product.id,
                "name": product.name,
                "image": product.thumbnail or PLACEHOLDER_IMAGE,
                "href": f"/{product.slug}",
                "priceNew": _money(product.price),
                "priceOld": _money(old),
                "discount": f"-{discount}%",
                "saveAmount": _money(save),
                "hidden": False,
            }
        )

    touched = []
    for site in db.query(WorkspaceSite).all():
        content = json.loads(site.storefront_cms_json or "{}")
        if not isinstance(content, dict):
            content = {}
        menu = content.get("menu") if isinstance(content.get("menu"), dict) else {}
        content["menu"] = {**menu, "source": "auto", "items": menu_items}

        strip = content.get("categories") if isinstance(content.get("categories"), dict) else {}
        content["categories"] = {
            "title": strip.get("title") or "Featured Category",
            "subtitle": strip.get("subtitle") or "Shop by category",
            "items": strip_items,
        }

        products = content.get("products") if isinstance(content.get("products"), dict) else {}
        content["products"] = {
            **products,
            "title": products.get("title") or "Featured Products",
            "subtitle": products.get("subtitle") or "Check & Get Your Desired Product!",
            "items": product_items,
        }
        site.storefront_cms_json = json.dumps(content)
        touched.append(site.code or site.id)

    return ", ".join(touched)


def main() -> None:
    db = SessionLocal()
    try:
        cats_removed, prods_removed, prods_retired = purge_non_it(db)
        fillers_removed, fillers_retired = drop_filler_products(db)
        cat_created, cat_updated = ensure_categories(db)
        removed_cats = purge_unused_categories(db)
        outside, outside_kept = drop_outside_demo(db)
        created, updated = seed_products(db)
        pins = pin_homepage_categories(db)
        sites = refresh_site_cms(db)
        db.commit()

        print(f"Non-IT categories deleted: {cats_removed}")
        print(f"Non-IT products deleted: {prods_removed} (retired: {prods_retired})")
        print(f"Filler products deleted: {fillers_removed} (retired: {fillers_retired})")
        print(f"Categories created: {cat_created}, updated: {cat_updated}")
        print(f"Categories deleted (outside demo tree): {removed_cats}")
        print(f"Products deleted (outside demo tree): {outside} (kept for orders: {outside_kept})")
        print(f"Demo products created: {created}, updated: {updated}")
        print(f"Homepage category pins: {pins}")
        print(f"Storefront CMS refreshed for sites: {sites}")

        print("\nStocked sections:")
        for slug in sorted(STOCKED_SLUGS):
            cat = db.query(CatalogCategory).filter(CatalogCategory.slug == slug).first()
            if not cat:
                continue
            live = (
                db.query(EcommerceItem)
                .filter(
                    EcommerceItem.primary_category_id == cat.id,
                    EcommerceItem.publish_status == "published",
                )
                .count()
            )
            print(f"  {slug:20} live={live}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
