"""Create the storefront's ready-made bundles in AgainERP (Website → Bundles) from real catalogue products.

The website used to carry these 9 bundles as built-in demo data; the storefront now shows the published bundles
from GET /api/v1/storefront/bundles instead. This creates them once (same names, types, taglines and discounts),
each with the closest real product, so an admin can review, change and publish them:

    python -m scripts.seed_storefront_bundles                      # dry run
    python -m scripts.seed_storefront_bundles --apply              # create as drafts
    python -m scripts.seed_storefront_bundles --apply --publish    # create (or publish existing) as published

A bundle whose slug already exists is left as it is (only --publish changes its status). A product that isn't in
the catalogue is reported and that bundle skipped.
"""

from __future__ import annotations

import argparse
from typing import List, Tuple

from app.database import SessionLocal
from app.models.catalog_bundle import CatalogBundle
from app.models.catalog_product import CatalogProduct
from app.routers.catalog_bundles import _apply_totals, _normalize_components

# slug, name, type (category), discount %, tagline, catalogue product ids
BUNDLES: List[Tuple[str, str, str, int, str, List[str]]] = [
    ("amd-ryzen-5-gaming-combo", "AMD Ryzen 5 Gaming Combo", "Gaming", 12,
     "The sweet spot for 1080p/1440p gaming on the AM5 platform — ready for future Ryzen upgrades.",
     ["oc-prod-10494", "oc-prod-7456", "oc-prod-10590"]),
    ("intel-core-i5-office-combo", "Intel Core i5 Office Combo", "Office", 10,
     "A fast, reliable core for office and study PCs with plenty of NVMe storage.",
     ["oc-prod-9443", "oc-prod-6663", "oc-prod-10701"]),
    ("gamers-peripheral-combo", "Gamer's Peripheral Combo", "Peripherals", 12,
     "180Hz monitor, a compact optical keyboard and a headset tuned for positional audio.",
     ["oc-prod-9297", "oc-prod-6707", "oc-prod-9271"]),
    ("ryzen-7-x3d-power-combo", "Ryzen 7 X3D Power Combo", "Gaming", 9,
     "The fastest gaming CPU pairing: 7800X3D with X870 and low-latency DDR5.",
     ["oc-prod-6725", "oc-prod-11201", "oc-prod-3278"]),
    ("budget-apu-starter-combo", "Budget APU Starter Combo", "Office", 8,
     "Play light games without a graphics card — perfect for a first PC.",
     ["oc-prod-1730", "oc-prod-7870", "oc-prod-1030"]),
    ("streamer-pro-kit", "Streamer Pro Kit", "Peripherals", 11,
     "Pro-grade wireless mouse, a tactile keyboard and a wireless gaming headset.",
     ["oc-prod-11610", "oc-prod-1890", "oc-prod-14705"]),
    ("rtx-5070-power-duo", "RTX 5070 + Gold PSU Duo", "Upgrade", 7,
     "Drop-in graphics upgrade with a quality 750W Gold power supply to match.",
     ["oc-prod-12478", "oc-prod-6070"]),
    ("storage-upgrade-duo", "Storage Upgrade Duo", "Upgrade", 9,
     "3TB of Gen4 NVMe: a big game drive plus a blazing boot drive.",
     ["oc-prod-11911", "oc-prod-9974"]),
    ("home-office-power-duo", "Home Office Power Duo", "Office", 8,
     "A comfortable 24\" monitor with a UPS to ride through load-shedding.",
     ["oc-prod-12172", "oc-prod-13705"]),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    ap.add_argument("--publish", action="store_true", help="publish the bundles (default: drafts)")
    args = ap.parse_args()
    status = "published" if args.publish else "draft"

    db = SessionLocal()
    for slug, name, kind, pct, tagline, ids in BUNDLES:
        existing = db.query(CatalogBundle).filter(CatalogBundle.slug == slug).first()
        if existing:
            if args.publish and existing.status != "published":
                existing.status = "published"
                print(f"{slug}: exists → published")
            else:
                print(f"{slug}: exists ({existing.status}) — left as it is")
            continue
        products = [db.get(CatalogProduct, pid) for pid in ids]
        missing = [pid for pid, p in zip(ids, products) if p is None]
        if missing:
            print(f"{slug}: SKIPPED — not in the catalogue: {', '.join(missing)}")
            continue
        components = _normalize_components([
            {
                "id": p.id,
                "product_id": p.id,
                "product_name": p.name,
                "sku": p.sku or "",
                "quantity": 1,
                "unit_price": p.price or 0,
                "is_optional": False,
                "thumbnail": getattr(p, "image_url", None) or getattr(p, "thumbnail", None),
            }
            for p in products
        ])
        row = CatalogBundle(
            name=name, slug=slug, sku=f"BND-{slug[:20].upper()}", status=status, pricing_mode="sum_discount",
            bundle_price=0, discount_percent=pct, category=kind, description=tagline, components_json=components,
        )
        _apply_totals(row)
        db.add(row)
        stock = ", ".join(f"{p.name[:28]} ({p.stock_status})" for p in products)
        print(f"{slug}: create ({status}) {pct}% off ৳{row.retail_total} → ৳{row.bundle_price} | {stock}")

    if args.apply:
        db.commit()
        print("applied")
    else:
        db.rollback()
        print("dry run — run with --apply to write")


if __name__ == "__main__":
    main()
