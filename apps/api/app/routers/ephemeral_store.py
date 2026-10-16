"""Ephemeral JSON store for serverless BFF workflow sessions.

Keys are unguessable UUIDs under a commerce-* prefix. No admin JWT required so
Vercel progress/resume handlers can read state across instances.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ephemeral_blob import EphemeralBlob

router = APIRouter(prefix="/ephemeral", tags=["ephemeral"])

KEY_RE = re.compile(r"^commerce-[A-Za-z0-9._-]{8,180}$")
DEFAULT_TTL_SECONDS = 86_400
MAX_TTL_SECONDS = 604_800
MAX_PAYLOAD_CHARS = 2_000_000


class EphemeralPutBody(BaseModel):
    payload: Any = None
    ttl_seconds: int = Field(default=DEFAULT_TTL_SECONDS, ge=60, le=MAX_TTL_SECONDS)


class EphemeralGetResponse(BaseModel):
    key: str
    payload: Any = None
    expires_at: Optional[datetime] = None


def _validate_key(key: str) -> str:
    cleaned = key.strip()
    if not KEY_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid ephemeral key")
    return cleaned


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.put("/{key}", response_model=EphemeralGetResponse)
def put_ephemeral(key: str, body: EphemeralPutBody, db: Session = Depends(get_db)) -> EphemeralGetResponse:
    cleaned = _validate_key(key)
    raw = json.dumps(body.payload, ensure_ascii=False)
    if len(raw) > MAX_PAYLOAD_CHARS:
        raise HTTPException(status_code=413, detail="Payload too large")

    expires_at = _utcnow() + timedelta(seconds=body.ttl_seconds)
    row = db.get(EphemeralBlob, cleaned)
    if row is None:
        row = EphemeralBlob(key=cleaned, payload=raw, expires_at=expires_at)
        db.add(row)
    else:
        row.payload = raw
        row.expires_at = expires_at
        row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    return EphemeralGetResponse(key=cleaned, payload=body.payload, expires_at=row.expires_at)


@router.get("/{key}", response_model=EphemeralGetResponse)
def get_ephemeral(key: str, db: Session = Depends(get_db)) -> EphemeralGetResponse:
    cleaned = _validate_key(key)
    row = db.get(EphemeralBlob, cleaned)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if row.expires_at and row.expires_at < _utcnow():
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=404, detail="Expired")
    try:
        payload = json.loads(row.payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Corrupt payload") from exc
    return EphemeralGetResponse(key=cleaned, payload=payload, expires_at=row.expires_at)


@router.delete("/{key}", status_code=204)
def delete_ephemeral(key: str, db: Session = Depends(get_db)) -> None:
    cleaned = _validate_key(key)
    row = db.get(EphemeralBlob, cleaned)
    if row is None:
        return
    db.delete(row)
    db.commit()
