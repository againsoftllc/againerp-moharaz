"""Admin dropship fulfillment — manual 1688 supplier orders."""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.auth_user import AuthUser
from app.models.commerce_order import CommerceOrder
from app.services.dropship_fulfillment import (
    SUPPLIER_STATUSES,
    ensure_dropship_order_columns,
    list_dropship_orders,
    order_dropship_payload,
)

router = APIRouter(prefix="/dropship", tags=["dropship"])

SupplierStatus = Literal["pending", "ordered", "shipped", "done"]


class DropshipUpdateRequest(BaseModel):
    supplier_order_status: Optional[SupplierStatus] = None
    supplier_order_id: Optional[str] = Field(default=None, max_length=100)
    supplier_notes: Optional[str] = None


@router.get("/orders")
def dropship_order_queue(
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    ensure_dropship_order_columns()
    data = list_dropship_orders(db)
    return {"count": len(data), "data": data}


@router.get("/orders/{order_id}")
def dropship_order_detail(
    order_id: str,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    ensure_dropship_order_columns()
    order = db.get(CommerceOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_dropship_payload(db, order)


@router.patch("/orders/{order_id}")
def update_dropship_fulfillment(
    order_id: str,
    payload: DropshipUpdateRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_write_access),
) -> dict[str, Any]:
    ensure_dropship_order_columns()
    order = db.get(CommerceOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if payload.supplier_order_status is not None:
        if payload.supplier_order_status not in SUPPLIER_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid supplier_order_status")
        order.supplier_order_status = payload.supplier_order_status
    if payload.supplier_order_id is not None:
        order.supplier_order_id = payload.supplier_order_id.strip() or None
    if payload.supplier_notes is not None:
        order.supplier_notes = payload.supplier_notes

    db.commit()
    db.refresh(order)
    return order_dropship_payload(db, order)
