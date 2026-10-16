"""Import OpenCart categories (Moharaz) into catalog_categories.

Input: JSON array extracted from the staging OpenCart DB (see docs/DATA_MIGRATION.md,
step 2). Each row: category_id, parent_id, sort_order, status, top, image, name,
description, meta_title, meta_description, meta_keyword, keyword (SEO URL).

Re-runnable: rows use the deterministic id ``oc-cat-{category_id}`` and are
updated in place. ``--reset`` first deletes every category that did not come
from OpenCart (products keep their rows; their category link is set NULL).

Usage (inside the api container):
    python -m scripts.import_opencart_categories /tmp/oc_categories.json --reset
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.catalog_category import CatalogCategory
from scripts.opencart_common import (
    COMPANY_ID,
    DEFAULT_IMAGE_SOURCE,
    clean_html,
    clean_text,
    import_image,
    load_slug_file,
    record_mapping,
    slugify,
)

ID_PREFIX = "oc-cat-"

def ordered_by_tree(rows: list[dict]) -> list[dict]:
    """Parents before children; a parent missing from the dump makes the row a root."""
    ids = {r["category_id"] for r in rows}
    children: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        parent = r["parent_id"] if r["parent_id"] in ids else 0
        children[parent].append(r)
    out: list[dict] = []
    queue = [0]
    while queue:
        pid = queue.pop(0)
        # Same order as the OpenCart storefront: ORDER BY sort_order, LCASE(name).
        siblings = sorted(
            children.get(pid, []),
            key=lambda x: (x["sort_order"], clean_text(x["name"]).lower(), x["category_id"]),
        )
        for position, r in enumerate(siblings):
            # OpenCart allows negative sort_order; AgainERP requires >= 0. Keep the order.
            r["position"] = position
            out.append(r)
            queue.append(r["category_id"])
    return out


def sync_catalog_menu(db) -> dict[str, int]:
    """Rebuild the auto Catalog menu (storefront SHOP slot) in category order.

    OpenCart shows a top-level category in the header menu only when `top` is
    ticked; its subcategories always show under it. Here that becomes the menu
    item's `hidden` flag on root items, which admins can still toggle later
    (Website → Menus). Stored items are reset so the order follows sort_order.
    """
    from app.models.website_menu import SYSTEM_MENU_CATALOG_ID, WebsiteMenu, dump_json, load_json_list
    from app.services.website_menu_service import ensure_system_menus, sync_auto_menu

    ensure_system_menus(db)
    menu = db.get(WebsiteMenu, SYSTEM_MENU_CATALOG_ID)
    menu.items_json = "[]"
    sync_auto_menu(db, menu)

    top = {c.id: c.show_in_top_menu for c in db.query(CatalogCategory).filter(CatalogCategory.parent_id.is_(None))}
    items = load_json_list(menu.items_json)
    shown = 0
    for item in items:
        visible = bool(top.get(item.get("link_ref_id")))
        item["hidden"] = not visible
        shown += visible
    menu.items_json = dump_json(items)
    db.commit()
    return {"menu_roots": len(items), "menu_roots_shown": shown}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path")
    parser.add_argument("--reset", action="store_true", help="delete non-OpenCart categories first")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument(
        "--image-source",
        default=DEFAULT_IMAGE_SOURCE,
        help="URL prefix or local copy of the old OpenCart image/ folder",
    )
    parser.add_argument(
        "--sync-menu",
        action="store_true",
        help="rebuild the storefront Catalog (SHOP) menu from these categories; a root shows "
        "only when OpenCart had `top` ticked, like the live site's header menu",
    )
    parser.add_argument(
        "--reserve",
        help="file of slugs/names owned by other entities (product/brand/page URLs); "
        "storefront URLs are flat, so a generated category slug must avoid them",
    )
    args = parser.parse_args()

    rows = json.load(open(args.json_path, encoding="utf-8"))
    db = SessionLocal()
    stats: dict[str, int] = defaultdict(int)
    image_failures: list[str] = []

    try:
        if args.reset:
            deleted = db.execute(
                text("DELETE FROM catalog_categories WHERE id NOT LIKE :p"), {"p": f"{ID_PREFIX}%"}
            ).rowcount
            db.commit()
            stats["deleted_old"] = deleted

        existing = {c.id: c for c in db.query(CatalogCategory).all()}
        # Re-runs reassign slugs; park our own rows on unique temp slugs first so a
        # swap between two rows can't hit the unique constraint mid-flush.
        for c in existing.values():
            if c.id.startswith(ID_PREFIX):
                c.slug = f"tmp-{c.id}"
        db.flush()
        used_slugs = {c.slug for c in existing.values() if not c.id.startswith(ID_PREFIX)}
        # Other entities' URLs only block *generated* slugs; a category keeps its own
        # live keyword (the live site never had two entities on one keyword).
        foreign = load_slug_file(args.reserve)

        # Pass 1: the live site's own SEO URLs win — reserve each cleaned keyword
        # for the category that owns it (first owner wins on the 2 duplicates).
        reserved: dict[int, str] = {}
        for r in sorted(rows, key=lambda x: x["category_id"]):
            raw = (r.get("keyword") or "").strip().lower()
            kw = slugify(raw)
            if kw != raw and kw in foreign:
                continue  # cleaning ("g-printer-" → "g-printer") would steal another entity's URL
            if kw and kw not in used_slugs:
                reserved[r["category_id"]] = kw
                used_slugs.add(kw)

        by_id: dict[int, CatalogCategory] = {}

        for r in ordered_by_tree(rows):
            cid = r["category_id"]
            row_id = f"{ID_PREFIX}{cid}"
            parent = by_id.get(r["parent_id"])
            name = clean_text(r["name"]) or f"Category {cid}"

            # Pass 2: no (or duplicate) keyword → name; then "{name}-{parent name}"
            # (the live site's own brand-subcategory style); then the id.
            slug = reserved.get(cid)
            if not slug:
                taken = lambda s: s in used_slugs or s in foreign
                base = slugify(name) or f"category-{cid}"
                slug = base
                if taken(slug) and parent:
                    slug = f"{base}-{slugify(parent.name)}"
                if taken(slug):
                    slug = f"{base}-{cid}"
                used_slugs.add(slug)
            if slug != (r.get("keyword") or "").strip():
                stats["slug_changed_or_generated"] += 1

            row = existing.get(row_id)
            if row is None:
                row = CatalogCategory(id=row_id, company_id=COMPANY_ID)
                db.add(row)
                stats["inserted"] += 1
            else:
                stats["updated"] += 1

            row.name = name[:255]
            row.caption = row.caption or ""
            row.slug = slug
            row.description = clean_html(r.get("description"))
            row.meta_title = clean_text(r.get("meta_title"))[:255] or None
            row.meta_description = clean_text(r.get("meta_description")) or None
            row.meta_keywords = clean_text(r.get("meta_keyword"))[:500] or None
            row.sort_order = r["position"]
            row.is_active = bool(r.get("status"))
            row.show_in_top_menu = bool(r.get("top"))
            row.channel = "catalog"
            if parent:
                row.parent_id, row.depth, row.path = parent.id, parent.depth + 1, f"{parent.path}{row_id}/"
            else:
                row.parent_id, row.depth, row.path = None, 0, f"/{row_id}/"

            image = (r.get("image") or "").strip()
            if image and not args.skip_images and not row.icon_media_id:
                try:
                    media = import_image(db, image, source=args.image_source, alt=name, folder="Categories")
                    row.icon_media_id, row.icon_url = media.id, media.url
                    stats["images_imported"] += 1
                except Exception as exc:  # keep importing; report at the end
                    image_failures.append(f"{cid} {image}: {exc}")

            record_mapping(db, "category", cid, row_id, name=name, metadata={"slug": slug})
            by_id[cid] = row
            db.flush()

        db.commit()

        if args.sync_menu:
            stats.update(sync_catalog_menu(db))
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
