from __future__ import annotations

import re
import uuid
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


class CatalogImportImagesRequest(BaseModel):
    urls: list[HttpUrl] = Field(default_factory=list, max_length=8)
    alt_prefix: Optional[str] = None


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


def _import_single_image(
    db: Session,
    url: str,
    *,
    company_id: str,
    alt_prefix: Optional[str] = None,
) -> Media:
    with httpx.Client(
        timeout=FETCH_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
    ) as client:
        response = client.get(url)
        response.raise_for_status()

        content_type = (response.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if not content_type.startswith("image/"):
            raise ValueError(f"Not an image ({content_type})")

        content = response.content[:MAX_IMAGE_BYTES]
        if not content:
            raise ValueError("Empty image response")

    filename = _filename_from_url(url, content_type)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE:
        raise ValueError(f"Unsupported image type: {ext or 'unknown'}")

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    stored = f"{uuid.uuid4().hex}_{safe_name}"
    media_type = _classify_filename(filename, content_type)
    title, alt = derive_labels_from_file_name(filename)
    if alt_prefix:
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

    for raw_url in payload.urls:
        url = str(raw_url)
        try:
            row = _import_single_image(
                db, url, company_id=company_id, alt_prefix=payload.alt_prefix
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
