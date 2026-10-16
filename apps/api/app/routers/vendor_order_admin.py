"""ERP admin review of vendor order requests — SPEC.md §22-24.

Every edit and status change is logged to collab_activity so the review
trail SPEC §23 asks for ("Every modification must be logged") is real, not
just a comment.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.auth_user import AuthUser
from app.models.collab_activity import CollabActivity
from app.models.item import Item
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_order_request import VendorOrderRequestItem
from app.schemas.vendor.order_request import (
    VendorOrderRequestAdminCreate,
    VendorOrderRequestAdminListResponse,
    VendorOrderRequestAdminRead,
    VendorOrderRequestAdminResponse,
    VendorOrderRequestAdminUpdate,
    VendorOrderRequestItemRead,
    VendorOrderRequestTransitionRequest,
)
from app.services.vendor import vendor_order_request_service
from app.services.vendor.vendor_notification_service import notify
from modules.vendor.workflow.transitions import can_transition

_STATUS_NOTIFICATIONS = {
    "approved": ("order_approved", "Order request approved"),
    "rejected": ("order_rejected", "Order request rejected"),
    "revision_required": ("revision_requested", "Order request needs revision"),
}

router = APIRouter(prefix="/vendors/order-requests", tags=["vendor-order-admin"])


def _log(db: Session, *, entity_id: str, action: str, performed_by: str, details: Optional[str] = None) -> None:
    db.add(
        CollabActivity(
            entity_type="vendor_order_request",
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type="user",
            details_json=details,
        )
    )


def _admin_read(db: Session, row) -> VendorOrderRequestAdminRead:
    vendor = db.get(Vendor, row.vendor_id)
    return VendorOrderRequestAdminRead(
        id=row.id,
        order_request_number=row.order_request_number,
        vendor_id=row.vendor_id,
        vendor_name=vendor.company_name if vendor else None,
        status=row.status,
        subtotal=row.subtotal,
        discount_amount=row.discount_amount,
        tax_amount=row.tax_amount,
        shipping_amount=row.shipping_amount,
        grand_total=row.grand_total,
        payment_terms=row.payment_terms,
        requested_delivery_date=row.requested_delivery_date,
        delivery_address=row.delivery_address,
        vendor_note=row.vendor_note,
        requires_credit_approval=row.requires_credit_approval,
        internal_note=row.internal_note,
        created_at=row.created_at,
        updated_at=row.updated_at,
        items=[
            VendorOrderRequestItemRead(
                id=i.id,
                item_id=i.item_id,
                sku_snapshot=i.sku_snapshot,
                name_snapshot=i.name_snapshot,
                unit_price=i.unit_price,
                quantity=i.quantity,
                discount_amount=i.discount_amount,
                tax_amount=i.tax_amount,
                line_total=i.line_total,
            )
            for i in row.items
        ],
    )


@router.post("", response_model=VendorOrderRequestAdminResponse, status_code=201)
def create_order_request(
    payload: VendorOrderRequestAdminCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorOrderRequestAdminResponse:
    vendor = db.get(Vendor, payload.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    row = vendor_order_request_service.create_by_admin(
        db,
        vendor=vendor,
        items=payload.items,
        performed_by=user.id,
        payment_terms=payload.payment_terms,
        requested_delivery_date=payload.requested_delivery_date,
        delivery_address=payload.delivery_address,
        vendor_note=payload.vendor_note,
        internal_note=payload.internal_note,
    )
    return VendorOrderRequestAdminResponse(data=_admin_read(db, row))


@router.get("", response_model=VendorOrderRequestAdminListResponse)
def list_order_requests(
    db: Session = Depends(get_db),
    vendor_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> VendorOrderRequestAdminListResponse:
    rows = vendor_order_request_service.list_order_requests(db, vendor_id=vendor_id, status=status).all()
    return VendorOrderRequestAdminListResponse(data=[_admin_read(db, r) for r in rows], total=len(rows))


@router.get("/{order_request_id}", response_model=VendorOrderRequestAdminResponse)
def get_order_request(order_request_id: str, db: Session = Depends(get_db)) -> VendorOrderRequestAdminResponse:
    row = vendor_order_request_service.get_order_request(db, order_request_id)
    return VendorOrderRequestAdminResponse(data=_admin_read(db, row))


@router.patch("/{order_request_id}", response_model=VendorOrderRequestAdminResponse)
def update_order_request(
    order_request_id: str,
    payload: VendorOrderRequestAdminUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorOrderRequestAdminResponse:
    row = vendor_order_request_service.get_order_request(db, order_request_id)
    if row.status in {"converted_to_order", "rejected", "cancelled"}:
        raise HTTPException(status_code=409, detail=f"Cannot edit a {row.status} order request")

    if payload.payment_terms is not None:
        row.payment_terms = payload.payment_terms
    if payload.shipping_amount is not None:
        row.shipping_amount = payload.shipping_amount
    if payload.tax_amount is not None:
        row.tax_amount = payload.tax_amount
    if payload.requested_delivery_date is not None:
        row.requested_delivery_date = payload.requested_delivery_date
    if payload.delivery_address is not None:
        row.delivery_address = payload.delivery_address
    if payload.vendor_note is not None:
        row.vendor_note = payload.vendor_note
    if payload.internal_note is not None:
        row.internal_note = payload.internal_note

    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=400, detail="An order request must have at least one item")
        db.query(VendorOrderRequestItem).filter(VendorOrderRequestItem.order_request_id == row.id).delete()
        subtotal = 0
        discount_total = 0
        for line in payload.items:
            item = db.get(Item, line.item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
            # House convention: unit_price is already net-of-discount (see
            # chat_order_service.py) — discount_amount is informational only
            # and must not be subtracted again, or the vendor gets double-discounted.
            line_total = (line.unit_price * line.quantity) + line.tax_amount
            db.add(
                VendorOrderRequestItem(
                    order_request_id=row.id,
                    item_id=line.item_id,
                    sku_snapshot=item.sku,
                    name_snapshot=item.name,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    discount_amount=line.discount_amount,
                    tax_amount=line.tax_amount,
                    line_total=line_total,
                )
            )
            subtotal += line.unit_price * line.quantity
            discount_total += line.discount_amount
        row.subtotal = subtotal
        row.discount_amount = discount_total

    row.grand_total = row.subtotal + row.tax_amount + row.shipping_amount

    _log(db, entity_id=row.id, action="order_request_edited", performed_by=user.id)
    db.commit()
    db.refresh(row)
    return VendorOrderRequestAdminResponse(data=_admin_read(db, row))


@router.post("/{order_request_id}/transition", response_model=VendorOrderRequestAdminResponse)
def transition_order_request(
    order_request_id: str,
    payload: VendorOrderRequestTransitionRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> VendorOrderRequestAdminResponse:
    row = vendor_order_request_service.get_order_request(db, order_request_id)
    if not can_transition(row.status, payload.status):
        raise HTTPException(
            status_code=409, detail=f"Cannot move order request from '{row.status}' to '{payload.status}'"
        )
    previous = row.status
    row.status = payload.status
    if payload.note:
        row.internal_note = f"{row.internal_note}\n{payload.note}" if row.internal_note else payload.note

    _log(
        db,
        entity_id=row.id,
        action="order_request_status_changed",
        performed_by=user.id,
        details=f"{previous} -> {payload.status}",
    )
    notification = _STATUS_NOTIFICATIONS.get(payload.status)
    if notification:
        event, title = notification
        notify(
            db,
            vendor_id=row.vendor_id,
            event=event,
            title=f"{title}: {row.order_request_number}",
            message=payload.note or "",
            entity_type="vendor_order_request",
            entity_id=row.id,
        )
    db.commit()
    db.refresh(row)
    return VendorOrderRequestAdminResponse(data=_admin_read(db, row))
