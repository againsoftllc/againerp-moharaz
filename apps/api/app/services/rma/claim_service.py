"""RMA supplier claim and dispatch (docs/RMA.md Stage C).

A claim is raised for a unit that sits in the RMA store, reviewed and approved, and only then dispatched. Dispatch is
the step that moves the unit out of the RMA store: one guarded stock event ("dispatch") takes it from the RMA store to
the Supplier / In Transit warehouse, the ticket goes to "sent to supplier" with the stock state "With Supplier", and the
legacy supplier job is kept in step so the existing lists and drawers keep working.

Like the rest of the RMA layer this flushes; the router owns the transaction and commits.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.rma import RmaSupplierClaim, RmaTicket
from app.services.rma import complaint_service
from app.services.rma.constants import (
    CLAIM_OPEN_STATUSES,
    CLAIM_STATUS_LABELS,
    CLAIM_TICKET_STATUSES,
    RMA_STATUS_LABELS,
)

# Fields a user may edit while the claim is still a draft (or sent back). Supplier, serial and purchase-invoice
# details are copied from the ticket and stay read-only; the supplier changes only through the override path.
EDITABLE_FIELDS = frozenset(
    {
        "supplier_reference",
        "problem",
        "diagnosis",
        "accessories_sent",
        "notes",
        "dispatch_date",
        "courier",
        "tracking_number",
        "expected_return_date",
    }
)


# ------------------------------------------------------------- lookups


def get_claim(db: Session, claim_id: str, company_id: Optional[str] = None) -> RmaSupplierClaim:
    row = db.get(RmaSupplierClaim, claim_id)
    if row is None or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Supplier claim not found")
    return row


def list_claims(db: Session, ticket_id: str) -> list[RmaSupplierClaim]:
    return (
        db.query(RmaSupplierClaim)
        .filter(RmaSupplierClaim.rma_id == ticket_id)
        .order_by(RmaSupplierClaim.created_at.desc())
        .all()
    )


def open_claim(db: Session, ticket_id: str) -> Optional[RmaSupplierClaim]:
    return (
        db.query(RmaSupplierClaim)
        .filter(RmaSupplierClaim.rma_id == ticket_id, RmaSupplierClaim.status.in_(CLAIM_OPEN_STATUSES))
        .first()
    )


def next_claim_number(db: Session, company_id: str) -> str:
    year = date.today().year
    prefix = f"SCL-{year}-"
    count = (
        db.query(func.count(RmaSupplierClaim.id))
        .filter(RmaSupplierClaim.company_id == company_id, RmaSupplierClaim.claim_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not db.query(RmaSupplierClaim.id).filter(RmaSupplierClaim.claim_number == number).first():
            return number
    raise HTTPException(status_code=500, detail="Could not allocate a claim number")


def supplier_transit_store(db: Session, company_id: str, *, ensure: bool = True) -> Optional[InventoryWarehouse]:
    """The "Supplier / In Transit" warehouse; created the first time it is needed."""
    row = (
        db.query(InventoryWarehouse)
        .filter(
            InventoryWarehouse.company_id == company_id,
            InventoryWarehouse.is_supplier_transit.is_(True),
            InventoryWarehouse.is_active.is_(True),
        )
        .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name)
        .first()
    )
    if row or not ensure:
        return row
    code = "RMA-SUP"
    if (
        db.query(InventoryWarehouse.id)
        .filter(InventoryWarehouse.company_id == company_id, func.lower(InventoryWarehouse.code) == code.lower())
        .first()
    ):
        code = "RMA-SUP-1"
    row = InventoryWarehouse(
        company_id=company_id,
        code=code,
        name="Supplier / In Transit",
        type="Returns / Damaged",
        is_active=True,
        is_default=False,
        is_supplier_transit=True,
        sort_order=910,
    )
    db.add(row)
    db.flush()
    return row


# ------------------------------------------------------------ create / edit


def _ticket_ready_for_claim(db: Session, ticket: RmaTicket) -> None:
    if ticket.custody_state != "in_rma_store":
        raise HTTPException(
            status_code=400,
            detail="A supplier claim is raised for a unit that is in the RMA store. Approve the complaint and receive the unit first.",
        )
    if ticket.status not in CLAIM_TICKET_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"A claim cannot be raised while the RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}.",
        )
    existing = open_claim(db, ticket.id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{existing.claim_number} is already open for this RMA ({CLAIM_STATUS_LABELS[existing.status]}).",
        )


def create_claim(
    db: Session,
    ticket: RmaTicket,
    *,
    actor: Optional[str],
    supplier_id: Optional[str] = None,
    override_reason: Optional[str] = None,
    can_override: bool = False,
) -> RmaSupplierClaim:
    """Raise a claim from an approved, received RMA. Supplier and purchase invoice come from the traced serial."""
    complaint_service.lock_ticket(db, ticket)
    _ticket_ready_for_claim(db, ticket)

    if not ticket.supplier_id:
        # No purchase trace: only an authorized manual choice (with a reason) may name the supplier.
        if not supplier_id:
            raise HTTPException(
                status_code=400,
                detail="The purchase trace did not find a supplier for this unit. Someone with the RMA override permission has to choose it.",
            )
        if not can_override:
            raise HTTPException(status_code=403, detail="Choosing the supplier by hand needs the RMA override permission.")
        complaint_service.set_supplier_manually(
            db, ticket, supplier_id=supplier_id, reason=override_reason or "", actor=actor
        )
    elif supplier_id and supplier_id != ticket.supplier_id:
        raise HTTPException(
            status_code=400,
            detail="This unit traces to a different supplier. Change the supplier with the Override action on the RMA first.",
        )

    claim = RmaSupplierClaim(
        company_id=ticket.company_id,
        rma_id=ticket.id,
        claim_number=next_claim_number(db, ticket.company_id),
        status="draft",
        supplier_id=ticket.supplier_id,
        supplier_name=ticket.supplier_name or "",
        purchase_receipt_no=ticket.purchase_receipt_no,
        purchase_bill_no=ticket.purchase_bill_no,
        vendor_invoice_no=ticket.vendor_invoice_no,
        sku=ticket.sku,
        product_name=ticket.product_name,
        serial_number=ticket.serial_number,
        quantity=ticket.quantity or 1,
        problem=ticket.fault_reported,
        diagnosis=ticket.diagnosis_report or ticket.fault_diagnosed,
        accessories_sent=ticket.accessories,
        expected_return_date=ticket.promised_delivery_date,
        created_by=actor,
    )
    db.add(claim)
    db.flush()
    complaint_service.record_activity(
        db, ticket, "claim_created", actor=actor, new_value=claim.claim_number, details={"supplier": claim.supplier_name}
    )
    return claim


def update_claim(db: Session, claim: RmaSupplierClaim, changes: dict[str, Any], *, actor: Optional[str]) -> RmaSupplierClaim:
    if claim.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"A claim that is {CLAIM_STATUS_LABELS[claim.status].lower()} can no longer be edited.",
        )
    for key, value in changes.items():
        if key not in EDITABLE_FIELDS:
            continue
        setattr(claim, key, value)
    db.flush()
    return claim


# ------------------------------------------------------------ workflow


def submit_claim(db: Session, claim: RmaSupplierClaim, *, actor: Optional[str]) -> RmaSupplierClaim:
    if claim.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a claim sent back for correction can be sent for approval (this one is {CLAIM_STATUS_LABELS[claim.status].lower()}).",
        )
    if not (claim.problem or "").strip():
        raise HTTPException(status_code=400, detail="Describe the problem for the supplier before sending the claim for approval.")
    claim.status = "pending_approval"
    claim.decision = None
    db.flush()
    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.record_activity(db, ticket, "claim_submitted", actor=actor, new_value=claim.claim_number)
    return claim


def decide_claim(
    db: Session, claim: RmaSupplierClaim, *, decision: str, reason: Optional[str], user: AuthUser
) -> RmaSupplierClaim:
    """Approve, reject or send a claim back. The caller has checked `rma_claim_approve`."""
    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
    # an approver finalizes a draft in one step: it is sent and decided in this same call (docs/approval.md)
    if decision == "approved" and claim.status in {"draft", "correction_requested"}:
        submit_claim(db, claim, actor=user.id)
    if claim.status != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Only a claim that is pending approval can be decided (this one is {CLAIM_STATUS_LABELS[claim.status].lower()}).",
        )
    text = (reason or "").strip()
    if decision != "approved" and not text:
        raise HTTPException(status_code=400, detail="A reason is required to reject a claim or send it back.")
    claim.status = decision
    claim.decision = decision
    claim.decided_by = user.id
    claim.decided_by_name = user.name or user.username
    claim.decided_at = datetime.utcnow()
    claim.decision_reason = text or None
    db.flush()
    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.record_activity(
        db, ticket, f"claim_{decision}", actor=user.id, new_value=claim.claim_number, details={"reason": text or None}
    )
    return claim


def cancel_claim(db: Session, claim: RmaSupplierClaim, *, actor: Optional[str], reason: Optional[str]) -> RmaSupplierClaim:
    if claim.status == "dispatched":
        raise HTTPException(
            status_code=400,
            detail="The unit has already been dispatched. Record what comes back from the supplier instead of cancelling the claim.",
        )
    if claim.status in {"cancelled", "rejected"}:
        raise HTTPException(status_code=400, detail=f"This claim is already {claim.status}.")
    claim.status = "cancelled"
    db.flush()
    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.record_activity(
        db, ticket, "claim_cancelled", actor=actor, new_value=claim.claim_number, details={"reason": (reason or "").strip() or None}
    )
    return claim


def dispatch_claim(
    db: Session,
    claim: RmaSupplierClaim,
    *,
    user: AuthUser,
    dispatch_date: Optional[date] = None,
    courier: Optional[str] = None,
    tracking_number: Optional[str] = None,
    expected_return_date: Optional[date] = None,
    note: Optional[str] = None,
) -> RmaSupplierClaim:
    """Hand the unit over to the supplier. The caller has checked `rma_dispatch`.

    Moves the unit out of the RMA store to Supplier / In Transit exactly once (the "dispatch" stock event), keeps the
    serial's location, sets the stock state to "With Supplier" and the RMA to "sent to supplier".
    """
    from app.services.inventory import serial_service
    from app.services.inventory.constants import MOVEMENT_TRANSFER_IN, MOVEMENT_TRANSFER_OUT
    from app.services.rma import rma_service

    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.lock_ticket(db, ticket)
    if claim.status != "approved":
        raise HTTPException(
            status_code=400,
            detail=f"Only an approved claim can be dispatched (this one is {CLAIM_STATUS_LABELS[claim.status].lower()}).",
        )
    intake = complaint_service.stock_event(db, ticket.id, "intake")
    if ticket.custody_state != "in_rma_store" or intake is None or intake.reversed_at is not None or not intake.warehouse_id:
        raise HTTPException(
            status_code=400,
            detail="The unit is not in the RMA store, so it cannot be dispatched.",
        )
    if ticket.status not in CLAIM_TICKET_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"The RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}; it cannot be sent to a supplier from there.",
        )

    transit = supplier_transit_store(db, ticket.company_id)
    qty = ticket.quantity or 1
    when = dispatch_date or claim.dispatch_date or date.today()
    _, posted = complaint_service.post_stock_event(
        db,
        ticket,
        "dispatch",
        [
            complaint_service.StockLeg(intake.warehouse_id, MOVEMENT_TRANSFER_OUT, qty, f"Dispatch {claim.claim_number} — out of the RMA store"),
            complaint_service.StockLeg(transit.id, MOVEMENT_TRANSFER_IN, qty, f"Dispatch {claim.claim_number} — with {claim.supplier_name}"),
        ],
        custody_state="with_supplier",
        actor=user.id,
        note=f"Dispatched to {claim.supplier_name} ({claim.claim_number})",
    )
    if not posted:
        raise HTTPException(status_code=409, detail="This unit was already dispatched.")

    claim.status = "dispatched"
    claim.dispatch_date = when
    claim.courier = (courier or claim.courier or None)
    claim.tracking_number = (tracking_number or claim.tracking_number or None)
    claim.expected_return_date = expected_return_date or claim.expected_return_date
    if note:
        claim.notes = f"{claim.notes}\n{note}".strip() if claim.notes else note
    claim.dispatched_by = user.id
    claim.dispatched_by_name = user.name or user.username
    claim.dispatched_at = datetime.utcnow()
    claim.transit_warehouse_id = transit.id

    # The unit's location follows it, and the serial's history says where it went.
    if ticket.serial_number:
        serial = serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id)
        if serial is not None and serial.rma_id == ticket.id:
            serial.warehouse_id = transit.id
            line = f"[{when.isoformat()}] Sent to supplier {claim.supplier_name} ({claim.claim_number}, RMA {ticket.rma_number})."
            serial.notes = f"{serial.notes}\n{line}".strip() if serial.notes else line

    # Keep the ticket's supplier leg in step so the existing list column and drawer stay correct.
    job = ticket.supplier_job
    rma_service.upsert_supplier_job(
        db,
        ticket,
        supplier_id=claim.supplier_id,
        status="dispatched",
        dispatched_at=when,
        supplier_reference=claim.supplier_reference,
        expected_return_date=claim.expected_return_date,
        cost=job.cost if job is not None else Decimal("0"),
        notes=claim.notes,
    )
    ticket.courier = claim.courier or ticket.courier
    ticket.tracking_number = claim.tracking_number or ticket.tracking_number
    ticket.expected_return_date = claim.expected_return_date or ticket.expected_return_date
    rma_service.change_status(
        db, ticket, "sent_to_supplier", actor=user.id, note=f"Dispatched to {claim.supplier_name} ({claim.claim_number})", _via_claim=True
    )
    db.flush()
    complaint_service.record_activity(
        db,
        ticket,
        "claim_dispatched",
        actor=user.id,
        new_value=claim.claim_number,
        details={"supplier": claim.supplier_name, "courier": claim.courier, "tracking": claim.tracking_number},
    )
    return claim


# ------------------------------------------------------------------ print


def claim_payload(db: Session, claim: RmaSupplierClaim, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """The supplier's copy. Built field by field: no customer details, internal notes or costs."""
    ticket = db.get(RmaTicket, claim.rma_id)
    return {
        "claim_no": claim.claim_number,
        "status": claim.status,
        "status_label": CLAIM_STATUS_LABELS[claim.status],
        "reprint": reprint,
        "print_count": claim.print_count,
        "printed_at": datetime.utcnow().isoformat(),
        "printed_by": printed_by,
        "rma_number": ticket.rma_number if ticket else "",
        "supplier_name": claim.supplier_name,
        "supplier_reference": claim.supplier_reference,
        "product_name": claim.product_name,
        "sku": claim.sku,
        "serial_number": claim.serial_number,
        "quantity": claim.quantity,
        "problem": claim.problem,
        "diagnosis": claim.diagnosis,
        "accessories_sent": claim.accessories_sent,
        "purchase_receipt_no": claim.purchase_receipt_no,
        "purchase_bill_no": claim.purchase_bill_no,
        "vendor_invoice_no": claim.vendor_invoice_no,
        "sold_on": ticket.purchased_at.isoformat() if ticket and ticket.purchased_at else None,
        "dispatch_date": claim.dispatch_date.isoformat() if claim.dispatch_date else None,
        "courier": claim.courier,
        "tracking_number": claim.tracking_number,
        "expected_return_date": claim.expected_return_date.isoformat() if claim.expected_return_date else None,
        "approved_by": claim.decided_by_name if claim.decision == "approved" else None,
        "dispatched_by": claim.dispatched_by_name,
    }


def count_claim_print(db: Session, claim: RmaSupplierClaim, *, actor: Optional[str]) -> None:
    claim.print_count = (claim.print_count or 0) + 1
    claim.last_printed_at = datetime.utcnow()
    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.record_activity(
        db,
        ticket,
        "claim_copy_printed" if claim.print_count == 1 else "claim_copy_reprinted",
        actor=actor,
        new_value=claim.claim_number,
        details={"print_count": claim.print_count},
    )
