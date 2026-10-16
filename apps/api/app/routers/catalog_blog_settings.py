from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.blog_settings import DEFAULT_BLOG_SETTINGS_ID, BlogSettings
from app.schemas.blog import BlogSettingsRead, BlogSettingsResponse, BlogSettingsUpdate

router = APIRouter(prefix="/blog/settings", tags=["catalog-blog"])


def _get_or_create(db: Session) -> BlogSettings:
    row = db.get(BlogSettings, DEFAULT_BLOG_SETTINGS_ID)
    if row:
        return row
    row = BlogSettings(id=DEFAULT_BLOG_SETTINGS_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: BlogSettings) -> BlogSettingsRead:
    return BlogSettingsRead.model_validate(row)


@router.get("", response_model=BlogSettingsResponse)
def get_settings(db: Session = Depends(get_db)) -> BlogSettingsResponse:
    row = _get_or_create(db)
    return BlogSettingsResponse(data=_to_read(row))


@router.patch("", response_model=BlogSettingsResponse)
def update_settings(
    payload: BlogSettingsUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogSettingsResponse:
    row = _get_or_create(db)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return BlogSettingsResponse(data=_to_read(row))

    slug = changes.get("blog_base_slug", row.blog_base_slug)
    if slug != row.blog_base_slug and not slug.replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Blog base slug must be alphanumeric")

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return BlogSettingsResponse(data=_to_read(row))
