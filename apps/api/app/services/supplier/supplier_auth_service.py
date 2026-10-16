"""Supplier portal authentication.

Password hashing and token generation come from app.security — the same
primitives the admin login uses. Nothing crypto-related is reimplemented here.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.commerce_supplier import CommerceSupplier
from app.models.supplier_user import SupplierSession, SupplierUser
from app.security import hash_password, new_session_token, verify_password

SESSION_TTL = timedelta(hours=12)
INVITE_TTL = timedelta(days=7)
MIN_PASSWORD_LENGTH = 8
MAX_FAILED_LOGINS = 10


def _normalise_email(email: str) -> str:
    return email.strip().lower()


# ------------------------------------------------------------------- invites


def invite_user(
    db: Session,
    *,
    supplier_id: str,
    email: str,
    name: str,
    company_id: str,
    invited_by: Optional[str],
) -> SupplierUser:
    supplier = db.get(CommerceSupplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    address = _normalise_email(email)
    existing = db.query(SupplierUser).filter(SupplierUser.email == address).first()
    if existing and existing.supplier_id != supplier_id:
        # Do not reveal which supplier already owns it.
        raise HTTPException(status_code=409, detail="That email already has portal access")

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + INVITE_TTL

    if existing:
        existing.name = name or existing.name
        existing.invite_token = token
        existing.invite_expires_at = expires
        existing.is_active = True
        row = existing
    else:
        row = SupplierUser(
            company_id=company_id,
            supplier_id=supplier_id,
            email=address,
            name=name,
            invite_token=token,
            invite_expires_at=expires,
            invited_by=invited_by,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return row


def accept_invite(db: Session, *, token: str, password: str) -> SupplierUser:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    row = db.query(SupplierUser).filter(SupplierUser.invite_token == token).first()
    if not row or not row.invite_expires_at or row.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite is invalid or has expired")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="This portal account is disabled")

    row.password_hash = hash_password(password)
    row.invite_token = None
    row.invite_expires_at = None
    row.accepted_at = datetime.utcnow()
    row.failed_login_attempts = 0
    db.commit()
    db.refresh(row)
    return row


def revoke_access(db: Session, *, supplier_user_id: str, supplier_id: str) -> SupplierUser:
    row = db.get(SupplierUser, supplier_user_id)
    if not row or row.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Portal user not found")
    row.is_active = False
    row.invite_token = None
    row.invite_expires_at = None
    # Kill live sessions immediately, not just future logins.
    db.query(SupplierSession).filter(SupplierSession.supplier_user_id == row.id).delete()
    db.commit()
    db.refresh(row)
    return row


def list_users(db: Session, supplier_id: str) -> list[SupplierUser]:
    return (
        db.query(SupplierUser)
        .filter(SupplierUser.supplier_id == supplier_id)
        .order_by(SupplierUser.created_at.asc())
        .all()
    )


# -------------------------------------------------------------------- login


def login(db: Session, *, email: str, password: str) -> tuple[SupplierUser, SupplierSession]:
    address = _normalise_email(email)
    row = db.query(SupplierUser).filter(SupplierUser.email == address).first()

    # One generic message for every failure path — no account enumeration.
    invalid = HTTPException(status_code=401, detail="Invalid email or password")

    if not row or not row.password_hash or not row.is_active:
        raise invalid
    if row.failed_login_attempts >= MAX_FAILED_LOGINS:
        raise HTTPException(
            status_code=423,
            detail="Too many failed attempts. Ask the buyer to reset your access.",
        )
    if not verify_password(password, row.password_hash):
        row.failed_login_attempts += 1
        db.commit()
        raise invalid

    supplier = db.get(CommerceSupplier, row.supplier_id)
    if not supplier or supplier.status == "blocked":
        raise HTTPException(status_code=403, detail="This supplier account is not active")

    row.failed_login_attempts = 0
    row.last_login_at = datetime.utcnow()

    session = SupplierSession(
        supplier_user_id=row.id,
        supplier_id=row.supplier_id,
        token=new_session_token(),
        expires_at=datetime.utcnow() + SESSION_TTL,
    )
    db.add(session)
    db.commit()
    db.refresh(row)
    db.refresh(session)
    return row, session


def logout(db: Session, token: str) -> None:
    db.query(SupplierSession).filter(SupplierSession.token == token).delete()
    db.commit()


def resolve_session(db: Session, token: str) -> tuple[SupplierUser, SupplierSession]:
    session = (
        db.query(SupplierSession)
        .filter(
            SupplierSession.token == token,
            SupplierSession.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.get(SupplierUser, session.supplier_user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Portal account is disabled")
    return user, session


def change_password(db: Session, user: SupplierUser, *, current: str, new: str) -> None:
    if not user.password_hash or not verify_password(current, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    user.password_hash = hash_password(new)
    db.commit()
