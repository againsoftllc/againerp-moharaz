from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_settings import DEFAULT_WEBSITE_SETTINGS_ID, WebsiteSettings
from app.schemas.website_settings import (
    WebsiteSettingsRead,
    WebsiteSettingsResponse,
    WebsiteSettingsUpdate,
)

router = APIRouter(prefix="/settings", tags=["website-settings"])


def _get_or_create(db: Session) -> WebsiteSettings:
    row = db.get(WebsiteSettings, DEFAULT_WEBSITE_SETTINGS_ID)
    if row:
        return row
    row = WebsiteSettings(id=DEFAULT_WEBSITE_SETTINGS_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_read(row: WebsiteSettings) -> WebsiteSettingsRead:
    return WebsiteSettingsRead.model_validate(row)


@router.get("", response_model=WebsiteSettingsResponse)
def get_settings(db: Session = Depends(get_db)) -> WebsiteSettingsResponse:
    row = _get_or_create(db)
    return WebsiteSettingsResponse(data=_to_read(row))


@router.patch("", response_model=WebsiteSettingsResponse)
def update_settings(
    payload: WebsiteSettingsUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteSettingsResponse:
    row = _get_or_create(db)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return WebsiteSettingsResponse(data=_to_read(row))
