"""Broken-link audit of everything the storefront shows (read only — changes nothing).

Scans the content columns visitors see (product / category / blog descriptions, menus, homepage, page builder,
collections, spec values, SEO images, approved reviews) for links: href/src attributes, JSON href/url/image
fields and bare http(s) URLs. Each unique link is classified and checked over HTTP, following redirects by hand:

  int-page  a page of this shop  (relative "/x", or an absolute URL on --own-host) → checked on --base (the storefront)
  int-img   an image of this shop                                                  → checked on --base
  ext-page  another site's page                                                    → checked directly (--external)
  ext-img   another site's image                                                   → checked directly (--external)

Result: a CSV, one row per (link, place it is used): verdict, status, final URL, redirect hops, and where —
table, column, row id and the row's slug/name, so the admin can find it.

  verdict  ok          answers 200 directly
           redirect    answers 200 after 301/302 — works, but the link should point at the final URL (SEO)
           broken      404 / 410 / other 4xx-5xx, or the host does not exist
           unsure      timeout, 403/429 bot blocking, TLS errors — open it in a browser before acting

Run in the api container (the storefront must be reachable from it):

  python -m scripts.audit_links --base http://host.docker.internal:3000 --out /tmp/links.csv
  python -m scripts.audit_links --base https://www.moharaz.com --external --out /tmp/links-live.csv
  python -m scripts.audit_links --base … --only int-page --limit 200          # quick sample
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import ssl
import sys
import threading
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urljoin, urlsplit

from sqlalchemy import text

from app.database import SessionLocal

# (table, column, filter) — what visitors can see. Spam / pending reviews, order notes, import provenance
# (media.source_url) and the like are left out on purpose.
SOURCES = [
    ("ecommerce_items", "full_description", "publish_status in ('published','hidden')"),
    ("catalog_categories", "description", "is_active"),
    ("catalog_brands", "description", "is_active"),
    ("blog_posts", "content", None),
    ("blog_categories", "description", None),
    ("website_menus", "items_json", None),
    ("website_homepage", "content_json", None),
    ("website_builder_documents", "document_json", None),
    ("website_pages", "body_html", None),
    ("catalog_collections", "hero_image_url", None),
    ("catalog_product_attribute_values", "value", None),
    ("seo_meta_records", "og_image", None),
    ("catalog_product_reviews", "body", "status = 'approved'"),
]
# a human handle for a row, per table (first column that exists)
LABEL_COLS = ["slug", "code", "name", "title", "product_id"]

ATTR = re.compile(r"""\b(href|src)\s*=\s*(?:\\?"([^"\\]*)\\?"|'([^']*)')""", re.I)
JSONF = re.compile(r""""(href|url|link|image|image_url|src)"\s*:\s*"([^"]+)\"""", re.I)
BARE = re.compile(r"""https?://[^\s"'<>\\)]+""", re.I)
IMG = re.compile(r"\.(jpe?g|png|gif|webp|svg|avif)(\?|$)", re.I)
SKIP = ("#", "mailto:", "tel:", "javascript:", "data:", "whatsapp:", "sms:")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36"


def table_columns(db, table: str) -> set[str]:
    return {r[0] for r in db.execute(text("select column_name from information_schema.columns where table_name=:t"), {"t": table})}


def primary_key(db, table: str) -> str | None:
    return db.execute(text(
        "select kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu"
        " on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema"
        " where tc.constraint_type = 'PRIMARY KEY' and tc.table_name = :t limit 1"), {"t": table}).scalar()


def collect(db) -> dict[tuple[str, str], list[dict]]:
    """(group, link) → the places it is used"""
    found: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for table, column, where in SOURCES:
        cols = table_columns(db, table)
        if column not in cols:
            continue
        label = next((c for c in LABEL_COLS if c in cols and c != column), None)
        key = primary_key(db, table)
        sql = f'select {f"{key}::text" if key else "null"}, {f"{label}::text" if label else "null"}, "{column}"::text from "{table}" where "{column}" is not null'
        if where:
            try:
                db.execute(text(f'select 1 from "{table}" where {where} limit 1'))
                sql += f" and ({where})"
            except Exception:
                db.rollback()
        for rid, name, val in db.execute(text(sql)):
            links: set[tuple[str, str]] = set()
            for m in ATTR.finditer(val):
                link = (m.group(2) if m.group(2) is not None else (m.group(3) or "")).strip()
                if link:
                    links.add((link, m.group(1).lower()))
            for m in JSONF.finditer(val):
                link = m.group(2).strip()
                if link.startswith(("/", "http")):
                    links.add((link, "src" if m.group(1).lower() in ("image", "image_url", "src") else "href"))
            for m in BARE.finditer(val):
                link = m.group(0).rstrip(".,;")
                if not any(link == x for x, _ in links):
                    links.add((link, "url"))
            for link, kind in links:
                c = classify(link, kind)
                if c:
                    found[c].append({"table": table, "column": column, "row": rid, "name": name or ""})
    return found


# the shop's own pages: bare domain, www. and the old new. host — not media.moharaz.com (the R2 media bucket)
OWN_HOST = re.compile(r"^(?:www\.|new\.)?moharaz\.com$", re.I)


def classify(link: str, kind: str) -> tuple[str, str] | None:
    l = link.strip()
    if not l or l.startswith(SKIP):
        return None
    if l.startswith("//"):
        l = "https:" + l
    img = kind == "src" or bool(IMG.search(l))
    if l.startswith("/") or not re.match(r"^[a-z][a-z0-9+.-]*:", l, re.I):
        return ("int-img" if img else "int-page"), l if l.startswith("/") else "/" + l
    u = urlsplit(l)
    if OWN_HOST.search(u.hostname or ""):
        return ("int-img" if img else "int-page"), (u.path or "/") + (f"?{u.query}" if u.query else "")
    return ("ext-img" if img else "ext-page"), l


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # handle redirects ourselves, to record the hops
        return None


_ctx = ssl.create_default_context()
_opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=_ctx))


def fetch(url: str, timeout: float) -> dict:
    hops = []
    for _ in range(7):
        try:
            req = urllib.request.Request(quote(url, safe=":/?&=%#+,;@!$'()*[]~"), headers={"User-Agent": UA, "Accept": "text/html,image/*,*/*"})
            with _opener.open(req, timeout=timeout) as r:
                return {"status": r.status, "final": url, "hops": hops}
        except urllib.error.HTTPError as e:
            loc = e.headers.get("Location")
            if 300 <= e.code < 400 and loc:
                hops.append(e.code)
                url = urljoin(url, loc)
                continue
            return {"status": e.code, "final": url, "hops": hops}
        except Exception as e:  # DNS, timeout, TLS, reset
            return {"status": 0, "final": url, "hops": hops, "error": type(getattr(e, "reason", e)).__name__ + ": " + str(getattr(e, "reason", e))[:80]}
    return {"status": -1, "final": url, "hops": hops, "error": "redirect loop"}


def verdict(r: dict) -> str:
    s = r["status"]
    if s == 200:
        return "redirect" if r["hops"] else "ok"
    if s in (403, 429, 999) or (s == 0 and "gaierror" not in r.get("error", "") and "Name or service" not in r.get("error", "")):
        return "unsure"
    return "broken"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, help="the storefront to check this shop's links on, e.g. http://host.docker.internal:3000")
    ap.add_argument("--external", action="store_true", help="also check links to other sites")
    ap.add_argument("--only", choices=["int-page", "int-img", "ext-page", "ext-img"], action="append")
    ap.add_argument("--limit", type=int, default=0, help="check at most N links per group (a sample)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--timeout", type=float, default=25)
    ap.add_argument("--out", default="/tmp/link_audit.csv")
    args = ap.parse_args()

    db = SessionLocal()
    found = collect(db)
    groups = args.only or ["int-page", "int-img"] + (["ext-page", "ext-img"] if args.external else [])
    todo = [k for k in found if k[0] in groups]
    if args.limit:
        per = Counter()
        todo = [k for k in todo if (per.update([k[0]]) or per[k[0]] <= args.limit)]
    print(f"{len(todo)} unique links to check ({', '.join(f'{g}: {sum(1 for k in todo if k[0] == g)}' for g in groups)})", flush=True)

    results: dict[tuple[str, str], dict] = {}
    lock, done = threading.Lock(), [0]

    def work(key):
        group, link = key
        url = urljoin(args.base.rstrip("/") + "/", link.lstrip("/")) if group.startswith("int") else link
        r = fetch(url, args.timeout)
        with lock:
            results[key] = r
            done[0] += 1
            if done[0] % 250 == 0:
                print(f"  {done[0]}/{len(todo)}", flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, todo))

    tally: Counter = Counter()
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["verdict", "group", "link", "status", "final_url", "hops", "error", "uses", "table", "column", "row_id", "row_slug_or_name"])
        for key in sorted(todo, key=lambda k: (verdict(results[k]), k)):
            r, v = results[key], verdict(results[key])
            tally[(key[0], v)] += 1
            for place in found[key]:
                w.writerow([v, key[0], key[1], r["status"], r["final"], "+".join(map(str, r["hops"])), r.get("error", ""),
                            len(found[key]), place["table"], place["column"], place["row"], place["name"]])
    print(json.dumps({f"{g} {v}": n for (g, v), n in sorted(tally.items())}, indent=1))
    print("report:", args.out)


if __name__ == "__main__":
    sys.exit(main())
