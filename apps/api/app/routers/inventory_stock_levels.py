from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.stock_level import (
    InventoryDashboardResponse,
    ReorderSuggestionListResponse,
    StockLevelListMeta,
    StockLevelListResponse,
    StockLevelResponse,
    StockLevelUpdate,
)
from app.services.inventory import dashboard_period_service, stock_level_service

router = APIRouter(tags=["inventory-stock"])


@router.get("/dashboard", response_model=InventoryDashboardResponse)
def inventory_dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> InventoryDashboardResponse:
    return InventoryDashboardResponse(
        data=stock_level_service.dashboard(db, company_id=company_id)
    )


@router.get("/dashboard/period")
def inventory_dashboard_period(
    date_from: Optional[date] = Query(default=None, description="first day, inclusive (none: from the first movement)"),
    date_to: Optional[date] = Query(default=None, description="last day, inclusive (none: up to today)"),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> dict:
    """The Inventory module's landing dashboard: stock right now and stock in / out over the chosen period."""
    return {"data": dashboard_period_service.dashboard_period(db, company_id, date_from, date_to)}


@router.get("/reports/reorder-suggestions", response_model=ReorderSuggestionListResponse)
def reorder_suggestions(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
) -> ReorderSuggestionListResponse:
    data = stock_level_service.reorder_suggestions(
        db, company_id=company_id, warehouse_id=warehouse_id
    )
    return ReorderSuggestionListResponse(
        data=data, meta=StockLevelListMeta(count=len(data), total=len(data), limit=len(data), offset=0)
    )


@router.get("/stock", response_model=StockLevelListResponse)
def list_stock(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    warehouse: Optional[str] = Query(default=None, description="Warehouse name or code"),
    product_id: Optional[str] = Query(default=None),
    item_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(in_stock|low_stock|out_of_stock|overstock)$"
    ),
    search: Optional[str] = Query(default=None, description="Search SKU or name"),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> StockLevelListResponse:
    rows, total = stock_level_service.list_stock_levels(
        db,
        company_id=company_id,
        warehouse_id=warehouse_id,
        warehouse=warehouse,
        product_id=product_id,
        item_id=item_id,
        status=status,
        q=search,
        limit=limit,
        offset=offset,
    )
    data = stock_level_service.to_read_many(db, rows)
    total_units, total_value = stock_level_service.rollups(rows)
    return StockLevelListResponse(
        data=data,
        meta=StockLevelListMeta(
            count=len(data),
            total=total,
            limit=limit,
            offset=offset,
            total_units=total_units,
            total_value=total_value,
        ),
    )


@router.get("/stock/{stock_level_id}", response_model=StockLevelResponse)
def get_stock(
    stock_level_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> StockLevelResponse:
    row = stock_level_service.get_stock_level(db, stock_level_id, company_id=company_id)
    return StockLevelResponse(data=stock_level_service.to_read_one(db, row))


@router.patch("/stock/{stock_level_id}", response_model=StockLevelResponse)
def update_stock(
    stock_level_id: str,
    payload: StockLevelUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockLevelResponse:
    """Update thresholds and unit cost. Quantity is not writable on this endpoint."""
    row = stock_level_service.update_stock_level(
        db, stock_level_id, payload, company_id=company_id
    )
    return StockLevelResponse(data=stock_level_service.to_read_one(db, row))


@router.post("/stock/{stock_level_id}/adjust", status_code=410)
def adjust_stock(
    stock_level_id: str,
    _: AuthUser = Depends(require_permission("inventory", "write")),
) -> None:
    raise HTTPException(
        status_code=410,
        detail=(
            "One-shot stock adjust is retired. "
            "Use POST /stock-adjustments, /stock-transfers, or /stock-counts."
        ),
    )
