"""Machine-readable product data a page carries besides its visible HTML.

Almost every store embeds the product for search engines or its own JavaScript, and that data
is more reliable than reading the rendered text — and on JavaScript-built stores (Next.js /
Nuxt / SPA: pickaboo.com, daraz.com.bd) it is the only place the price, gallery and
description exist in the downloaded HTML. Three layers, most trusted first:

1. schema.org Product / ProductGroup in JSON-LD (incl. @graph, offers / AggregateOffer);
2. embedded app state — __NEXT_DATA__, __NUXT__, <script type=application/json>,
   `window.__X__ = {...}`, `app.run({...})` — searched for the object that is this product;
3. meta tags — og:title / og:image / product:price:amount / itemprop=price.

`structured_product()` returns a flat dict (name, price, currency, brand, sku, mpn, images,
description); `is_junk_image()` drops tracking pixels, logos, icons, flags and thumbnails.
"""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Optional
from urllib.parse import unquote, urljoin

from bs4 import BeautifulSoup

_IMAGE_EXT = re.compile(r"\.(jpe?g|png|webp|avif|gif)(\?|_|$|\.)", re.I)
_JUNK_IMAGE = re.compile(
    r"facebook\.com/tr|google-analytics|doubleclick|/pixel|logo|favicon|sprite|placeholder|"
    r"loading|spinner|/icons?/|[-_]icon[-_.]|/flags?/|/badges?/|/payment|bkash|nagad|visa|mastercard|"
    r"\.svg(\?|$)|/static/media/|banner|avatar|emoji",
    re.I,
)
_TINY_SIZE = re.compile(r"(?<!\d)(\d{2,3})\s*[x×]\s*(\d{2,3})(?!\d)")
_PRICE_KEYS = ("price", "pdt_price", "special_price", "final_price", "sale_price", "saleprice", "salePrice", "current_price",
               "selling_price", "priceAmount", "price_amount", "regular_price", "offerPrice", "discountPrice", "amount")
_NAME_KEYS = ("name", "pdt_name", "title", "productName", "product_name")
_IMAGE_KEYS = ("image", "images", "gallery", "media", "media_gallery", "mediaGallery", "photos", "pictures",
               "thumbnail", "thumbnails", "image_url", "imageUrl", "img", "skuImages", "large_image")
_DESC_KEYS = ("description", "short_description", "shortDescription", "highlights", "desc")
_BRAND_KEYS = ("brand", "brand_name", "brandName", "manufacturer", "vendor")
_SKU_KEYS = ("sku", "SKU", "productCode", "product_code", "model", "mpn")


_WIDTH_PARAM = re.compile(r"[?&](?:w|width|size)=(\d{1,4})(?:&|$)", re.I)
# "/cache/responsive/<hash>/500.webp" — a size-named rendition of a photo listed elsewhere.
_RENDITION_NAME = re.compile(r"/(?:[^/]*(?:responsive|cache|resize|resized|thumbs?)[^/]*/)(?:[^/]+/)?\d{2,4}(?:x\d{2,4})?\.\w+$", re.I)


def is_junk_image(url: str) -> bool:
    """Tracking pixels, logos, icons, flags, payment badges, ≤150px thumbnails and size-named
    renditions — also when wrapped in an image proxy (Next.js /_next/image?url=…&w=96)."""
    if not url or url.startswith("data:"):
        return True
    decoded = unquote(url)
    if _JUNK_IMAGE.search(decoded) or _RENDITION_NAME.search(decoded.split("?")[0]):
        return True
    m = _WIDTH_PARAM.search(url)
    if m and int(m.group(1)) <= 150:
        return True
    for w, h in _TINY_SIZE.findall(decoded.split("?")[0].rsplit("/", 1)[-1]):
        if int(w) <= 150 and int(h) <= 150:
            return True
    return False


def _money(value: Any) -> Optional[Decimal]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        amount = Decimal(str(value))
    else:
        text = re.sub(r"[^\d.,]", "", str(value))
        if not text:
            return None
        # "12,650.00" / "12.650,00" / "12,650"
        if "," in text and "." in text:
            text = text.replace(",", "") if text.rfind(".") > text.rfind(",") else text.replace(".", "").replace(",", ".")
        elif "," in text:
            text = text.replace(",", "") if len(text.rsplit(",", 1)[1]) == 3 else text.replace(",", ".")
        try:
            amount = Decimal(text)
        except InvalidOperation:
            return None
    return amount if amount > 0 else None


def _text(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("name") or value.get("@value") or ""
    if isinstance(value, list):
        value = value[0] if value else ""
    text = str(value or "").strip()
    if "<" in text and ">" in text:
        text = BeautifulSoup(text, "html.parser").get_text("\n", strip=True)
    return text


def _image_list(value: Any, base_url: str) -> list[str]:
    out: list[str] = []

    def walk(v: Any, depth: int = 0) -> None:
        if depth > 4 or len(out) >= 30:
            return
        if isinstance(v, str):
            if (v.startswith("http") or v.startswith("//") or v.startswith("/")) and _IMAGE_EXT.search(v):
                out.append(urljoin(base_url, v))
        elif isinstance(v, list):
            for x in v:
                walk(x, depth + 1)
        elif isinstance(v, dict):
            for key in ("url", "contentUrl", "src", "large", "full", "original", "image", "file", "path", "zoom", "big"):
                if key in v:
                    walk(v[key], depth + 1)
                    if out:
                        break

    walk(value)
    return [u for u in dict.fromkeys(out) if not is_junk_image(u)]


# ------------------------------------------------------------------------------- JSON-LD


def _ld_nodes(blocks: Iterable[dict]) -> list[dict]:
    nodes: list[dict] = []

    def walk(v: Any, depth: int = 0) -> None:
        # every nested object — a Product can sit in @graph, hasVariant, mainEntity, or even
        # inside a Review's itemReviewed (ryans.com)
        if depth > 8:
            return
        if isinstance(v, list):
            for x in v:
                walk(x, depth + 1)
        elif isinstance(v, dict):
            nodes.append(v)
            for x in v.values():
                if isinstance(x, (dict, list)):
                    walk(x, depth + 1)

    walk(list(blocks))
    return nodes


def _type_of(node: dict) -> set[str]:
    t = node.get("@type")
    return {str(x).lower() for x in (t if isinstance(t, list) else [t]) if x}


def _offer_availability(offers: Any) -> Optional[str]:
    """schema.org availability as a short word: "InStock", "OutOfStock", "PreOrder", …"""
    for offer in offers if isinstance(offers, list) else [offers]:
        if isinstance(offer, dict) and offer.get("availability"):
            return str(offer["availability"]).rstrip("/").rsplit("/", 1)[-1]
    return None


def _offer_price(offers: Any) -> tuple[Optional[Decimal], Optional[str]]:
    for offer in offers if isinstance(offers, list) else [offers]:
        if not isinstance(offer, dict):
            continue
        for key in ("price", "lowPrice", "highPrice"):
            amount = _money(offer.get(key))
            if amount:
                return amount, (offer.get("priceCurrency") or None)
        spec = offer.get("priceSpecification")
        if isinstance(spec, (dict, list)):
            amount, cur = _offer_price(spec)
            if amount:
                return amount, cur or offer.get("priceCurrency")
    return None, None


def from_json_ld(blocks: list[dict], base_url: str, page_title: str = "") -> dict:
    products = [n for n in _ld_nodes(blocks) if _type_of(n) & {"product", "productgroup", "individualproduct"}]
    if not products:
        return {}
    main = next((p for p in products if "productgroup" in _type_of(p)), None)
    if main is None:
        # Several Products (e.g. a related-products list next to the main one): the one whose
        # name matches the page title is this page's product.
        title_words = _words(page_title)
        main = max(products, key=lambda p: len(_words(_text(p.get("name"))) & title_words)) if title_words else products[0]
        products = [main] + [p for p in products if p is not main and p.get("name") == main.get("name")]
    out: dict[str, Any] = {}
    out["name"] = _text(main.get("name"))
    price, currency = _offer_price(main.get("offers"))
    if price is None:
        for variant in products:
            price, currency = _offer_price(variant.get("offers"))
            if price:
                break
    out["price"], out["currency"] = price, currency
    out["availability"] = next(
        (a for a in (_offer_availability(p.get("offers")) for p in [main, *products]) if a), None
    )
    out["brand"] = _text(main.get("brand") or main.get("manufacturer"))
    out["sku"] = _text(main.get("sku") or main.get("productID"))
    out["mpn"] = _text(main.get("mpn"))
    out["description"] = _text(main.get("description"))
    images: list[str] = []
    for p in products:
        images += _image_list(p.get("image"), base_url)
    out["images"] = list(dict.fromkeys(images))
    return {k: v for k, v in out.items() if v}


# ------------------------------------------------------------------- embedded app state

_ASSIGN = re.compile(r"(?:=|\(|:)\s*\{")
# `x = "{\"a\":1}"` — JSON shipped as a string and JSON.parse()d by the page (daraz.com.bd's
# pdpTrackingData carries the product name and price this way).
_ASSIGN_STRING = re.compile(r"=\s*\"\{")


def _json_blobs(soup: BeautifulSoup) -> list[Any]:
    blobs: list[Any] = []
    decoder = json.JSONDecoder()
    for tag in soup.find_all("script"):
        text = tag.string or ""
        if len(text) < 50 or len(text) > 4_000_000 or tag.get("type") == "application/ld+json":
            continue
        if tag.get("type") in ("application/json",) or tag.get("id") in ("__NEXT_DATA__", "__NUXT_DATA__"):
            try:
                blobs.append(json.loads(text))
            except ValueError:
                pass
            continue
        if "price" not in text.lower():
            continue
        for m in list(_ASSIGN_STRING.finditer(text))[:10]:
            try:
                literal, _end = decoder.raw_decode(text, m.end() - 2)
                value = json.loads(literal) if isinstance(literal, str) else None
            except ValueError:
                continue
            if isinstance(value, (dict, list)):
                blobs.append(value)
        for m in list(_ASSIGN.finditer(text))[:20]:
            try:
                value, _end = decoder.raw_decode(text, m.end() - 1)
            except ValueError:
                continue
            if isinstance(value, (dict, list)) and len(json.dumps(value)) > 200:
                blobs.append(value)
    return blobs


def _first(d: dict, keys: Iterable[str]) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, "", [], {}):
            return d[k]
    return None


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 1}


def from_embedded_json(soup: BeautifulSoup, page_title: str, base_url: str) -> dict:
    """The object in the page's app state that is this product: it has a name that matches the
    page title, a price, and ideally images."""
    title_words = _words(page_title)
    best: tuple[float, Optional[dict]] = (0.0, None)
    seen = 0

    def walk(v: Any, depth: int = 0) -> None:
        nonlocal best, seen
        seen += 1
        if depth > 14 or seen > 60_000:
            return
        if isinstance(v, list):
            for x in v[:200]:
                walk(x, depth + 1)
            return
        if not isinstance(v, dict):
            return
        name = _first(v, _NAME_KEYS)
        price = _first(v, _PRICE_KEYS)
        if isinstance(price, dict):
            price = _first(price, ("value", "amount", "price", "final", "regular"))
        if isinstance(name, str) and _money(price):
            overlap = len(_words(name) & title_words) / max(1, len(_words(name)))
            score = overlap * 3 + (1 if _first(v, _IMAGE_KEYS) else 0) + (0.5 if _first(v, _DESC_KEYS) else 0)
            if score > best[0] and overlap >= 0.4:
                best = (score, v)
        for x in v.values():
            if isinstance(x, (dict, list)):
                walk(x, depth + 1)

    for blob in _json_blobs(soup):
        walk(blob)
    node = best[1]
    if not node:
        return {}
    price = _first(node, _PRICE_KEYS)
    if isinstance(price, dict):
        price = _first(price, ("value", "amount", "price", "final", "regular"))
    out = {
        "name": _text(_first(node, _NAME_KEYS)),
        "price": _money(price),
        "brand": _text(_first(node, _BRAND_KEYS)),
        "sku": _text(_first(node, _SKU_KEYS)),
        "description": _text(_first(node, _DESC_KEYS))[:6000],
        "images": _image_list(_first(node, _IMAGE_KEYS), base_url),
    }
    return {k: v for k, v in out.items() if v}


# ---------------------------------------------------------------------------- meta tags


def from_meta(soup: BeautifulSoup, base_url: str) -> dict:
    def meta(*names: str) -> str:
        for n in names:
            tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n}) or soup.find(attrs={"itemprop": n})
            if tag is not None:
                value = tag.get("content") or tag.get_text(" ", strip=True)
                if value:
                    return value.strip()
        return ""

    out = {
        "name": meta("og:title"),
        "price": _money(meta("product:price:amount", "og:price:amount", "price")),
        "currency": meta("product:price:currency", "og:price:currency", "priceCurrency"),
        "brand": meta("product:brand", "og:brand", "brand"),
        "images": [u for u in [urljoin(base_url, meta("og:image"))] if meta("og:image") and not is_junk_image(u)],
    }
    return {k: v for k, v in out.items() if v}


def structured_product(soup: BeautifulSoup, json_ld: list[dict], title: str, base_url: str) -> dict:
    """JSON-LD wins field by field, then embedded app state, then meta tags. Images are
    concatenated in that order (deduplicated)."""
    layers = [from_json_ld(json_ld, base_url, title), from_embedded_json(soup, title, base_url), from_meta(soup, base_url)]
    merged: dict[str, Any] = {}
    for layer in layers:
        for key, value in layer.items():
            if key == "images":
                merged["images"] = list(dict.fromkeys([*merged.get("images", []), *value]))
            elif key not in merged:
                merged[key] = value
    if "images" in merged:
        merged["images"] = merged["images"][:20]
    return merged
