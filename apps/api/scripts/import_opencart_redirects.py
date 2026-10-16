"""301 redirects from the previous Moharaz shop's URLs (docs/DATA_MIGRATION.md, step 10).

Writes seo_redirects rows (admin: SEO → Redirects) keyed by app.services.seo.legacy_urls.legacy_key:
- every reachable product / category / brand: its OpenCart index.php form
  (route=product/product&product_id=N, product/category&path=N, product/manufacturer.info&manufacturer_id=N)
- every live SEO keyword whose page now has another slug (cleaned dots, "²", "–", spaces, upper case,
  duplicates, merged brands)
- information pages and other routes → the matching page of the new shop (INFO / ROUTES below)

A keyword row is skipped when its path is served by something else on the new site (that page wins).
Rows carry note "opencart-import"; re-runs replace exactly those. --replace-demo also removes the
seeded demo redirects (e.g. /contact-us → /contact, which would break the real Contact page).

Input: the live keywords (oc_seo_urls.json: [{k: keyword, q: "product_id=N"}, …]).
Usage (api container):
    python -m scripts.import_opencart_redirects /tmp/oc_seo_urls.json --replace-demo
"""
from __future__ import annotations

import argparse
import json
import uuid
from collections import Counter

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.services.seo.legacy_urls import legacy_key
from scripts.opencart_common import COMPANY_ID, PROVIDER

NOTE = "opencart-import"

# information_id → new page (the old page's keyword, when it had one, redirects the same way)
INFO = {
    3: "/privacy-policy", 4: "/about-us", 5: "/terms-conditions", 11: "/refund",
    12: "/help", 13: "/shipping", 15: "/offer", 16: "/warranty",
}
# other OpenCart routes (index.php?route=… and their keywords)
ROUTES = {
    "common/home": "/", "product/search": "/all", "product/special": "/offer", "product/catalog": "/all",
    "product/manufacturer": "/brand", "product/compare": "/compare", "checkout/cart": "/cart",
    "checkout/checkout": "/checkout", "account/login": "/login", "account/register": "/register",
    "account/account": "/account", "account/order": "/account", "account/wishlist": "/account",
    "information/contact": "/contact-us", "journal3/blog": "/blog", "extension/pc_builder/pc_builder": "/pc-builder",
    "extension/module/special_offer/offerlist": "/offer",
}
# pages the storefront serves itself (never shadowed by a redirect)
PAGES = {"/", "/all", "/about-us", "/contact-us", "/emi", "/help", "/pc-builder", "/privacy-policy",
         "/refund", "/shipping", "/terms-conditions", "/warranty", "/blog", "/brand", "/bundles", "/cart",
         "/checkout", "/compare", "/login", "/register", "/account"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("seo_urls_path")
    parser.add_argument("--replace-demo", action="store_true", help="also delete redirects not made by this import")
    args = parser.parse_args()
    keywords = json.load(open(args.seo_urls_path, encoding="utf-8"))

    db = SessionLocal()
    stats: Counter = Counter()
    try:
        # the new site's served paths, and where each OpenCart id lives now
        products = {
            pid: slug
            for pid, slug in db.execute(text(
                "SELECT p.id, p.slug FROM catalog_products p JOIN ecommerce_items e ON e.catalog_product_id = p.id "
                "WHERE p.id LIKE 'oc-prod-%' AND e.publish_status IN ('published', 'hidden')"
            ))
        }
        categories = {cid: slug for cid, slug in db.execute(text(
            "SELECT id, slug FROM catalog_categories WHERE id LIKE 'oc-cat-%' AND is_active"
        ))}
        brand_slug = {bid: slug for bid, slug in db.execute(text("SELECT id, slug FROM catalog_brands"))}
        brand_of = {  # OpenCart manufacturer id → ERP brand id (merged duplicates included)
            src: erp for src, erp in db.execute(text(
                "SELECT provider_entity_id, erp_entity_id FROM provider_entity_mappings "
                "WHERE provider = :p AND entity_type = 'brand'"), {"p": PROVIDER})
        }
        served = PAGES | {"/" + s for s in products.values()} | {"/" + s for s in categories.values()} | {"/" + s for s in brand_slug.values()}

        rows: dict[str, tuple[str, str]] = {}  # from key → (to path, note)

        def add(old: str, to: str, why: str) -> None:
            key = legacy_key(old)
            if key == to or key in rows:
                return
            if not key.startswith("/index.php") and key in served:
                stats["skipped_served_by_other_page"] += 1
                return
            rows[key] = (to, f"{NOTE}: {why}")
            stats[why.split(" ")[0]] += 1

        for oc_id, slug in ((k[len("oc-prod-"):], v) for k, v in products.items()):
            add(f"/index.php?route=product/product&product_id={oc_id}", f"/{slug}", f"product {oc_id}")
        for oc_id, slug in ((k[len("oc-cat-"):], v) for k, v in categories.items()):
            add(f"/index.php?route=product/category&path={oc_id}", f"/{slug}", f"category {oc_id}")
        for src, erp in brand_of.items():
            if erp in brand_slug:
                add(f"/index.php?route=product/manufacturer.info&manufacturer_id={src}", f"/{brand_slug[erp]}", f"brand {src}")
        for info_id, to in INFO.items():
            add(f"/index.php?route=information/information&information_id={info_id}", to, f"information {info_id}")
        for route, to in ROUTES.items():
            add(f"/index.php?route={route}", to, f"route {route}")

        # live keywords whose page moved to another slug
        for row in keywords:
            kw, query = (row.get("k") or "").strip(), (row.get("q") or "").strip()
            if not kw:
                continue
            kind, _, value = query.partition("=")
            to = None
            if kind == "product_id":
                to = products.get(f"oc-prod-{value}")
            elif kind == "category_id":
                to = categories.get(f"oc-cat-{value}")
            elif kind == "manufacturer_id":
                to = brand_slug.get(brand_of.get(value, ""))
            elif kind == "information_id" and value.isdigit():
                to = (INFO.get(int(value)) or "").lstrip("/")
            elif query in ROUTES:
                to = ROUTES[query].lstrip("/")
            if to is None:
                stats["keyword_without_target"] += 1
                continue
            add("/" + kw, "/" + to if to else "/", f"keyword {kind or query}")

        # write: replace this import's rows (and the demo ones when asked)
        if args.replace_demo:
            stats["demo_rows_removed"] = db.execute(text(
                "DELETE FROM seo_redirects WHERE note IS NULL OR note NOT LIKE :n"), {"n": f"{NOTE}%"}).rowcount
        stats["old_import_rows_removed"] = db.execute(text("DELETE FROM seo_redirects WHERE note LIKE :n"), {"n": f"{NOTE}%"}).rowcount
        # an admin-made redirect for the same path wins
        taken = {p for (p,) in db.execute(text("SELECT from_path FROM seo_redirects"))}
        batch = [
            {"id": str(uuid.uuid4()), "c": COMPANY_ID, "f": key, "t": to, "n": note}
            for key, (to, note) in rows.items() if key not in taken
        ]
        for i in range(0, len(batch), 1000):
            db.execute(text(
                "INSERT INTO seo_redirects (id, company_id, from_path, to_path, redirect_type, status, hits_30d, note, created_at, updated_at) "
                "VALUES (:id, :c, :f, :t, '301', 'active', 0, :n, now(), now())"), batch[i:i + 1000])
        db.commit()
        stats["rows_written"] = len(batch)
        stats["rows_kept_admin_override"] = len(rows) - len(batch)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps(dict(stats), indent=1))


if __name__ == "__main__":
    main()
