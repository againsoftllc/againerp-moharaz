"""Vendor quotations — SPEC.md §25 (Phase-1 scope, see model docstring)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.collab_activity import CollabActivity
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_group import VendorGroup
from app.models.vendor.vendor_negotiation import VendorNegotiation
from app.models.vendor.vendor_order_request import VendorOrderRequest, VendorOrderRequestItem
from app.models.vendor.vendor_quotation import VendorQuotation, VendorQuotationItem
from app.services.vendor.vendor_notification_service import notify
from app.services.core.sequence_service import next_number as allocate_number
from modules.vendor.workflow.transitions import can_transition, can_transition_quotation


def _log(db: Session, *, entity_id: str, action: str, performed_by: Optional[str], performed_by_type: str, details: Optional[str] = None) -> None:
    db.add(
        CollabActivity(
            entity_type="vendor_quotation",
            entity_id=entity_id,
            action=action,
            performed_by=performed_by,
            performed_by_type=performed_by_type,
            details_json=details,
        )
    )


def _next_quotation_number(db: Session, company_id: str = "default") -> str:
    # Prefix is VQU- (not QUO-): sales quotations already own QUO-, so the old
    # numbering handed two different documents the same user-facing number.
    return allocate_number(
        db,
        company_id,
        "vendor.quotation",
        initial=lambda: db.query(VendorQuotation).count() + 1,
    )


def create_from_order_request(
    db: Session,
    *,
    order_request_id: str,
    performed_by: str,
    payment_terms: Optional[str] = None,
    delivery_terms: str = "",
    valid_until=None,
    notes: Optional[str] = None,
) -> VendorQuotation:
    order_request = db.get(VendorOrderRequest, order_request_id)
    if not order_request:
        raise HTTPException(status_code=404, detail="Order request not found")
    if not can_transition(order_request.status, "quotation_created"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot create a quotation from an order request in '{order_request.status}' status",
        )

    quotation = VendorQuotation(
        quotation_number=_next_quotation_number(db),
        order_request_id=order_request.id,
        vendor_id=order_request.vendor_id,
        status="sent",
        payment_terms=payment_terms if payment_terms is not None else order_request.payment_terms,
        delivery_terms=delivery_terms,
        valid_until=valid_until,
        notes=notes,
    )
    db.add(quotation)
    db.flush()

    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    for line in order_request.items:
        db.add(
            VendorQuotationItem(
                quotation_id=quotation.id,
                item_id=line.item_id,
                sku_snapshot=line.sku_snapshot,
                name_snapshot=line.name_snapshot,
                unit_price=line.unit_price,
                quantity=line.quantity,
                discount_amount=line.discount_amount,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
        )
        subtotal += line.unit_price * line.quantity
        discount_total += line.discount_amount
        tax_total += line.tax_amount

    # unit_price is already net-of-discount (house convention: line_total =
    # unit_price * quantity, see chat_order_service.py). discount_amount is
    # informational only — it must not be subtracted again here.
    quotation.subtotal = subtotal
    quotation.discount_amount = discount_total
    quotation.tax_amount = tax_total
    quotation.shipping_amount = order_request.shipping_amount
    quotation.grand_total = subtotal + tax_total + order_request.shipping_amount

    order_request.status = "quotation_created"

    _log(db, entity_id=quotation.id, action="quotation_created", performed_by=performed_by, performed_by_type="user")
    notify(
        db,
        vendor_id=quotation.vendor_id,
        event="quotation_created",
        title=f"New quotation {quotation.quotation_number}",
        message=f"A quotation for {quotation.grand_total} is ready for your review.",
        entity_type="vendor_quotation",
        entity_id=quotation.id,
    )
    db.commit()
    db.refresh(quotation)
    return quotation


def get_quotation(db: Session, quotation_id: str, *, vendor_id: Optional[str] = None) -> VendorQuotation:
    row = db.get(VendorQuotation, quotation_id)
    if not row or (vendor_id and row.vendor_id != vendor_id):
        raise HTTPException(status_code=404, detail="Quotation not found")
    return row


def list_quotations(db: Session, *, vendor_id: Optional[str] = None, status: Optional[str] = None):
    q = db.query(VendorQuotation)
    if vendor_id:
        q = q.filter(VendorQuotation.vendor_id == vendor_id)
    if status:
        q = q.filter(VendorQuotation.status == status)
    return q.order_by(VendorQuotation.created_at.desc())


def mark_viewed(db: Session, quotation: VendorQuotation) -> VendorQuotation:
    if quotation.status == "sent":
        quotation.status = "viewed"
        quotation.viewed_at = datetime.utcnow()
        db.commit()
        db.refresh(quotation)
    return quotation


def respond(db: Session, quotation: VendorQuotation, *, accept: bool, performed_by: str) -> VendorQuotation:
    target = "accepted" if accept else "rejected"
    if not can_transition_quotation(quotation.status, target):
        raise HTTPException(status_code=409, detail=f"Cannot move quotation from '{quotation.status}' to '{target}'")
    quotation.status = target
    quotation.responded_at = datetime.utcnow()
    _log(
        db,
        entity_id=quotation.id,
        action=f"quotation_{target}",
        performed_by=performed_by,
        performed_by_type="vendor_user",
    )
    db.commit()
    db.refresh(quotation)
    return quotation


def request_negotiation(
    db: Session,
    quotation: VendorQuotation,
    *,
    vendor_user_id: str,
    request_type: str,
    message: str,
    requested_price=None,
    requested_quantity: Optional[int] = None,
    requested_delivery_date=None,
    requested_payment_terms: Optional[str] = None,
) -> VendorNegotiation:
    vendor = db.get(Vendor, quotation.vendor_id)
    group = db.get(VendorGroup, vendor.vendor_group_id) if vendor and vendor.vendor_group_id else None
    if not group or not group.negotiation_enabled:
        raise HTTPException(status_code=403, detail="Negotiation is not enabled for this vendor's group")
    if not can_transition_quotation(quotation.status, "negotiation"):
        raise HTTPException(
            status_code=409, detail=f"Cannot request negotiation on a quotation in '{quotation.status}' status"
        )

    negotiation = VendorNegotiation(
        quotation_id=quotation.id,
        vendor_id=quotation.vendor_id,
        vendor_user_id=vendor_user_id,
        request_type=request_type,
        message=message,
        requested_price=requested_price,
        requested_quantity=requested_quantity,
        requested_delivery_date=requested_delivery_date,
        requested_payment_terms=requested_payment_terms,
    )
    db.add(negotiation)
    quotation.status = "negotiation"

    _log(
        db,
        entity_id=quotation.id,
        action="negotiation_requested",
        performed_by=vendor_user_id,
        performed_by_type="vendor_user",
        details=message,
    )
    db.commit()
    db.refresh(negotiation)
    return negotiation


def list_negotiations(db: Session, *, quotation_id: str):
    return (
        db.query(VendorNegotiation)
        .filter(VendorNegotiation.quotation_id == quotation_id)
        .order_by(VendorNegotiation.created_at.desc())
        .all()
    )


def decline_negotiation(
    db: Session, negotiation: VendorNegotiation, *, admin_response: str, performed_by: str
) -> VendorNegotiation:
    if negotiation.status != "pending":
        raise HTTPException(status_code=409, detail="This negotiation has already been resolved")
    quotation = db.get(VendorQuotation, negotiation.quotation_id)
    negotiation.status = "declined"
    negotiation.admin_response = admin_response
    if quotation and quotation.status == "negotiation":
        quotation.status = "sent"
    _log(db, entity_id=negotiation.quotation_id, action="negotiation_declined", performed_by=performed_by, performed_by_type="user")
    db.commit()
    db.refresh(negotiation)
    return negotiation


def create_revision(
    db: Session,
    quotation: VendorQuotation,
    *,
    performed_by: str,
    items: Optional[list[dict]] = None,
    payment_terms: Optional[str] = None,
    delivery_terms: Optional[str] = None,
    valid_until=None,
    notes: Optional[str] = None,
    negotiation: Optional[VendorNegotiation] = None,
) -> VendorQuotation:
    """SPEC §26 — never overwrites `quotation`; always creates a new row and
    stamps the old one as superseded, keeping the whole chain queryable via
    previous_quotation_id / superseded_by_id."""
    if quotation.status not in {"sent", "viewed", "negotiation"}:
        raise HTTPException(status_code=409, detail=f"Cannot revise a quotation in '{quotation.status}' status")

    source_items = items if items is not None else [
        {
            "item_id": i.item_id,
            "sku_snapshot": i.sku_snapshot,
            "name_snapshot": i.name_snapshot,
            "unit_price": i.unit_price,
            "quantity": i.quantity,
            "discount_amount": i.discount_amount,
            "tax_amount": i.tax_amount,
        }
        for i in quotation.items
    ]

    revised = VendorQuotation(
        quotation_number=_next_quotation_number(db),
        order_request_id=quotation.order_request_id,
        vendor_id=quotation.vendor_id,
        status="sent",
        revision_number=quotation.revision_number + 1,
        previous_quotation_id=quotation.id,
        payment_terms=payment_terms if payment_terms is not None else quotation.payment_terms,
        delivery_terms=delivery_terms if delivery_terms is not None else quotation.delivery_terms,
        valid_until=valid_until if valid_until is not None else quotation.valid_until,
        notes=notes if notes is not None else quotation.notes,
    )
    db.add(revised)
    db.flush()

    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    for line in source_items:
        line_total = Decimal(line["unit_price"]) * line["quantity"] + Decimal(line.get("tax_amount", 0))
        db.add(
            VendorQuotationItem(
                quotation_id=revised.id,
                item_id=line["item_id"],
                sku_snapshot=line["sku_snapshot"],
                name_snapshot=line["name_snapshot"],
                unit_price=line["unit_price"],
                quantity=line["quantity"],
                discount_amount=line.get("discount_amount", 0),
                tax_amount=line.get("tax_amount", 0),
                line_total=line_total,
            )
        )
        subtotal += Decimal(line["unit_price"]) * line["quantity"]
        discount_total += Decimal(line.get("discount_amount", 0))
        tax_total += Decimal(line.get("tax_amount", 0))

    revised.subtotal = subtotal
    revised.discount_amount = discount_total
    revised.tax_amount = tax_total
    revised.shipping_amount = quotation.shipping_amount
    revised.grand_total = subtotal + tax_total + quotation.shipping_amount

    quotation.status = "superseded"
    quotation.superseded_by_id = revised.id

    if negotiation is not None:
        negotiation.status = "resolved"
        negotiation.resulting_quotation_id = revised.id

    _log(db, entity_id=quotation.id, action="quotation_superseded", performed_by=performed_by, performed_by_type="user")
    _log(db, entity_id=revised.id, action="quotation_revised", performed_by=performed_by, performed_by_type="user")
    notify(
        db,
        vendor_id=revised.vendor_id,
        event="quotation_created",
        title=f"Revised quotation {revised.quotation_number} (rev {revised.revision_number})",
        message=f"A revised quotation for {revised.grand_total} is ready for your review.",
        entity_type="vendor_quotation",
        entity_id=revised.id,
    )
    db.commit()
    db.refresh(revised)
    return revised


def transition(db: Session, quotation: VendorQuotation, *, target: str, performed_by: str) -> VendorQuotation:
    if not can_transition_quotation(quotation.status, target):
        raise HTTPException(
            status_code=409, detail=f"Cannot move quotation from '{quotation.status}' to '{target}'"
        )
    previous = quotation.status
    quotation.status = target
    _log(
        db,
        entity_id=quotation.id,
        action="quotation_status_changed",
        performed_by=performed_by,
        performed_by_type="user",
        details=f"{previous} -> {target}",
    )
    db.commit()
    db.refresh(quotation)
    return quotation
