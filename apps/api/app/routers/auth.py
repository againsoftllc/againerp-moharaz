from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_activity_log import AuthActivityLog
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    MeResponse,
    SessionListResponse,
    SessionRead,
)
from app.security import hash_password, new_session_token, verify_password
from app.services.core import auth_security
from app.services import rbac as rbac_service
from app.services.auth_user_read import user_read

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_DAYS = 7


def _enabled_modules(db: Session, company_id: str) -> Optional[List[str]]:
    company = db.get(Company, company_id)
    if not company or not company.enabled_modules:
        return None
    try:
        return json.loads(company.enabled_modules)
    except (ValueError, TypeError):
        return None


def _log(db: Session, user: AuthUser, action: str, detail: str) -> None:
    db.add(AuthActivityLog(id=__import__("uuid").uuid4().__str__(), user_id=user.id, action=action, detail=detail))


def _client(request: Request) -> tuple[Optional[str], Optional[str]]:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = forwarded or (request.client.host if request.client else None)
    return (ip[:64] if ip else None), ((request.headers.get("user-agent") or "")[:255] or None)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    identifier = payload.email.strip().lower()
    user = (
        db.query(AuthUser).filter(AuthUser.email == identifier).first()
        or db.query(AuthUser).filter(AuthUser.username == identifier).first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    auth_security.check_not_locked(user)
    ip, user_agent = _client(request)
    if not verify_password(payload.password, user.password_hash):
        locked = auth_security.register_failed_login(db, user)
        _log(db, user, "login_locked" if locked else "login_failed",
             f"Account locked after wrong passwords{f' from {ip}' if ip else ''}" if locked else f"Wrong password{f' from {ip}' if ip else ''}")
        db.commit()
        if locked:
            auth_security.check_not_locked(user)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    auth_security.register_login(user)
    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token=token, expires_at=expires_at, ip=ip, user_agent=user_agent))
    db.add(AuthActivityLog(
        id=__import__("uuid").uuid4().__str__(),
        user_id=user.id,
        action="login",
        detail="Signed in",
    ))
    db.commit()
    return LoginResponse(
        token=token,
        expires_at=expires_at,
        user=user_read(db, user),
        permissions=rbac_service.permissions_for_api(db, user),
        enabled_modules=_enabled_modules(db, user.company_id),
    )


@router.get("/me", response_model=MeResponse)
def me(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    return MeResponse(
        data=user_read(db, user),
        permissions=rbac_service.permissions_for_api(db, user),
        enabled_modules=_enabled_modules(db, user.company_id),
    )


EXTENSION_SESSION_DAYS = 30


@router.post("/extension-session")
def extension_session(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """The "Send to AgainERP" browser extension signs in through the admin (no password is typed into the extension): the admin page,
    already signed in, asks for a session of its own for the extension. It ends with the extension's Sign out, or on expiry."""
    expires_at = datetime.utcnow() + timedelta(days=EXTENSION_SESSION_DAYS)
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token=token, expires_at=expires_at, user_agent="againerp-extension"))
    db.add(AuthActivityLog(
        id=__import__("uuid").uuid4().__str__(),
        user_id=user.id,
        action="extension_connect",
        detail="Browser extension connected",
    ))
    db.commit()
    return {"token": token, "expires_at": expires_at.isoformat(), "user": {"name": user.name, "email": user.email}}


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip()
    return None


@router.post("/change-password", response_model=MeResponse)
def change_password(
    payload: ChangePasswordRequest,
    authorization: Optional[str] = Header(default=None),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    """The signed-in member changes their own password. Every other session of theirs ends; this one stays."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="The current password is not right")
    auth_security.check_new_password(user, payload.new_password)
    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = datetime.utcnow()
    user.must_change_password = False
    ended = auth_security.revoke_sessions(db, user.id, keep_token=_bearer(authorization))
    _log(db, user, "password_changed", "Changed their own password" + (f"; signed out {ended} other session(s)" if ended else ""))
    db.commit()
    db.refresh(user)
    return MeResponse(
        data=user_read(db, user),
        permissions=rbac_service.permissions_for_api(db, user),
        enabled_modules=_enabled_modules(db, user.company_id),
    )


def session_reads(db: Session, user_id: str, current_token: Optional[str]) -> list[SessionRead]:
    return [
        SessionRead(
            id=row.id,
            device=auth_security.session_label(row),
            ip=row.ip,
            created_at=row.created_at,
            expires_at=row.expires_at,
            current=bool(current_token) and row.token == current_token,
        )
        for row in auth_security.active_sessions(db, user_id)
    ]


@router.get("/sessions", response_model=SessionListResponse)
def my_sessions(
    authorization: Optional[str] = Header(default=None),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionListResponse:
    return SessionListResponse(data=session_reads(db, user.id, _bearer(authorization)))


@router.post("/sessions/sign-out-others", response_model=SessionListResponse)
def sign_out_others(
    authorization: Optional[str] = Header(default=None),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionListResponse:
    token = _bearer(authorization)
    ended = auth_security.revoke_sessions(db, user.id, keep_token=token)
    _log(db, user, "sessions_ended", f"Signed out {ended} other session(s)")
    db.commit()
    return SessionListResponse(data=session_reads(db, user.id, token))


@router.post("/logout", response_model=LogoutResponse)
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        db.query(AuthSession).filter(AuthSession.token == token).delete()
        db.commit()
    return LogoutResponse()
