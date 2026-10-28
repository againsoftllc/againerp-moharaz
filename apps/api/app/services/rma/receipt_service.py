"""RMA supplier receipt (docs/RMA.md Stage D): what the supplier sent back for a dispatched claim.

The receipt has a TYPE (`outcome`) that says what came back, and the type drives everything:

  same_unit          Same product, same serial   the unit is back, the serial is the one that was sent
  same_product       Same product, new serial    a replacement unit: the new serial must be new to the registry and is *linked*
                                                 to the original (never written over it)
  different_product  Different product, new     another inventory item came back: it is stocked (with its new serial) and
                     serial                      the RMA holds it from then on, so the customer delivery hands THAT over
  cash_back          Cash back                   no unit returns: the original is written off the transit stock and the money
                                                 is posted to Finance through an RMA settlement (supplier, money in)

A serial or product that differs from what was sent needs the serial-change permission (the note is optional). Approving the receipt is
the only step that posts: ONE guarded "receipt" stock event (and, for cash back, the settlement). A draft, pending or rejected
receipt creates no stock and no money entry.

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
    RECEIPT_UNIT_OUTCOMES,
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
        "received_item_id",
        "refund_amount",
        "refund_account_id",
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
        outcome="same_unit",
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


def _normalize(receipt: RmaSupplierReceipt) -> None:
    """Keep only what the receipt's type uses, so a type that was changed leaves nothing stale behind."""
    kind = receipt.outcome
    if kind != "different_product":
        receipt.received_item_id = receipt.received_sku = receipt.received_product_name = None
    if kind != "cash_back":
        receipt.refund_amount = None
        receipt.refund_account_id = None
    if kind == "same_unit":
        receipt.received_serial = receipt.sent_serial
    elif kind == "cash_back":
        receipt.received_serial = None


def _apply_received_item(db: Session, receipt: RmaSupplierReceipt, ticket: RmaTicket, item_id: Optional[str]) -> None:
    from app.models.item import Item

    if not item_id:
        receipt.received_item_id = receipt.received_sku = receipt.received_product_name = None
        return
    item = db.get(Item, item_id)
    if item is None or item.company_id != receipt.company_id:
        raise HTTPException(status_code=400, detail="That product was not found.")
    if item.id == ticket.item_id:
        raise HTTPException(
            status_code=400,
            detail="That is the product that was sent. Choose \"Same product, different serial\" for a replacement of the same product.",
        )
    receipt.received_item_id = item.id
    receipt.received_sku = item.sku
    receipt.received_product_name = item.name


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
    outcome = changes.get("outcome", receipt.outcome)
    ticket = db.get(RmaTicket, receipt.rma_id)

    if outcome in {"same_product", "different_product"} and "received_serial" in changes:
        new_serial = (changes["received_serial"] or "").strip() or None
        if new_serial and not _same(new_serial, receipt.received_serial):
            if not _same(new_serial, receipt.sent_serial) and not can_change_serial:
                raise HTTPException(
                    status_code=403,
                    detail="The supplier sent a different serial. Changing the received serial needs the RMA serial-change permission.",
                )
            validate_received_serial(db, receipt, new_serial)
        changes["received_serial"] = new_serial
    elif "received_serial" in changes:
        changes.pop("received_serial")  # the type decides the serial (the one sent, or none for cash back)

    if "refund_account_id" in changes and changes["refund_account_id"]:
        from app.models.finance import FinancePaymentAccount

        account = db.get(FinancePaymentAccount, changes["refund_account_id"])
        if account is None or account.company_id != receipt.company_id or not account.is_active:
            raise HTTPException(status_code=400, detail="That cash / bank account is not available.")

    item_change = changes.pop("received_item_id", "__unchanged__")
    if outcome == "different_product" and item_change != "__unchanged__":
        _apply_received_item(db, receipt, ticket, item_change)  # refuses before anything else is changed
    for key, value in changes.items():
        if key in EDITABLE_FIELDS:
            setattr(receipt, key, value)
    _normalize(receipt)
    db.flush()
    return receipt


def validate_outcome(db: Session, receipt: RmaSupplierReceipt) -> None:
    """Every rule that can refuse a receipt, by type. Run when it is sent and again when it is approved."""
    kind = receipt.outcome
    if kind not in RECEIPT_OUTCOMES:
        raise HTTPException(status_code=400, detail="Choose what the supplier sent back.")
    ticket = db.get(RmaTicket, receipt.rma_id)

    if kind in RECEIPT_UNIT_OUTCOMES:
        if not receipt.warehouse_id:
            raise HTTPException(status_code=400, detail="Choose the RMA store the unit is received into.")
        complaint_service.require_rma_store(db, receipt.company_id, receipt.warehouse_id)

    if kind == "same_product" or kind == "different_product":
        serial = (receipt.received_serial or "").strip()
        if not serial or _same(serial, receipt.sent_serial):
            raise HTTPException(
                status_code=400,
                detail="Enter the serial of the unit the supplier sent" + (f" (it must differ from {receipt.sent_serial})." if receipt.sent_serial else "."),
            )
        validate_received_serial(db, receipt, serial)
    if kind == "different_product":
        if not receipt.received_item_id:
            raise HTTPException(status_code=400, detail="Choose the product the supplier sent back.")
        if receipt.received_item_id == ticket.item_id:
            raise HTTPException(status_code=400, detail="That is the product that was sent. Choose \"Same product, different serial\".")
    if kind == "cash_back":
        from app.models.finance import FinancePaymentAccount

        if receipt.refund_amount is None or Decimal(str(receipt.refund_amount)) <= 0:
            raise HTTPException(status_code=400, detail="Enter the amount the supplier paid back.")
        if not receipt.refund_account_id:
            raise HTTPException(status_code=400, detail="Pick the cash or bank account the money went into.")
        account = db.get(FinancePaymentAccount, receipt.refund_account_id)
        if account is None or account.company_id != receipt.company_id or not account.is_active:
            raise HTTPException(status_code=400, detail="That cash / bank account is not available.")


# ------------------------------------------------------------ workflow


def submit_receipt(db: Session, receipt: RmaSupplierReceipt, *, actor: Optional[str]) -> RmaSupplierReceipt:
    if receipt.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a receipt sent back for correction can be sent for approval (this one is {RECEIPT_STATUS_LABELS[receipt.status].lower()}).",
        )
    validate_outcome(db, receipt)
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
    # an approver finalizes a draft in one step: it is sent and decided in this same call (docs/approval.md)
    if decision == "approved" and receipt.status in {"draft", "correction_requested"}:
        submit_receipt(db, receipt, actor=user.id)
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
        if receipt.outcome in {"same_product", "different_product"} and not can_change_serial:
            raise HTTPException(
                status_code=403,
                detail="This receipt records a different serial or product than the one sent. Approving it needs the RMA serial-change permission.",
            )
        validate_outcome(db, receipt)
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


def _append_note(row: Any, line: str) -> None:
    row.notes = f"{row.notes}\n{line}".strip() if row.notes else line


def _post_receipt(db: Session, receipt: RmaSupplierReceipt, ticket: RmaTicket, *, user: AuthUser) -> None:
    """Post what came back, by type: one guarded stock event, the serials, the money (cash back), the ticket and supplier job."""
    from app.services.inventory import serial_service
    from app.services.inventory.constants import (
        MOVEMENT_STOCK_ADJUSTMENT_IN,
        MOVEMENT_STOCK_ADJUSTMENT_OUT,
        MOVEMENT_TRANSFER_IN,
        MOVEMENT_TRANSFER_OUT,
    )
    from app.services.rma import rma_service

    claim = db.get(RmaSupplierClaim, receipt.claim_id)
    complaint_service.lock_ticket(db, ticket)
    if ticket.custody_state != "with_supplier" or not claim or not claim.transit_warehouse_id:
        raise HTTPException(status_code=400, detail="This unit is not with the supplier, so it cannot be received back.")
    kind = receipt.outcome
    label = RECEIPT_OUTCOMES[kind]
    qty = ticket.quantity or 1
    transit = claim.transit_warehouse_id
    original_item = ticket.item_id
    note = f"Received from {receipt.supplier_name} ({receipt.receipt_number}): {label}"
    store = complaint_service.require_rma_store(db, ticket.company_id, receipt.warehouse_id) if kind in RECEIPT_UNIT_OUTCOMES else None

    # --- stock: the unit that went out to the supplier is accounted for, and whatever came back is stocked into the RMA store
    if kind == "cash_back":
        legs = [
            complaint_service.StockLeg(
                transit, MOVEMENT_STOCK_ADJUSTMENT_OUT, qty, f"Receipt {receipt.receipt_number} — kept by {receipt.supplier_name}, cash back", item_id=original_item
            )
        ]
        custody = "cash_back"
    elif kind == "different_product":
        legs = [
            complaint_service.StockLeg(
                transit, MOVEMENT_STOCK_ADJUSTMENT_OUT, qty, f"Receipt {receipt.receipt_number} — original replaced by {receipt.supplier_name} with another product", item_id=original_item
            ),
            complaint_service.StockLeg(
                store.id, MOVEMENT_STOCK_ADJUSTMENT_IN, qty, f"Receipt {receipt.receipt_number} — {receipt.received_sku} received from {receipt.supplier_name}", item_id=receipt.received_item_id
            ),
        ]
        custody = "replacement_received"
    else:
        legs = [
            complaint_service.StockLeg(transit, MOVEMENT_TRANSFER_OUT, qty, f"Receipt {receipt.receipt_number} — out of Supplier / In Transit"),
            complaint_service.StockLeg(store.id, MOVEMENT_TRANSFER_IN, qty, f"Receipt {receipt.receipt_number} — back from {receipt.supplier_name}"),
        ]
        custody = "replacement_received"
    _, posted = complaint_service.post_stock_event(db, ticket, "receipt", legs, custody_state=custody, actor=user.id, note=note)
    if not posted:
        raise HTTPException(status_code=409, detail="This unit was already received back.")

    when = receipt.received_date or date.today()
    original = serial_service.find_by_number(db, receipt.sent_serial, company_id=ticket.company_id) if receipt.sent_serial else None

    # --- serials: the original is never written over; a different unit is registered and linked to it
    if kind in {"same_product", "different_product"}:
        received_no = (receipt.received_serial or "").strip()
        is_other_product = kind == "different_product"
        results = serial_service.register_serials_or_raise(
            db,
            [received_no],
            company_id=ticket.company_id,
            item_id=receipt.received_item_id if is_other_product else ticket.item_id,
            sku=receipt.received_sku if is_other_product else ticket.sku,
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
        what = f"as the {label.lower()}" + (f" ({receipt.received_sku})" if is_other_product else "")
        _append_note(created, f"[{when.isoformat()}] Received from {receipt.supplier_name} {what} for {receipt.sent_serial} ({receipt.receipt_number}, RMA {ticket.rma_number}).")
        if original is not None:
            if original.rma_id == ticket.id:
                serial_service.release_from_rma(db, original, "replaced")
            original.replaced_by_serial = received_no
            _append_note(original, f"[{when.isoformat()}] Replaced by {received_no} ({receipt.receipt_number}, RMA {ticket.rma_number}).")
        ticket.received_serial_number = received_no
    elif kind == "cash_back":
        if original is not None:
            if original.rma_id == ticket.id:
                serial_service.release_from_rma(db, original, "replaced")
            _append_note(original, f"[{when.isoformat()}] Kept by {receipt.supplier_name}; cash back paid ({receipt.receipt_number}, RMA {ticket.rma_number}).")
        ticket.received_serial_number = None
    else:
        if original is not None and original.rma_id == ticket.id:
            original.warehouse_id = store.id
            _append_note(original, f"[{when.isoformat()}] Back from {receipt.supplier_name}: {label.lower()} ({receipt.receipt_number}, RMA {ticket.rma_number}).")
        ticket.received_serial_number = receipt.sent_serial

    # --- what the RMA holds from now on: a different product is the one the customer delivery hands over
    if kind == "different_product":
        ticket.held_item_id = receipt.received_item_id
        ticket.held_sku = receipt.received_sku
        ticket.held_product_name = receipt.received_product_name
    else:
        ticket.held_item_id = ticket.held_sku = ticket.held_product_name = None

    # --- cash back: the money the supplier paid goes to Finance through an RMA settlement (supplier, money in)
    if kind == "cash_back":
        _post_cash_back(db, receipt, ticket, user=user, when=when)

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
    if ticket.status == "sent_to_supplier":
        rma_service.change_status(db, ticket, "at_supplier", actor=user.id, note="Supplier handling the unit", _via_claim=True)
    if ticket.status == "at_supplier":
        rma_service.change_status(db, ticket, "returned_from_supplier", actor=user.id, note=note, _via_claim=True)
    complaint_service.record_activity(
        db,
        ticket,
        "stock_in_from_supplier" if kind in RECEIPT_UNIT_OUTCOMES else "cash_back_from_supplier",
        actor=user.id,
        new_value=store.name if store is not None else str(receipt.refund_amount),
        details={
            "receipt": receipt.receipt_number,
            "outcome": kind,
            "serial_sent": receipt.sent_serial,
            "serial_received": receipt.received_serial,
            "product_received": receipt.received_sku,
            "cash_back": str(receipt.refund_amount) if kind == "cash_back" else None,
        },
    )
    # the claim itself stays "dispatched": it is the record of what was sent


def _post_cash_back(db: Session, receipt: RmaSupplierReceipt, ticket: RmaTicket, *, user: AuthUser, when: date) -> None:
    """Money in from the supplier: an RMA settlement is made and approved in the same step (Finance posts it, once)."""
    from app.models.commerce_supplier import CommerceSupplier
    from app.services.rma import settlement_service

    supplier = db.get(CommerceSupplier, receipt.supplier_id)
    what = ticket.product_name or ticket.sku or "the unit"
    serial = f" ({receipt.sent_serial})" if receipt.sent_serial else ""
    why = (receipt.outcome_note or "").strip()
    settlement = settlement_service.create_settlement(
        db,
        ticket,
        {
            "party_type": "supplier",
            "party_id": supplier.party_id if supplier is not None else None,
            "direction": "in",
            "amount": receipt.refund_amount,
            "purpose": "refund_settlement",
            "purpose_note": f"Cash back from {receipt.supplier_name} for {what}{serial}" + (f": {why}" if why else "") + f" ({receipt.receipt_number})",
            "payment_account_id": receipt.refund_account_id,
            "transaction_date": when,
            "reference": receipt.supplier_delivery_ref or receipt.receipt_number,
        },
        user=user,
    )
    settlement_service.decide_settlement(db, settlement, decision="approved", reason=None, user=user)
    receipt.settlement_id = settlement.id


# ------------------------------------------------------------------ print


def receipt_payload(db: Session, receipt: RmaSupplierReceipt, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """Replacement Receive Copy. Built field by field: no customer details, internal notes or costs."""
    ticket = db.get(RmaTicket, receipt.rma_id)
    claim = db.get(RmaSupplierClaim, receipt.claim_id)
    store = db.get(InventoryWarehouse, receipt.warehouse_id) if receipt.warehouse_id else None
    from app.models.rma import RmaSettlement

    settlement = db.get(RmaSettlement, receipt.settlement_id) if receipt.settlement_id else None
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
        "serial_changed": receipt.outcome in {"same_product", "different_product"},
        "outcome": receipt.outcome,
        "outcome_label": RECEIPT_OUTCOMES[receipt.outcome],
        "outcome_note": receipt.outcome_note,
        "received_sku": receipt.received_sku,
        "received_product_name": receipt.received_product_name,
        "refund_amount": receipt.refund_amount,
        "settlement_number": settlement.settlement_number if settlement is not None else None,
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
