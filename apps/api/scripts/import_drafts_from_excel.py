"""Bulk-create DRAFT products from an Excel/CSV of (title, source_url) - no page requests.

Same draft shape as import_competitor_drafts.py: status draft / visibility private, price 0, no stock, no category /
brand / description / images. A source_url already in the catalogue is skipped, so the run can be repeated safely.

Usage (api container):
    python -m scripts.import_drafts_from_excel /tmp/startech-products.xlsx --limit 10            # dry run
    python -m scripts.import_drafts_from_excel /tmp/startech-products.xlsx --limit 10 --apply
    python -m scripts.import_drafts_from_excel /tmp/startech-products.xlsx --apply               # everything
"""
from __future__ import annotations

import argparse
import hashlib

import openpyxl
from sqlalchemy import text

import scripts.init_db  # noqa: F401 - registers every model
from app.database import SessionLocal
from app.models.catalog_product import CatalogProduct
from app.routers.catalog_products import _free_slug
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
from app.services.inventory.inventory_item_service import InventoryItemService
from app.services.items.catalog_item_bridge import ensure_default_variant
from app.services.items.item_identity_service import ItemIdentityService
from scripts.opencart_common import COMPANY_ID, slugify


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--limit", type=int, default=0, help="products to add this run (0 = all)")
    ap.add_argument("--batch", type=int, default=200, help="commit every N products")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    ws = openpyxl.load_workbook(args.file, read_only=True).active
    rows = [(str(t or "").strip(), str(u or "").strip()) for _, t, u in list(ws.iter_rows(values_only=True))[1:]]
    rows = [(t, u) for t, u in rows if t and u]

    db = SessionLocal()
    have = {u for (u,) in db.execute(text("SELECT source_url FROM catalog_products WHERE source_url IS NOT NULL"))}
    todo = [(t, u) for t, u in rows if u not in have]
    if args.limit:
        todo = todo[: args.limit]
    print(f"rows {len(rows)} · already in catalogue {len(rows) - len([1 for t, u in rows if u not in have])} · to add {len(todo)}")

    identity, inventory, ecommerce = ItemIdentityService(db), InventoryItemService(db), EcommerceItemService(db)
    added = 0
    for title, url in todo:
        if not args.apply:
            print(f"  + {title}  <-  {url}")
            continue
        h = hashlib.md5(url.encode()).hexdigest()
        pid = "src-" + h[:16]
        if db.get(CatalogProduct, pid):
            continue
        product = CatalogProduct(id=pid, company_id=COMPANY_ID, product_type="simple")
        db.add(product)
        product.name = title[:255]
        product.slug = _free_slug(db, slugify(title)[:200] or pid, COMPANY_ID)
        product.sku = "SRC-" + h[:10].upper()
        product.source_url = url[:1000]
        product.status = "draft"
        product.visibility = "private"
        product.price = 0
        product.last_selling_price = 0
        product.stock = 0
        product.stock_status = "out_of_stock"
        product.track_quantity = False
        product.dropship_meta_json = None
        db.flush()
        identity.persist_and_mirror(product)
        inventory.ensure_for_catalog_product(product, track_stock=False)
        ecommerce.sync_content_from_catalog(product, mirror_publish=True)
        variant = ensure_default_variant(db, product)
        variant.price = 0
        variant.status = "draft"
        added += 1
        if added % args.batch == 0:
            db.commit()
            db.expunge_all()  # keep memory flat over thousands of products
            print(f"  ... {added}")
    if args.apply:
        db.commit()
    print(f"added {added} (applied={args.apply})")
    db.close()


if __name__ == "__main__":
    main()
