from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.services.core.access_scope import assert_document_warehouse, assert_warehouse_access, warehouse_scope
from app.models.inventory_stock_count import InventoryStockCount
from app.models.inventory_warehouse import InventoryWarehouse
from app.schemas.inventory.stock_count import (
    StockCountCreate,
    StockCountLineRead,
    StockCountLineUpdate,
    StockCountListMeta,
    StockCountListResponse,
    StockCountRead,
    StockCountResponse,
)
from app.services.inventory import stock_count_service

router = APIRouter(prefix="/stock-counts", tags=["inventory-stock-counts"])


def _line_read(line) -> StockCountLineRead:
    out = StockCountLineRead.model_validate(line)
    out.variance = None if line.counted_qty is None else line.counted_qty - line.expected_qty
    out.expected_serials = [row.serial_number for row in line.serials if row.role == "expected"]
    out.counted_serials = [row.serial_number for row in line.serials if row.role == "counted"]
    return out


def _read(db: Session, count: InventoryStockCount) -> StockCountRead:
    out = StockCountRead.model_validate(count)
    warehouse = db.get(InventoryWarehouse, count.warehouse_id)
    out.warehouse_name = warehouse.name if warehouse else None
    out.lines = [_line_read(line) for line in count.lines]
    out.line_count = len(out.lines)
    out.variance_count = sum(1 for line in out.lines if line.variance not in (None, 0))
    return out


@router.get("", response_model=StockCountListResponse)
def list_counts(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> StockCountListResponse:
    assert_warehouse_access(db, user, warehouse_id)
    rows = stock_count_service.list_counts(
        db, company_id=company_id, warehouse_id=warehouse_id, status=status, warehouse_ids=warehouse_scope(db, user)
    )
    data = [_read(db, row) for row in rows]
    return StockCountListResponse(data=data, meta=StockCountListMeta(count=len(data)))


@router.get("/{count_id}", response_model=StockCountResponse)
def get_count(
    count_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> StockCountResponse:
    row = stock_count_service.get_count(db, count_id, company_id=company_id)
    return StockCountResponse(data=_read(db, row))


@router.post("", response_model=StockCountResponse, status_code=201)
def create_count(
    payload: StockCountCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> StockCountResponse:
    assert_warehouse_access(db, user, payload.warehouse_id)
    row = stock_count_service.create_count(
        db,
        company_id=company_id,
        warehouse_id=payload.warehouse_id,
        counted_by=user.id,
        notes=payload.notes,
    )
    return StockCountResponse(data=_read(db, row))


@router.patch("/{count_id}/lines/{line_id}", response_model=StockCountResponse)
def update_line(
    count_id: str,
    line_id: str,
    payload: StockCountLineUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockCountResponse:
    assert_document_warehouse(db, user, InventoryStockCount, count_id, "warehouse_id")
    stock_count_service.update_line_counted_qty(
        db,
        count_id,
        line_id,
        payload.counted_qty,
        company_id=company_id,
        counted_serials=payload.counted_serials,
    )
    row = stock_count_service.get_count(db, count_id, company_id=company_id)
    return StockCountResponse(data=_read(db, row))


@router.post("/{count_id}/post", response_model=StockCountResponse)
def post_count(
    count_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockCountResponse:
    assert_document_warehouse(db, user, InventoryStockCount, count_id, "warehouse_id")
    row = stock_count_service.post_count(db, count_id, company_id=company_id, actor_id=user.id)
    return StockCountResponse(data=_read(db, row))


@router.post("/{count_id}/cancel", response_model=StockCountResponse)
def cancel_count(
    count_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockCountResponse:
    assert_document_warehouse(db, user, InventoryStockCount, count_id, "warehouse_id")
    row = stock_count_service.cancel_count(db, count_id, company_id=company_id)
    return StockCountResponse(data=_read(db, row))


@router.delete("/{count_id}", status_code=204)
def delete_count(
    count_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    stock_count_service.delete_count(db, count_id, company_id=company_id)
    return Response(status_code=204)
