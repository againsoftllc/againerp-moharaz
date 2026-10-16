#!/usr/bin/env python3
"""Ensure SQLAlchemy tables exist before seeding (safe to run repeatedly)."""

import scripts.init_db  # noqa: F401 — loads all models via init_db imports

from app.database import Base, engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print("Tables ready.")


if __name__ == "__main__":
    main()
