"""Migration: create auth_activity_log table."""
import sys
sys.path.insert(0, "/app")

from app.database import engine
from sqlalchemy import text

CREATE = """
CREATE TABLE IF NOT EXISTS auth_activity_log (
    id          VARCHAR(36)  PRIMARY KEY,
    user_id     VARCHAR(36)  NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    actor_id    VARCHAR(36),
    actor_name  VARCHAR(255),
    action      VARCHAR(64)  NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON auth_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON auth_activity_log(created_at DESC);
"""

with engine.begin() as conn:
    conn.execute(text(CREATE))

print("auth_activity_log table ready.")
