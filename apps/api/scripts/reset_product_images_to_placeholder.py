"""Point every product back at the shared placeholder image.

Undoes `seed_it_demo_images.py` in all three places it wrote: the catalog row,
the mirrored ecommerce item the storefront reads, and the homepage cards
snapshotted into `workspace_sites.storefront_cms_json`.

Run: docker compose exec api python scripts/reset_product_images_to_placeholder.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.database import SessionLocal

PLACEHOLDER = "/images/products/placeholder.svg"
GENERATED_PREFIX = "/images/products/it/"


def reset_homepage_images(db) -> int:
    updated = 0
    rows = db.execute(
        text(
            "SELECT id, storefront_cms_json FROM workspace_sites "
            "WHERE storefront_cms_json IS NOT NULL"
        )
    ).mappings().all()

    def retarget(node) -> bool:
        touched = False
        if isinstance(node, dict):
            image = node.get("image")
            if isinstance(image, str) and image.startswith(GENERATED_PREFIX):
                node["image"] = PLACEHOLDER
                touched = True
            for value in node.values():
                touched = retarget(value) or touched
        elif isinstance(node, list):
            for value in node:
                touched = retarget(value) or touched
        return touched

    for row in rows:
        try:
            cms = json.loads(row["storefront_cms_json"])
        except (TypeError, ValueError):
            continue
        if not retarget(cms):
            continue
        db.execute(
            text("UPDATE workspace_sites SET storefront_cms_json = :cms WHERE id = :id"),
            {"cms": json.dumps(cms), "id": row["id"]},
        )
        updated += 1
    return updated


def main() -> None:
    db = SessionLocal()
    try:
        products = db.execute(
            text(
                "UPDATE catalog_products SET thumbnail = :placeholder "
                "WHERE thumbnail LIKE :prefix"
            ),
            {"placeholder": PLACEHOLDER, "prefix": f"{GENERATED_PREFIX}%"},
        ).rowcount
        items = db.execute(
            text(
                "UPDATE ecommerce_items SET thumbnail_url = :placeholder "
                "WHERE thumbnail_url LIKE :prefix"
            ),
            {"placeholder": PLACEHOLDER, "prefix": f"{GENERATED_PREFIX}%"},
        ).rowcount
        reviews = db.execute(
            text(
                "UPDATE catalog_product_reviews SET product_image_url = :placeholder "
                "WHERE product_image_url LIKE :prefix"
            ),
            {"placeholder": PLACEHOLDER, "prefix": f"{GENERATED_PREFIX}%"},
        ).rowcount
        sites = reset_homepage_images(db)
        db.commit()
        print(
            f"Reset {products} product(s), {items} storefront item(s), "
            f"{reviews} review thumbnail(s) and {sites} site homepage(s)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
