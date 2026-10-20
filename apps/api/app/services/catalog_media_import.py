from __future__ import annotations

import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.models.media import Media
from app.schemas.media import MediaRead, derive_labels_from_file_name
from app.services.media_storage import save_media_bytes

MAX_IMAGE_BYTES = 5_000_000
FETCH_TIMEOUT = 20.0

# ── images the admin's own browser fetched ──────────────────────────────────────────────────────────────────────
# Shops behind a bot check (Ryans) refuse the server for their images too, but open fine in a browser. The "Send to AgainERP"
# extension reads the product's photos and hands their bytes to /catalog/ai/source-images; for a short while the import
# uses these bytes for that image address instead of asking the shop.
import time as _time

_BROWSER_IMAGE_TTL = 30 * 60
_BROWSER_IMAGE_MAX_COUNT = 80
_BROWSER_IMAGE_MAX_BYTES = 120_000_000
_browser_images: dict[str, tuple[float, bytes, str]] = {}


def _image_key(url: str) -> str:
    return url.strip().split("#", 1)[0].split("?", 1)[0]


def remember_browser_image(url: str, content: bytes, content_type: str) -> None:
    now = _time.time()
    for key in [k for k, (exp, _c, _t) in _browser_images.items() if exp < now]:
        _browser_images.pop(key, None)
    while _browser_images and (
        len(_browser_images) >= _BROWSER_IMAGE_MAX_COUNT or sum(len(v[1]) for v in _browser_images.values()) + len(content) > _BROWSER_IMAGE_MAX_BYTES
    ):
        _browser_images.pop(next(iter(_browser_images)), None)
    _browser_images[_image_key(url)] = (now + _BROWSER_IMAGE_TTL, content, content_type)


def recall_browser_image(url: str) -> Optional[tuple[bytes, str]]:
    entry = _browser_images.get(_image_key(url))
    if not entry:
        return None
    if entry[0] < _time.time():
        _browser_images.pop(_image_key(url), None)
        return None
    return entry[1], entry[2]

USER_AGENT = "AgainERP-CatalogBot/1.0 (+https://againerp.com)"
ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp"}


def _classify_filename(filename: str, mime: str) -> str:
    ext = Path(filename).suffix.lower()
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("application/") or mime.startswith("text/"):
        return "document"
    return "image"


SQUARE_PX = 500
MAX_BYTES = 100 * 1024  # no stored product image is bigger than 100 KB
# the size marker a storefront adds to a resized copy: ".../name-500x500.webp", ".../name_300x300.jpg"
_SIZE_SUFFIX = re.compile(r"[-_]\d{2,4}x\d{2,4}(?=\.[A-Za-z0-9]+$)")


class CatalogImportImagesRequest(BaseModel):
    urls: list[HttpUrl] = Field(default_factory=list, max_length=24)
    alt_prefix: Optional[str] = None
    # SEO file names "<name_prefix>-1.webp", "-2" ... (the product's slug) instead of "<random>_<source name>"
    name_prefix: Optional[str] = None
    # store every raster image as a 500 x 500 px square (scaled to fit, centred on white, never stretched), WebP
    square: bool = False


class CatalogImportImageFailure(BaseModel):
    url: str
    reason: str


class CatalogImportImagesResponse(BaseModel):
    items: list[MediaRead] = Field(default_factory=list)
    failed: list[CatalogImportImageFailure] = Field(default_factory=list)
    # images that were already in their slot (same source) and were left alone: nothing downloaded, nothing stored
    reused: int = 0
    # the URL that was asked for -> the media row that now holds it (the stored copy comes from the ORIGINAL url, so
    # source_url may differ from what the page linked)
    url_map: dict[str, str] = Field(default_factory=dict)
    # images that need a look: low resolution, odd proportions (nothing is edited automatically)
    warnings: list[str] = Field(default_factory=list)


def _filename_from_url(url: str, content_type: str) -> str:
    path = urlparse(url).path
    name = Path(path).name
    if name and "." in name:
        return re.sub(r"[^a-zA-Z0-9._-]", "_", name)

    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    elif "gif" in content_type:
        ext = ".gif"
    elif "avif" in content_type:
        ext = ".avif"
    return f"import{ext}"


def slug_part(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:120] or "product"


def _original_candidates(url: str) -> list[str]:
    """Where the ORIGINAL of a resized copy probably lives, best guess first, the given URL last:
    ".../name-500x500.webp" -> ".../name.webp"; OpenCart's ".../image/cache/catalog/x-500x500.jpg" -> ".../image/catalog/x.jpg"."""
    clean = url.split("?", 1)[0]
    out: list[str] = []
    stripped = _SIZE_SUFFIX.sub("", clean)
    if "/image/cache/" in stripped:
        out.append(stripped.replace("/image/cache/", "/image/", 1))
    if stripped != clean:
        out.append(stripped)
    out.append(url)
    return list(dict.fromkeys(out))


MARGIN_PX = 40       # empty space kept on all four sides of the 500 px square (8 %), so every product sits the same way
MAX_UPSCALE = 3.0    # a small image is enlarged at most this much (beyond that it only turns blurry)
_BG_TOLERANCE = 14   # how far a pixel may differ from the background and still count as background


def _background(im) -> tuple[int, int, int] | None:
    """The image's flat background colour when its four corners agree (white packshots, a grey studio sweep …), else None."""
    w, h = im.size
    pts = [im.getpixel(xy) for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    mean = tuple(sum(c[i] for c in pts) // 4 for i in range(3))
    if all(max(abs(c[i] - mean[i]) for i in range(3)) <= _BG_TOLERANCE for c in pts):
        return mean  # type: ignore[return-value]
    return None


def to_square(content: bytes, side: int = SQUARE_PX) -> bytes:
    """One standard look for every product image (pure Pillow — no AI, no tokens):
    the flat background is trimmed away, the product is scaled to fit INSIDE the square leaving MARGIN_PX of empty
    space on every side (small images are enlarged, large ones reduced, never stretched), centred on the same
    background colour, saved as WebP of at most MAX_BYTES."""
    from PIL import Image, ImageChops, ImageOps

    im = ImageOps.exif_transpose(Image.open(BytesIO(content)))
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, "white")
        flat.paste(im, mask=im.getchannel("A"))
        im = flat
    else:
        im = im.convert("RGB")
    bg = _background(im)
    if bg is not None:  # trim the empty border the source left around the product
        diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L").point(lambda v: 255 if v > _BG_TOLERANCE else 0)
        box = diff.getbbox()
        if box and (box[2] - box[0]) > 8 and (box[3] - box[1]) > 8:
            im = im.crop(box)
    inner = side - 2 * MARGIN_PX
    scale = min(inner / im.width, inner / im.height, MAX_UPSCALE)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    im = im.resize(size, Image.LANCZOS)
    canvas = Image.new("RGB", (side, side), bg or (255, 255, 255))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    # at most MAX_BYTES (100 KB): highest quality first, lowered step by step only when the file is bigger
    data = b""
    for quality in (92, 88, 84, 80, 75, 70, 65, 60, 55, 50, 45, 40):
        out = BytesIO()
        canvas.save(out, format="WEBP", quality=quality, method=6)
        data = out.getvalue()
        if len(data) <= MAX_BYTES:
            break
    return data


MIN_SIDE_PX = 300
MAX_ASPECT = 2.5


def _quality_note(content: bytes) -> Optional[str]:
    """Only a note for the admin — the image is never edited automatically (an AI edit costs tokens and changes the photo;
    it is done only on the admin's approval, for the exceptional image)."""
    try:
        from PIL import Image

        w, h = Image.open(BytesIO(content)).size
    except Exception:  # noqa: BLE001
        return None
    if min(w, h) < MIN_SIDE_PX:
        return f"low resolution ({w}x{h}px)"
    if max(w, h) / max(1, min(w, h)) > MAX_ASPECT:
        return f"unusual proportions ({w}x{h}px)"
    return None


def _import_single_image(
    db: Session,
    url: str,
    *,
    company_id: str,
    alt_prefix: Optional[str] = None,
    name_prefix: Optional[str] = None,
    position: int = 1,
    square: bool = False,
) -> Media:
    # One slot per position: "<slug>-<n>.webp". The same source image already in its slot is left alone (nothing is
    # downloaded or stored again); a different image REPLACES the slot's file and row — images never pile up.
    slot: Optional[Media] = None
    wanted = f"{slug_part(name_prefix)}-{position}.webp" if (square and name_prefix) else None
    if wanted:
        slot = db.query(Media).filter(Media.company_id == company_id, Media.url.like(f"%/{wanted}")).first()
        if slot is not None and slot.source_url in set(_original_candidates(url)):
            slot._image_reused = True  # type: ignore[attr-defined]
            return slot
    from_browser = recall_browser_image(url)  # the admin's browser already fetched it (a shop that blocks the server)
    if from_browser is not None:
        content, content_type = from_browser[0][: MAX_IMAGE_BYTES * (4 if square else 1)], from_browser[1]
    else:
        with httpx.Client(
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
        ) as client:
            response = None
            last_error: Exception | None = None
            # the ORIGINAL first (a resized "-500x500" copy of it is what pages usually link), then the given URL
            for candidate in (_original_candidates(url) if square else [url]):
                try:
                    res = client.get(candidate)
                    res.raise_for_status()
                    if not (res.headers.get("content-type") or "image/jpeg").startswith("image/") or not res.content:
                        raise ValueError("not an image")
                    response, url = res, candidate
                    break
                except Exception as exc:  # noqa: BLE001 - try the next candidate
                    last_error = exc
            if response is None:
                raise last_error or ValueError("Could not fetch the image")

            content_type = (response.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                raise ValueError(f"Not an image ({content_type})")

            content = response.content[: MAX_IMAGE_BYTES * (4 if square else 1)]
            if not content:
                raise ValueError("Empty image response")

    filename = _filename_from_url(url, content_type)
    ext = Path(filename).suffix.lower()
    seo_name = None
    note: Optional[str] = None
    if square and ext not in (".svg", ".gif"):
        try:
            note = _quality_note(content)
            content, content_type = to_square(content), "image/webp"
            ext = ".webp"
            if wanted:
                seo_name = wanted
                filename = seo_name
            else:
                filename = f"{Path(filename).stem}-{SQUARE_PX}x{SQUARE_PX}.webp"
        except Exception as exc:  # noqa: BLE001 - an unreadable image is a failed image, not a failed product
            raise ValueError(f"Could not process the image: {exc}") from exc
    if ext not in ALLOWED_IMAGE:
        raise ValueError(f"Unsupported image type: {ext or 'unknown'}")

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    stored = seo_name or f"{uuid.uuid4().hex}_{safe_name}"
    media_type = _classify_filename(filename, content_type)
    title, alt = derive_labels_from_file_name(filename)
    if alt_prefix and square:
        title = alt_prefix.strip()[:200]
        alt = (alt_prefix.strip() if position == 1 else f"{alt_prefix.strip()} - view {position}")[:240]
    elif alt_prefix:
        alt = f"{alt_prefix.strip()} — {alt}"[:240]

    public_url, local_path, provider = save_media_bytes(db, stored, content, content_type)
    if slot is not None:  # replace the slot in place (same file name, new picture)
        slot.name, slot.title, slot.alt = filename, title, alt
        slot.url, slot.local_path, slot.provider = public_url, local_path, provider
        slot.mime_type, slot.size_kb, slot.source_url = content_type, max(1, len(content) // 1024), url
        slot._image_note = note  # type: ignore[attr-defined]
        return slot
    row = Media(
        company_id=company_id,
        name=filename,
        title=title,
        folder="Uploads",
        url=public_url,
        media_type=media_type,
        mime_type=content_type,
        size_kb=max(1, len(content) // 1024),
        alt=alt,
        source_url=url,
        local_path=local_path,
        imported_by="url",
        provider=provider,
        uploaded_by="You",
        title_linked_to_name=True,
        alt_linked_to_name=True,
    )
    row._image_note = note  # type: ignore[attr-defined]
    db.add(row)
    return row


def import_catalog_images(
    db: Session,
    payload: CatalogImportImagesRequest,
    *,
    company_id: str,
) -> CatalogImportImagesResponse:
    if not payload.urls:
        raise ValueError("urls is required")

    items: list[MediaRead] = []
    failed: list[CatalogImportImageFailure] = []
    warnings: list[str] = []
    reused = 0
    url_map: dict[str, str] = {}

    for position, raw_url in enumerate(payload.urls, start=1):
        url = str(raw_url)
        try:
            row = _import_single_image(
                db, url, company_id=company_id, alt_prefix=payload.alt_prefix,
                name_prefix=payload.name_prefix, position=position, square=payload.square,
            )
            db.flush()
            db.refresh(row)
            if getattr(row, "_image_reused", False):
                reused += 1
            if getattr(row, "_image_note", None):
                warnings.append(f"{row.name}: {row._image_note}")
            items.append(MediaRead.model_validate(row))
            url_map[url] = row.id
        except Exception as exc:
            failed.append(CatalogImportImageFailure(url=url, reason=str(exc)))

    if items:
        db.commit()
    else:
        db.rollback()

    return CatalogImportImagesResponse(items=items, failed=failed, reused=reused, warnings=warnings, url_map=url_map)


def drop_replaced_media(db: Session, *, owner, old_ids: list[str]) -> int:
    """After a re-import the product's NEW images are linked; the ones it had before (a different crop, a cached copy,
    an earlier run) are replaced, not kept: each old media row that came from a URL import, is no longer linked to this
    product, and is used by nothing else (no other product / listing, not inside any description) is removed together
    with its file. Anything doubtful stays."""
    from app.models.catalog_product import CatalogProduct
    from app.models.catalog_product_media import CatalogProductMedia
    from app.models.ecommerce_item_media import EcommerceItemMedia
    from app.routers.media import _delete_media_row

    keep = {l.media_id for l in db.query(CatalogProductMedia).filter(CatalogProductMedia.product_id == owner.id).all()}
    owner_keys = {k for k in (owner.id, getattr(owner, "item_id", None)) if k}
    # media the listing still links from earlier runs count as replaced too
    stale = {l.media_id for l in db.query(EcommerceItemMedia).filter(EcommerceItemMedia.item_id.in_(owner_keys)).all()}
    removed = 0
    for mid in (set(old_ids) | stale) - keep:
        m = db.get(Media, mid)
        if m is None or m.imported_by != "url":
            continue
        if db.query(CatalogProductMedia).filter(CatalogProductMedia.media_id == mid).first():
            continue
        if db.query(EcommerceItemMedia).filter(EcommerceItemMedia.media_id == mid, ~EcommerceItemMedia.item_id.in_(owner_keys)).first():
            continue
        stored = (m.url or "").rsplit("/", 1)[-1]
        if stored and db.query(CatalogProduct.id).filter(
            CatalogProduct.description.like(f"%{stored}%") | CatalogProduct.short_description.like(f"%{stored}%")
        ).first():
            continue
        db.query(EcommerceItemMedia).filter(EcommerceItemMedia.media_id == mid, EcommerceItemMedia.item_id.in_(owner_keys)).delete(synchronize_session=False)
        _delete_media_row(m, db)
        removed += 1
    if removed:
        db.commit()
    return removed
