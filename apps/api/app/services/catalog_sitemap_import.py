"""Unlisted products from another shop's sitemap.xml: one product per URL, the title made from the URL.

The Unlisted list's "Import from sitemap" option: the admin gives a sitemap address (or pastes / uploads its XML when the shop
blocks our server), the URLs are read (a sitemap index is followed), and every address that is not a product we already have
becomes an UNLISTED product with
  - name       = the last part of the address, as a title ("asus-vivobook-15-x1504za" -> "Asus Vivobook 15 X1504ZA")
  - source_url = the address (also saved as its Price Compare link when the shop is a known competitor site)
  - price 0, no stock, no category / brand / images - those are filled later (AI import, live edit ...)
Nothing is requested from the product pages themselves; only the sitemap is read.
"""
from __future__ import annotations

import hashlib
import html
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

MAX_SITEMAP_FILES = 60  # a sitemap index is followed up to this many files
MAX_URLS = 200_000
MAX_BYTES = 40_000_000
RUN_BATCH = 100  # most URLs one /run call creates
USER_AGENT = "Mozilla/5.0 (compatible; MoharazCatalogBot/1.0; +info@moharaz.com)"
# product pages have a long hyphenated slug; short ones ("hair-dryer") are category pages
MIN_SLUG_HYPHENS = 3
SKIP_URL = re.compile(r"[?&](product_id|component_id|product_set_id|category_id|pc_id|tracking|offer_id|tag)=|/product/search|\.(jpe?g|png|webp|gif|pdf)(\?|$)", re.I)

_ACRONYMS = {
    "ssd", "hdd", "usb", "rgb", "led", "lcd", "ips", "cpu", "gpu", "ram", "ddr", "ddr3", "ddr4", "ddr5", "hdmi", "atx", "nvme", "pci",
    "pcie", "wifi", "ups", "cctv", "dvr", "nvr", "ip", "pc", "tv", "usb-c", "vga", "dp", "sata", "m2", "amd", "intel", "msi", "hp", "lg",
    "tp", "gsm", "lan", "poe", "oled", "qled", "4k", "2k", "fhd", "uhd", "ai", "ac", "dc", "pos", "sd", "fm", "ocr", "rj45",
}
_UNIT = re.compile(r"^(\d+(?:\.\d+)?)(gb|tb|mb|kb|w|kw|mah|hz|mm|cm|m|v|a|ah|mp|fps|rpm|ghz|mhz|inch|pcs|pin)$", re.I)
_ORDINAL = re.compile(r"^\d+(st|nd|rd|th)$", re.I)


def title_from_url(url: str) -> str:
    """'https://www.ryans.com/asus-vivobook-15-x1504za-core-i3-laptop' -> 'Asus Vivobook 15 X1504ZA Core I3 Laptop'."""
    path = urlparse(url).path.strip("/").split("/")[-1]
    path = re.sub(r"\.(html?|php|aspx?)$", "", path, flags=re.I)
    words: list[str] = []
    for tok in re.split(r"[-_+]+", path):
        tok = tok.strip()
        if not tok:
            continue
        low = tok.lower()
        unit = _UNIT.match(tok)
        if low in _ACRONYMS:
            words.append(tok.upper())
        elif unit:
            words.append(unit.group(1) + unit.group(2).upper() if unit.group(2).lower() != "inch" else unit.group(1) + '"')
        elif _ORDINAL.match(tok):
            words.append(low)
        elif re.search(r"\d", tok) and re.search(r"[a-z]", low):  # a model code: x1504za -> X1504ZA
            words.append(tok.upper())
        else:
            words.append(tok.capitalize())
    return " ".join(words)[:255]


def _check_public_host(url: str) -> None:
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise HTTPException(status_code=422, detail="Enter a full http(s) address of the sitemap, e.g. https://www.ryans.com/product-sitemap.xml")
    try:
        infos = socket.getaddrinfo(parts.hostname, None)
    except OSError:
        raise HTTPException(status_code=422, detail=f"Could not find the site {parts.hostname}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=422, detail="That address is not a public website")


def _blocked(res: httpx.Response, url: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=(
            f"{urlparse(url).netloc} did not give the sitemap to our server (HTTP {res.status_code}). Open the sitemap in your browser, "
            "save it as an .xml file (or copy its text) and use 'Upload / paste the XML' instead."
        ),
    )


def _locs(body: str) -> list[str]:
    return [html.unescape(u) for u in re.findall(r"<loc>\s*(.*?)\s*</loc>", body, re.S)]


def read_sitemap(url: str | None, xml: str | None, url_list: list[str] | None = None) -> list[str]:
    """Every page address of a sitemap (from its address, from XML text, or a ready list from an Excel / text file); a sitemap index is followed."""
    urls: list[str] = []
    if url_list:
        urls = [u.strip() for u in url_list if isinstance(u, str) and re.match(r"^https?://", u.strip())]
    elif xml and xml.strip():
        if "<sitemapindex" in xml:
            raise HTTPException(status_code=422, detail="This is a sitemap index (a list of other sitemaps). Use its address instead, or paste one of the sitemaps it lists.")
        urls = _locs(xml)
    elif url and url.strip():
        queue = [url.strip()]
        seen: set[str] = set()
        with httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/xml,text/xml,*/*"}, follow_redirects=True, timeout=60) as client:
            while queue and len(seen) < MAX_SITEMAP_FILES:
                current = queue.pop(0)
                if current in seen:
                    continue
                seen.add(current)
                _check_public_host(current)
                try:
                    res = client.get(current)
                except httpx.HTTPError as exc:
                    raise HTTPException(status_code=422, detail=f"Could not open {current}: {exc}")
                if res.status_code != 200:
                    raise _blocked(res, current)
                if len(res.content) > MAX_BYTES:
                    raise HTTPException(status_code=422, detail="The sitemap is too large")
                body = res.text
                if "<sitemapindex" in body:
                    queue += _locs(body)
                else:
                    urls += _locs(body)
                if len(urls) > MAX_URLS:
                    break
    else:
        raise HTTPException(status_code=422, detail="Give a sitemap address, its XML or a file of addresses")
    return list(dict.fromkeys(urls))[:MAX_URLS]


def _is_product_url(url: str) -> bool:
    if SKIP_URL.search(url):
        return False
    parts = urlparse(url)
    if parts.scheme not in ("http", "https"):
        return False
    slug = parts.path.strip("/")
    return bool(slug) and "/" not in slug and slug.count("-") >= MIN_SLUG_HYPHENS


def _product_id(url: str) -> str:
    return "src-" + hashlib.md5(url.encode()).hexdigest()[:16]


def _existing(db: Session, company_id: str, urls: list[str]) -> set[str]:
    have: set[str] = set()
    for i in range(0, len(urls), 2000):
        chunk = urls[i : i + 2000]
        rows = db.execute(
            text("SELECT source_url FROM catalog_products WHERE company_id = :c AND source_url = ANY(:u)"),
            {"c": company_id, "u": chunk},
        )
        have.update(r[0] for r in rows)
    return have


def preview(db: Session, company_id: str, url: str | None, xml: str | None, url_list: list[str] | None = None) -> dict[str, Any]:
    """What a sitemap holds: the addresses that would become new products, and how many were left out and why."""
    all_urls = read_sitemap(url, xml, url_list)
    candidates = [u for u in all_urls if _is_product_url(u)]
    have = _existing(db, company_id, candidates)
    new = [u for u in candidates if u not in have]
    host = urlparse(all_urls[0]).netloc if all_urls else ""
    return {
        "host": host,
        "total": len(all_urls),
        "notProduct": len(all_urls) - len(candidates),
        "alreadyHave": len(have),
        "newCount": len(new),
        "sample": [{"url": u, "title": title_from_url(u)} for u in new[:8]],
        "urls": new,
    }


def create_from_urls(db: Session, company_id: str, urls: list[str]) -> dict[str, int]:
    """Create one unlisted product per address (at most RUN_BATCH); addresses already imported are skipped."""
    from app.models.catalog_product import CatalogProduct
    from app.routers.catalog_products import _free_slug
    from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
    from app.services.inventory.inventory_item_service import InventoryItemService
    from app.services.items.catalog_item_bridge import ensure_default_variant
    from app.services.items.item_identity_service import ItemIdentityService
    from app.services.plugins import price_update_service as pus

    urls = [u for u in dict.fromkeys(urls) if _is_product_url(u)][:RUN_BATCH]
    have = _existing(db, company_id, urls)
    identity, inventory, ecommerce = ItemIdentityService(db), InventoryItemService(db), EcommerceItemService(db)
    sites = None
    created = skipped = failed = 0
    for url in urls:
        pid = _product_id(url)
        if url in have or db.get(CatalogProduct, pid):
            skipped += 1
            continue
        try:
            title = title_from_url(url) or pid
            product = CatalogProduct(id=pid, company_id=company_id, product_type="simple")
            db.add(product)
            product.name = title
            product.slug = _free_slug(db, re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:200] or pid, company_id)
            product.sku = "SRC-" + hashlib.md5(url.encode()).hexdigest()[:10].upper()
            product.source_url = url[:1000]
            product.status = "unlisted"
            product.visibility = "public"
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
            created += 1
        except Exception:  # noqa: BLE001 - one bad address must not stop the rest
            db.rollback()
            failed += 1
            continue
        # the Source column / Price Compare: save the address under the competitor site that owns it (when there is one)
        try:
            if sites is None:
                sites = pus.list_competitor_sites(db, company_id)
            host = urlparse(url).netloc.lower().removeprefix("www.")
            site = next((s for s in sites if (s.domain or "").lower().removeprefix("www.") == host), None)
            if site is not None:
                pus.set_manual_match(db, company_id=company_id, product_id=pid, competitor=site.id, url=url, verified=True, verified_by="sitemap import")
        except Exception:  # noqa: BLE001
            db.rollback()
    return {"created": created, "skipped": skipped, "failed": failed}
