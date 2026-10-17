"""Fetch a product page and pull out the raw signal an LLM needs to
extract a product — title, meta tags, JSON-LD, visible text, image
candidates. No product-shape assumptions here; that's the LLM's job.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from app.services.catalog_ai.structured_data import is_junk_image, structured_product
from fastapi import HTTPException

FETCH_TIMEOUT = 20.0
MAX_BODY_BYTES = 5_000_000
USER_AGENT = "AgainERP-CatalogBot/1.0 (+https://againerp.com)"
_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
MAX_TEXT_CHARS = 20_000
MAX_IMAGES = 20
# Site chrome (mega-menus, headers, footers) can be huge — large enough to push the actual
# product content (price, specs, warranty) past the character budget before an LLM ever sees
# it. Verified live: a startech.com.bd nav menu alone blew past the old 12k-char cap, leaving
# price/warranty/model truncated out entirely even though they were on the page.
_CHROME_TAGS = ("script", "style", "noscript", "nav", "header", "footer")


@dataclass(frozen=True)
class ScrapedPage:
    url: str
    title: str
    meta_description: str
    json_ld: list[dict] = field(default_factory=list)
    text: str = ""
    image_urls: list[str] = field(default_factory=list)
    # The site's own declared display name (og:site_name / application-name), when present —
    # a deterministic, LLM-independent way to know whose name to scrub from imported copy.
    site_name: str = ""
    # The page's own specification table, parsed straight from the HTML (no LLM) —
    # [{"group": str, "items": [{"label": str, "value": str}]}]. Empty when none was found.
    spec_groups: list[dict] = field(default_factory=list)
    # The page's own short highlights list ("Key Features" on startech.com.bd, "Quick Overview" on
    # ryans.com), one point per item — the product's short description.
    highlights: list[str] = field(default_factory=list)
    # Product data the page carries for machines (JSON-LD / embedded app state / meta tags) —
    # structured_data.structured_product(): name, price, currency, brand, sku, mpn, images,
    # description. The only source on JavaScript-built stores.
    structured: dict = field(default_factory=dict)


def _extract_json_ld(soup: BeautifulSoup) -> list[dict]:
    blocks: list[dict] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict):
                blocks.append(item)
    return blocks


def _extract_breadcrumb(soup: BeautifulSoup, json_ld: list[dict]) -> list[str]:
    """The page's own category trail ("Home > Networking > Router > TP-Link > <product>"): schema.org BreadcrumbList
    first, else a .breadcrumb block. The shop's own categorisation is the most reliable category signal there is."""
    for block in json_ld:
        if str(block.get("@type")) == "BreadcrumbList":
            items = sorted(block.get("itemListElement") or [], key=lambda i: int(i.get("position") or 0))
            names = [str((i.get("name") or (i.get("item") or {}).get("name") or "")).strip() for i in items if isinstance(i, dict)]
            if len([n for n in names if n]) >= 2:
                return [n for n in names if n]
    node = soup.select_one(".breadcrumb, nav.breadcrumb, [itemtype*=BreadcrumbList]")
    if node is not None:
        names = [a.get_text(" ", strip=True) for a in node.find_all(["a", "li", "span"]) if a.name == "a" or not a.find(["a", "li"])]
        out: list[str] = []
        for n in names:
            if n and n not in out:
                out.append(n)
        return out
    return []


_SIZE_SUFFIX_RE = re.compile(r"[-_](\d{2,4})x(\d{2,4})(?=\.[a-zA-Z]{2,4}$)")


# Size folders some stores use instead of a size suffix (ryans.com: /storage/products/small/x.webp
# and /storage/products/main/x.webp are one photo), ranked smallest → largest.
_SIZE_DIRS = {"thumb": 1, "thumbs": 1, "thumbnail": 1, "thumbnails": 1, "small": 2, "medium": 3,
              "main": 4, "large": 5, "big": 5, "full": 6, "original": 7}
_SIZE_DIR_RE = re.compile(r"/(" + "|".join(_SIZE_DIRS) + r")/", re.I)


def _image_signature(url: str) -> tuple[str, int]:
    """Same photo, different rendered size (e.g. many storefronts serve
    '...-01-1200x630.webp' and '...-01-500x500.webp' for one product photo, or the same file
    under /small/ and /main/) — strip the size marker so both collapse to the same signature,
    and return a size rank so the largest rendition can be kept."""
    path = url.split("?", 1)[0]
    rank = 0
    d = _SIZE_DIR_RE.search(path)
    if d:
        rank = _SIZE_DIRS[d.group(1).lower()]
        path = path[: d.start()] + "/*/" + path[d.end():]
    m = _SIZE_SUFFIX_RE.search(path)
    if not m:
        return path, rank
    area = int(m.group(1)) * int(m.group(2))
    return path[: m.start()] + path[m.end():], area + rank


def _dedupe_image_candidates(urls: list[str]) -> list[str]:
    """Collapse same-photo/different-resolution duplicates, keeping the highest-
    resolution rendition found and the original discovery order otherwise."""
    best_by_sig: dict[str, tuple[str, int]] = {}
    order: list[str] = []
    for url in urls:
        sig, area = _image_signature(url)
        current = best_by_sig.get(sig)
        if current is None:
            best_by_sig[sig] = (url, area)
            order.append(sig)
        elif area > current[1]:
            best_by_sig[sig] = (url, area)
    return [best_by_sig[sig][0] for sig in order]


def _extract_images(soup: BeautifulSoup, base_url: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def add(raw: Optional[str]) -> None:
        if not raw or raw.startswith("data:"):
            return
        absolute = urljoin(base_url, raw)
        if absolute in seen or is_junk_image(absolute):
            return
        seen.add(absolute)
        urls.append(absolute)

    og_image = soup.find("meta", attrs={"property": "og:image"})
    if og_image:
        add(og_image.get("content"))

    # schema.org Product markup (`<meta itemprop="image">`), when present, is scoped to the
    # product's own gallery — verified live against startech.com.bd, where it gave exactly the
    # 6 real photos at full 500x500 resolution and correctly excluded a "related products"
    # carousel elsewhere on the page that a whole-page <img> scan below would otherwise catch.
    # It also side-steps the common thumbnail-only-in-HTML problem (gallery images 2+ often
    # have no larger rendition anywhere in the raw <img src>, only in this markup or a
    # thumbnail-anchor's href) — so when it's present, trust it exclusively.
    itemprop_images = [m.get("content") for m in soup.find_all("meta", attrs={"itemprop": "image"})]
    if itemprop_images:
        for src in itemprop_images:
            add(src)
        return _dedupe_image_candidates(urls)[:MAX_IMAGES]

    # No schema.org markup — fall back to a whole-page scan. Thumbnail galleries commonly wrap
    # a small <img> in an <a> linking to the full-size rendition (OpenCart's default
    # "a.thumbnail" pattern, seen across many BD storefronts); prefer that href over the
    # thumbnail <img src> itself before the generic scan.
    for a in soup.find_all("a", class_="thumbnail"):
        add(a.get("href"))

    for img in soup.find_all("img"):
        # lazy-loading galleries keep the real photo in data-* attributes
        add(img.get("data-large_image") or img.get("data-zoom-image") or img.get("data-src") or img.get("src"))
        if len(urls) >= MAX_IMAGES * 3:  # extra headroom before de-duping same-photo resolutions
            break
    return _dedupe_image_candidates(urls)[:MAX_IMAGES]


_IMG_FILE = re.compile(r"\.(jpe?g|png|webp|avif)(\?|$)", re.I)
_RELATED = re.compile(r"related|similar|recommend|upsell|cross-?sell|also|recent|bestseller|popular|widget|"
                      r"item-grid|products-grid|product-list|footer|header|menu|brand-?logo", re.I)
_IMG_ATTRS = ("data-large_image", "data-zoom-image", "data-zoom", "data-full", "data-big", "data-image",
              "data-src", "data-lazy", "data-original", "src")


def _photo_key(url: str) -> str:
    """Same photo regardless of size marker or folder: the file name without size suffix."""
    return _image_signature(url)[0].rsplit("/", 1)[-1].lower()


def _urls_in(el, base_url: str) -> list[str]:
    """Photos inside an element: the largest rendition each <img>/<source>/<a> offers."""
    out: list[str] = []
    for a in el.find_all("a", href=True):
        if _IMG_FILE.search(a["href"]):
            out.append(urljoin(base_url, a["href"]))
    for img in el.find_all(["img", "source"]):
        srcset = img.get("data-srcset") or img.get("srcset") or ""
        if srcset:
            # last srcset candidate is conventionally the widest
            last = srcset.split(",")[-1].strip().split(" ")[0]
            if last:
                out.append(urljoin(base_url, last))
        for attr in _IMG_ATTRS:
            if img.get(attr) and not str(img.get(attr)).startswith("data:"):
                out.append(urljoin(base_url, img.get(attr)))
                break
    keep = [u for u in dict.fromkeys(out) if not is_junk_image(u)]
    return _dedupe_image_candidates(keep)


def _extract_gallery(soup: BeautifulSoup, anchor: Optional[str], base_url: str) -> list[str]:
    """The product's own photo gallery: start at the element showing its main photo (`anchor`,
    from structured data / og:image) and widen to the nearest slider/gallery block holding the
    other photos — never a related-products carousel. Works whatever the file names are
    (timestamps on gadgetandgear.com, different folders on ucc.com.bd)."""
    if not anchor:
        return []
    key = _photo_key(anchor)
    start = None
    for el in soup.find_all(["img", "a", "source"]):
        for attr in ("href", *_IMG_ATTRS, "srcset", "data-srcset"):
            value = el.get(attr)
            if value and key and key in _photo_key(str(value).split(",")[0].strip().split(" ")[0]):
                start = el
                break
        if start is not None:
            break
    if start is None:
        return []
    best: list[str] = []
    node = start
    for _ in range(7):
        node = node.parent
        if node is None or node.name in ("body", "html", "main"):
            break
        if _RELATED.search(" ".join([node.get("id") or "", *(node.get("class") or [])])):
            break
        photos = _urls_in(node, base_url)
        if len(photos) > 15:  # grew into a listing — the previous level was the gallery
            break
        if len(photos) > len(best):
            best = photos
    if len(best) >= 3:
        # A brand badge or sticker inside the slider lives in another folder than the photos
        # (gadgetandgear.com: upload/media/samsung-aas.png among upload/product/*.jpeg). Keep
        # the main photo and the photos in the gallery's majority folder.
        folders = [u.split("?")[0].rsplit("/", 1)[0] for u in best]
        majority = max(set(folders), key=folders.count)
        if folders.count(majority) >= 2:
            best = [u for u, f in zip(best, folders) if f == majority or _photo_key(u) == key]
    return best[:MAX_IMAGES]


MAX_SPEC_ITEMS = 300
_SPEC_HINT = re.compile(r"spec|attribute|feature|technical|detail", re.I)


def _cell_text(tag) -> str:
    return re.sub(r"[ \t]+", " ", tag.get_text("\n", strip=True)).strip()


def _startech_specs(soup: BeautifulSoup) -> list[dict]:
    """startech.com.bd layout — same selectors as againerp-center's StarTech site adapter
    (services/ai-commerce/.../adapters/startech/site_adapter.py)."""
    table = soup.select_one("#specification table.data-table")
    if not table:
        return []
    groups: list[dict] = []
    current: Optional[dict] = None
    for row in table.find_all("tr"):
        heading = row.find("td", class_="heading-row")
        if heading:
            current = {"group": heading.get_text(strip=True), "items": []}
            groups.append(current)
            continue
        name_td, value_td = row.find("td", class_="name"), row.find("td", class_="value")
        if name_td and value_td:
            if current is None:
                current = {"group": "Specifications", "items": []}
                groups.append(current)
            current["items"].append({"label": name_td.get_text(strip=True), "value": _cell_text(value_td)})
    return [g for g in groups if g["items"]]


def _ryans_specs(soup: BeautifulSoup) -> list[dict]:
    """ryans.com layout: specs are div rows of span.att-title / span.att-value (no <table>), one
    `.container.for-last-hr` block per group, the group name in the neighbouring col-lg-2.
    The col-lg-12 blocks elsewhere are a shorter 'quick overview' duplicate — skipped."""
    groups: list[dict] = []
    for block in soup.select("div.col-lg-10 > div.container.for-last-hr"):
        title_col = block.parent.find_previous_sibling()
        name = title_col.get_text(" ", strip=True) if title_col is not None else ""
        items = []
        for title in block.select("span.att-title"):
            row = title.find_parent("div", class_="row") or title.parent
            value = row.select_one("span.att-value") if row is not None else None
            if value is not None:
                label, val = title.get_text(" ", strip=True), _cell_text(value)
                if label and val:
                    items.append({"label": label, "value": val})
        if items:
            groups.append({"group": name or "Specifications", "items": items})
    return groups


def _pair_specs(soup: BeautifulSoup) -> list[dict]:
    """Generic div/span label-value pairs (class names like att-title/att-value, spec-name/
    spec-value, label/value) for stores that don't use a <table>."""
    items = []
    for title in soup.select("[class*=att-title], [class*=spec-name], [class*=spec-label], [class*=spec-key]"):
        row = title.parent
        for _ in range(2):
            if row is None:
                break
            value = row.select_one("[class*=att-value], [class*=spec-value], [class*=spec-val]")
            if value is not None and value is not title:
                label, val = title.get_text(" ", strip=True), _cell_text(value)
                if label and val and len(label) <= 80:
                    items.append({"label": label, "value": val})
                break
            row = row.parent
    seen, unique = set(), []
    for item in items:
        if item["label"].lower() not in seen:
            seen.add(item["label"].lower())
            unique.append(item)
    return [{"group": "Specifications", "items": unique}] if len(unique) >= 3 else []


def _table_specs(table, default_group: str) -> list[dict]:
    """Generic label/value table: 2-cell rows are items; a 1-cell (or th-only / colspan) row
    starts a new group."""
    groups: list[dict] = []
    current: Optional[dict] = None
    caption = table.find("caption")
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if not cells:
            continue
        if len(cells) == 1 or (len(cells) >= 2 and all(c.name == "th" for c in cells) and not _cell_text(cells[1])):
            title = _cell_text(cells[0])
            if title and len(title) <= 80:
                current = {"group": title, "items": []}
                groups.append(current)
            continue
        label, value = _cell_text(cells[0]), _cell_text(cells[1])
        if not label or not value or len(label) > 80:
            continue
        if current is None:
            current = {"group": _cell_text(caption) if caption else default_group, "items": []}
            groups.append(current)
        current["items"].append({"label": label.rstrip(":"), "value": value})
    return [g for g in groups if g["items"]]


def _dl_specs(dl, default_group: str) -> list[dict]:
    items = []
    for dt in dl.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd is not None:
            label, value = _cell_text(dt), _cell_text(dd)
            if label and value and len(label) <= 80:
                items.append({"label": label.rstrip(":"), "value": value})
    return [{"group": default_group, "items": items}] if items else []


# Blocks that hold label/value tables but are never the product's specs: EMI / installment
# calculators (techlandbd.com has 28 hidden per-bank "Month | Charges" tables), price lists,
# shipping and review widgets.
_NOT_SPEC_CONTEXT = re.compile(
    r"emi|installment|instalment|bank|calculator|price-?list|pricing|shipping|delivery|review|rating|"
    r"compare|cart|checkout|modal|popup|related|similar|footer|header|nav|menu",
    re.I,
)
_NOT_SPEC_HEADER = re.compile(r"^(month|months|tenure|charges?|installment|instalment|emi|overall cost|interest|bank|price|qty|quantity)$", re.I)
_MONEY = re.compile(r"(৳|tk\.?\s*\d|bdt|\$|€|£|₹)\s*\d|\d[\d,]*\s*(৳|tk|bdt|taka)\b", re.I)
_SPEC_SECTION_TEXT = re.compile(r"^\s*(full\s+|technical\s+|tech\s+|product\s+|key\s+)?(specifications?|specs|technical details|tech specs)\s*:?\s*$", re.I)
# "spec", "specs", "specification(s)" as a whole word inside id/class — not "special-product".
_SPEC_SECTION_ATTR = re.compile(r"(?<![a-z])spec(?:s|ification|ifications)?(?![a-z])", re.I)
_GROUP_TAGS = ("h2", "h3", "h4", "h5", "h6")


def _attr_text(el) -> str:
    return " ".join([el.get("id") or "", *(el.get("class") or [])]) if hasattr(el, "get") else ""


def _in_non_spec_context(el, depth: int = 6) -> bool:
    node = el
    for _ in range(depth):
        if node is None or not hasattr(node, "get"):
            return False
        attrs = _attr_text(node)
        if _NOT_SPEC_CONTEXT.search(attrs) and not _SPEC_SECTION_ATTR.search(attrs):
            return True
        node = node.parent
    return False


def _looks_like_specs(groups: list[dict]) -> bool:
    """A real spec sheet: at least 3 rows, labels that are words (not '3', '6', '9' months),
    values that are mostly not prices, and no EMI-style header labels."""
    items = [i for g in groups for i in g["items"]]
    if len(items) < 3:
        return False
    numeric_labels = sum(1 for i in items if re.fullmatch(r"[\d\s.,%-]+", i["label"]))
    money_values = sum(1 for i in items if _MONEY.search(i["value"]))
    header_labels = sum(1 for i in items if _NOT_SPEC_HEADER.match(i["label"].strip()))
    return numeric_labels <= len(items) * 0.3 and money_values <= len(items) * 0.3 and header_labels <= 1


def _row_pair(el) -> Optional[tuple[str, str]]:
    """A two-part row: exactly two child elements with text (label, value), e.g.
    <div><span class=label>DPI</span><span class=value>1600</span></div>."""
    kids = [c for c in el.find_all(recursive=False) if c.get_text(strip=True)]
    if len(kids) != 2:
        return None
    if any(k.find(["table", "dl", "ul", "ol"]) for k in kids):
        return None
    # A wrapper around two rows is not itself a row — its children are the pairs.
    if any(k.name in ("div", "p", "li", "section", "article") and _row_pair(k) for k in kids):
        return None
    label, value = kids[0].get_text(" ", strip=True).rstrip(":"), _cell_text(kids[1])
    if not label or not value or len(label) > 60 or len(value) > 600:
        return None
    return label, value


def _section_specs(section) -> list[dict]:
    """Every label/value pair inside a specifications section, grouped by its sub-headings —
    whatever the markup: table rows, dt/dd, two-part div/span rows, or 'Label: value' items."""
    groups: list[dict] = []
    current: Optional[dict] = None
    claimed: set[int] = set()

    def add(label: str, value: str) -> None:
        nonlocal current
        if current is None:
            current = {"group": "Specifications", "items": []}
            groups.append(current)
        if not any(i["label"].lower() == label.lower() for i in current["items"]):
            current["items"].append({"label": label, "value": value})

    for el in section.descendants:
        if not hasattr(el, "name") or el.name is None or id(el) in claimed:
            continue
        if any(id(p) in claimed for p in el.parents):
            continue
        text = el.get_text(" ", strip=True)
        if el.name in _GROUP_TAGS and text and len(text) <= 80 and not _SPEC_SECTION_TEXT.match(text):
            current = {"group": text, "items": []}
            groups.append(current)
            claimed.add(id(el))
            continue
        if el.name == "tr":
            cells = el.find_all(["th", "td"], recursive=False)
            if len(cells) == 1 or (cells and all(c.name == "th" for c in cells) and len(cells) >= 2 and not _cell_text(cells[1])):
                title = _cell_text(cells[0])
                if title and len(title) <= 80:
                    current = {"group": title, "items": []}
                    groups.append(current)
            elif len(cells) >= 2:
                label, value = _cell_text(cells[0]).rstrip(":"), _cell_text(cells[1])
                if label and value and len(label) <= 80:
                    add(label, value)
            claimed.add(id(el))
            continue
        if el.name == "dt":
            dd = el.find_next_sibling("dd")
            if dd is not None:
                label, value = _cell_text(el).rstrip(":"), _cell_text(dd)
                if label and value and len(label) <= 80:
                    add(label, value)
                claimed.add(id(dd))
            claimed.add(id(el))
            continue
        if el.name == "li":
            m = re.match(r"^\s*([^:]{1,60}?)\s*[:–-]\s+(.+)$", text)
            if m:
                add(m.group(1).strip(), m.group(2).strip())
                claimed.add(id(el))
            continue
        if el.name in ("div", "p", "span", "section", "article"):
            pair = _row_pair(el)
            if pair:
                add(*pair)
                claimed.add(id(el))
    return [g for g in groups if g["items"]]


def _spec_sections(soup: BeautifulSoup) -> list:
    """Containers that hold the product's specifications: an element whose id/class says 'spec',
    or the parent block of a 'Specifications' / 'Technical Details' heading."""
    found = []
    for el in soup.find_all(attrs={"id": _SPEC_SECTION_ATTR}):
        found.append(el)
    for el in soup.find_all(class_=_SPEC_SECTION_ATTR):
        found.append(el)
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "strong", "b", "button", "a", "li", "span", "div"]):
        if heading.find(True) is not None and heading.name not in ("h1", "h2", "h3", "h4", "h5"):
            continue
        if _SPEC_SECTION_TEXT.match(heading.get_text(" ", strip=True) or ""):
            found.append(heading.parent)
    unique, seen = [], set()
    for el in found:
        if el is not None and id(el) not in seen and not _in_non_spec_context(el):
            seen.add(id(el))
            unique.append(el)
    return unique


_TEXT_BLOCK = re.compile(r"description|overview|details|feature|summary|tab-?content|product-?info|key-?spec", re.I)
_BULLET_SPLIT = re.compile(r"\s*(?:\n|▶️|▶|►|•|●|✔️?|✅|➤|➢|■|◆|\|)\s*")
_TEXT_PAIR = re.compile(r"^([A-Za-z][A-Za-z0-9 ()/&.+'-]{1,40}?)\s*:\s*(\S.{0,200})$")


def _text_pair_specs(soup: BeautifulSoup) -> list[dict]:
    """Specs written as text — 'Form Factor: M.2 2280' lines, often behind ▶️ / • bullets in a
    description or short-description block (common on WooCommerce shops such as smartbd.com)."""
    best: list[dict] = []
    for block in soup.find_all(attrs={"class": _TEXT_BLOCK}) + soup.find_all(attrs={"id": _TEXT_BLOCK}):
        if _in_non_spec_context(block):
            continue
        items = []
        for line in _BULLET_SPLIT.split(block.get_text("\n", strip=True)):
            m = _TEXT_PAIR.match(line.strip())
            if m and not any(i["label"].lower() == m.group(1).strip().lower() for i in items):
                items.append({"label": m.group(1).strip(), "value": m.group(2).strip()})
        found = [{"group": "Specifications", "items": items}] if items else []
        if len(items) > sum(len(g["items"]) for g in best) and _looks_like_specs(found):
            best = found
    return best


def _extract_spec_groups(soup: BeautifulSoup) -> list[dict]:
    """The page's specification sheet, without an LLM:
    1. known store layouts (startech.com.bd, ryans.com);
    2. a 'Specifications' section (id/class or heading) read generically — table rows, dt/dd,
       two-part div rows, 'Label: value' items, sub-headings as groups;
    3. the largest label/value table or <dl> outside EMI / price / review blocks.
    Anything that does not look like a spec sheet (month → price rows, mostly prices) is
    rejected; then the LLM reads the specs from the page text instead."""
    groups = _startech_specs(soup) or _ryans_specs(soup)
    if not groups:
        best: tuple[int, list[dict]] = (0, [])
        for section in _spec_sections(soup):
            found = _section_specs(section)
            count = sum(len(g["items"]) for g in found)
            if count > best[0] and _looks_like_specs(found):
                best = (count, found)
        groups = best[1]
    if not groups:
        best = (0, [])
        for el in soup.find_all(["table", "dl"]):
            if _in_non_spec_context(el):
                continue
            found = _table_specs(el, "Specifications") if el.name == "table" else _dl_specs(el, "Specifications")
            if not _looks_like_specs(found):
                continue
            hinted = any(_SPEC_HINT.search(_attr_text(p)) for p in list(el.parents)[:4])
            score = sum(len(g["items"]) for g in found) * (3 if hinted else 1)
            if score > best[0]:
                best = (score, found)
        groups = best[1]
    if not groups:
        pairs = _pair_specs(soup)
        groups = pairs if _looks_like_specs(pairs) else []
    if not groups:
        groups = _text_pair_specs(soup)
    out, total = [], 0
    for g in groups:
        items = g["items"][: max(0, MAX_SPEC_ITEMS - total)]
        total += len(items)
        if items:
            out.append({"group": g["group"][:100] or "Specifications", "items": items})
    return out


_HIGHLIGHT_HEADING = re.compile(r"^\s*(key features|quick overview|highlights|key specs|product highlights)\s*:?\s*$", re.I)


_MORE_LINK = re.compile(r"^\s*(view|see|show|read)\s+(more|all|details)\b", re.I)


def _extract_highlights(soup: BeautifulSoup) -> list[str]:
    """Items of the first non-empty list right after a 'Key Features' / 'Quick Overview' heading."""
    for heading in soup.find_all(["h2", "h3", "h4", "h5", "strong", "b"]):
        if not _HIGHLIGHT_HEADING.match(heading.get_text(" ", strip=True)):
            continue
        ul = heading.find_next(["ul", "ol"])
        # must belong to the heading's own box, not some list further down the page
        if ul is None or heading.parent not in ul.parents:
            continue
        items = [re.sub(r"\s+", " ", li.get_text(" ", strip=True)) for li in ul.find_all("li")]
        items = [i for i in items if i and len(i) <= 200 and not _MORE_LINK.match(i)]
        if len(items) >= 2:
            return items[:12]
    return []


def _extract_text(soup: BeautifulSoup) -> str:
    # A schema.org Product container, when present, is concentrated product info (price,
    # status, specs, warranty) — prefer its text alone so chrome elsewhere on the page can't
    # crowd it out of the character budget. Selected before chrome removal since decompose()
    # below removes matching tags wherever they are in the tree, including inside this scope.
    product_scope = soup.select_one("[itemtype*='schema.org/Product']") or soup.select_one("[itemtype*='/Product']")
    for tag in soup(_CHROME_TAGS):
        tag.decompose()
    if product_scope is not None:
        scoped_text = re.sub(r"\s+", " ", product_scope.get_text(separator=" ")).strip()
        if len(scoped_text) > 200:  # sanity floor — an almost-empty match isn't useful
            return scoped_text[:MAX_TEXT_CHARS]
    return re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()[:MAX_TEXT_CHARS]


def is_bot_challenge(response: httpx.Response) -> bool:
    """Cloudflare's "Just a moment..." JavaScript check (techlandbd.com after a burst of requests):
    no plain HTTP request gets past it, so it's reported as such rather than as a missing page."""
    if response.status_code not in (403, 429, 503):
        return False
    if response.headers.get("cf-mitigated") == "challenge":
        return True
    head = response.text[:2000].lower() if response.text else ""
    return "just a moment" in head or "challenge-platform" in head or "cf-chl" in head


def fetch_page(url: str, *, timeout: float = FETCH_TIMEOUT) -> ScrapedPage:
    try:
        with httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
            transport=httpx.HTTPTransport(retries=2),
        ) as client:
            response = client.get(url)
            # Many shops refuse unknown bots (verified: computervillage.com.bd answers our
            # catalog-bot UA with 503) — ask once more the way a normal browser does.
            if response.status_code in (401, 403, 406, 429, 503):
                response = client.get(url, headers=_BROWSER_HEADERS)
            if is_bot_challenge(response):
                raise HTTPException(
                    status_code=422,
                    detail=f"Cloudflare bot check (HTTP {response.status_code}) — the site wants a real browser for this server",
                )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {exc}") from exc

    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type:
        raise HTTPException(status_code=422, detail=f"URL did not return HTML (content-type: {content_type})")

    body = response.content[:MAX_BODY_BYTES]
    soup = BeautifulSoup(body, "html.parser")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""

    meta_desc_tag = soup.find("meta", attrs={"name": "description"})
    meta_description = meta_desc_tag.get("content", "").strip() if meta_desc_tag else ""

    site_name_tag = soup.find("meta", attrs={"property": "og:site_name"}) or soup.find("meta", attrs={"name": "application-name"})
    site_name = (site_name_tag.get("content", "").strip() if site_name_tag else "")

    json_ld = _extract_json_ld(soup)
    structured = structured_product(soup, json_ld, title, str(response.url))
    structured["breadcrumb"] = _extract_breadcrumb(soup, json_ld)
    # The product's own gallery block (found from its main photo), then its declared photos,
    # then whatever else the page shows.
    page_images = _extract_images(soup, str(response.url))
    anchor = (structured.get("images") or page_images or [None])[0]
    gallery = _extract_gallery(soup, anchor, str(response.url))
    if gallery:
        structured["gallery"] = gallery
    image_urls = _dedupe_image_candidates(
        list(dict.fromkeys([*gallery, *structured.get("images", []), *page_images]))
    )[:MAX_IMAGES]
    spec_groups = _extract_spec_groups(soup)  # before _extract_text, which strips chrome tags in place
    highlights = _extract_highlights(soup)
    text = _extract_text(soup)

    return ScrapedPage(
        url=str(response.url),
        title=title,
        meta_description=meta_description,
        json_ld=json_ld,
        text=text,
        image_urls=image_urls,
        site_name=site_name,
        spec_groups=spec_groups,
        highlights=highlights,
        structured=structured,
    )
