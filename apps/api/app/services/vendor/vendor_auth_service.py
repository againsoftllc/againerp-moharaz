"""Vendor portal authentication — mirrors app.services.supplier.supplier_auth_service.

Password hashing and token generation come from app.security — the same
primitives admin login and the supplier portal use. Nothing crypto-related
is reimplemented here.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.collab_activity import CollabActivity
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_user import VendorSession, VendorUser
from app.security import hash_password, new_session_token, verify_password

SESSION_TTL = timedelta(hours=12)
INVITE_TTL = timedelta(days=7)
MIN_PASSWORD_LENGTH = 8
MAX_FAILED_LOGINS = 10


def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _log(
    db: Session,
    *,
    entity_id: str,
    action: str,
    performed_by: Optional[str],
    performed_by_type: str = "vendor_user",
    details: Optional[str] = None,
) -> None:
    db.add(
        CollabActivity(
            entity_type="vendor",
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type=performed_by_type,
            details_json=details,
        )
    )


# ------------------------------------------------------------------- invites


def invite_user(
    db: Session,
    *,
    vendor_id: str,
    email: str,
    name: str,
    role: str,
    company_id: str,
    invited_by: Optional[str],
) -> VendorUser:
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    address = _normalise_email(email)
    existing = db.query(VendorUser).filter(VendorUser.email == address).first()
    if existing and existing.vendor_id != vendor_id:
        # Do not reveal which vendor already owns it.
        raise HTTPException(status_code=409, detail="That email already has portal access")

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + INVITE_TTL

    if existing:
        existing.name = name or existing.name
        existing.role = role or existing.role
        existing.invite_token = token
        existing.invite_expires_at = expires
        existing.is_active = True
        row = existing
    else:
        row = VendorUser(
            company_id=company_id,
            vendor_id=vendor_id,
            email=address,
            name=name,
            role=role or "staff",
            invite_token=token,
            invite_expires_at=expires,
            invited_by=invited_by,
        )
        db.add(row)

    _log(db, entity_id=vendor_id, action="vendor_user_invited", performed_by=invited_by, performed_by_type="user")
    db.commit()
    db.refresh(row)
    return row


def accept_invite(db: Session, *, token: str, password: str) -> tuple[VendorUser, VendorSession]:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    row = db.query(VendorUser).filter(VendorUser.invite_token == token).first()
    if not row or not row.invite_expires_at or row.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite is invalid or has expired")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="This portal account is disabled")

    row.password_hash = hash_password(password)
    row.invite_token = None
    row.invite_expires_at = None
    row.accepted_at = datetime.utcnow()
    row.failed_login_attempts = 0

    # Land the vendor signed in immediately — no separate login round-trip.
    session = VendorSession(
        vendor_user_id=row.id,
        vendor_id=row.vendor_id,
        token=new_session_token(),
        expires_at=datetime.utcnow() + SESSION_TTL,
    )
    db.add(session)
    _log(db, entity_id=row.vendor_id, action="vendor_user_invite_accepted", performed_by=row.id)
    db.commit()
    db.refresh(row)
    db.refresh(session)
    return row, session


def revoke_access(db: Session, *, vendor_user_id: str, vendor_id: str, performed_by: Optional[str]) -> VendorUser:
    row = db.get(VendorUser, vendor_user_id)
    if not row or row.vendor_id != vendor_id:
        raise HTTPException(status_code=404, detail="Portal user not found")
    row.is_active = False
    row.invite_token = None
    row.invite_expires_at = None
    # Kill live sessions immediately, not just future logins.
    db.query(VendorSession).filter(VendorSession.vendor_user_id == row.id).delete()
    _log(db, entity_id=vendor_id, action="vendor_user_revoked", performed_by=performed_by, performed_by_type="user")
    db.commit()
    db.refresh(row)
    return row


def list_users(db: Session, vendor_id: str) -> list[VendorUser]:
    return (
        db.query(VendorUser)
        .filter(VendorUser.vendor_id == vendor_id)
        .order_by(VendorUser.created_at.asc())
        .all()
    )


# -------------------------------------------------------------------- login


def login(db: Session, *, email: str, password: str) -> tuple[VendorUser, VendorSession]:
    address = _normalise_email(email)
    row = db.query(VendorUser).filter(VendorUser.email == address).first()

    # One generic message for every failure path — no account enumeration.
    invalid = HTTPException(status_code=401, detail="Invalid email or password")

    if not row or not row.password_hash or not row.is_active:
        raise invalid
    if row.failed_login_attempts >= MAX_FAILED_LOGINS:
        raise HTTPException(
            status_code=423,
            detail="Too many failed attempts. Ask your account manager to reset your access.",
        )
    if not verify_password(password, row.password_hash):
        row.failed_login_attempts += 1
        db.commit()
        raise invalid

    vendor = db.get(Vendor, row.vendor_id)
    if not vendor or not vendor.portal_enabled or vendor.status in {"suspended", "blocked", "archived"}:
        raise HTTPException(status_code=403, detail="This vendor account is not active")

    row.failed_login_attempts = 0
    row.last_login_at = datetime.utcnow()

    session = VendorSession(
        vendor_user_id=row.id,
        vendor_id=row.vendor_id,
        token=new_session_token(),
        expires_at=datetime.utcnow() + SESSION_TTL,
    )
    db.add(session)
    _log(db, entity_id=row.vendor_id, action="vendor_user_login", performed_by=row.id)
    db.commit()
    db.refresh(row)
    db.refresh(session)
    return row, session


def logout(db: Session, token: str) -> None:
    db.query(VendorSession).filter(VendorSession.token == token).delete()
    db.commit()


def resolve_session(db: Session, token: str) -> tuple[VendorUser, VendorSession]:
    session = (
        db.query(VendorSession)
        .filter(VendorSession.token == token, VendorSession.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.get(VendorUser, session.vendor_user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Portal account is disabled")
    return user, session


def change_password(db: Session, user: VendorUser, *, current: str, new: str) -> None:
    if not user.password_hash or not verify_password(current, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    user.password_hash = hash_password(new)
    db.commit()
