"""Per-user UI preferences (grid layouts and similar), stored server-side."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.user_ui_preference import UserUiPreference

router = APIRouter(prefix="/me/ui-prefs", tags=["ui-preferences"])

MAX_VALUE_BYTES = 64_000
KEY_PATTERN = r"^[A-Za-z0-9:_\-.]{1,120}$"


class UiPrefBody(BaseModel):
    value: Any = None


class UiPrefResponse(BaseModel):
    key: str
    value: Any = None
    found: bool


@router.get("/{key}", response_model=UiPrefResponse)
def get_ui_pref(
    key: str = Path(pattern=KEY_PATTERN),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> UiPrefResponse:
    row = db.query(UserUiPreference).filter_by(user_id=user.id, pref_key=key).first()
    if not row:
        return UiPrefResponse(key=key, value=None, found=False)
    try:
        value = json.loads(row.value_json)
    except ValueError:
        value = None
    return UiPrefResponse(key=key, value=value, found=True)


@router.put("/{key}", response_model=UiPrefResponse)
def put_ui_pref(
    body: UiPrefBody,
    key: str = Path(pattern=KEY_PATTERN),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> UiPrefResponse:
    raw = json.dumps(body.value)
    if len(raw.encode()) > MAX_VALUE_BYTES:
        raise HTTPException(status_code=413, detail="Preference value is too large")
    row = db.query(UserUiPreference).filter_by(user_id=user.id, pref_key=key).first()
    if not row:
        row = UserUiPreference(user_id=user.id, pref_key=key)
        db.add(row)
    row.value_json = raw
    db.commit()
    return UiPrefResponse(key=key, value=body.value, found=True)
