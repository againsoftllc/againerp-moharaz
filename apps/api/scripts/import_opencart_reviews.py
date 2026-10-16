"""Product reviews from the previous Moharaz shop (docs/DATA_MIGRATION.md, decision D8).

Writes catalog_product_reviews (admin: Website → Reviews; the storefront shows the approved ones and
their average rating):
- OpenCart status 1 (shown on the live site) → "approved"; status 0 (never approved) → "pending"
- link / drug / casino spam → "spam" whatever its OpenCart status (kept for the record, never shown)
- author, text, rating and dates as in the source; sentiment from the rating
- product name / SKU / brand / category / image copied from the imported catalogue product

Ids are deterministic (oc-review-{review_id}) and review numbers come from the normal "catalog.review"
sequence, so re-runs only add reviews that are not there yet. Reviews of products that were not
imported are skipped.

Input: ac_review as JSON lines (one JSON_OBJECT per row, see DATA_MIGRATION.md step 11).
Usage (api container):
    python -m scripts.import_opencart_reviews /tmp/oc_reviews.jsonl
"""
from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter
from datetime import datetime

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_review import CatalogProductReview
from app.services.core.sequence_service import next_number
from scripts.opencart_common import COMPANY_ID

ID = "oc-review-"
SPAM = re.compile(
    r"\[url=|https?://|www\.|<a\s|cialis|viagra|tadalafil|casino|porn|crypto|bitcoin|pharmacy|\.(ru|monster|xyz|top)\b",
    re.I,
)


def _text(value: str | None) -> str:
    return re.sub(r"[ \t]+", " ", html.unescape(value or "")).strip()


def _when(row: dict) -> datetime | None:
    raw = row.get("date_added") or row.get("date_modified")
    return datetime.strptime(raw, "%Y-%m-%d %H:%M:%S") if raw else None


def _sentiment(rating: int) -> str:
    return "positive" if rating >= 4 else "negative" if rating <= 2 else "neutral"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("reviews_path")
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.reviews_path, encoding="utf-8") if line.strip()]
    db = SessionLocal()
    stats: Counter = Counter()

    existing = {rid for (rid,) in db.execute(text("SELECT id FROM catalog_product_reviews WHERE id LIKE 'oc-review-%'"))}
    products = {p.id: p for p in db.query(CatalogProduct).filter(CatalogProduct.id.like("oc-prod-%"))}
    thumbs = dict(db.execute(text(
        "SELECT catalog_product_id, thumbnail_url FROM ecommerce_items "
        "WHERE catalog_product_id LIKE 'oc-prod-%' AND thumbnail_url IS NOT NULL"
    )).all())

    for r in rows:
        rid = f"{ID}{r['review_id']}"
        if rid in existing:
            stats["already imported"] += 1
            continue
        product = products.get(f"oc-prod-{r['product_id']}")
        if product is None:
            stats["skipped: product not imported"] += 1
            continue
        author, body = _text(r.get("author")), _text(r.get("text"))
        rating = min(5, max(1, int(r.get("rating") or 5)))
        if SPAM.search(body) or SPAM.search(author):
            status = "spam"
        else:
            status = "approved" if int(r.get("status") or 0) == 1 else "pending"
        stats[f"status {status}"] += 1
        when = _when(r)
        review = CatalogProductReview(
            id=rid,
            company_id=COMPANY_ID,
            review_number=next_number(db, COMPANY_ID, "catalog.review", initial=20001),
            product_id=product.id,
            product_name=product.name[:255],
            product_sku=(product.sku or "")[:100],
            product_brand=(product.brand or None) and product.brand[:100],
            product_category=(product.category or None) and product.category[:100],
            product_image_url=(thumbs.get(product.id) or None) and thumbs[product.id][:500],
            customer_id=None,
            customer_name=(author or "Customer")[:255],
            review_type="text",
            status=status,
            rating=rating,
            title="",
            body=body,
            sentiment=_sentiment(rating),
            is_verified_purchase=False,
            moderated_by="opencart-import",
            notes=f"OpenCart review #{r['review_id']}" + (f", customer #{r['customer_id']}" if r.get("customer_id") else ""),
        )
        if when:
            review.created_at = when
            review.updated_at = datetime.strptime(r["date_modified"], "%Y-%m-%d %H:%M:%S") if (r.get("date_modified") or "").startswith("0000") is False and r.get("date_modified") else when
        db.add(review)
        stats["imported"] += 1
        if stats["imported"] % 500 == 0:
            db.commit()
    db.commit()
    db.close()
    print(json.dumps(dict(stats), indent=1))


if __name__ == "__main__":
    main()
