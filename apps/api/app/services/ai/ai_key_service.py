"""Where the Aladin (OpenAI) API key comes from.

Resolution order, per company:
1. Workspace-stored key — `ai_api_connections` row with provider_id "openai" saved from the
   AI screen (AI → Settings, administrators only). Lets a tenant configure Aladin without
   a redeploy and keeps the key out of the repo and the shell.
2. `OPENAI_API_KEY` environment variable — deployment-wide fallback.

The full key is never returned to a client; only a 4-character hint for display.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.ai_api_connection import AiApiConnection

OPENAI_PROVIDER_ID = "openai"
PROVIDER_LABEL = "Aladin"


def get_openai_connection(db: Session, company_id: str) -> Optional[AiApiConnection]:
    return (
        db.query(AiApiConnection)
        .filter(AiApiConnection.company_id == company_id, AiApiConnection.provider_id == OPENAI_PROVIDER_ID)
        .first()
    )


def resolve_openai_key(db: Optional[Session], company_id: Optional[str]) -> tuple[str, str]:
    """(key, source) — source is "workspace", "env" or "" when nothing is configured."""
    if db is not None and company_id:
        row = get_openai_connection(db, company_id)
        if row and row.status == "connected" and (row.api_key or "").strip():
            return row.api_key.strip(), "workspace"
    env_key = (get_settings().openai_api_key or "").strip()
    if env_key:
        return env_key, "env"
    return "", ""


def key_hint(key: str) -> str:
    key = (key or "").strip()
    return key[-4:] if len(key) >= 8 else ""


def set_openai_key(db: Session, company_id: str, api_key: str, *, base_url: str = "") -> AiApiConnection:
    key = (api_key or "").strip()
    if not key:
        raise ValueError("API key is required")
    row = get_openai_connection(db, company_id)
    if row is None:
        row = AiApiConnection(
            id=str(uuid.uuid4()),
            company_id=company_id,
            provider_id=OPENAI_PROVIDER_ID,
            provider_name=PROVIDER_LABEL,
        )
        db.add(row)
    row.provider_name = PROVIDER_LABEL
    row.api_key = key
    row.api_key_hint = key_hint(key)
    row.base_url = (base_url or "").strip()
    row.status = "connected"
    row.last_connected_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def clear_openai_key(db: Session, company_id: str) -> None:
    row = get_openai_connection(db, company_id)
    if row is None:
        return
    row.api_key = ""
    row.api_key_hint = ""
    row.status = "disconnected"
    db.commit()
