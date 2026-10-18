"""Seed the warranty choices the product form and the AI import select from: 6 Months, 1 Year, 2 Years ...

Existing options (any spelling of the same name) are kept; only missing ones are added. Safe to run again.

    python -m scripts.seed_warranty_options
"""
import scripts.init_db  # noqa: F401
from sqlalchemy import func

from app.database import SessionLocal
from app.models.catalog_warranty import CatalogWarranty

COMPANY_ID = "default"
OPTIONS = ["No Warranty", "3 Months", "6 Months", "1 Year", "2 Years", "3 Years", "4 Years", "5 Years", "10 Years", "Lifetime"]


def main() -> None:
    db = SessionLocal()
    top = db.query(func.max(CatalogWarranty.sort_order)).scalar() or 0
    have = {n.strip().lower() for (n,) in db.query(CatalogWarranty.name).all()}
    added = []
    for name in OPTIONS:
        if name.lower() in have:
            continue
        top += 1
        db.add(CatalogWarranty(company_id=COMPANY_ID, name=name, sort_order=top))
        added.append(name)
    db.commit()
    print("added:", ", ".join(added) or "nothing (all present)")
    db.close()


if __name__ == "__main__":
    main()
