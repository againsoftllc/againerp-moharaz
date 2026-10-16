"""Draft products from another shop's sitemap: title + source URL only, a few at a time.

Reads the sitemap, walks its URLs in order from a saved cursor, opens each candidate page, and for every page that
is a product page (og:type = product) creates a DRAFT product in the catalogue with
  - name        = the page's <h1>
  - source_url  = the page's address
  - status draft / visibility private, price 0, no stock, no category / brand / description / images
Everything else (price, brand, category, specs, images ...) is filled later, step by step.

Polite by design: one request at a time, a pause between requests (--delay), an identifying User-Agent, only product
pages (never the disallowed ?product_id= style URLs), and a hard cap per run (--limit). The cursor lives in
platform_settings (key competitor_import.<host>.cursor), so every run continues where the last one stopped; a page
already imported (same source_url) is never imported twice.

Usage (api container):
    python -m scripts.import_competitor_drafts https://www.startech.com.bd/sitemap.xml --limit 10            # dry run
    python -m scripts.import_competitor_drafts https://www.startech.com.bd/sitemap.xml --limit 10 --apply
    python -m scripts.import_competitor_drafts <sitemap> --reset-cursor --apply                              # start over
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
from urllib.parse import urlparse

import httpx
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

USER_AGENT = "MoharazCatalogBot/1.0 (+contact: info@moharaz.com)"
MAX_PAGE_BYTES = 400_000
# product pages have a long, hyphenated slug; short ones ("hair-dryer") are category pages — skip them without a request
MIN_SLUG_HYPHENS = 3
DISALLOWED = re.compile(r"[?&](product_id|component_id|product_set_id|category_id|pc_id|tracking|offer_id|tag)=|/product/search")


def sitemap_urls(client: httpx.Client, url: str) -> list[str]:
    body = client.get(url, timeout=60).text
    locs = re.findall(r"<loc>\s*(.*?)\s*</loc>", body, re.S)
    if "<sitemapindex" in body:  # an index of sitemaps
        out: list[str] = []
        for sub in locs:
            out += sitemap_urls(client, html.unescape(sub))
        return out
    return [html.unescape(u) for u in locs]


def read_head_and_h1(client: httpx.Client, url: str) -> tuple[str, str] | None:
    """(og:type, h1) of a page, reading only as much of it as needed."""
    buf = ""
    with client.stream("GET", url, timeout=30, follow_redirects=True) as res:
        if res.status_code != 200:
            return None
        for chunk in res.iter_text():
            buf += chunk
            if "</h1>" in buf or len(buf) > MAX_PAGE_BYTES:
                break
    og = re.search(r'property=["\']og:type["\']\s+content=["\']([^"\']+)', buf) or re.search(
        r'content=["\']([^"\']+)["\']\s+property=["\']og:type["\']', buf)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", buf, re.S)
    title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h1.group(1) if h1 else ""))).strip()
    return (og.group(1).strip().lower() if og else ""), title


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sitemap")
    ap.add_argument("--limit", type=int, default=10, help="products to add this run")
    ap.add_argument("--delay", type=float, default=1.5, help="seconds between page requests")
    ap.add_argument("--max-pages", type=int, default=400, help="stop after looking at this many pages (safety)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--reset-cursor", action="store_true")
    ap.add_argument("--start", type=int, default=0, help="never look before this sitemap position (the first product pages of the Star Tech sitemap start at ~1846; before that are category pages)")
    args = ap.parse_args()

    host = urlparse(args.sitemap).netloc
    cursor_key = f"competitor_import.{host}.cursor"
    db = SessionLocal()
    row = db.execute(text("SELECT value FROM platform_settings WHERE key = :k"), {"k": cursor_key}).first()
    cursor = max(args.start, 0 if args.reset_cursor or not row else int(row[0] or 0))

    with httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        urls = sitemap_urls(client, args.sitemap)
        have = {u for (u,) in db.execute(text("SELECT source_url FROM catalog_products WHERE source_url LIKE :p"), {"p": f"%{host}%"})}
        print(f"sitemap: {len(urls)} urls · cursor {cursor} · already imported {len(have)}")
        identity, inventory, ecommerce = ItemIdentityService(db), InventoryItemService(db), EcommerceItemService(db)

        added: list[tuple[str, str]] = []
        looked = skipped_short = 0
        i = cursor
        while i < len(urls) and len(added) < args.limit and looked < args.max_pages:
            url = urls[i]
            i += 1
            slug = urlparse(url).path.strip("/")
            if (not slug or "/" in slug or slug.count("-") < MIN_SLUG_HYPHENS or DISALLOWED.search(url) or url in have):
                skipped_short += 1
                continue
            looked += 1
            time.sleep(args.delay)
            try:
                page = read_head_and_h1(client, url)
            except httpx.HTTPError as exc:
                print(f"  ! {url}: {exc}")
                continue
            if not page or page[0] != "product" or not page[1]:
                continue
            title = page[1][:255]
            print(f"  + {title}  <-  {url}")
            added.append((title, url))
            if not args.apply:
                continue
            pid = "src-" + hashlib.md5(url.encode()).hexdigest()[:16]
            if db.get(CatalogProduct, pid):
                continue
            product = CatalogProduct(id=pid, company_id=COMPANY_ID, product_type="simple")
            db.add(product)
            product.name = title
            product.slug = _free_slug(db, slugify(title)[:200] or pid, COMPANY_ID)
            product.sku = "SRC-" + hashlib.md5(url.encode()).hexdigest()[:10].upper()
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
            db.commit()

    if args.apply:
        db.execute(text(
            "INSERT INTO platform_settings (key, value, description, is_secret, updated_at) "
            "VALUES (:k, :v, 'next sitemap index to look at', false, now()) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()"), {"k": cursor_key, "v": str(i)})
        db.commit()
    print(json.dumps({"added": len(added), "pages_opened": looked, "skipped_without_request": skipped_short,
                      "cursor_now": i, "applied": args.apply}, indent=1))
    db.close()


if __name__ == "__main__":
    main()
