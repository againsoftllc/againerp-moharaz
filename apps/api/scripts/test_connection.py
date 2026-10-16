#!/usr/bin/env python3
"""Quick database + API connection test."""

import sys

from app.database import check_database_connection
from app.models.catalog_product import CatalogProduct
from app.database import SessionLocal


def main() -> int:
    print("=== AgainERP Connection Test ===\n")

    print("[1/2] Database ping…")
    try:
        info = check_database_connection()
        print(f"  OK — PostgreSQL {info.get('version', 'unknown')}")
    except Exception as exc:
        print(f"  FAIL — {exc}")
        return 1

    print("\n[2/2] Query catalog_products…")
    try:
        db = SessionLocal()
        count = db.query(CatalogProduct).count()
        sample = db.query(CatalogProduct).limit(3).all()
        db.close()
        print(f"  OK — {count} product(s) in catalog_products")
        for p in sample:
            print(f"       · {p.sku} — {p.name} ({p.status})")
    except Exception as exc:
        print(f"  FAIL — {exc}")
        return 1

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
