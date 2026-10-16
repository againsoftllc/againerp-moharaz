"""Seed / upsert the storefront Happy Hour campaign with hand-picked catalog deals."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models.marketing_happy_hour import (  # noqa: E402
    MarketingHappyHour,
    MarketingHappyHourDeal,
    MarketingHappyHourSection,
)

TERMS = [
    "Happy Hour prices are live only during the nightly window shown above and revert to regular pricing once it closes.",
    "Offer prices apply to online orders placed on againcart.com; showroom walk-in purchases are excluded.",
    "Each deal is limited to available stock and, where noted, to a maximum quantity per customer.",
    "bKash instant cashback of up to ৳1,000 applies to online bKash payments only and is credited by bKash as per their campaign terms.",
    "Happy Hour prices cannot be combined with any other running offer, coupon, bundle, or EMI discount.",
    "Orders cancelled or returned lose the Happy Hour price; a replacement is issued at the regular price if the window has closed.",
    "Againcart reserves the right to change, pause, or withdraw the campaign at any time without prior notice.",
]

SECTIONS = [
    {
        "key": "desktop",
        "label": "Desktop",
        "deals": [
            {"product_slug": "it-desktop-product-1", "offer_price": 7900},
            {"product_slug": "it-desktop-product-2", "offer_price": 9900},
            {"product_slug": "it-desktop-product-3", "offer_price": 11900, "note": "Limited to 3 units"},
        ],
    },
    {
        "key": "laptop",
        "label": "Laptop",
        "deals": [
            {"product_slug": "it-asus-vivobook-14", "offer_price": 79900},
            {"product_slug": "it-hp-15s-intel-i5", "offer_price": 72900},
            {
                "product_slug": "it-lenovo-ideapad-slim-3",
                "offer_price": 59900,
                "note": "Limited to 2 units",
            },
        ],
    },
    {
        "key": "component",
        "label": "Component",
        "deals": [
            {"product_slug": "it-pc-component-product-1", "offer_price": 8900},
            {"product_slug": "it-pc-component-product-2", "offer_price": 10900},
            {"product_slug": "it-pc-component-product-3", "offer_price": 12900},
        ],
    },
    {
        "key": "gaming",
        "label": "Gaming",
        "deals": [
            {"product_slug": "it-gaming-product-1", "offer_price": 17900},
            {"product_slug": "it-gaming-product-2", "offer_price": 19900},
            {"product_slug": "it-gaming-product-3", "offer_price": 21900},
        ],
    },
]


def main() -> None:
    db = SessionLocal()
    try:
        row = db.query(MarketingHappyHour).filter(MarketingHappyHour.slug == "happy-hour").first()
        starts = datetime(2026, 8, 1, 22, 0, 0)
        ends = datetime(2026, 12, 31, 23, 59, 59)
        if not row:
            row = MarketingHappyHour(slug="happy-hour")
            db.add(row)
        row.title = "শুরু হচ্ছে Againcart Happy Hour!"
        row.subtitle = None
        row.description = (
            "আজ রাত ১০টায়, আপনার পছন্দের Laptop, Desktop, Monitor, Smart Watch, Keyboard, "
            "Mouse, Headphone-সহ প্রযুক্তি পণ্যে পাচ্ছেন নিশ্চিত মূল্যছাড়। এবং বিকাশ অনলাইন "
            "পেমেন্টে পাচ্ছেন সর্বোচ্চ ১০০০ টাকা পর্যন্ত ইনস্ট্যান্ট ক্যাশব্যাক।"
        )
        row.outlet_label = "Online Only"
        row.starts_at = starts
        row.ends_at = ends
        row.daily_start_hour = 22
        row.daily_end_hour = 24
        row.status = "running"
        row.terms_json = json.dumps(TERMS, ensure_ascii=False)
        row.sort_order = 0
        row.sections.clear()
        db.flush()
        for s_index, section in enumerate(SECTIONS):
            sec = MarketingHappyHourSection(
                key=section["key"],
                label=section["label"],
                sort_order=s_index,
            )
            for d_index, deal in enumerate(section["deals"]):
                sec.deals.append(
                    MarketingHappyHourDeal(
                        product_slug=deal["product_slug"],
                        offer_price=float(deal["offer_price"]),
                        note=deal.get("note"),
                        sort_order=d_index,
                    )
                )
            row.sections.append(sec)
        db.commit()
        print("ok happy-hour seeded", f"sections={len(row.sections)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
