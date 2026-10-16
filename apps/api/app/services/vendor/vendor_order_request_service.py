"""Vendor order request — SPEC.md §17, §21-24.

submit_cart() turns a vendor's validated cart into a snapshot-priced
request, per the price-protection rule (§17) — once submitted, later
catalog/price changes never touch it. create_by_admin() is the staff-side
equivalent for when ERP staff place an order/quotation on a vendor's
behalf instead of the vendor submitting one through the portal.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.collab_activity import CollabActivity
from app.models.item import Item
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_cart import VendorCart, VendorCartItem
from app.models.vendor.vendor_order_request import VendorOrderRequest, VendorOrderRequestItem
from app.services.vendor.vendor_cart_service import build_cart_view, clear_cart
from app.services.vendor.vendor_credit_service import would_exceed_credit
from app.services.vendor.vendor_notification_service import notify
from app.services.core.sequence_service import next_number as allocate_number

if TYPE_CHECKING:
    from app.schemas.vendor.order_request import VendorOrderRequestItemWrite


def _next_order_request_number(db: Session, company_id: str = "default") -> str:
    return allocate_number(
        db,
        company_id,
        "vendor.order_request",
        initial=lambda: db.query(VendorOrderRequest).count() + 1,
    )


def _log(db: Session, *, entity_id: str, action: str, performed_by: Optional[str], performed_by_type: str, details: Optional[str] = None) -> None:
    db.add(
        CollabActivity(
            entity_type="vendor_order_request",
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type=performed_by_type,
            details_json=details,
        )
    )


def submit_cart(
    db: Session,
    *,
    vendor: Vendor,
    vendor_user_id: str,
    cart: VendorCart,
    notes: Optional[str] = None,
    delivery_address: Optional[str] = None,
    requested_delivery_date: Optional[date] = None,
) -> VendorOrderRequest:
    view = build_cart_view(db, vendor, cart)

    if not view.lines:
        raise HTTPException(status_code=400, detail="Cart is empty")
    if view.has_blocking_issues:
        blocking = [f"{line.sku}: {line.issue}" for line in view.lines if line.issue]
        raise HTTPException(status_code=422, detail="Cart has unresolved issues: " + "; ".join(blocking))

    order_request = VendorOrderRequest(
        order_request_number=_next_order_request_number(db),
        vendor_id=vendor.id,
        vendor_user_id=vendor_user_id,
        status="submitted",
        payment_terms=vendor.payment_terms,
        requested_delivery_date=requested_delivery_date,
        delivery_address=delivery_address,
        vendor_note=notes,
    )
    db.add(order_request)
    db.flush()

    subtotal = Decimal("0")
    discount_amount = Decimal("0")
    for line in view.lines:
        item = db.get(Item, line.item_id)
        line_discount = (line.list_price - line.unit_price) * line.quantity
        db.add(
            VendorOrderRequestItem(
                order_request_id=order_request.id,
                item_id=line.item_id,
                sku_snapshot=item.sku if item else line.sku,
                name_snapshot=item.name if item else line.name,
                unit_price=line.unit_price,
                quantity=line.quantity,
                discount_amount=line_discount,
                line_total=line.line_total,
            )
        )
        subtotal += line.line_total
        discount_amount += line_discount

    order_request.subtotal = subtotal
    order_request.discount_amount = discount_amount
    order_request.grand_total = subtotal
    # §30 — flag, never block: admin decides whether to approve anyway.
    order_request.requires_credit_approval = would_exceed_credit(db, vendor, subtotal)

    clear_cart(db, cart)
    _log(
        db,
        entity_id=order_request.id,
        action="order_request_submitted",
        performed_by=vendor_user_id,
        performed_by_type="vendor_user",
    )
    notify(
        db,
        vendor_id=vendor.id,
        event="order_submitted",
        title=f"Order request {order_request.order_request_number} submitted",
        message=f"Your order request for {order_request.grand_total} has been submitted for review.",
        entity_type="vendor_order_request",
        entity_id=order_request.id,
    )
    if order_request.requires_credit_approval:
        notify(
            db,
            vendor_id=vendor.id,
            event="credit_warning",
            title="Order exceeds your credit limit",
            message=f"{order_request.order_request_number} requires admin approval — it would exceed your credit limit.",
            entity_type="vendor_order_request",
            entity_id=order_request.id,
        )
    db.commit()
    db.refresh(order_request)
    return order_request


def create_by_admin(
    db: Session,
    *,
    vendor: Vendor,
    items: list["VendorOrderRequestItemWrite"],
    performed_by: str,
    payment_terms: Optional[str] = None,
    requested_delivery_date: Optional[date] = None,
    delivery_address: Optional[str] = None,
    vendor_note: Optional[str] = None,
    internal_note: Optional[str] = None,
) -> VendorOrderRequest:
    order_request = VendorOrderRequest(
        order_request_number=_next_order_request_number(db),
        vendor_id=vendor.id,
        vendor_user_id=None,
        status="under_review",
        payment_terms=payment_terms if payment_terms is not None else vendor.payment_terms,
        requested_delivery_date=requested_delivery_date,
        delivery_address=delivery_address,
        vendor_note=vendor_note,
        internal_note=internal_note,
    )
    db.add(order_request)
    db.flush()

    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    for line in items:
        item = db.get(Item, line.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        # House convention: unit_price is already net-of-discount (see
        # chat_order_service.py) — discount_amount is informational only.
        line_total = (line.unit_price * line.quantity) + line.tax_amount
        db.add(
            VendorOrderRequestItem(
                order_request_id=order_request.id,
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
        tax_total += line.tax_amount

    order_request.subtotal = subtotal
    order_request.discount_amount = discount_total
    order_request.tax_amount = tax_total
    order_request.grand_total = subtotal + tax_total + order_request.shipping_amount
    # §30 — flag, never block: admin decides whether to approve anyway.
    order_request.requires_credit_approval = would_exceed_credit(db, vendor, order_request.grand_total)

    _log(
        db,
        entity_id=order_request.id,
        action="order_request_created_by_admin",
        performed_by=performed_by,
        performed_by_type="user",
    )
    notify(
        db,
        vendor_id=vendor.id,
        event="order_submitted",
        title=f"Order {order_request.order_request_number} created by staff",
        message=f"An order for {order_request.grand_total} was created on your behalf and is under review.",
        entity_type="vendor_order_request",
        entity_id=order_request.id,
    )
    db.commit()
    db.refresh(order_request)
    return order_request


def list_order_requests(db: Session, *, vendor_id: Optional[str] = None, status: Optional[str] = None):
    q = db.query(VendorOrderRequest)
    if vendor_id:
        q = q.filter(VendorOrderRequest.vendor_id == vendor_id)
    if status:
        q = q.filter(VendorOrderRequest.status == status)
    return q.order_by(VendorOrderRequest.created_at.desc())


def get_order_request(db: Session, order_request_id: str, *, vendor_id: Optional[str] = None) -> VendorOrderRequest:
    row = db.get(VendorOrderRequest, order_request_id)
    if not row or (vendor_id and row.vendor_id != vendor_id):
        raise HTTPException(status_code=404, detail="Order request not found")
    return row
