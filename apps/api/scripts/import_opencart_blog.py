"""Blog of the previous Moharaz shop (Journal3) → AgainERP blog (docs/DATA_MIGRATION.md, step 12).

Writes blog_categories / blog_posts / blog_post_products / blog_comments (admin: Website → Blog):
- posts keep their slug (= the live URL /blog/{keyword}), title, HTML, SEO title / description, dates;
  excerpt = meta description, else the start of the text; author "Moharaz" (the dump has no names)
- images: the cover and every <img> in the HTML become media (from the old shop's image/ folder, or
  decoded when the post embeds them as base64) and the HTML points at the stored files
- links to www.moharaz.com pages become site-relative, so they open on the new shop
- products a post features → blog_post_products (when the product was imported)
- comments: 110 of the 111 are link spam (generic praise + a backlink) → "spam"; the rest → "approved"
--replace-demo removes the seeded demo blog (posts, comments, categories without "oc-" ids) first.

Ids: oc-blog-{post_id}, oc-blogcat-{category_id}, oc-blogcomment-{comment_id}; re-runs update posts in place.
Input: oc_blog.jsonl (JSON_OBJECT rows of ac_journal3_blog_* from the OpenCart dump, step 12).
Usage (api container):
    python -m scripts.import_opencart_blog /tmp/oc_blog.jsonl --image-dir /import/image --replace-demo
    (without --image-dir the images are downloaded from the old shop, e.g. inside the Railway api service)
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import re
from collections import Counter
from datetime import datetime

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model
from app.database import SessionLocal
from app.models.blog_category import BlogCategory
from app.models.blog_category_post import BlogCategoryPost
from app.models.blog_comment import BlogComment
from app.models.blog_post import BlogPost
from app.models.blog_post_product import BlogPostProduct
from app.models.media import Media
from scripts.import_opencart_product_details import fetch, read_local
from scripts.opencart_common import COMPANY_ID, DEFAULT_IMAGE_SOURCE, image_url, store_image_bytes

AUTHOR = "Moharaz"
LIVE = re.compile(r"https?://(?:www\.)?moharaz\.com", re.I)
SPAM = re.compile(r"https?://|www\.|\[url|viagra|cialis|casino|porn|loan|crypto|backlink", re.I)
IMG_SRC = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', re.I)
DATA_URI = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,(.+)$", re.I | re.S)


def _dt(raw: str | None) -> datetime | None:
    if not raw or raw.startswith("0000"):
        return None
    return datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S")


def _plain(markup: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup or ""))).strip()


def _excerpt(meta: str | None, body: str | None) -> str:
    text_ = _plain(meta) or _plain(body)
    return text_ if len(text_) <= 220 else text_[:217].rsplit(" ", 1)[0] + "…"


class Images:
    """Stores each image once (keyed by its live URL, or a hash for embedded ones) and returns its URL."""

    def __init__(self, db, image_dir: str | None, stats: Counter):
        self.db, self.stats = db, stats
        # a copy of the old shop's image/ folder, else download from the old shop (it is still online)
        self.read = read_local(image_dir, DEFAULT_IMAGE_SOURCE) if image_dir else fetch
        self.cache: dict[str, str | None] = {}

    def _existing(self, source: str) -> str | None:
        m = self.db.query(Media).filter(Media.source_url == source).first()
        return m.url if m else None

    def from_path(self, rel: str, alt: str) -> str | None:
        rel = rel.strip()
        if not rel:
            return None
        source = rel if rel.startswith("http") else image_url(rel)
        if source in self.cache:
            return self.cache[source]
        url = self._existing(source)
        if not url:
            _, content, mime, err = self.read(source)
            if err:
                self.stats[f"image missing ({err})"] += 1
                url = None
            else:
                url = store_image_bytes(self.db, source.rsplit("/", 1)[-1], content, mime, source_url=source,
                                        alt=alt, folder="Blog").url
                self.stats["images stored"] += 1
        self.cache[source] = url
        return url

    def from_data_uri(self, uri: str, alt: str, name: str) -> str | None:
        m = DATA_URI.match(uri)
        if not m:
            return None
        mime, payload = m.group(1).lower(), re.sub(r"\s+", "", m.group(2))
        content = base64.b64decode(payload)
        source = f"opencart-blog-embedded:{hashlib.sha1(content).hexdigest()}"
        url = self._existing(source)
        if not url:
            ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(mime, "img")
            url = store_image_bytes(self.db, f"{name}.{ext}", content, mime, source_url=source, alt=alt, folder="Blog").url
            self.stats["embedded images stored"] += 1
        return url


def _rewrite_html(body: str, images: Images, title: str, slug: str) -> str:
    n = Counter()

    def img(m: re.Match) -> str:
        src = html.unescape(m.group(2))
        if src.startswith("data:"):
            n["i"] += 1
            url = images.from_data_uri(src, title, f"{slug}-{n['i']}")
        else:
            rel = LIVE.sub("", src).lstrip("/")
            rel = rel[len("image/"):] if rel.startswith("image/") else rel
            url = images.from_path(rel, title) if rel.startswith("catalog/") else None
        return f"{m.group(1)}{url or src}{m.group(3)}"

    body = IMG_SRC.sub(img, body)
    # links to the old shop's pages → this shop (same paths; old ones are redirected)
    return re.sub(r'(href=")' + LIVE.pattern + r'/?', r"\1/", body, flags=re.I)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("blog_path")
    parser.add_argument("--image-dir", help="copy of the old shop's image/ folder; omitted: download from the old shop")
    parser.add_argument("--replace-demo", action="store_true")
    args = parser.parse_args()

    rows = [json.loads(line) for line in open(args.blog_path, encoding="utf-8") if line.strip()]
    db = SessionLocal()
    stats: Counter = Counter()

    if args.replace_demo:
        stats["demo comments removed"] = db.execute(text("DELETE FROM blog_comments WHERE id NOT LIKE 'oc-%'")).rowcount
        db.execute(text("DELETE FROM blog_post_products WHERE post_id NOT LIKE 'oc-%'"))
        db.execute(text("DELETE FROM blog_category_posts WHERE post_id NOT LIKE 'oc-%' OR category_id NOT LIKE 'oc-%'"))
        stats["demo posts removed"] = db.execute(text("DELETE FROM blog_posts WHERE id NOT LIKE 'oc-%'")).rowcount
        stats["demo categories removed"] = db.execute(text("DELETE FROM blog_categories WHERE id NOT LIKE 'oc-%'")).rowcount

    images = Images(db, args.image_dir, stats)
    products = {pid for (pid,) in db.execute(text("SELECT id FROM catalog_products WHERE id LIKE 'oc-prod-%'"))}

    cats: dict[int, BlogCategory] = {}
    for r in (x for x in rows if x["type"] == "category"):
        cid = f"oc-blogcat-{r['category_id']}"
        cat = db.get(BlogCategory, cid) or BlogCategory(id=cid, company_id=COMPANY_ID)
        cat.name = (r["name"] or "Blog")[:120]
        cat.slug = (r["keyword"] or f"blog-category-{r['category_id']}")[:120]
        cat.description = r.get("description") or None
        cat.status = "active" if r.get("status") else "inactive"
        cat.sort_order = r.get("sort_order") or 0
        cat.seo_title = (r.get("meta_title") or None) and r["meta_title"][:255]
        cat.seo_description = r.get("meta_description") or None
        db.add(cat)
        cats[r["category_id"]] = cat
        stats["categories"] += 1
    db.flush()

    posts: dict[int, BlogPost] = {}
    for r in (x for x in rows if x["type"] == "post"):
        pid = f"oc-blog-{r['post_id']}"
        title = _plain(r["name"]) or r["keyword"]
        post = db.get(BlogPost, pid) or BlogPost(id=pid, company_id=COMPANY_ID)
        post.title = title[:255]
        post.slug = r["keyword"][:255]
        post.content = _rewrite_html(r.get("description") or "", images, title, r["keyword"])
        post.excerpt = _excerpt(r.get("meta_description"), r.get("description"))
        post.status = "published" if r.get("status") else "draft"
        cat = next((cats[c] for c in (r.get("category_ids") or []) if c in cats), None)
        post.category_id = cat.id if cat else None
        post.category_name = cat.name if cat else None
        post.author_name = AUTHOR
        post.cover_image_url = images.from_path(r.get("image") or "", title)
        post.seo_title = (r.get("meta_title") or "").strip()[:255] or None
        post.seo_description = (r.get("meta_description") or "").strip() or None
        post.published_at = _dt(r.get("date_created"))
        if post.published_at:
            post.created_at = post.published_at
        post.updated_at = _dt(r.get("date_updated")) or post.published_at or datetime.utcnow()
        db.add(post)
        db.flush()
        posts[r["post_id"]] = post
        stats[f"posts {post.status}"] += 1

        db.query(BlogCategoryPost).filter(BlogCategoryPost.post_id == pid).delete(synchronize_session=False)
        for c in r.get("category_ids") or []:
            if c in cats:
                db.add(BlogCategoryPost(category_id=cats[c].id, post_id=pid, sort_order=r.get("sort_order") or 0))
        db.query(BlogPostProduct).filter(BlogPostProduct.post_id == pid).delete(synchronize_session=False)
        for i, prod in enumerate(r.get("product_ids") or []):
            if f"oc-prod-{prod}" in products:
                db.add(BlogPostProduct(post_id=pid, product_id=f"oc-prod-{prod}", sort_order=i))
                stats["post products"] += 1
            else:
                stats["post product not imported"] += 1

    db.query(BlogComment).filter(BlogComment.id.like("oc-blogcomment-%")).delete(synchronize_session=False)
    for r in (x for x in rows if x["type"] == "comment"):
        post = posts.get(r["post_id"])
        if not post:
            stats["comment of unknown post"] += 1
            continue
        body = html.unescape(r.get("comment") or "").strip()
        spam = bool((r.get("website") or "").strip() or SPAM.search(body))
        status = "spam" if spam else "approved" if r.get("status") else "pending"
        when = _dt(r.get("date")) or datetime.utcnow()
        db.add(BlogComment(
            id=f"oc-blogcomment-{r['comment_id']}",
            company_id=COMPANY_ID,
            post_id=post.id,
            article_title=post.title,
            author_name=(r.get("name") or "Guest")[:120],
            author_email=(r.get("email") or None) and r["email"][:255],
            body=body,
            status=status,
            parent_id=f"oc-blogcomment-{r['parent_id']}" if r.get("parent_id") else None,
            moderated_by="opencart-import",
            created_at=when,
            updated_at=when,
        ))
        stats[f"comments {status}"] += 1

    db.commit()
    db.close()
    print(json.dumps(dict(stats), indent=1))


if __name__ == "__main__":
    main()
