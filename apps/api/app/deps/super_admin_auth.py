from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.super_admin_session import SuperAdminSession
from app.models.super_admin_user import SuperAdminUser


def require_super_admin(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> SuperAdminUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    session = (
        db.query(SuperAdminSession)
        .filter(SuperAdminSession.token == token, SuperAdminSession.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = db.get(SuperAdminUser, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account inactive")
    return user
