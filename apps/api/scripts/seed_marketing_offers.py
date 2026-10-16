"""Create marketing_offers tables and seed Computer & Gaming + Home & Office deals."""

from __future__ import annotations

from datetime import datetime

from app.database import Base, SessionLocal, engine
from app.models.marketing_offer import MarketingOffer, MarketingOfferSection


SEEDS = [
    {
        "slug": "computer-gaming-deal",
        "title": "Computer & Gaming Deal",
        "description": "Buy Desktop, Laptop & Gaming Gear and enjoy exciting discounts with free delivery!",
        "image_url": "/images/offers/placeholder.svg",
        "outlet_label": "All Outlet",
        "starts_at": datetime(2026, 8, 5, 0, 0, 0),
        "ends_at": datetime(2026, 8, 31, 23, 59, 59),
        "status": "running",
        "sort_order": 1,
        "sections": [
            ("desktop", "Desktop", "desktop", 0),
            ("laptop", "Laptop", "laptop", 1),
            ("pc-component", "Component", "pc-component", 2),
            ("gaming", "Gaming", "gaming", 3),
        ],
    },
    {
        "slug": "home-office-deal",
        "title": "Home & Office Deal",
        "description": "Buy AC, UPS & Office Equipment and enjoy exciting discounts with free delivery!",
        "image_url": "/images/offers/placeholder.svg",
        "outlet_label": "All Outlet",
        "starts_at": datetime(2026, 8, 5, 0, 0, 0),
        "ends_at": datetime(2026, 8, 31, 23, 59, 59),
        "status": "running",
        "sort_order": 2,
        "sections": [
            ("power", "Power", "power", 0),
            ("office", "Office Equipment", "office", 1),
            ("cc-camera", "Security", "cc-camera", 2),
        ],
    },
]


def main() -> None:
    Base.metadata.create_all(bind=engine, tables=[MarketingOffer.__table__, MarketingOfferSection.__table__])
    db = SessionLocal()
    try:
        created = 0
        for seed in SEEDS:
            existing = db.query(MarketingOffer).filter(MarketingOffer.slug == seed["slug"]).first()
            if existing:
                print(f"skip {seed['slug']}")
                continue
            row = MarketingOffer(
                slug=seed["slug"],
                title=seed["title"],
                description=seed["description"],
                image_url=seed["image_url"],
                outlet_label=seed["outlet_label"],
                starts_at=seed["starts_at"],
                ends_at=seed["ends_at"],
                status=seed["status"],
                sort_order=seed["sort_order"],
            )
            db.add(row)
            db.flush()
            for key, label, cat_slug, order in seed["sections"]:
                db.add(
                    MarketingOfferSection(
                        offer_id=row.id,
                        key=key,
                        label=label,
                        category_slug=cat_slug,
                        sort_order=order,
                    )
                )
            created += 1
            print(f"created {seed['slug']}")
        db.commit()
        print(f"done created={created} total={db.query(MarketingOffer).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
