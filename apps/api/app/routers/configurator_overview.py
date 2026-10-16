"""Admin Overview data for the Smart PC Builder plugin panel — see
app/services/configurator_overview.py for what the issue kinds mean."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.configurator_overview import build_overview, overview_slots
from app.services.ecommerce.storefront_configurator_service import ConfiguratorError

router = APIRouter(prefix="/overview", tags=["configurator-overview"])


@router.get("")
def get_overview(
    profile: str = Query("pc-builder"),
    slot: Optional[str] = Query(None, description="one slot id — the page loads slot by slot"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        return {"data": build_overview(db, profile, slot_id=slot)}
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/slots")
def get_overview_slots(profile: str = Query("pc-builder"), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """The slots alone (no product work), shown while each slot's numbers load."""
    try:
        return {"data": overview_slots(db, profile)}
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
