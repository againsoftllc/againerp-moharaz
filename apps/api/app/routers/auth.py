from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_activity_log import AuthActivityLog
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company import Company
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    MeResponse,
)
from app.security import new_session_token, verify_password
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


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    identifier = payload.email.strip().lower()
    user = (
        db.query(AuthUser).filter(AuthUser.email == identifier).first()
        or db.query(AuthUser).filter(AuthUser.username == identifier).first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token=token, expires_at=expires_at))
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
