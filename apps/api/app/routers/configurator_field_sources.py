from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.services import configurator_field_sources as field_sources

router = APIRouter(prefix="/field-sources", tags=["configurator-field-sources"])


class FieldSourceUpdate(BaseModel):
    # None puts the field back on its default attribute.
    attribute_id: Optional[str] = None


@router.get("")
def list_field_sources(db: Session = Depends(get_db)) -> dict:
    return {"data": field_sources.describe(db)}


class FieldValueCreate(BaseModel):
    value: str


@router.post("/{field_key}/values")
def add_field_value(
    field_key: str,
    payload: FieldValueCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> dict:
    """Add a value to the attribute that feeds this field (its predefined list)."""
    try:
        stored = field_sources.add_value(db, field_key, payload.value)
    except field_sources.FieldSourceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": {"value": stored, "values": field_sources.attribute_values(db, field_key)["values"]}}


@router.put("/{field_key}")
def set_field_source(
    field_key: str,
    payload: FieldSourceUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> dict:
    try:
        field_sources.set_source(db, field_key, payload.attribute_id)
    except field_sources.FieldSourceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": next(f for f in field_sources.describe(db) if f["key"] == field_key)}
