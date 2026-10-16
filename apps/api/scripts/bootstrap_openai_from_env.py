#!/usr/bin/env python3
"""Refresh AI connection rows from Center gateway (no local OpenAI key copy)."""

from app.database import SessionLocal
from app.services.ai_connection_sync import refresh_center_gateway_connections


def main() -> None:
    db = SessionLocal()
    try:
        result = refresh_center_gateway_connections(db)
        print(f"center_gateway_status: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
