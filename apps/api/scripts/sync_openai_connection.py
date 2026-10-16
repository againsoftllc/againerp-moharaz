#!/usr/bin/env python3
"""Refresh cloud AI connection status from AgainERP Center gateway health."""

from app.database import SessionLocal
from app.services.ai_connection_sync import refresh_center_gateway_connections


def main() -> None:
    db = SessionLocal()
    try:
        result = refresh_center_gateway_connections(db)
        print(f"Center gateway connection status: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
