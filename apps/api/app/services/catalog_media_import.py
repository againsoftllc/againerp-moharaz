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


def to_square(content: bytes, side: int = SQUARE_PX) -> bytes:
    """The photo scaled to FIT a side x side white square (never stretched or cropped), as a high-quality WebP."""
    from PIL import Image, ImageOps

    im = ImageOps.exif_transpose(Image.open(BytesIO(content)))
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, "white")
        flat.paste(im, mask=im.getchannel("A"))
        im = flat
    else:
        im = im.convert("RGB")
    im = ImageOps.contain(im, (side, side), method=Image.LANCZOS)
    canvas = Image.new("RGB", (side, side), "white")
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    out = BytesIO()
    canvas.save(out, format="WEBP", quality=92, method=6)
    return out.getvalue()


def _unique_stored_name(db: Session, wanted: str) -> str:
    if not db.query(Media.id).filter(Media.url.like(f"%/{wanted}")).first():
        return wanted
    stem, ext = wanted.rsplit(".", 1)
    return f"{stem}-{uuid.uuid4().hex[:4]}.{ext}"


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
    if square and ext not in (".svg", ".gif"):
        try:
            content, content_type = to_square(content), "image/webp"
            ext = ".webp"
            if name_prefix:
                seo_name = _unique_stored_name(db, f"{slug_part(name_prefix)}-{position}.webp")
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

    for position, raw_url in enumerate(payload.urls, start=1):
        url = str(raw_url)
        try:
            row = _import_single_image(
                db, url, company_id=company_id, alt_prefix=payload.alt_prefix,
                name_prefix=payload.name_prefix, position=position, square=payload.square,
            )
            db.flush()
            db.refresh(row)
            items.append(MediaRead.model_validate(row))
        except Exception as exc:
            failed.append(CatalogImportImageFailure(url=url, reason=str(exc)))

    if items:
        db.commit()
    else:
        db.rollback()

    return CatalogImportImagesResponse(items=items, failed=failed)
