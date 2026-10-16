"""Warehouse location/bin master CRUD."""

from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.inventory_location import InventoryLocation
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.schemas.inventory.location import LocationCreate, LocationUpdate


def warehouse_location_counts(db: Session, company_id: str) -> dict[str, int]:
    """Live count of location/bin rows per warehouse — WarehouseRead.locations_count.

    Computed on read (same pattern as stock_level_service.warehouse_unit_totals)
    instead of trusting a stored counter, so it can never drift from the real
    inventory_locations rows.
    """
    rows = (
        db.query(
            InventoryLocation.warehouse_id,
            func.count(InventoryLocation.id),
        )
        .filter(InventoryLocation.company_id == company_id)
        .group_by(InventoryLocation.warehouse_id)
        .all()
    )
    return {warehouse_id: int(count) for warehouse_id, count in rows}


def list_locations(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    q: Optional[str] = None,
) -> Sequence[InventoryLocation]:
    query = db.query(InventoryLocation).filter(InventoryLocation.company_id == company_id)
    if warehouse_id:
        query = query.filter(InventoryLocation.warehouse_id == warehouse_id)
    if is_active is not None:
        query = query.filter(InventoryLocation.is_active.is_(is_active))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (InventoryLocation.name.ilike(like)) | (InventoryLocation.code.ilike(like))
        )
    return query.order_by(
        InventoryLocation.warehouse_id.asc(),
        InventoryLocation.sort_order.asc(),
        InventoryLocation.name.asc(),
    ).all()


def get_location(
    db: Session, location_id: str, company_id: Optional[str] = None
) -> InventoryLocation:
    row = db.get(InventoryLocation, location_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Location not found")
    return row


def _assert_warehouse_exists(db: Session, warehouse_id: str) -> None:
    if not db.get(InventoryWarehouse, warehouse_id):
        raise HTTPException(status_code=404, detail="Warehouse not found")


def _assert_code_unique(
    db: Session, warehouse_id: str, code: str, *, exclude_id: Optional[str] = None
) -> None:
    query = db.query(InventoryLocation).filter(
        InventoryLocation.warehouse_id == warehouse_id,
        func.lower(InventoryLocation.code) == code.lower(),
    )
    if exclude_id:
        query = query.filter(InventoryLocation.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Location code already exists in this warehouse")


def create_location(db: Session, payload: LocationCreate, company_id: str) -> InventoryLocation:
    _assert_warehouse_exists(db, payload.warehouse_id)
    code = payload.code.strip()
    _assert_code_unique(db, payload.warehouse_id, code)

    row = InventoryLocation(
        company_id=company_id,
        warehouse_id=payload.warehouse_id,
        code=code,
        name=payload.name.strip(),
        is_active=payload.is_active,
        sort_order=payload.sort_order,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_location(
    db: Session, location_id: str, payload: LocationUpdate, *, company_id: str
) -> InventoryLocation:
    row = get_location(db, location_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)

    warehouse_id = data.get("warehouse_id", row.warehouse_id)
    if data.get("warehouse_id") is not None:
        _assert_warehouse_exists(db, warehouse_id)

    if data.get("code") is not None:
        code = data["code"].strip()
        _assert_code_unique(db, warehouse_id, code, exclude_id=location_id)
        data["code"] = code
    if data.get("name") is not None:
        data["name"] = data["name"].strip()

    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return row


def delete_location(db: Session, location_id: str, *, company_id: str) -> None:
    row = get_location(db, location_id, company_id=company_id)
    movement_count = (
        db.query(func.count(InventoryStockMovement.id))
        .filter(InventoryStockMovement.location_id == location_id)
        .scalar()
        or 0
    )
    if movement_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete location referenced by {movement_count} movement(s)",
        )
    db.delete(row)
    db.commit()
