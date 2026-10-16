"""Additive POS patches for databases that already have the original tables."""

from __future__ import annotations

from sqlalchemy import text

from app.database import engine


def ensure_pos_columns() -> None:
    statements = [
        "ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS terminal_id VARCHAR(36)",
        "ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS opening_note TEXT",
        "ALTER TABLE pos_sessions ADD COLUMN IF NOT EXISTS closing_note TEXT",
        "ALTER TABLE pos_carts ADD COLUMN IF NOT EXISTS order_discount NUMERIC(14,2) DEFAULT 0",
        "ALTER TABLE pos_cart_lines ADD COLUMN IF NOT EXISTS serial_number VARCHAR(128)",
        "ALTER TABLE pos_cart_lines ADD COLUMN IF NOT EXISTS warranty_text VARCHAR(200)",
        "ALTER TABLE pos_return_lines ADD COLUMN IF NOT EXISTS serial_number VARCHAR(128)",
        "CREATE INDEX IF NOT EXISTS ix_pos_sessions_terminal_id ON pos_sessions (terminal_id)",
        "CREATE INDEX IF NOT EXISTS ix_pos_cart_lines_serial_number ON pos_cart_lines (serial_number)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
