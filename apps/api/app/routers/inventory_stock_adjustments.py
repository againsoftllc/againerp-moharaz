from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.inventory.stock_adjustment import (
    StockAdjustmentCreate,
    StockAdjustmentListMeta,
    StockAdjustmentListResponse,
    StockAdjustmentResponse,
)
from app.services.inventory.stock_adjustment_service import (
    AdjustmentLineInput,
    StockAdjustmentService,
    adjustment_to_read,
)

router = APIRouter(prefix="/stock-adjustments", tags=["inventory-stock-adjustments"])


def _commit(db: Session, row):
    try:
        db.commit()
        db.refresh(row)
        return row
    except Exception:
        db.rollback()
        raise


@router.get("", response_model=StockAdjustmentListResponse)
def list_adjustments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    warehouse_id: Optional[str] = Query(default=None),
    reason: Optional[str] = Query(default=None),
    adjustment_type: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=500),
) -> StockAdjustmentListResponse:
    svc = StockAdjustmentService(db)
    rows, total = svc.list_adjustments(
        company_id=company_id,
        status=status,
        warehouse_id=warehouse_id,
        reason=reason,
        adjustment_type=adjustment_type,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    return StockAdjustmentListResponse(
        data=[adjustment_to_read(db, row) for row in rows],
        meta=StockAdjustmentListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{adjustment_id}", response_model=StockAdjustmentResponse)
def get_adjustment(
    adjustment_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("inventory", "read")),
    company_id: str = Depends(get_current_company_id),
) -> StockAdjustmentResponse:
    row = StockAdjustmentService(db, company_id=company_id).get_adjustment(adjustment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    return StockAdjustmentResponse(data=adjustment_to_read(db, row))


@router.post("", response_model=StockAdjustmentResponse, status_code=201)
def create_adjustment(
    payload: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "create")),
    company_id: str = Depends(get_current_company_id),
) -> StockAdjustmentResponse:
    try:
        row = StockAdjustmentService(db, company_id=company_id).create_adjustment(
            company_id=company_id,
            warehouse_id=payload.warehouse_id,
            reason=payload.reason,
            lines=[
                AdjustmentLineInput(
                    item_id=line.item_id,
                    physical_qty=line.physical_qty,
                    reason=line.reason,
                    notes=line.notes,
                    keep_serial_ids=tuple(line.keep_serial_ids),
                    add_serial_numbers=tuple(line.add_serial_numbers),
                )
                for line in payload.lines
            ],
            adjustment_date=payload.adjustment_date,
            reason_details=payload.reason_details,
            reference_number=payload.reference_number,
            notes=payload.notes,
            actor_id=user.id,
        )
        row = _commit(db, row)
        return StockAdjustmentResponse(data=adjustment_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise


@router.post("/{adjustment_id}/apply", response_model=StockAdjustmentResponse)
def apply_adjustment(
    adjustment_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockAdjustmentResponse:
    try:
        row = StockAdjustmentService(db, company_id=company_id).apply_adjustment(adjustment_id, actor_id=user.id)
        row = _commit(db, row)
        return StockAdjustmentResponse(data=adjustment_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise


@router.post("/{adjustment_id}/cancel", response_model=StockAdjustmentResponse)
def cancel_adjustment(
    adjustment_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("inventory", "write")),
    company_id: str = Depends(get_current_company_id),
) -> StockAdjustmentResponse:
    try:
        row = StockAdjustmentService(db, company_id=company_id).cancel_adjustment(adjustment_id, actor_id=user.id)
        row = _commit(db, row)
        return StockAdjustmentResponse(data=adjustment_to_read(db, row))
    except HTTPException:
        db.rollback()
        raise
