"""Import OpenCart manufacturers (Moharaz) as catalog_brands.

Input: JSON array from the staging OpenCart DB (docs/DATA_MIGRATION.md, step 1):
manufacturer_id, name, image, sort_order, keyword (SEO URL), product_count.

- Deterministic id ``oc-brand-{manufacturer_id}``; re-runs update in place.
- Same-name manufacturers (OpenCart has 5 such pairs) merge into one brand; every
  OpenCart id is recorded in provider_entity_mappings (entity_type "brand") so
  the product import resolves either id to the merged brand.
- Slug: the live SEO keyword when free; storefront URLs are flat, so a keyword or
  generated slug may not take a category URL (live categories own them) or a
  product URL. Fallback: name → "{name}-brand" → "{name}-{id}".
- Image: OpenCart `image` path fetched from --image-source (live site URL by
  default, or a local copy of the old `image/` folder) into Media folder "Brands".
- ``--reset`` deletes every brand that did not come from OpenCart first
  (products/listings keep their rows; brand_id becomes NULL).

Usage (api container):
    python -m scripts.import_opencart_brands /tmp/oc_brands.json \
        --reserve /tmp/oc_product_slugs.txt --reset [--image-source /images] [--skip-images]
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from scripts.opencart_common import (
    COMPANY_ID,
    DEFAULT_IMAGE_SOURCE,
    clean_text,
    import_image,
    load_slug_file,
    record_mapping,
    slugify,
)

ID_PREFIX = "oc-brand-"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path")
    parser.add_argument("--reset", action="store_true", help="delete non-OpenCart brands first")
    parser.add_argument("--reserve", help="file of product URLs the brand slugs must avoid")
    parser.add_argument("--image-source", default=DEFAULT_IMAGE_SOURCE)
    parser.add_argument("--skip-images", action="store_true")
    args = parser.parse_args()

    rows = json.load(open(args.json_path, encoding="utf-8"))
    db = SessionLocal()
    stats: dict[str, int] = defaultdict(int)
    image_failures: list[str] = []

    try:
        if args.reset:
            stats["deleted_old"] = db.execute(
                text("DELETE FROM catalog_brands WHERE id NOT LIKE :p"), {"p": f"{ID_PREFIX}%"}
            ).rowcount
            db.commit()

        # Merge same-name manufacturers: the canonical one is the one with a live
        # URL, then the most products, then the lowest id.
        groups: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            groups[clean_text(r["name"]).lower()].append(r)
        canonical: list[tuple[dict, list[dict]]] = []
        for members in groups.values():
            members.sort(key=lambda r: (not (r.get("keyword") or "").strip(), -int(r["product_count"] or 0), int(r["manufacturer_id"])))
            canonical.append((members[0], members[1:]))

        existing = {b.id: b for b in db.query(CatalogBrand).all()}
        for b in existing.values():  # park own rows so slug swaps can't hit the unique index
            if b.id.startswith(ID_PREFIX):
                b.slug = f"tmp-{b.id}"
        db.flush()

        category_slugs = {c.slug for c in db.query(CatalogCategory.slug)}
        used = {b.slug for b in existing.values() if not b.id.startswith(ID_PREFIX)}
        foreign = category_slugs | load_slug_file(args.reserve)
        taken = lambda s: s in used or s in foreign  # noqa: E731

        # Pass 1: live keywords for their owners, unless a category/product owns that URL.
        reserved: dict[int, str] = {}
        for head, _ in sorted(canonical, key=lambda g: g[0]["manufacturer_id"]):
            raw = (head.get("keyword") or "").strip().lower()
            kw = slugify(raw)
            if kw and not taken(kw):
                reserved[head["manufacturer_id"]] = kw
                used.add(kw)
            elif kw:
                stats["live_url_owned_by_other_entity"] += 1

        # Storefront order: OpenCart sorts brands by sort_order, then name.
        ordered = sorted(canonical, key=lambda g: (g[0]["sort_order"], clean_text(g[0]["name"]).lower()))
        for position, (head, dupes) in enumerate(ordered):
            mid = head["manufacturer_id"]
            row_id = f"{ID_PREFIX}{mid}"
            name = clean_text(head["name"]) or f"Brand {mid}"

            slug = reserved.get(mid)
            if not slug:
                base = slugify(name) or f"brand-{mid}"
                for candidate in (base, f"{base}-brand", f"{base}-{mid}"):
                    if not taken(candidate):
                        slug = candidate
                        break
                used.add(slug)
                stats["slug_generated"] += 1

            row = existing.get(row_id)
            if row is None:
                row = CatalogBrand(id=row_id, company_id=COMPANY_ID)
                db.add(row)
                stats["inserted"] += 1
            else:
                stats["updated"] += 1
            row.name = name[:255]
            row.slug = slug
            row.sort_order = position
            row.is_active = True
            row.channel = "catalog"

            # Image: the canonical's, else the first duplicate that has one.
            image = next(
                ((m.get("image") or "").strip() for m in [head, *dupes] if (m.get("image") or "").strip()),
                "",
            )
            if image and not args.skip_images and not row.logo_media_id:
                try:
                    media = import_image(db, image, source=args.image_source, alt=name, folder="Brands")
                    row.logo_media_id, row.logo_url = media.id, media.url
                    stats["images_imported"] += 1
                except Exception as exc:  # keep going; report at the end
                    image_failures.append(f"{mid} {image}: {exc}")

            record_mapping(db, "brand", mid, row_id, name=name, metadata={"slug": slug})
            for dupe in dupes:
                record_mapping(
                    db, "brand", dupe["manufacturer_id"], row_id, name=name, method="merged_name",
                    metadata={"merged_into_oc_id": mid},
                )
                stats["merged_duplicates"] += 1
            db.flush()

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(json.dumps({**stats, "image_failures": len(image_failures)}, indent=1))
    for line in image_failures:
        print("  image failed:", line)


if __name__ == "__main__":
    main()
