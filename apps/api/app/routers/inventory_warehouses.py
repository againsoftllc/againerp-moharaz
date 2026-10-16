from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.warehouse import (
    WarehouseCreate,
    WarehouseListMeta,
    WarehouseListResponse,
    WarehouseRead,
    WarehouseResponse,
    WarehouseUpdate,
)
from app.services.inventory import location_service, stock_level_service, warehouse_service

router = APIRouter(prefix="/warehouses", tags=["inventory-warehouses"])


def _read(
    db: Session,
    row,
    company_id: str,
    *,
    totals: Optional[dict] = None,
    location_counts: Optional[dict] = None,
    branch_names: Optional[dict[str, str]] = None,
) -> WarehouseRead:
    unit_totals = totals if totals is not None else stock_level_service.warehouse_unit_totals(db, company_id)
    loc_counts = (
        location_counts
        if location_counts is not None
        else location_service.warehouse_location_counts(db, company_id)
    )
    names = branch_names if branch_names is not None else warehouse_service.branch_names_for(db, [row])
    out = WarehouseRead.model_validate(row)
    out.total_units = unit_totals.get(row.id, 0)
    out.locations_count = loc_counts.get(row.id, 0)
    out.branch_name = names.get(row.branch_id) if row.branch_id else None
    return out


@router.get("", response_model=WarehouseListResponse)
def list_warehouses(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    is_active: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Search code, name, type, address"),
) -> WarehouseListResponse:
    rows = warehouse_service.list_warehouses(
        db, company_id=company_id, is_active=is_active, q=q
    )
    totals = stock_level_service.warehouse_unit_totals(db, company_id)
    location_counts = location_service.warehouse_location_counts(db, company_id)
    branch_names = warehouse_service.branch_names_for(db, rows)
    data = [
        _read(
            db,
            row,
            company_id,
            totals=totals,
            location_counts=location_counts,
            branch_names=branch_names,
        )
        for row in rows
    ]
    return WarehouseListResponse(data=data, meta=WarehouseListMeta(count=len(data)))


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
def get_warehouse(
    warehouse_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> WarehouseResponse:
    row = warehouse_service.get_warehouse(db, warehouse_id, company_id=company_id)
    return WarehouseResponse(data=_read(db, row, company_id))


@router.post("", response_model=WarehouseResponse, status_code=201)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> WarehouseResponse:
    payload.company_id = company_id
    row = warehouse_service.create_warehouse(db, payload)
    return WarehouseResponse(data=_read(db, row, company_id))


@router.patch("/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(
    warehouse_id: str,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> WarehouseResponse:
    row = warehouse_service.update_warehouse(db, warehouse_id, payload, company_id=company_id)
    return WarehouseResponse(data=_read(db, row, company_id))


@router.delete("/{warehouse_id}", status_code=204)
def delete_warehouse(
    warehouse_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    warehouse_service.delete_warehouse(db, warehouse_id, company_id=company_id)
    return Response(status_code=204)
