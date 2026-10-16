"""Create ready-made PC builds (Website → PC Builder → Ready Builds) from real catalogue products.

The website's "Prebuilt & Custom Gaming PC" cards show the published Ready Builds. This creates six, each with
compatible parts that were in stock when it was written (socket, RAM type, PSU headroom and case size checked),
one product per required slot. No discount is set — that is the shop's call, in the admin.

    python -m scripts.seed_ready_builds                    # dry run: checks every product and the build rules
    python -m scripts.seed_ready_builds --apply            # create as drafts
    python -m scripts.seed_ready_builds --apply --publish  # create and publish (only builds that pass the checks)

A build whose slug already exists is left as it is. A missing product skips that build.
"""

from __future__ import annotations

import argparse
from typing import Dict, List, Tuple

from app.database import SessionLocal
from app.models.catalog_product import CatalogProduct
from app.services.ecommerce import ready_build_service as rbs
from app.services.ecommerce.storefront_configurator_service import StorefrontConfiguratorService

# slug, name, category, tags, {slot slug: catalogue product id}; a slot set to None is "any" (customer's choice)
BUILDS: List[Tuple[str, str, str, List[str], Dict[str, str | None]]] = [
    ("ultra-gaming-pc-ryzen-5-9600x-rtx-5060", "Ultra Gaming PC — Ryzen 5 9600X + RTX 5060", "Gaming", ["Best seller"], {
        "cpu": "oc-prod-10494", "motherboard": "oc-prod-9126", "memory": "oc-prod-12208", "graphics-card": "oc-prod-13274",
        "ssd": "oc-prod-14374", "power-supply": "oc-prod-3047", "cpu-cooler": "oc-prod-3846", "casing": "oc-prod-12976"}),
    ("ultra-gaming-pc-core-i5-14400f-rtx-5060", "Ultra Gaming PC — Core i5-14400F + RTX 5060", "Gaming", [], {
        "cpu": "oc-prod-9443", "motherboard": "oc-prod-7855", "memory": "oc-prod-12208", "graphics-card": "oc-prod-14556",
        "ssd": "oc-prod-14374", "power-supply": "oc-prod-3047", "cpu-cooler": "oc-prod-3846", "casing": "oc-prod-12639"}),
    ("ultra-pro-pc-ryzen-7-7800x3d-rtx-5070", "Ultra Pro PC — Ryzen 7 7800X3D + RTX 5070", "Gaming", ["Top pick"], {
        "cpu": "oc-prod-6725", "motherboard": "oc-prod-13429", "memory": "oc-prod-14494", "graphics-card": "oc-prod-12142",
        "ssd": "oc-prod-12635", "power-supply": "oc-prod-11634", "cpu-cooler": "oc-prod-4836", "casing": "oc-prod-12976"}),
    ("ultra-pro-pc-core-ultra-5-245k-rtx-5060", "Ultra Pro PC — Core Ultra 5 245K + RTX 5060", "Gaming", [], {
        "cpu": "oc-prod-10907", "motherboard": "oc-prod-13727", "memory": "oc-prod-12208", "graphics-card": "oc-prod-13072",
        "ssd": "oc-prod-14374", "power-supply": "oc-prod-11634", "cpu-cooler": "oc-prod-3846", "casing": "oc-prod-13696"}),
    ("ultra-budget-pc-ryzen-5-5600g", "Ultra Budget PC — Ryzen 5 5600G", "Office", ["Budget"], {
        "cpu": "oc-prod-1730", "motherboard": "oc-prod-7738", "memory": "oc-prod-14551", "graphics-card": None,
        "ssd": "oc-prod-14334", "power-supply": "oc-prod-10501", "cpu-cooler": "oc-prod-12147", "casing": "oc-prod-829"}),
    ("ultra-creator-pc-ryzen-9-9900x-rtx-5070", "Ultra Creator PC — Ryzen 9 9900X + RTX 5070", "Creator", ["Creator"], {
        "cpu": "oc-prod-10485", "motherboard": "oc-prod-13429", "memory": "oc-prod-14494", "graphics-card": "oc-prod-12025",
        "ssd": "oc-prod-11911", "power-supply": "oc-prod-11688", "cpu-cooler": "oc-prod-4836", "casing": "oc-prod-12976"}),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    ap.add_argument("--publish", action="store_true", help="publish the builds that pass the checks")
    args = ap.parse_args()

    db = SessionLocal()
    svc = StorefrontConfiguratorService(db)
    profile = svc.get_profile("pc-builder")
    cats = {c.slug: c for c in svc.list_categories(profile)}

    for slug, name, category, tags, parts in BUILDS:
        try:
            rbs.get_build_by_slug(db, slug)
            print(f"{slug}: exists — left as it is")
            continue
        except rbs.ReadyBuildError:
            pass
        missing = [s for s in parts if s not in cats]
        gone = [pid for pid in parts.values() if pid and db.get(CatalogProduct, pid) is None]
        if missing or gone:
            print(f"{slug}: SKIPPED — slots {missing or '-'}, products not in the catalogue {gone or '-'}")
            continue
        slots = [
            {
                "category_id": cats[s].id,
                "mode": "any" if pid is None else "locked",
                "sort_order": cats[s].sort_order,
                "items": [] if pid is None else [{"product_id": pid, "is_default": True}],
            }
            for s, pid in parts.items()
        ]
        stock = ", ".join(f"{s}: {db.get(CatalogProduct, pid).stock_status}" for s, pid in parts.items() if pid)
        if not args.apply:
            print(f"{slug}: would create — {stock}")
            continue
        # save_build commits; the publish checks (required slots, compatibility rules) run on the saved draft
        build = rbs.save_build(db, {
            "profile_id": profile.id, "name": name, "slug": slug, "category": category, "tags": tags,
            "discount_type": "none", "discount_value": 0, "show_timer": False, "slots": slots, "status": "draft",
        })
        errors = rbs.validate_for_publish(db, build)
        total = rbs.compute_totals(db, build)["final"]
        state = "draft"
        if args.publish and not errors:
            rbs.publish_build(db, build.id)
            state = "published"
        print(f"{slug}: created ({state}) ৳{total:,.0f}" + (f" — can't publish: {'; '.join(errors)}" if errors else ""))

    if not args.apply:
        print("dry run — run with --apply to write")


if __name__ == "__main__":
    main()
