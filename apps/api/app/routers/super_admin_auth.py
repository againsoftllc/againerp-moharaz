from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.super_admin_auth import require_super_admin
from app.models.super_admin_session import SuperAdminSession
from app.models.super_admin_user import SuperAdminUser
from app.schemas.super_admin import (
    SuperAdminLoginRequest,
    SuperAdminLoginResponse,
    SuperAdminLogoutResponse,
    SuperAdminMeResponse,
    SuperAdminRead,
)
from app.security import new_session_token, verify_password

router = APIRouter(prefix="/super-admin/auth", tags=["super-admin-auth"])

SESSION_DAYS = 7


def _read(user: SuperAdminUser) -> SuperAdminRead:
    return SuperAdminRead(
        id=user.id,
        email=user.email,
        username=user.username,
        name=user.name,
        is_active=user.is_active,
    )


@router.post("/login", response_model=SuperAdminLoginResponse)
def login(payload: SuperAdminLoginRequest, db: Session = Depends(get_db)) -> SuperAdminLoginResponse:
    identifier = payload.email.strip().lower()
    user = (
        db.query(SuperAdminUser).filter(SuperAdminUser.email == identifier).first()
        or db.query(SuperAdminUser).filter(SuperAdminUser.username == identifier).first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    token = new_session_token()
    db.add(SuperAdminSession(user_id=user.id, token=token, expires_at=expires_at))
    db.commit()
    return SuperAdminLoginResponse(token=token, expires_at=expires_at, user=_read(user))


@router.get("/me", response_model=SuperAdminMeResponse)
def me(user: SuperAdminUser = Depends(require_super_admin)) -> SuperAdminMeResponse:
    return SuperAdminMeResponse(data=_read(user))


@router.post("/logout", response_model=SuperAdminLogoutResponse)
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> SuperAdminLogoutResponse:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        db.query(SuperAdminSession).filter(SuperAdminSession.token == token).delete()
        db.commit()
    return SuperAdminLogoutResponse()
