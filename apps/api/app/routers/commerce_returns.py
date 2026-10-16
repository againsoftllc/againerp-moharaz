from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.commerce_order_return import CommerceOrderReturn
from app.schemas.commerce_order_return import (
    OrderReturnListMeta,
    OrderReturnListResponse,
    OrderReturnRead,
    OrderReturnResponse,
    OrderReturnUpdate,
)

router = APIRouter(prefix="/returns", tags=["commerce-returns"])


def _to_read(row: CommerceOrderReturn) -> OrderReturnRead:
    return OrderReturnRead.model_validate(row)


@router.get("", response_model=OrderReturnListResponse)
def list_returns(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> OrderReturnListResponse:
    query = db.query(CommerceOrderReturn).order_by(CommerceOrderReturn.created_at.desc())

    if status:
        query = query.filter(CommerceOrderReturn.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            (CommerceOrderReturn.return_number.ilike(term))
            | (CommerceOrderReturn.order_number.ilike(term))
            | (CommerceOrderReturn.customer_name.ilike(term))
            | (CommerceOrderReturn.product_name.ilike(term))
            | (CommerceOrderReturn.sku.ilike(term)),
        )

    rows = query.all()
    data = [_to_read(row) for row in rows]
    total_amount = sum(row.amount for row in rows)
    return OrderReturnListResponse(
        data=data,
        meta=OrderReturnListMeta(count=len(data), total_amount=total_amount),
    )


@router.get("/{return_id}", response_model=OrderReturnResponse)
def get_return(return_id: str, db: Session = Depends(get_db)) -> OrderReturnResponse:
    row = db.get(CommerceOrderReturn, return_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    return OrderReturnResponse(data=_to_read(row))


@router.patch("/{return_id}", response_model=OrderReturnResponse)
def update_return(
    return_id: str,
    payload: OrderReturnUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> OrderReturnResponse:
    row = db.get(CommerceOrderReturn, return_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return OrderReturnResponse(data=_to_read(row))
