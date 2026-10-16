from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.inventory.product_history import (
    ProductLedgerResponse,
    ProductPriceResponse,
    ProductPurchaseResponse,
    ProductRmaResponse,
    ProductSalesResponse,
)
from app.services.inventory import product_history_service as svc

router = APIRouter(prefix="/products/{item_id}", tags=["inventory-product-history"])

PageParam = Query(default=1, ge=1)
PerPageParam = Query(default=25, ge=1, le=100)


@router.get("/sales", response_model=ProductSalesResponse)
def product_sales(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    page: int = PageParam,
    per_page: int = PerPageParam,
) -> ProductSalesResponse:
    svc.resolve_item(db, company_id=company_id, item_id=item_id)
    return svc.sales_history(
        db,
        company_id=company_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )


@router.get("/purchases", response_model=ProductPurchaseResponse)
def product_purchases(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("purchase", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    page: int = PageParam,
    per_page: int = PerPageParam,
) -> ProductPurchaseResponse:
    svc.resolve_item(db, company_id=company_id, item_id=item_id)
    return svc.purchase_history(
        db,
        company_id=company_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )


@router.get("/ledger", response_model=ProductLedgerResponse)
def product_ledger(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    movement_type: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    page: int = PageParam,
    per_page: int = PerPageParam,
) -> ProductLedgerResponse:
    svc.resolve_item(db, company_id=company_id, item_id=item_id)
    return svc.ledger_history(
        db,
        company_id=company_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
        movement_type=movement_type,
        warehouse_id=warehouse_id,
        page=page,
        per_page=per_page,
    )


@router.get("/rma", response_model=ProductRmaResponse)
def product_rma(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = PageParam,
    per_page: int = PerPageParam,
) -> ProductRmaResponse:
    svc.resolve_item(db, company_id=company_id, item_id=item_id)
    return svc.rma_history(db, company_id=company_id, item_id=item_id, page=page, per_page=per_page)


@router.get("/price-history", response_model=ProductPriceResponse)
def product_price_history(
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("catalog", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = PageParam,
    per_page: int = PerPageParam,
) -> ProductPriceResponse:
    svc.resolve_item(db, company_id=company_id, item_id=item_id)
    return svc.price_history(db, company_id=company_id, item_id=item_id, page=page, per_page=per_page)
