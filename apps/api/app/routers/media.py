from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.services.media_storage import save_media_bytes, get_cloudflare_plugin, local_public_url
from app.services.cloudflare_client import delete_from_r2
from app.deps.auth import get_current_company_id, require_write_access
from app.database import get_db
from app.models.media import Media
from app.schemas.media import (
    MediaBatchCreateRequest,
    MediaCreate,
    MediaListMeta,
    MediaListResponse,
    MediaMigrateRequest,
    MediaMigrateResponse,
    MediaMigrateMeta,
    MediaMigrateItemResult as MediaMigrateItemResultSchema,
    MediaRead,
    MediaResponse,
    MediaUpdate,
    derive_labels_from_file_name,
)
from app.services.media_migrate import migrate_media_by_ids, migrate_one_with_bytes
from app.services.cloudflare_client import CloudflareError

router = APIRouter(prefix="/media", tags=["media"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "media"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp"}
ALLOWED_VIDEO = {".mp4", ".webm", ".mov", ".m4v", ".ogv"}
ALLOWED_DOC = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".odt", ".ods"}


def _normalize_media_url(url: str | None) -> str | None:
    """Rewrite localhost/API-host upload URLs to relative /uploads paths."""
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


def _apply_patch(row: Media, payload: MediaUpdate) -> None:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return

    if "name" in changes and changes["name"] != row.name:
        new_name = changes["name"]
        title, alt = derive_labels_from_file_name(new_name)
        if row.title_linked_to_name:
            row.title = title
        if row.alt_linked_to_name:
            row.alt = alt
        if row.local_path:
            slash = row.local_path.rfind("/")
            row.local_path = (
                f"{row.local_path[: slash + 1]}{new_name}" if slash >= 0 else new_name
            )
        row.name = new_name
        changes.pop("name", None)

    if "title" in changes:
        row.title = changes["title"]
        row.title_linked_to_name = False
        changes.pop("title", None)

    if "alt" in changes:
        row.alt = changes["alt"]
        row.alt_linked_to_name = False
        changes.pop("alt", None)

    for key, value in changes.items():
        setattr(row, key, value)


def _classify_filename(filename: str, mime: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in ALLOWED_VIDEO or mime.startswith("video/"):
        return "video"
    if ext in ALLOWED_DOC or mime.startswith("application/") or mime.startswith("text/"):
        return "document"
    return "image"


def _public_upload_url(filename: str) -> str:
    return local_public_url(filename)


def _scoped_media(db: Session, media_id: str, company_id: str) -> Media:
    row = db.get(Media, media_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Media not found")
    return row


@router.get("", response_model=MediaListResponse)
def list_media(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    query: Optional[str] = Query(None),
    media_type: Optional[str] = Query(None, alias="type"),
    limit: Optional[int] = Query(None, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ids: Optional[str] = Query(None, description="comma-separated media ids (the picker's already-selected files)"),
) -> MediaListResponse:
    """`limit` / `offset` page the library (the admin grid loads as it scrolls — the whole library is tens of
    thousands of files, ~35 MB in one response); without `limit` everything comes back as before. `count` is
    always the total that matches."""
    q = db.query(Media).filter(Media.company_id == company_id).order_by(Media.created_at.desc(), Media.id.desc())
    if media_type:
        q = q.filter(Media.media_type == media_type)
    if ids:
        q = q.filter(Media.id.in_([i.strip() for i in ids.split(",") if i.strip()][:500]))
    if query:
        term = f"%{query.strip()}%"
        q = q.filter(
            (Media.name.ilike(term))
            | (Media.title.ilike(term))
            | (Media.alt.ilike(term))
        )
    if limit is None:
        rows = q.all()
        return MediaListResponse(data=[_to_read(r) for r in rows], meta=MediaListMeta(count=len(rows)))
    total = q.order_by(None).count()
    rows = q.offset(offset).limit(limit).all()
    return MediaListResponse(data=[_to_read(r) for r in rows], meta=MediaListMeta(count=total))


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
    media_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
) -> MediaResponse:
    row = _scoped_media(db, media_id, company_id)
    return MediaResponse(data=_to_read(row))


@router.post("", response_model=MediaResponse, status_code=201)
def create_media(
    payload: MediaCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaResponse:
    row = Media(**payload.model_dump(), company_id=company_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return MediaResponse(data=_to_read(row))


@router.post("/batch", response_model=MediaListResponse, status_code=201)
def create_media_batch(
    payload: MediaBatchCreateRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaListResponse:
    rows: List[Media] = []
    for item in payload.items:
        row = Media(**item.model_dump(), company_id=company_id)
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    data = [_to_read(r) for r in rows]
    return MediaListResponse(data=data, meta=MediaListMeta(count=len(data)))


@router.post("/upload", response_model=MediaListResponse, status_code=201)
async def upload_media(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaListResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    created: List[Media] = []
    for upload in files:
        filename = upload.filename or "upload.bin"
        ext = Path(filename).suffix.lower()
        allowed = ALLOWED_IMAGE | ALLOWED_VIDEO | ALLOWED_DOC
        if ext not in allowed:
            continue

        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
        stored = f"{uuid.uuid4().hex}_{safe_name}"
        content = await upload.read()

        mime = upload.content_type or "application/octet-stream"
        media_type = _classify_filename(filename, mime)
        title, alt = derive_labels_from_file_name(filename)
        public_url, local_path, provider = save_media_bytes(db, stored, content, mime)
        row = Media(
            company_id=company_id,
            name=filename,
            title=title,
            folder="Documents" if media_type == "document" else "Uploads",
            url=public_url,
            media_type=media_type,
            mime_type=mime,
            size_kb=max(1, len(content) // 1024),
            alt=alt if media_type != "document" else title,
            local_path=local_path,
            imported_by="file",
            provider=provider,
            uploaded_by="You",
            title_linked_to_name=True,
            alt_linked_to_name=media_type != "document",
        )
        db.add(row)
        created.append(row)

    if not created:
        raise HTTPException(status_code=400, detail="No allowed files in upload")

    db.commit()
    for row in created:
        db.refresh(row)

    data = [_to_read(r) for r in created]
    return MediaListResponse(data=data, meta=MediaListMeta(count=len(data)))


@router.post("/migrate", response_model=MediaMigrateResponse)
def migrate_media(
    payload: MediaMigrateRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaMigrateResponse:
    try:
        results = migrate_media_by_ids(db, payload.ids, payload.target, company_id=company_id)
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    moved = sum(1 for r in results if r.ok and not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    failed = sum(1 for r in results if not r.ok and not r.skipped)
    return MediaMigrateResponse(
        data=[
            MediaMigrateItemResultSchema(
                id=r.id,
                ok=r.ok,
                skipped=r.skipped,
                message=r.message,
                provider=r.provider,
            )
            for r in results
        ],
        meta=MediaMigrateMeta(moved=moved, skipped=skipped, failed=failed),
    )


@router.post("/migrate-bytes", response_model=MediaMigrateResponse)
async def migrate_media_bytes(
    media_id: str = Form(...),
    target: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaMigrateResponse:
    """Migrate using bytes fetched by the admin/CDN proxy (Railway cannot reach some CDNs)."""
    if target not in {"local", "r2"}:
        raise HTTPException(status_code=400, detail="target must be local or r2")
    row = _scoped_media(db, media_id, company_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        result = migrate_one_with_bytes(
            db,
            row,
            target,  # type: ignore[arg-type]
            content,
            filename=file.filename or row.name,
        )
    except CloudflareError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)[:240]) from exc

    moved = 1 if result.ok and not result.skipped else 0
    skipped = 1 if result.skipped else 0
    failed = 0 if result.ok or result.skipped else 1
    return MediaMigrateResponse(
        data=[
            MediaMigrateItemResultSchema(
                id=result.id,
                ok=result.ok,
                skipped=result.skipped,
                message=result.message,
                provider=result.provider,
            )
        ],
        meta=MediaMigrateMeta(moved=moved, skipped=skipped, failed=failed),
    )


@router.patch("/{media_id}", response_model=MediaResponse)
def update_media(
    media_id: str,
    payload: MediaUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> MediaResponse:
    row = _scoped_media(db, media_id, company_id)
    _apply_patch(row, payload)
    db.commit()
    db.refresh(row)
    return MediaResponse(data=_to_read(row))


def _delete_media_row(row: Media, db: Session) -> None:
    if row.provider == "r2" and row.local_path and row.local_path.startswith("r2://"):
        try:
            cf = get_cloudflare_plugin(db)
            if cf:
                # local_path format: r2://{bucket}/{key}  e.g. r2://againerp/media/file.jpg
                # strip scheme and bucket → key = "media/file.jpg"
                without_scheme = row.local_path[5:]  # "againerp/media/file.jpg"
                key = without_scheme.split("/", 1)[1] if "/" in without_scheme else without_scheme
                delete_from_r2(cf, key)
        except Exception:
            pass
    db.delete(row)


@router.delete("/bulk", status_code=204)
def delete_media_bulk(
    ids: List[str],
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    for media_id in ids:
        row = (
            db.query(Media)
            .filter(Media.id == media_id, Media.company_id == company_id)
            .first()
        )
        if row:
            _delete_media_row(row, db)
    db.commit()


@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
    company_id: str = Depends(get_current_company_id),
) -> None:
    row = _scoped_media(db, media_id, company_id)
    _delete_media_row(row, db)
    db.commit()
