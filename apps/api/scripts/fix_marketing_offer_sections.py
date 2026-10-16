"""Fix offer category slugs + products_limit column; re-seed deal sections."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models.marketing_offer import MarketingOffer, MarketingOfferSection

SECTION_FIXES = {
    "computer-gaming-deal": [
        ("desktop", "Desktop", "desktop", 0),
        ("laptop", "Laptop", "laptop", 1),
        ("pc-component", "Component", "pc-component", 2),
        ("gaming", "Gaming", "gaming", 3),
    ],
    "home-office-deal": [
        ("power", "Power", "power", 0),
        ("office", "Office Equipment", "office", 1),
        ("cc-camera", "Security", "cc-camera", 2),
    ],
}


def main() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE marketing_offers "
                "ADD COLUMN IF NOT EXISTS products_limit INTEGER NOT NULL DEFAULT 12"
            )
        )
    Base.metadata.create_all(bind=engine, tables=[MarketingOffer.__table__, MarketingOfferSection.__table__])

    db = SessionLocal()
    try:
        for slug, sections in SECTION_FIXES.items():
            row = db.query(MarketingOffer).filter(MarketingOffer.slug == slug).first()
            if not row:
                row = MarketingOffer(
                    slug=slug,
                    title=(
                        "Computer & Gaming Deal"
                        if slug.startswith("computer")
                        else "Home & Office Deal"
                    ),
                    description=(
                        "Buy Desktop, Laptop & Gaming Gear and enjoy exciting discounts with free delivery!"
                        if slug.startswith("computer")
                        else "Buy AC, UPS & Office Equipment and enjoy exciting discounts with free delivery!"
                    ),
                    image_url="/images/offers/placeholder.svg",
                    outlet_label="All Outlet",
                    starts_at=datetime(2026, 8, 5, 0, 0, 0),
                    ends_at=datetime(2026, 8, 31, 23, 59, 59),
                    status="running",
                    sort_order=1 if slug.startswith("computer") else 2,
                    products_limit=12,
                )
                db.add(row)
                db.flush()
                print(f"created {slug}")
            else:
                row.products_limit = 12
                row.status = "running"
                print(f"update {slug}")

            row.sections.clear()
            db.flush()
            for key, label, cat_slug, order in sections:
                db.add(
                    MarketingOfferSection(
                        offer_id=row.id,
                        key=key,
                        label=label,
                        category_slug=cat_slug,
                        sort_order=order,
                    )
                )
        db.commit()
        print("done")
    finally:
        db.close()


if __name__ == "__main__":
    main()
