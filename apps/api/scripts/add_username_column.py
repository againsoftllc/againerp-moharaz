#!/usr/bin/env python3
"""Add username column to auth_users and populate existing rows."""

import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models.auth_user import AuthUser


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9._-]", "", value)
    value = re.sub(r"[-_.]{2,}", "_", value)
    return value[:32].strip("_.-") or "user"


def main() -> None:
    with engine.connect() as conn:
        # Add column if it doesn't exist (idempotent)
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='auth_users' AND column_name='username'"
        ))
        if result.fetchone():
            print("Column 'username' already exists — checking for NULL values")
        else:
            conn.execute(text(
                "ALTER TABLE auth_users ADD COLUMN username VARCHAR(64)"
            ))
            conn.commit()
            print("Added column 'username'")

    db = SessionLocal()
    try:
        users = db.query(AuthUser).all()
        taken: set[str] = set()

        for user in users:
            if user.username:
                taken.add(user.username)

        for user in users:
            if user.username:
                continue
            base = slugify(user.email.split("@")[0])
            candidate = base
            i = 2
            while candidate in taken:
                candidate = f"{base}{i}"
                i += 1
            user.username = candidate
            taken.add(candidate)
            print(f"  {user.email} → username: {candidate}")

        db.commit()

        # Now add NOT NULL + UNIQUE constraints
        with engine.connect() as conn:
            # Drop index/constraint if already there from a previous partial run
            try:
                conn.execute(text("ALTER TABLE auth_users ALTER COLUMN username SET NOT NULL"))
                conn.commit()
                print("Set NOT NULL on username")
            except Exception:
                conn.rollback()

            try:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_users_username ON auth_users (username)"))
                conn.commit()
                print("Created unique index on username")
            except Exception as e:
                conn.rollback()
                print(f"Index may already exist: {e}")

        print("\nDone.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
