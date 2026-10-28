"""Sign-in security for staff accounts (OnerERP spec §3.1, §2.2): wrong-password lockout, password expiry, a forced password
change, and ending sessions.

The rules are company settings (module settings page `security`): `lockoutAttempts` wrong passwords in a row lock the account for
`lockoutMinutes`; with `passwordExpiryDays` > 0 a password older than that must be changed before anything else.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.security import verify_password
from app.services.core.module_settings import get_module_setting

MIN_PASSWORD_LENGTH = 8

# While a password change is due, these are the only API paths the account may use.
PASSWORD_CHANGE_PATHS = ("/api/v1/auth/me", "/api/v1/auth/change-password", "/api/v1/auth/logout")
PASSWORD_CHANGE_REQUIRED = "Password change required: set a new password before you continue."


def ensure_auth_security_columns() -> None:
    """Additive columns (the project's ensure_* pattern)."""
    statements = [
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP",
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP",
        "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip VARCHAR(64)",
        "ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255)",
        # existing accounts count their password from now, so turning expiry on does not lock everyone out at once
        "UPDATE auth_users SET password_changed_at = COALESCE(updated_at, NOW()) WHERE password_changed_at IS NULL",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _int_setting(db: Session, company_id: str, key: str, default: int, low: int, high: int) -> int:
    try:
        value = int(get_module_setting(db, company_id, "security", key))
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def lockout_rule(db: Session, company_id: str) -> tuple[int, int]:
    """(wrong passwords in a row before the lock, minutes locked). 0 attempts = no lockout."""
    return (
        _int_setting(db, company_id, "lockoutAttempts", 5, 0, 20),
        _int_setting(db, company_id, "lockoutMinutes", 15, 1, 1440),
    )


def password_expiry_days(db: Session, company_id: str) -> int:
    return _int_setting(db, company_id, "passwordExpiryDays", 0, 0, 3650)


def password_expires_at(db: Session, user: AuthUser) -> Optional[datetime]:
    days = password_expiry_days(db, user.company_id)
    if days <= 0 or user.password_changed_at is None:
        return None
    return user.password_changed_at + timedelta(days=days)


def password_change_due(db: Session, user: AuthUser, *, now: Optional[datetime] = None) -> bool:
    if user.must_change_password:
        return True
    expires = password_expires_at(db, user)
    return expires is not None and (now or datetime.utcnow()) >= expires


def check_not_locked(user: AuthUser, *, now: Optional[datetime] = None) -> None:
    now = now or datetime.utcnow()
    if user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise HTTPException(
            status_code=423,
            detail=f"Too many wrong passwords. This account is locked for {minutes} more minute(s), or until an administrator unlocks it.",
        )


def register_failed_login(db: Session, user: AuthUser, *, now: Optional[datetime] = None) -> bool:
    """Count a wrong password. Returns True when this attempt locked the account."""
    now = now or datetime.utcnow()
    attempts, minutes = lockout_rule(db, user.company_id)
    user.failed_login_count = (user.failed_login_count or 0) + 1
    if attempts and user.failed_login_count >= attempts:
        user.locked_until = now + timedelta(minutes=minutes)
        user.failed_login_count = 0
        return True
    return False


def register_login(user: AuthUser, *, now: Optional[datetime] = None) -> None:
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now or datetime.utcnow()


def unlock(user: AuthUser) -> None:
    user.failed_login_count = 0
    user.locked_until = None


def check_new_password(user: AuthUser, new_password: str) -> None:
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"The new password needs at least {MIN_PASSWORD_LENGTH} characters")
    if not any(c.isalpha() for c in new_password) or not any(c.isdigit() for c in new_password):
        raise HTTPException(status_code=400, detail="The new password needs at least one letter and one digit")
    if verify_password(new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="The new password must be different from the current one")


def revoke_sessions(db: Session, user_id: str, *, keep_token: Optional[str] = None) -> int:
    query = db.query(AuthSession).filter(AuthSession.user_id == user_id)
    if keep_token:
        query = query.filter(AuthSession.token != keep_token)
    return query.delete(synchronize_session=False)


def active_sessions(db: Session, user_id: str) -> list[AuthSession]:
    return (
        db.query(AuthSession)
        .filter(AuthSession.user_id == user_id, AuthSession.expires_at > datetime.utcnow())
        .order_by(AuthSession.created_at.desc())
        .all()
    )


def session_label(session: AuthSession) -> str:
    """"Chrome on Windows" style text from the stored user agent."""
    ua = (session.user_agent or "").lower()
    if not ua:
        return "Unknown device"
    if "againerp-extension" in ua:
        return "Browser extension"
    browser = next((name for key, name in (("edg/", "Edge"), ("chrome/", "Chrome"), ("firefox/", "Firefox"), ("safari/", "Safari")) if key in ua), "Browser")
    system = next(
        (name for key, name in (("android", "Android"), ("iphone", "iPhone"), ("ipad", "iPad"), ("windows", "Windows"), ("mac os", "macOS"), ("linux", "Linux")) if key in ua),
        "",
    )
    return f"{browser} on {system}" if system else browser
