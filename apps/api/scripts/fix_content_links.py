"""Fix the links inside content the shop shows: broken links removed, moved links pointed at their page.

Works on the HTML content columns (product / category / brand descriptions, blog, pages). Every <a href> and
<img src> is resolved the way the storefront would answer it — in-process, no page rendering:

  this shop's pages   "/" and the shop's own routes · /{slug} = product, category, brand (catalog) · a brand inside a
                      category (/hp-monitor) · /blog/{slug}, /bundles/{slug}, /brand/{slug} · old keywords and
                      index.php links (admin: SEO → Redirects) · old category-path URLs (/pc-components/ssd/x → /x)
  this shop's images  /uploads/… (media library) · old /image/… files that were imported (Media.source_url)
  other sites         with --external: fetched; only a 404/410 or a host that does not exist counts as broken
                      (403/429/timeouts are bot blocking or the network — left alone)

Actions (with --apply):
  broken link   <a href="x">text</a> → text            (the words stay, the link goes)
  broken image  <img src="x" …> → removed
  moved link    href → the page it ends on, relative ("/x"); an absolute link to this shop's own domain becomes
                relative too, so it keeps working whatever domain the shop runs on
  parent        an old category path whose page is gone → its nearest parent category that exists
  JSON content (menus, homepage, page builder) is reported only — fix those in the admin.

Dry run by default: prints counts and samples, writes a CSV of every finding (--report). Back up before --apply.

    python -m scripts.fix_content_links                         # dry run, this shop's links only
    python -m scripts.fix_content_links --external              # … and other sites' links (slow: fetches them)
    python -m scripts.fix_content_links --external --apply
"""

from __future__ import annotations

import argparse
import csv
import html
import re
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, unquote, urlsplit

from sqlalchemy import text

import scripts.init_db  # noqa: F401 — registers every model (relationships resolve by name)
from app.database import SessionLocal
from app.models.blog_category import BlogCategory
from app.models.blog_post import BlogPost
from app.models.catalog_bundle import CatalogBundle
from app.models.media import Media
from app.models.seo_redirect import SeoRedirect
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService
from app.services.seo.legacy_urls import legacy_key

# the shop's own pages: the bare domain, www. and the old new. host — NOT other subdomains: media.moharaz.com is
# the R2 media bucket (product and content images) and must never be taken for an old-shop page
OWN_HOST = re.compile(r"^(?:www\.|new\.)?moharaz\.com$", re.I)
OLD_IMAGE_BASE = "https://www.moharaz.com/image/"

# HTML content that is edited (table, column); JSON content is only reported
HTML_SOURCES = [
    ("ecommerce_items", "full_description"),
    ("catalog_products", "description"),
    ("ecommerce_items", "short_description"),
    ("catalog_products", "short_description"),
    ("catalog_categories", "description"),
    ("catalog_brands", "description"),
    ("blog_posts", "content"),
    ("blog_categories", "description"),
    ("website_pages", "body_html"),
]
JSON_SOURCES = [("website_menus", "items_json"), ("website_homepage", "content_json"), ("website_builder_documents", "document_json")]

# the storefront's own pages (frontend/src/app) and the renames next.config.ts redirects
STATIC = {
    "", "all", "brand", "blog", "bundles", "bundles/create", "cart", "checkout", "compare", "account", "login", "register",
    "about-us", "contact-us", "emi", "help", "privacy-policy", "refund", "shipping", "terms-conditions",
    "warranty", "pc-builder", "pc-builder/print", "sitemap.xml", "robots.txt",
}
RENAMED = {"about": "/about-us", "terms": "/terms-conditions", "privacy": "/privacy-policy",
           "contact": "/contact-us", "brands": "/brand"}

# the innermost <a>…</a>: copied markup nests links (<a href="/"><a href="https://shop/">…), so the text part may
# not hold another <a — each link is then matched on its own
A_TAG = re.compile(r"""<a\b[^>]*?\bhref\s*=\s*(["'])((?:(?!\1).)*)\1[^>]*>((?:(?!<a\b).)*?)</a\s*>""", re.I | re.S)
# the rich-text editor's hidden copy of a link (data-mce-href / data-mce-src): it wins when the text is saved again
# in the editor, so an old absolute own-domain copy is made relative too
MCE = re.compile(r"""\b(data-mce-(?:href|src))\s*=\s*(["'])(?:https?:)?//(?:www\.)?moharaz\.com(/[^"']*)?\2""", re.I)
IMG_TAG = re.compile(r"""<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1[^>]*>""", re.I | re.S)
JSON_LINK = re.compile(r""""(?:href|url|link|image|image_url|src)"\s*:\s*"([^"]+)\"""", re.I)
SKIP = ("#", "mailto:", "tel:", "javascript:", "data:", "whatsapp:", "sms:")


class Resolver:
    def __init__(self, db):
        self.db = db
        self.svc = StorefrontCatalogService(db)
        self.cache: dict[str, tuple[str, str | None]] = {}

    # ---- this shop's pages ----
    def slug_ok(self, slug: str) -> bool:
        if not slug:
            return False
        if slug == "all" or slug in STATIC:
            return True
        return self.svc.resolve_slug(slug) is not None

    def redirect(self, path: str) -> str | None:
        row = self.db.query(SeoRedirect).filter(SeoRedirect.from_path == legacy_key(path), SeoRedirect.status == "active",
                                                SeoRedirect.to_path.isnot(None)).first()
        return row.to_path if row else None

    def brand_in_category(self, slug: str) -> bool:
        parts = slug.split("-")
        for i in range(1, len(parts)):
            b, c = self.svc.resolve_slug("-".join(parts[:i])), self.svc.resolve_slug("-".join(parts[i:]))
            if b and c and b.get("type") == "brand" and c.get("type") == "category":
                return True
        return False

    def page(self, path_q: str) -> tuple[str, str | None]:
        """→ ("ok"|"moved"|"broken", the path to use when moved)"""
        if path_q in self.cache:
            return self.cache[path_q]
        out = self._page(path_q)
        self.cache[path_q] = out
        return out

    def _page(self, path_q: str) -> tuple[str, str | None]:
        u = urlsplit(path_q)
        path = unquote(u.path or "/")
        query = f"?{u.query}" if u.query else ""
        if path.lower().rstrip("/") in ("/index.php", "index.php"):
            to = self.redirect(f"/index.php{query}")
            return ("moved", to) if to else ("broken", None)
        segs = [s for s in path.strip().strip("/").lower().split("/") if s]
        if not segs:
            return ("ok", None)
        joined = "/".join(segs)
        if joined in STATIC:
            return ("ok", None)
        if len(segs) == 1 and segs[0] in RENAMED:
            return ("moved", RENAMED[segs[0]] + query)
        if len(segs) == 2 and segs[0] in ("category", "product", "brands", "brand"):
            return ("moved" if segs[0] != "brand" else "ok", f"/{segs[1]}{query}") if self.slug_ok(segs[1]) else ("broken", None)
        if len(segs) == 2 and segs[0] == "blog":
            ok = self.db.query(BlogPost.id).filter(BlogPost.slug == segs[1]).first() or self.db.query(BlogCategory.id).filter(BlogCategory.slug == segs[1]).first()
            return ("ok", None) if ok else ("broken", None)
        if len(segs) == 2 and segs[0] == "bundles":
            return ("ok", None) if self.db.query(CatalogBundle.id).filter(CatalogBundle.slug == segs[1]).first() else ("broken", None)
        last = segs[-1]
        if self.slug_ok(last):
            return ("ok", None) if len(segs) == 1 and path == f"/{last}" else ("moved", f"/{last}{query}")
        to = self.redirect(f"/{joined}") or self.redirect(f"/{last}")
        if to:
            return ("moved", to)
        if self.brand_in_category(last):
            return ("ok", None) if len(segs) == 1 else ("moved", f"/{last}{query}")
        # an old category path whose page is gone: the nearest parent that still exists keeps the link useful
        # (/pc-components/intel-motherboard/asus-intel → /intel-motherboard)
        for parent in reversed(segs[:-1]):
            if parent not in STATIC and self.slug_ok(parent):
                return ("parent", f"/{parent}")
        return ("broken", None)

    # ---- this shop's images ----
    def image(self, path: str) -> tuple[str, str | None]:
        key = "img:" + path
        if key in self.cache:
            return self.cache[key]
        p = unquote(urlsplit(path).path)
        out: tuple[str, str | None] = ("broken", None)
        if p.startswith("/uploads/"):
            hit = self.db.query(Media.id).filter(Media.url.like(f"%{p}")).first()
            out = ("ok", None) if hit else ("broken", None)
        elif re.match(r"^/?image/", p):
            rel = re.sub(r"^/?image/", "", p)
            cands = [rel]
            if rel.startswith("cache/"):
                orig = re.sub(r"-\d+x\d+[a-z]?(?=\.[A-Za-z0-9]+$)", "", rel[len("cache/"):])
                stem = orig.rpartition(".")[0]
                cands += [orig] + [f"{stem}.{e}" for e in ("jpg", "jpeg", "png", "webp", "JPG", "PNG")]
            m = self.db.query(Media).filter(Media.source_url.in_([OLD_IMAGE_BASE + quote(c) for c in cands])).first()
            out = ("moved", m.url) if m and m.url else ("broken", None)
        self.cache[key] = out
        return out


def classify(link: str) -> tuple[str, str] | None:
    """→ ("own", path+query) | ("ext", url) | None (anchors, mailto, …)"""
    l = html.unescape(link or "").strip()  # an href holds "&amp;" for "&"
    if not l or l.lower().startswith(SKIP):
        return None
    if l.startswith("//"):
        l = "https:" + l
    # typos the old editor let through: a doubled scheme ("http://hTtPs://www.shop/…") → the last URL in it
    doubled = list(re.finditer(r"https?://", l, re.I))
    if len(doubled) > 1:
        l = l[doubled[-1].start():]
    if re.match(r"^[a-z][a-z0-9+.-]*:", l, re.I):
        u = urlsplit(l)
        if not u.scheme.lower().startswith("http"):
            return None
        # a "host" without a dot is a slug typed as a URL ("http://royal-kludge-rk-g87-…") → this shop's page
        if u.hostname and "." not in u.hostname and u.hostname != "localhost":
            return ("own", f"/{u.hostname}{u.path or ''}" + (f"?{u.query}" if u.query else ""))
        if OWN_HOST.search(u.hostname or ""):
            return ("own", (u.path or "/") + (f"?{u.query}" if u.query else ""))
        return ("ext", l)
    return ("own", l if l.startswith("/") else "/" + l)


def external_broken(urls: list[str], workers: int) -> dict[str, tuple[bool, str]]:
    """url → (definitely broken, why) — 404/410 or a host that does not exist"""
    from scripts.audit_links import fetch

    def one(u):
        r = fetch(u, 25)
        s, err = r["status"], r.get("error", "")
        if s in (404, 410):
            return u, (True, str(s))
        if s == 0 and ("gaierror" in err or "Name or service not known" in err or "No address" in err):
            return u, (True, "host not found")
        return u, (False, str(s or err))

    with ThreadPoolExecutor(workers) as pool:
        return dict(pool.map(one, urls))


def primary_key(db, table: str) -> str | None:
    return db.execute(text(
        "select kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu"
        " on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema"
        " where tc.constraint_type = 'PRIMARY KEY' and tc.table_name = :t limit 1"), {"t": table}).scalar()


def has_column(db, table: str, column: str) -> bool:
    return bool(db.execute(text("select 1 from information_schema.columns where table_name=:t and column_name=:c"), {"t": table, "c": column}).first())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--external", action="store_true", help="also check (and remove broken) links to other sites")
    ap.add_argument("--keep-moved", action="store_true", help="do not rewrite moved links, only remove broken ones")
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--report", default="/tmp/content_links.csv")
    args = ap.parse_args()

    db = SessionLocal()
    res = Resolver(db)

    # 1) read content, collect links
    rows = []
    for table, column in HTML_SOURCES:
        if not has_column(db, table, column):
            continue
        key = primary_key(db, table)
        for pk, val in db.execute(text(f'select "{key}"::text, "{column}"::text from "{table}" where "{column}" ~* \'<a |<img \'')):
            rows.append((table, column, key, pk, val))
    ext_urls = set()
    for *_, val in rows:
        for m in list(A_TAG.finditer(val)) + list(IMG_TAG.finditer(val)):
            c = classify(m.group(2))
            if c and c[0] == "ext":
                ext_urls.add(c[1])
    ext = external_broken(sorted(ext_urls), args.workers) if args.external else {}

    def decide(link: str, is_img: bool) -> tuple[str, str | None, str]:
        c = classify(link)
        if not c:
            return ("skip", None, "")
        kind, target = c
        if kind == "ext":
            if target in ext and ext[target][0]:
                return ("broken", None, ext[target][1])
            return ("ok", None, "")
        verdict, to = res.image(target) if is_img else res.page(target)
        if verdict == "ok" and link.strip() != target:  # absolute link to the own domain → relative
            return ("moved", target, "own domain → relative")
        return (verdict, to, "")

    # 2) plan the edits
    findings = []
    tally: Counter = Counter()
    new_vals = {}
    for table, column, key, pk, val in rows:
        def fix_a(m):
            verdict, to, why = decide(m.group(2), False)
            if verdict in ("ok", "skip"):
                return m.group(0)
            findings.append((verdict, "link", m.group(2), to or "", why, table, column, pk))
            tally[("link", verdict)] += 1
            if verdict == "broken":
                return m.group(3)  # keep the words, drop the link
            if args.keep_moved:
                return m.group(0)
            q = m.group(1)
            return m.group(0).replace(f"href={q}{m.group(2)}{q}", f"href={q}{to}{q}", 1)

        def fix_img(m):
            verdict, to, why = decide(m.group(2), True)
            if verdict in ("ok", "skip"):
                return m.group(0)
            findings.append((verdict, "image", m.group(2), to or "", why, table, column, pk))
            tally[("image", verdict)] += 1
            if verdict == "broken":
                return ""
            if args.keep_moved:
                return m.group(0)
            q = m.group(1)
            return m.group(0).replace(f"src={q}{m.group(2)}{q}", f"src={q}{to}{q}", 1)

        new = IMG_TAG.sub(fix_img, val)
        new = A_TAG.sub(fix_a, new)
        new2 = MCE.sub(lambda m: f"{m.group(1)}={m.group(2)}{m.group(3) or '/'}{m.group(2)}", new)
        if new2 != new:
            tally[("editor copy", "moved")] += 1
            new = new2
        if new != val:
            new_vals[(table, column, key, pk)] = new

    # JSON content: report only
    for table, column in JSON_SOURCES:
        if not has_column(db, table, column):
            continue
        key = primary_key(db, table)
        for pk, val in db.execute(text(f'select "{key}"::text, "{column}"::text from "{table}"')):
            for m in JSON_LINK.finditer(val or ""):
                link = m.group(1)
                is_img = bool(re.search(r"\.(jpe?g|png|gif|webp|svg|avif)(\?|$)", link, re.I))
                verdict, to, why = decide(link, is_img)
                if verdict in ("broken", "moved", "parent"):
                    findings.append((verdict + " (fix in admin)", "image" if is_img else "link", link, to or "", why, table, column, pk))
                    tally[("json", verdict)] += 1

    with open(args.report, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["verdict", "what", "link", "new_link", "why", "table", "column", "row_id"])
        w.writerows(sorted(findings))

    per_col = Counter(f"{t}.{c}" for (t, c, _k, _p) in new_vals)
    print(f"html rows with links: {len(rows)} · external links checked: {len(ext)}")
    for (what, verdict), n in sorted(tally.items()):
        print(f"  {what:6} {verdict:8} {n}")
    print("rows to change:", dict(per_col))
    print("report:", args.report)
    samples = defaultdict(list)
    for v, what, link, to, why, t, c, pk in findings:
        if len(samples[(what, v)]) < 4:
            samples[(what, v)].append(f"{link[:90]}  →  {to[:60] or '(removed)'}  {why}")
    for k, v in samples.items():
        print(" ", k)
        for x in v:
            print("     ", x)

    if not args.apply:
        print("dry run — nothing written (--apply to write)")
        return
    for (table, column, key, pk), new in new_vals.items():
        db.execute(text(f'update "{table}" set "{column}" = :v where "{key}"::text = :pk'), {"v": new, "pk": pk})
    db.commit()
    print("written:", dict(per_col))


if __name__ == "__main__":
    sys.exit(main())
