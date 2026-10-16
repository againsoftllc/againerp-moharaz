"""Tidy specification profiles: keep the fields their products share, move the rest onto each product, and
rebuild the shop filters from the specs.

Imported (OpenCart) profiles collect every spec name any product ever used — the motherboard profile had 371
fields, so editing one board showed hundreds of empty boxes; the same spec sat under many names ("USB",
"USB (s)", "USB Ports"…); and every profile carried filters of other product types (a monitor's "Input Type"
on motherboards) while its own filters were spelled many ways and missing on half the products.

How a profile is tidied: scripts/spec_tidy_engine.py. The rules per product type (which filters, how their
values are read from names and specs): scripts/spec_tidy_rules.py — profiles without rules are tidied
automatically. Re-running is safe: a tidied profile stays as it is, new values are added.
Process and results: docs/DATA_MIGRATION.md → "Specification profiles & shop filters".

Usage (api container):
    python -m scripts.tidy_spec_profile --profile oc-motherboard            # dry run: what would change
    python -m scripts.tidy_spec_profile --profile oc-motherboard --apply
    python -m scripts.tidy_spec_profile --all [--apply]                     # every profile with products
    python -m scripts.tidy_spec_profile --profile oc-ram --missing capacity # products a filter found nothing for
"""
from __future__ import annotations

import argparse

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_product import CatalogProduct
from scripts.spec_tidy_engine import Rules, run
from scripts.spec_tidy_rules import PROFILES


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    which = ap.add_mutually_exclusive_group(required=True)
    which.add_argument("--profile", help="profile code, e.g. oc-motherboard")
    which.add_argument("--all", action="store_true", help="every profile that has products")
    ap.add_argument("--apply", action="store_true", help="make the change (default: dry run)")
    ap.add_argument("--missing", metavar="FILTER_CODE", help="list products where this filter found no value")
    ap.add_argument("--show", metavar="FILTER_CODE", help="list sample products with the value this filter found")
    args = ap.parse_args()
    db = SessionLocal()
    try:
        if args.all:
            codes = [
                code for (code,) in db.query(CatalogAttributeProfile.code)
                .join(CatalogProduct, CatalogProduct.attribute_profile_id == CatalogAttributeProfile.id)
                .distinct().order_by(CatalogAttributeProfile.code)
            ]
        else:
            codes = [args.profile]
        for code in codes:
            rules = PROFILES.get(code, Rules())
            run(db, code, rules, args.apply, args.missing, show=args.show)
            print()
    finally:
        db.close()


if __name__ == "__main__":
    main()
