from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.services.auth_user_warehouses import resolve_user_warehouse
from app.schemas.inventory.reports import (
    MovementSummaryResponse,
    OnHandReportResponse,
    ProductReportListResponse,
    ProductReportResponse,
    ProfitBreakdownResponse,
    ProfitLossReportResponse,
    SerialReportResponse,
    SupplierValuationResponse,
    ValuationReportResponse,
)
from app.services.inventory import inventory_reports

router = APIRouter(prefix="/reports", tags=["inventory-reports"])


@router.get("/on-hand", response_model=OnHandReportResponse)
def on_hand_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(in_stock|low_stock|out_of_stock|overstock)$"
    ),
    search: Optional[str] = Query(default=None),
    page: Optional[int] = Query(default=None, ge=1),
    per_page: Optional[int] = Query(default=None, ge=1, le=200),
) -> OnHandReportResponse:
    data, meta = inventory_reports.on_hand_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        status=status,
        q=search,
        page=page,
        per_page=per_page,
    )
    return OnHandReportResponse(data=data, meta=meta)


@router.get("/valuation", response_model=ValuationReportResponse)
def valuation_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> ValuationReportResponse:
    data, groups, by_supplier, meta = inventory_reports.valuation_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        q=search,
    )
    return ValuationReportResponse(data=data, groups=groups, by_supplier=by_supplier, meta=meta)


@router.get("/by-supplier", response_model=SupplierValuationResponse)
def supplier_valuation_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
) -> SupplierValuationResponse:
    data, meta = inventory_reports.supplier_valuation_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
    )
    return SupplierValuationResponse(data=data, meta=meta)


@router.get("/movements", response_model=MovementSummaryResponse)
def movement_summary_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    movement_type: Optional[str] = Query(default=None, max_length=40),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=10000),
) -> MovementSummaryResponse:
    data, by_type, meta = inventory_reports.movement_summary_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        date_from=date_from,
        date_to=date_to,
        movement_type=movement_type,
        search=search,
        page=page,
        per_page=per_page,
    )
    return MovementSummaryResponse(data=data, by_type=by_type, meta=meta)


@router.get("/products", response_model=ProductReportListResponse)
def product_report_list(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    search: Optional[str] = Query(default=None),
    category_id: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(in_stock|low_stock|out_of_stock|overstock)$"),
    sort_by: str = Query(default="name", pattern="^(name|sku)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=200),
) -> ProductReportListResponse:
    """The product report as a datatable — every catalog product, one row each,
    lifetime stock/purchase/sales/profit figures. Powers the product-report
    list view before a single product is opened for its full history."""
    return inventory_reports.product_report_list(
        db,
        company_id=company_id,
        search=search,
        category_id=category_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        per_page=per_page,
    )


@router.get("/product", response_model=ProductReportResponse)
def product_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    item_id: str = Query(min_length=1),
    warehouse_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> ProductReportResponse:
    return inventory_reports.product_report(
        db,
        company_id=company_id,
        item_id=item_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/profit-loss", response_model=ProfitLossReportResponse)
def profit_loss_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> ProfitLossReportResponse:
    return inventory_reports.profit_loss_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/profit-loss/breakdown", response_model=ProfitBreakdownResponse)
def profit_breakdown_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    group_by: str = Query(
        pattern="^(product|category|brand|location|invoice|customer|day|date|staff)$"
    ),
    warehouse_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=200),
) -> ProfitBreakdownResponse:
    data, meta = inventory_reports.profit_breakdown_report(
        db,
        company_id=company_id,
        group_by=group_by,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        date_from=date_from,
        date_to=date_to,
        search=search,
        page=page,
        per_page=per_page,
    )
    return ProfitBreakdownResponse(data=data, meta=meta)


@router.get("/serials", response_model=SerialReportResponse)
def serials_report(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    warehouse_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> SerialReportResponse:
    data, meta = inventory_reports.serials_report(
        db,
        company_id=company_id,
        warehouse_id=resolve_user_warehouse(db, user, warehouse_id),
        status=status,
    )
    return SerialReportResponse(data=data, meta=meta)
