"""Public storefront media library (Live Edit image picker)."""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.media import Media
from app.schemas.media import (
    MediaListMeta,
    MediaListResponse,
    MediaRead,
    derive_labels_from_file_name,
)
from app.services.media_storage import save_media_bytes

router = APIRouter(tags=["storefront-media"])

STOREFRONT_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=120"
ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp"}


def _normalize_media_url(url: str | None) -> str | None:
    if not url:
        return url
    value = url.strip()
    if not value:
        return value
    if value.startswith("/uploads/"):
        return value
    marker = "/uploads/"
    idx = value.find(marker)
    if idx >= 0:
        return value[idx:]
    return value


def _to_read(row: Media) -> MediaRead:
    data = MediaRead.model_validate(row)
    return data.model_copy(
        update={
            "url": _normalize_media_url(data.url) or data.url,
            "source_url": _normalize_media_url(data.source_url),
        }
    )


def _assert_live_edit_secret(x_live_edit_secret: Optional[str]) -> None:
    """Upload requires the same secret as storefront live-edit (server-side proxy)."""
    expected = (os.getenv("LIVE_EDIT_SECRET") or os.getenv("STOREFRONT_LIVE_EDIT_SECRET") or "").strip()
    # Local/dev convenience: if unset, allow upload (Docker local).
    if not expected:
        return
    if not x_live_edit_secret or x_live_edit_secret.strip() != expected:
        raise HTTPException(status_code=401, detail="Live-edit secret required for media upload")


@router.get("/media", response_model=MediaListResponse)
def storefront_media_list(
    response: Response,
    db: Session = Depends(get_db),
    query: Optional[str] = Query(None),
    limit: int = Query(120, ge=1, le=500),
) -> MediaListResponse:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    q = (
        db.query(Media)
        .filter(Media.media_type == "image")
        .order_by(Media.created_at.desc())
    )
    if query:
        term = f"%{query.strip()}%"
        q = q.filter(
            (Media.name.ilike(term))
            | (Media.title.ilike(term))
            | (Media.alt.ilike(term))
        )
    rows = q.limit(limit).all()
    return MediaListResponse(
        data=[_to_read(r) for r in rows],
        meta=MediaListMeta(count=len(rows)),
    )


@router.post("/media/upload", response_model=MediaListResponse, status_code=201)
async def storefront_media_upload(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    x_live_edit_secret: Optional[str] = Header(default=None),
) -> MediaListResponse:
    _assert_live_edit_secret(x_live_edit_secret)
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    created: List[Media] = []
    for upload in files:
        filename = upload.filename or "upload.bin"
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_IMAGE:
            continue

        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
        stored = f"{uuid.uuid4().hex}_{safe_name}"
        content = await upload.read()
        mime = upload.content_type or "image/jpeg"
        title, alt = derive_labels_from_file_name(filename)
        public_url, local_path, provider = save_media_bytes(db, stored, content, mime)
        row = Media(
            name=filename,
            title=title,
            folder="Uploads",
            url=public_url,
            media_type="image",
            mime_type=mime,
            size_kb=max(1, len(content) // 1024),
            alt=alt,
            local_path=local_path,
            imported_by="live-edit",
            provider=provider,
            uploaded_by="live-edit",
            title_linked_to_name=True,
            alt_linked_to_name=True,
        )
        db.add(row)
        created.append(row)

    if not created:
        raise HTTPException(status_code=400, detail="No allowed image files in upload")

    db.commit()
    for row in created:
        db.refresh(row)

    return MediaListResponse(
        data=[_to_read(r) for r in created],
        meta=MediaListMeta(count=len(created)),
    )
