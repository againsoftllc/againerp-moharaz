"""RMA supplier receipt (docs/RMA.md Stage D): what the supplier sent back for a dispatched claim.

The receipt defaults the actual serial to the serial that was sent. A different serial needs the serial-change permission,
must not exist in the registry yet, and is *linked* to the original (never written over it). Approving the receipt is the
only step that posts stock: ONE guarded "receipt" event brings the unit from Supplier / In Transit back into the RMA store.
A draft, pending or rejected receipt creates no stock.

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
from app.models.rma import RmaSupplierClaim, RmaSupplierReceipt, RmaTicket
from app.services.rma import complaint_service
from app.services.rma.constants import (
    RECEIPT_OPEN_STATUSES,
    RECEIPT_OUTCOMES,
    RECEIPT_STATUS_LABELS,
)

EDITABLE_FIELDS = frozenset(
    {
        "outcome",
        "outcome_note",
        "supplier_delivery_ref",
        "received_date",
        "received_by",
        "condition_notes",
        "accessories_received",
        "warehouse_id",
        "received_serial",
    }
)


# ------------------------------------------------------------- lookups


def get_receipt(db: Session, receipt_id: str, company_id: Optional[str] = None) -> RmaSupplierReceipt:
    row = db.get(RmaSupplierReceipt, receipt_id)
    if row is None or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Supplier receipt not found")
    return row


def list_receipts(db: Session, claim_id: str) -> list[RmaSupplierReceipt]:
    return (
        db.query(RmaSupplierReceipt)
        .filter(RmaSupplierReceipt.claim_id == claim_id)
        .order_by(RmaSupplierReceipt.created_at.desc())
        .all()
    )


def open_receipt(db: Session, claim_id: str) -> Optional[RmaSupplierReceipt]:
    return (
        db.query(RmaSupplierReceipt)
        .filter(RmaSupplierReceipt.claim_id == claim_id, RmaSupplierReceipt.status.in_(RECEIPT_OPEN_STATUSES))
        .first()
    )


def approved_receipt(db: Session, claim_id: str) -> Optional[RmaSupplierReceipt]:
    return (
        db.query(RmaSupplierReceipt)
        .filter(RmaSupplierReceipt.claim_id == claim_id, RmaSupplierReceipt.status == "approved")
        .first()
    )


def next_receipt_number(db: Session, company_id: str) -> str:
    year = date.today().year
    prefix = f"RRC-{year}-"
    count = (
        db.query(func.count(RmaSupplierReceipt.id))
        .filter(RmaSupplierReceipt.company_id == company_id, RmaSupplierReceipt.receipt_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not db.query(RmaSupplierReceipt.id).filter(RmaSupplierReceipt.receipt_number == number).first():
            return number
    raise HTTPException(status_code=500, detail="Could not allocate a receipt number")


def _same(a: Optional[str], b: Optional[str]) -> bool:
    return (a or "").strip().lower() == (b or "").strip().lower()


# --------------------------------------------------------- serial rules


def validate_received_serial(db: Session, receipt: RmaSupplierReceipt, serial: Optional[str]) -> None:
    """A serial that differs from the one sent must be new: not in the registry, not on another open receipt."""
    from app.services.inventory import serial_service

    if not serial or _same(serial, receipt.sent_serial):
        return
    existing = serial_service.find_by_number(db, serial, company_id=receipt.company_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Serial {serial} already exists in the registry ({existing.sku or 'unknown SKU'}, {existing.status}). The supplier cannot send back a unit that is already registered.",
        )
    clash = (
        db.query(RmaSupplierReceipt.id, RmaSupplierReceipt.receipt_number)
        .filter(
            RmaSupplierReceipt.company_id == receipt.company_id,
            RmaSupplierReceipt.id != receipt.id,
            RmaSupplierReceipt.status.in_(("draft", "pending_approval", "correction_requested", "approved")),
            func.lower(RmaSupplierReceipt.received_serial) == serial.strip().lower(),
        )
        .first()
    )
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"Serial {serial} is already on receipt {clash[1]}.")


# ------------------------------------------------------------ create / edit


def create_receipt(db: Session, claim: RmaSupplierClaim, *, actor: Optional[str]) -> RmaSupplierReceipt:
    """Open a receipt for a dispatched claim; the received serial starts as the serial that was sent."""
    ticket = db.get(RmaTicket, claim.rma_id)
    complaint_service.lock_ticket(db, ticket)
    if claim.status != "dispatched":
        raise HTTPException(
            status_code=400,
            detail="A receipt is recorded for a dispatched claim. Dispatch the claim to the supplier first.",
        )
    if ticket.custody_state != "with_supplier":
        raise HTTPException(status_code=400, detail="This unit is not with the supplier, so there is nothing to receive.")
    done = approved_receipt(db, claim.id)
    if done is not None:
        raise HTTPException(status_code=409, detail=f"{done.receipt_number} already brought this unit back.")
    pending = open_receipt(db, claim.id)
    if pending is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{pending.receipt_number} is already open for this claim ({RECEIPT_STATUS_LABELS[pending.status]}).",
        )
    intake = complaint_service.stock_event(db, ticket.id, "intake")
    receipt = RmaSupplierReceipt(
        company_id=ticket.company_id,
        rma_id=ticket.id,
        claim_id=claim.id,
        receipt_number=next_receipt_number(db, ticket.company_id),
        status="draft",
        supplier_id=claim.supplier_id,
        supplier_name=claim.supplier_name,
        sent_serial=claim.serial_number,
        received_serial=claim.serial_number,
        outcome="replacement",
        received_date=date.today(),
        accessories_received=claim.accessories_sent,
        warehouse_id=(intake.warehouse_id if intake is not None and intake.warehouse_id else ticket.warehouse_id),
        created_by=actor,
    )
    db.add(receipt)
    db.flush()
    complaint_service.record_activity(
        db, ticket, "receipt_created", actor=actor, new_value=receipt.receipt_number, details={"claim": claim.claim_number}
    )
    return receipt


def update_receipt(
    db: Session,
    receipt: RmaSupplierReceipt,
    changes: dict[str, Any],
    *,
    actor: Optional[str],
    can_change_serial: bool,
) -> RmaSupplierReceipt:
    if receipt.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"A receipt that is {RECEIPT_STATUS_LABELS[receipt.status].lower()} can no longer be edited.",
        )
    if "outcome" in changes and changes["outcome"] not in RECEIPT_OUTCOMES:
        raise HTTPException(status_code=400, detail=f"Unknown outcome: {changes['outcome']}")
    if "warehouse_id" in changes and changes["warehouse_id"]:
        complaint_service.require_rma_store(db, receipt.company_id, changes["warehouse_id"])
    if "received_serial" in changes:
        new_serial = (changes["received_serial"] or "").strip() or receipt.sent_serial
        if not _same(new_serial, receipt.received_serial):
            if not _same(new_serial, receipt.sent_serial) and not can_change_serial:
                raise HTTPException(
                    status_code=403,
                    detail="The supplier sent a different serial. Changing the received serial needs the RMA serial-change permission.",
                )
            validate_received_serial(db, receipt, new_serial)
        changes["received_serial"] = new_serial
    for key, value in changes.items():
        if key in EDITABLE_FIELDS:
            setattr(receipt, key, value)
    db.flush()
    return receipt


# ------------------------------------------------------------ workflow


def submit_receipt(db: Session, receipt: RmaSupplierReceipt, *, actor: Optional[str]) -> RmaSupplierReceipt:
    if receipt.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a receipt sent back for correction can be sent for approval (this one is {RECEIPT_STATUS_LABELS[receipt.status].lower()}).",
        )
    if not receipt.warehouse_id:
        raise HTTPException(status_code=400, detail="Choose the RMA store the unit is received into.")
    complaint_service.require_rma_store(db, receipt.company_id, receipt.warehouse_id)
    if receipt.outcome not in RECEIPT_OUTCOMES:
        raise HTTPException(status_code=400, detail="Choose what the supplier sent back (the outcome).")
    validate_received_serial(db, receipt, receipt.received_serial)
    receipt.status = "pending_approval"
    receipt.decision = None
    db.flush()
    ticket = db.get(RmaTicket, receipt.rma_id)
    complaint_service.record_activity(db, ticket, "receipt_submitted", actor=actor, new_value=receipt.receipt_number)
    return receipt


def cancel_receipt(db: Session, receipt: RmaSupplierReceipt, *, actor: Optional[str], reason: Optional[str]) -> RmaSupplierReceipt:
    if receipt.status == "approved":
        raise HTTPException(
            status_code=400,
            detail="This receipt is approved and the unit is already back in the RMA store; it cannot be cancelled.",
        )
    if receipt.status in {"cancelled", "rejected"}:
        raise HTTPException(status_code=400, detail=f"This receipt is already {receipt.status}.")
    receipt.status = "cancelled"
    db.flush()
    ticket = db.get(RmaTicket, receipt.rma_id)
    complaint_service.record_activity(
        db, ticket, "receipt_cancelled", actor=actor, new_value=receipt.receipt_number, details={"reason": (reason or "").strip() or None}
    )
    return receipt


def decide_receipt(
    db: Session,
    receipt: RmaSupplierReceipt,
    *,
    decision: str,
    reason: Optional[str],
    user: AuthUser,
    can_change_serial: bool,
) -> RmaSupplierReceipt:
    """Approve, reject or send back. The caller has checked `rma_receive_approve`. Only approval posts stock."""
    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
    if receipt.status != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Only a receipt that is pending approval can be decided (this one is {RECEIPT_STATUS_LABELS[receipt.status].lower()}).",
        )
    text = (reason or "").strip()
    if decision != "approved" and not text:
        raise HTTPException(status_code=400, detail="A reason is required to reject a receipt or send it back.")
    ticket = db.get(RmaTicket, receipt.rma_id)

    if decision == "approved":
        # Everything that can refuse is checked before anything changes.
        if not _same(receipt.received_serial, receipt.sent_serial) and not can_change_serial:
            raise HTTPException(
                status_code=403,
                detail="This receipt records a different serial than the one sent. Approving it needs the RMA serial-change permission.",
            )
        validate_received_serial(db, receipt, receipt.received_serial)
        _post_receipt(db, receipt, ticket, user=user)

    receipt.status = decision
    receipt.decision = decision
    receipt.decided_by = user.id
    receipt.decided_by_name = user.name or user.username
    receipt.decided_at = datetime.utcnow()
    receipt.decision_reason = text or None
    if decision == "approved":
        receipt.posted_at = datetime.utcnow()
    db.flush()
    complaint_service.record_activity(
        db, ticket, f"receipt_{decision}", actor=user.id, new_value=receipt.receipt_number, details={"reason": text or None}
    )
    return receipt


def _post_receipt(db: Session, receipt: RmaSupplierReceipt, ticket: RmaTicket, *, user: AuthUser) -> None:
    """Bring the unit back: one guarded stock event, the serial link, the ticket and supplier job in step."""
    from app.services.inventory import serial_service
    from app.services.inventory.constants import MOVEMENT_TRANSFER_IN, MOVEMENT_TRANSFER_OUT
    from app.services.rma import rma_service

    claim = db.get(RmaSupplierClaim, receipt.claim_id)
    complaint_service.lock_ticket(db, ticket)
    if ticket.custody_state != "with_supplier" or not claim or not claim.transit_warehouse_id:
        raise HTTPException(status_code=400, detail="This unit is not with the supplier, so it cannot be received back.")
    store = complaint_service.require_rma_store(db, ticket.company_id, receipt.warehouse_id)
    qty = ticket.quantity or 1

    _, posted = complaint_service.post_stock_event(
        db,
        ticket,
        "receipt",
        [
            complaint_service.StockLeg(claim.transit_warehouse_id, MOVEMENT_TRANSFER_OUT, qty, f"Receipt {receipt.receipt_number} — out of Supplier / In Transit"),
            complaint_service.StockLeg(store.id, MOVEMENT_TRANSFER_IN, qty, f"Receipt {receipt.receipt_number} — back from {receipt.supplier_name}"),
        ],
        custody_state="replacement_received",
        actor=user.id,
        note=f"Received from {receipt.supplier_name} ({receipt.receipt_number}): {RECEIPT_OUTCOMES[receipt.outcome]}",
    )
    if not posted:
        raise HTTPException(status_code=409, detail="This unit was already received back.")

    when = receipt.received_date or date.today()
    outcome = RECEIPT_OUTCOMES[receipt.outcome]
    different = not _same(receipt.received_serial, receipt.sent_serial)

    # --- serials: the original is never written over; a different unit is registered and linked to it
    if receipt.sent_serial:
        original = serial_service.find_by_number(db, receipt.sent_serial, company_id=ticket.company_id)
    else:
        original = None
    if different:
        received_no = (receipt.received_serial or "").strip()
        results = serial_service.register_serials_or_raise(
            db,
            [received_no],
            company_id=ticket.company_id,
            item_id=ticket.item_id,
            sku=ticket.sku,
            warehouse_id=store.id,
            source_type="rma_replacement",
            source_id=receipt.id,
            supplier_id=receipt.supplier_id,
        )
        created = serial_service.find_by_number(db, received_no, company_id=ticket.company_id)
        if created is None or not results:
            raise HTTPException(status_code=500, detail="The received serial could not be registered.")
        # The unit stays in the RMA's hands (waiting for the customer delivery step) and says what it replaces.
        created.status = "in_service"
        created.rma_id = ticket.id
        created.replaces_serial = receipt.sent_serial
        line = f"[{when.isoformat()}] Received from {receipt.supplier_name} as the {outcome.lower()} for {receipt.sent_serial} ({receipt.receipt_number}, RMA {ticket.rma_number})."
        created.notes = f"{created.notes}\n{line}".strip() if created.notes else line
        if original is not None:
            if original.rma_id == ticket.id:
                serial_service.release_from_rma(db, original, "replaced")
            original.replaced_by_serial = received_no
            line = f"[{when.isoformat()}] Replaced by {received_no} ({receipt.receipt_number}, RMA {ticket.rma_number})."
            original.notes = f"{original.notes}\n{line}".strip() if original.notes else line
        ticket.received_serial_number = received_no
    else:
        if original is not None and original.rma_id == ticket.id:
            original.warehouse_id = store.id
            line = f"[{when.isoformat()}] Back from {receipt.supplier_name}: {outcome.lower()} ({receipt.receipt_number}, RMA {ticket.rma_number})."
            original.notes = f"{original.notes}\n{line}".strip() if original.notes else line
        ticket.received_serial_number = receipt.sent_serial

    # --- ticket and supplier job
    job = ticket.supplier_job
    rma_service.upsert_supplier_job(
        db,
        ticket,
        supplier_id=receipt.supplier_id,
        status="returned",
        dispatched_at=job.dispatched_at if job is not None else None,
        supplier_reference=job.supplier_reference if job is not None else claim.supplier_reference,
        expected_return_date=job.expected_return_date if job is not None else claim.expected_return_date,
        returned_at=when,
        outcome=receipt.outcome,
        cost=job.cost if job is not None else Decimal("0"),
        notes=job.notes if job is not None else None,
    )
    note = f"Received from {receipt.supplier_name} ({receipt.receipt_number}): {outcome}"
    if ticket.status == "sent_to_supplier":
        rma_service.change_status(db, ticket, "at_supplier", actor=user.id, note="Supplier handling the unit", _via_claim=True)
    if ticket.status == "at_supplier":
        rma_service.change_status(db, ticket, "returned_from_supplier", actor=user.id, note=note, _via_claim=True)
    complaint_service.record_activity(
        db,
        ticket,
        "stock_in_from_supplier",
        actor=user.id,
        new_value=store.name,
        details={"receipt": receipt.receipt_number, "serial_sent": receipt.sent_serial, "serial_received": receipt.received_serial, "outcome": receipt.outcome},
    )
    # the claim itself stays "dispatched": it is the record of what was sent


# ------------------------------------------------------------------ print


def receipt_payload(db: Session, receipt: RmaSupplierReceipt, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """Replacement Receive Copy. Built field by field: no customer details, internal notes or costs."""
    ticket = db.get(RmaTicket, receipt.rma_id)
    claim = db.get(RmaSupplierClaim, receipt.claim_id)
    store = db.get(InventoryWarehouse, receipt.warehouse_id) if receipt.warehouse_id else None
    return {
        "receipt_no": receipt.receipt_number,
        "status": receipt.status,
        "status_label": RECEIPT_STATUS_LABELS[receipt.status],
        "reprint": reprint,
        "print_count": receipt.print_count,
        "printed_at": datetime.utcnow().isoformat(),
        "printed_by": printed_by,
        "rma_number": ticket.rma_number if ticket else "",
        "claim_number": claim.claim_number if claim else "",
        "supplier_name": receipt.supplier_name,
        "supplier_reference": claim.supplier_reference if claim else None,
        "supplier_delivery_ref": receipt.supplier_delivery_ref,
        "product_name": ticket.product_name if ticket else "",
        "sku": ticket.sku if ticket else "",
        "serial_sent": receipt.sent_serial,
        "serial_received": receipt.received_serial,
        "serial_changed": not _same(receipt.received_serial, receipt.sent_serial),
        "outcome": receipt.outcome,
        "outcome_label": RECEIPT_OUTCOMES[receipt.outcome],
        "outcome_note": receipt.outcome_note,
        "received_date": receipt.received_date.isoformat() if receipt.received_date else None,
        "received_by": receipt.received_by,
        "condition_notes": receipt.condition_notes,
        "accessories_received": receipt.accessories_received,
        "received_into": store.name if store else None,
        "approved_by": receipt.decided_by_name if receipt.decision == "approved" else None,
    }


def count_receipt_print(db: Session, receipt: RmaSupplierReceipt, *, actor: Optional[str]) -> None:
    receipt.print_count = (receipt.print_count or 0) + 1
    receipt.last_printed_at = datetime.utcnow()
    ticket = db.get(RmaTicket, receipt.rma_id)
    complaint_service.record_activity(
        db,
        ticket,
        "receipt_copy_printed" if receipt.print_count == 1 else "receipt_copy_reprinted",
        actor=actor,
        new_value=receipt.receipt_number,
        details={"print_count": receipt.print_count},
    )
