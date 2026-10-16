"""Idempotent bootstrap for the first super-admin account.

Creates one SuperAdminUser from env-configured credentials the first time
the table is empty. Safe to run on every boot — no-op once a row exists.
"""
from __future__ import annotations

from app.config import get_settings
from app.database import SessionLocal
from app.models.super_admin_user import SuperAdminUser
from app.security import hash_password


def ensure_super_admin_bootstrap() -> int:
    settings = get_settings()
    db = SessionLocal()
    try:
        if db.query(SuperAdminUser).count() > 0:
            return 0
        db.add(
            SuperAdminUser(
                email=settings.super_admin_email.strip().lower(),
                username=settings.super_admin_username.strip().lower(),
                name=settings.super_admin_name,
                password_hash=hash_password(settings.super_admin_password),
                is_active=True,
            )
        )
        db.commit()
        return 1
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    created = ensure_super_admin_bootstrap()
    print(f"Super-admin bootstrap: {created} account created")
