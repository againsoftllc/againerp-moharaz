from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.commerce_order_refund import CommerceOrderRefund
from app.schemas.commerce_order_refund import (
    OrderRefundListMeta,
    OrderRefundListResponse,
    OrderRefundRead,
    OrderRefundResponse,
    OrderRefundUpdate,
)

router = APIRouter(prefix="/refunds", tags=["commerce-refunds"])


def _to_read(row: CommerceOrderRefund) -> OrderRefundRead:
    return OrderRefundRead.model_validate(row)


@router.get("", response_model=OrderRefundListResponse)
def list_refunds(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> OrderRefundListResponse:
    query = db.query(CommerceOrderRefund).order_by(CommerceOrderRefund.created_at.desc())

    if status:
        query = query.filter(CommerceOrderRefund.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            (CommerceOrderRefund.refund_number.ilike(term))
            | (CommerceOrderRefund.order_number.ilike(term))
            | (CommerceOrderRefund.customer_name.ilike(term))
            | (CommerceOrderRefund.method.ilike(term)),
        )

    rows = query.all()
    data = [_to_read(row) for row in rows]
    total_amount = sum(row.amount for row in rows)
    return OrderRefundListResponse(
        data=data,
        meta=OrderRefundListMeta(count=len(data), total_amount=total_amount),
    )


@router.get("/{refund_id}", response_model=OrderRefundResponse)
def get_refund(refund_id: str, db: Session = Depends(get_db)) -> OrderRefundResponse:
    row = db.get(CommerceOrderRefund, refund_id)
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")
    return OrderRefundResponse(data=_to_read(row))


@router.patch("/{refund_id}", response_model=OrderRefundResponse)
def update_refund(
    refund_id: str,
    payload: OrderRefundUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> OrderRefundResponse:
    row = db.get(CommerceOrderRefund, refund_id)
    if not row:
        raise HTTPException(status_code=404, detail="Refund not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return OrderRefundResponse(data=_to_read(row))
