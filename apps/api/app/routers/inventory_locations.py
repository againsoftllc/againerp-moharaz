from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.location import (
    LocationCreate,
    LocationListMeta,
    LocationListResponse,
    LocationRead,
    LocationResponse,
    LocationUpdate,
)
from app.services.inventory import location_service

router = APIRouter(prefix="/locations", tags=["inventory-locations"])


@router.get("", response_model=LocationListResponse)
def list_locations(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Search code, name"),
) -> LocationListResponse:
    rows = location_service.list_locations(
        db, company_id=company_id, warehouse_id=warehouse_id, is_active=is_active, q=q
    )
    data = [LocationRead.model_validate(row) for row in rows]
    return LocationListResponse(data=data, meta=LocationListMeta(count=len(data)))


@router.get("/{location_id}", response_model=LocationResponse)
def get_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> LocationResponse:
    row = location_service.get_location(db, location_id, company_id=company_id)
    return LocationResponse(data=LocationRead.model_validate(row))


@router.post("", response_model=LocationResponse, status_code=201)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> LocationResponse:
    row = location_service.create_location(db, payload, company_id)
    return LocationResponse(data=LocationRead.model_validate(row))


@router.patch("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> LocationResponse:
    row = location_service.update_location(db, location_id, payload, company_id=company_id)
    return LocationResponse(data=LocationRead.model_validate(row))


@router.delete("/{location_id}", status_code=204)
def delete_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    location_service.delete_location(db, location_id, company_id=company_id)
    return Response(status_code=204)
