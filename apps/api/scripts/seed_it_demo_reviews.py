"""Seed approved customer reviews for the IT demo catalog.

Storefront stars come from `catalog_product_reviews` with status `approved`, so
with an empty table every product card and product page showed no rating at all.
This gives each product 2-5 believable reviews (deterministic per product, so
re-running does not reshuffle the demo) and leaves a couple pending so the Admin
moderation queue is not empty either.

Run: docker compose exec api python scripts/seed_it_demo_reviews.py
"""

from __future__ import annotations

import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.database import SessionLocal

REVIEWERS = [
    "Rakib Hasan", "Tanvir Ahmed", "Sadia Islam", "Mehedi Hasan", "Nusrat Jahan",
    "Arif Chowdhury", "Farhan Kabir", "Sabbir Rahman", "Mahmudul Alam", "Ishrat Binte",
    "Shakib Al Amin", "Rumana Akter", "Nazmul Huda", "Tahmid Rahman", "Jannatul Ferdous",
    "Imran Hossain", "Sumaiya Akter", "Ashiqur Rahman", "Rifat Mahmud", "Zarin Tasnim",
]

TITLES_5 = [
    "Exactly what I needed",
    "Great value for the price",
    "Fast delivery, genuine product",
    "Performance is excellent",
    "Highly recommended",
]
TITLES_4 = [
    "Very good, minor niggles",
    "Solid choice overall",
    "Happy with the purchase",
    "Works well for daily use",
]
TITLES_3 = [
    "Decent but not perfect",
    "Okay for the budget",
]

BODIES_5 = [
    "Ordered from Againcart and got it the next day. Build quality feels premium and it "
    "handles everything I throw at it without heating up. Warranty paperwork was included.",
    "Been using it for three weeks now and there is nothing to complain about. Setup took "
    "ten minutes and performance is exactly as advertised in the specs.",
    "Price here was lower than the two other shops I checked in Dhaka and the product is "
    "100% genuine with official warranty. Packaging was properly sealed.",
]
BODIES_4 = [
    "Overall very good for the money. Performance is smooth for my workload; the only "
    "thing I would change is the bundled accessories, which feel a bit basic.",
    "Does the job well and delivery was on time. Took off one star because the manual is "
    "not in Bangla, but support helped me over the phone.",
]
BODIES_3 = [
    "It works fine and matches the description, but I expected a little more at this price "
    "point. Fine as a budget pick if you are not pushing it hard.",
]

POOL = {
    5: (TITLES_5, BODIES_5),
    4: (TITLES_4, BODIES_4),
    3: (TITLES_3, BODIES_3),
}
# Mostly happy, a few mid ratings, so averages land in the 4.2-4.8 range.
RATING_WEIGHTS = ([5] * 6) + ([4] * 3) + [3]


def sentiment_for(rating: int) -> str:
    if rating >= 4:
        return "positive"
    return "negative" if rating <= 2 else "neutral"


def main() -> None:
    db = SessionLocal()
    try:
        existing = db.execute(
            text("SELECT count(*) FROM catalog_product_reviews WHERE notes = 'it-demo-seed'")
        ).scalar()
        if existing:
            db.execute(text("DELETE FROM catalog_product_reviews WHERE notes = 'it-demo-seed'"))
            print(f"Removed {existing} previously seeded review(s).")

        products = db.execute(
            text(
                """
                SELECT p.id, p.name, p.sku, p.thumbnail, p.company_id,
                       coalesce(b.name, '') AS brand, coalesce(c.name, '') AS category
                FROM catalog_products p
                LEFT JOIN catalog_brands b ON b.id = p.brand_id
                LEFT JOIN catalog_categories c ON c.id = p.category_id
                ORDER BY p.name
                """
            )
        ).mappings().all()

        start = db.execute(
            text("SELECT count(*) FROM catalog_product_reviews")
        ).scalar() or 0
        counter = int(start) + 1
        now = datetime.utcnow()
        created = 0
        pending = 0

        for index, product in enumerate(products):
            rng = random.Random(f"{product['id']}::reviews")
            for slot in range(rng.randint(2, 5)):
                rating = rng.choice(RATING_WEIGHTS)
                titles, bodies = POOL[rating]
                # Every 17th review stays pending to populate the moderation queue.
                status = "pending" if (index + slot) % 17 == 16 else "approved"
                if status == "pending":
                    pending += 1
                db.execute(
                    text(
                        """
                        INSERT INTO catalog_product_reviews (
                            id, company_id, review_number, product_id, product_name,
                            product_sku, product_brand, product_category, product_image_url,
                            customer_name, review_type, status, rating, title, body,
                            sentiment, is_verified_purchase, helpful_votes, notes,
                            media_json, created_at, updated_at
                        ) VALUES (
                            :id, :company_id, :review_number, :product_id, :product_name,
                            :product_sku, :product_brand, :product_category, :product_image_url,
                            :customer_name, 'text', :status, :rating, :title, :body,
                            :sentiment, :verified, :helpful, 'it-demo-seed',
                            '[]', :created_at, :created_at
                        )
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "company_id": product["company_id"],
                        "review_number": f"REV-{counter:05d}",
                        "product_id": product["id"],
                        "product_name": product["name"],
                        "product_sku": product["sku"] or "",
                        "product_brand": product["brand"] or None,
                        "product_category": product["category"] or None,
                        "product_image_url": product["thumbnail"],
                        "customer_name": rng.choice(REVIEWERS),
                        "status": status,
                        "rating": rating,
                        "title": rng.choice(titles),
                        "body": rng.choice(bodies),
                        "sentiment": sentiment_for(rating),
                        "verified": rng.random() < 0.75,
                        "helpful": rng.randint(0, 24),
                        "created_at": now - timedelta(days=rng.randint(2, 180)),
                    },
                )
                counter += 1
                created += 1

        db.commit()
        print(f"Created {created} review(s) across {len(products)} product(s); {pending} pending.")

        summary = db.execute(
            text(
                """
                SELECT count(DISTINCT product_id) AS rated,
                       round(avg(rating)::numeric, 2) AS avg_rating
                FROM catalog_product_reviews
                WHERE status = 'approved'
                """
            )
        ).mappings().first()
        print(f"Products with an approved rating: {summary['rated']} (avg {summary['avg_rating']})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
