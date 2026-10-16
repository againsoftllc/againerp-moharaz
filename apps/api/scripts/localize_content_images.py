"""Move images that content still loads from the OLD shop into the media library (R2 on a Cloudflare-connected
site) and point the content at them — so nothing breaks when the old shop's server goes away.

Imported descriptions (products, categories, brands, blog, pages, homepage) still hold old-shop image URLs:

    <img src="https://www.moharaz.com/image/catalog/ssd/kingston/nv2-250gb/kingston-nv2-….jpg">
    <img src="/image/catalog/website/banner/home/E900__02.jpg">          (relative — the old shop's /image/ folder)
    …/image/cache/catalog/…-660x418.jpg                                   (a resized copy of a catalog image)

For each one: if the media library already has that image (the importers keep `Media.source_url`; a resized
`cache/` copy is matched to its original), its URL is used; otherwise it is downloaded from the old shop once and
stored like an import (`Media.source_url` = the old URL, folder "Content images"). Then every use in the content is
rewritten to the new URL. An image the old shop no longer has (404) is reported and left as it is.

Dry run by default (prints what would change, downloads nothing). Run local first; on live take a backup first.

    python -m scripts.localize_content_images                       # dry run: counts + samples
    python -m scripts.localize_content_images --check               # dry run that also asks the old shop which exist
    python -m scripts.localize_content_images --apply               # download missing ones, rewrite the content
    python -m scripts.localize_content_images --apply --only ecommerce_items.full_description

Re-running is safe: rewritten content no longer matches, and images already stored are reused (by source_url).
"""

from __future__ import annotations

import argparse
import mimetypes
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, unquote, urlsplit

from sqlalchemy import text

from app.database import SessionLocal
from app.models.media import Media

OLD_HOST = "www.moharaz.com"
OLD_IMAGE_BASE = f"https://{OLD_HOST}/image/"
FOLDER = "Content images"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36"

# (table, column) holding content a visitor sees; rows are updated by primary key
SOURCES = [
    ("ecommerce_items", "full_description"),
    ("catalog_products", "description"),  # the admin's copy of the same text — kept in step
    ("ecommerce_items", "short_description"),
    ("catalog_products", "short_description"),
    ("catalog_categories", "description"),
    ("catalog_brands", "description"),
    ("blog_posts", "content"),
    ("blog_categories", "description"),
    ("website_pages", "body_html"),
    ("website_homepage", "content_json"),
    ("website_builder_documents", "document_json"),
    ("catalog_product_attribute_values", "value"),
]

# an old-shop image reference: absolute (any scheme / www or not) or a relative path into its /image/ folder.
# The relative form must start right after a quote, "(", "=" or whitespace, so text like "my/image/x" is not taken.
OLD_IMG = re.compile(
    r"""(?:https?:)?//(?:www\.)?moharaz\.com/image/[^\s"'<>()\\]+"""
    r"""|(?<=["'(=\s])/?image/(?:catalog|cache|data)/[^\s"'<>()\\]+""",
    re.I,
)
IMG_EXT = re.compile(r"\.(jpe?g|png|gif|webp|svg|avif|bmp)$", re.I)


def rel_path(ref: str) -> str:
    """'https://www.moharaz.com/image/catalog/x.jpg' / '/image/catalog/x.jpg' → 'catalog/x.jpg' (decoded)"""
    path = urlsplit(ref if "//" in ref else "https://x/" + ref.lstrip("/")).path
    return re.sub(r"^/?image/", "", unquote(path))


def candidates(rel: str) -> list[str]:
    """the path itself, then — for a resized cache/ copy — its catalog original (same rule as the image redirect)"""
    out = [rel]
    if rel.startswith("cache/"):
        original = re.sub(r"-\d+x\d+[a-z]?(?=\.[A-Za-z0-9]+$)", "", rel[len("cache/"):])
        stem, _, _ext = original.rpartition(".")
        out += [original] + [f"{stem}.{e}" for e in ("jpg", "jpeg", "png", "webp", "JPG", "PNG")]
    return list(dict.fromkeys(c for c in out if c))


def source_urls(rel: str) -> list[str]:
    return [OLD_IMAGE_BASE + quote(c) for c in candidates(rel)] + [f"opencart:image/{c}" for c in candidates(rel)]


def download(rel: str, timeout: float = 30) -> tuple[bytes, str] | None:
    req = urllib.request.Request(OLD_IMAGE_BASE + quote(rel), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            mime = (r.headers.get_content_type() or "").lower()
            body = r.read()
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return None
    if not mime.startswith("image/"):
        mime = mimetypes.guess_type(rel)[0] or ""
    return (body, mime) if body and mime.startswith("image/") else None


def exists(rel: str) -> bool:
    req = urllib.request.Request(OLD_IMAGE_BASE + quote(rel), method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def primary_key(db, table: str) -> str | None:
    return db.execute(text(
        "select kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu"
        " on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema"
        " where tc.constraint_type = 'PRIMARY KEY' and tc.table_name = :t limit 1"), {"t": table}).scalar()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="download missing images and rewrite the content")
    ap.add_argument("--check", action="store_true", help="dry run: also ask the old shop which images exist")
    ap.add_argument("--only", action="append", help="table.column to process (repeatable)")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    db = SessionLocal()
    rows: list[tuple[str, str, str, str, str]] = []  # table, column, pk column, pk value, text
    refs: dict[str, str] = {}  # reference as written → relative path
    uses: Counter = Counter()
    for table, column in SOURCES:
        if args.only and f"{table}.{column}" not in args.only:
            continue
        key = primary_key(db, table)
        if not key or not db.execute(text("select 1 from information_schema.columns where table_name=:t and column_name=:c"),
                                     {"t": table, "c": column}).first():
            continue
        q = text(f'select "{key}"::text, "{column}"::text from "{table}" where "{column}" ~* :pat')
        for pk, val in db.execute(q, {"pat": r"moharaz\.com/image/|image/(catalog|cache|data)/"}):
            hit = False
            for m in OLD_IMG.finditer(val):
                ref = m.group(0).rstrip(".,;")
                rel = rel_path(ref)
                if not IMG_EXT.search(rel):
                    continue  # a link to an old page/folder, not an image
                refs[ref] = rel
                uses[f"{table}.{column}"] += 1
                hit = True
            if hit:
                rows.append((table, column, key, pk, val))

    rels = sorted(set(refs.values()))
    # already in the media library?
    known: dict[str, str] = {}
    for rel in rels:
        m = db.query(Media).filter(Media.source_url.in_(source_urls(rel)), Media.url.isnot(None)).order_by(Media.created_at).first()
        if m:
            known[rel] = m.url
    todo = [r for r in rels if r not in known]
    print(f"rows with old-shop images: {len(rows)} · references: {sum(uses.values())} · unique images: {len(rels)}")
    for k, n in uses.most_common():
        print(f"  {n:6}  {k}")
    print(f"already in the media library: {len(known)} · to download from the old shop: {len(todo)}")

    if not args.apply:
        if args.check and todo:
            with ThreadPoolExecutor(args.workers) as pool:
                ok = list(pool.map(exists, todo))
            missing = [r for r, o in zip(todo, ok) if not o]
            print(f"old shop has {len(todo) - len(missing)} of them; missing (404, left as they are): {len(missing)}")
            for r in missing[:30]:
                print("   ", r)
        for r in todo[:10]:
            print("  e.g.", OLD_IMAGE_BASE + r)
        print("dry run — nothing written (--apply to write)")
        return

    # download the missing ones in parallel, store them one by one (one session)
    with ThreadPoolExecutor(args.workers) as pool:
        fetched = dict(zip(todo, pool.map(download, todo)))
    from scripts.opencart_common import store_image_bytes

    missing: list[str] = []
    for rel, got in fetched.items():
        if not got:
            missing.append(rel)
            continue
        body, mime = got
        media = store_image_bytes(db, rel, body, mime, source_url=OLD_IMAGE_BASE + quote(rel), folder=FOLDER)
        media.imported_by = "content-images"
        known[rel] = media.url
    db.commit()
    print(f"stored {len(fetched) - len(missing)} new images · missing on the old shop: {len(missing)}")

    # rewrite every use (longest reference first, so a reference that contains another is replaced whole)
    changed: Counter = Counter()
    order = sorted(refs, key=len, reverse=True)
    for table, column, key, pk, val in rows:
        new = val
        for ref in order:
            if ref in new and refs[ref] in known:
                new = new.replace(ref, known[refs[ref]])
        if new != val:
            db.execute(text(f'update "{table}" set "{column}" = :v where "{key}"::text = :pk'), {"v": new, "pk": pk})
            changed[f"{table}.{column}"] += 1
    db.commit()
    print("rows rewritten:", dict(changed))
    if missing:
        print("left as they are (the old shop has no such file):")
        for r in missing:
            print("   ", OLD_IMAGE_BASE + r)


if __name__ == "__main__":
    sys.exit(main())
