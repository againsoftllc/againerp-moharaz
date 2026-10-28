"""RMA customer delivery (docs/RMA.md Stage E): what the customer gets back, and what they pay or are paid.

A delivery has a TYPE (`outcome`) that mirrors what came back from the supplier (`receipt_service`):

  same_unit          Same product, same serial   the customer's own unit goes back (repaired, or as it was)
  same_product       Same product, new serial     a replacement of the same product, with a different serial
  different_product  Different product            another product goes to the customer, with its own serial
  cash_back          Cash back                    no unit: money is paid back to the customer

The three unit types must match the unit the RMA actually holds (a unit whose serial or product differs from what the customer
brought cannot be called "same unit"). Money is part of the same document: the customer can be charged a service charge,
parts, labour or a FINE (the RMA's charges), what is collected now is posted at once and the rest stays owed on the RMA's
invoice, and a cash back is paid out.

Nothing is posted until the delivery is approved. Approval posts, each effect once: the invoice for the charges (and the payment
collected, as an RMA settlement through Finance), the refund (an RMA settlement, money out), the unit leaving the RMA store with its
serial going back to the customer, and the completed RMA. A rejected, sent-back, draft or pending delivery posts nothing.

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
from app.models.finance import FinancePaymentAccount, FinanceReceivable
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.rma import RmaCharge, RmaDelivery, RmaTicket
from app.services.rma import complaint_service
from app.services.rma.constants import (
    DELIVERY_OPEN_STATUSES,
    DELIVERY_OUTCOMES,
    DELIVERY_PHYSICAL_STATUSES,
    DELIVERY_STATUS_LABELS,
    DELIVERY_UNIT_OUTCOMES,
    RMA_STATUS_LABELS,
)

ZERO = Decimal("0")
CENT = Decimal("0.01")
TERMINAL = {"closed", "rejected", "cancelled"}

EDITABLE_FIELDS = frozenset(
    {
        "delivery_date",
        "delivered_to",
        "notes",
        "outcome",
        "refund_amount",
        "refund_account_id",
        "amount_received",
        "payment_account_id",
        "payment_reference",
    }
)

CHARGE_LABELS = {"service": "Service charge", "part": "Parts", "labour": "Labour", "fine": "Fine", "misc": "Other"}


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT)


# ------------------------------------------------------------- lookups


def get_delivery(db: Session, delivery_id: str, company_id: Optional[str] = None) -> RmaDelivery:
    row = db.get(RmaDelivery, delivery_id)
    if row is None or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Delivery not found")
    return row


def list_deliveries(db: Session, ticket_id: str) -> list[RmaDelivery]:
    return (
        db.query(RmaDelivery).filter(RmaDelivery.rma_id == ticket_id).order_by(RmaDelivery.created_at.desc()).all()
    )


def open_delivery(db: Session, ticket_id: str) -> Optional[RmaDelivery]:
    return (
        db.query(RmaDelivery)
        .filter(RmaDelivery.rma_id == ticket_id, RmaDelivery.status.in_(DELIVERY_OPEN_STATUSES))
        .first()
    )


def next_delivery_number(db: Session, company_id: str) -> str:
    year = date.today().year
    prefix = f"DLV-{year}-"
    count = (
        db.query(func.count(RmaDelivery.id))
        .filter(RmaDelivery.company_id == company_id, RmaDelivery.delivery_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not db.query(RmaDelivery.id).filter(RmaDelivery.delivery_number == number).first():
            return number
    raise HTTPException(status_code=500, detail="Could not allocate a delivery number")


# ------------------------------------------------------------- the unit the RMA holds


def held_serial(ticket: RmaTicket) -> Optional[str]:
    return ticket.received_serial_number or ticket.serial_number


def unit_outcome(ticket: RmaTicket) -> str:
    """Which unit type the RMA's held unit is: compared with what the customer brought in."""
    if ticket.held_item_id and ticket.held_item_id != ticket.item_id:
        return "different_product"
    serial = (held_serial(ticket) or "").strip().lower()
    original = (ticket.serial_number or "").strip().lower()
    if serial and serial != original:
        return "same_product"
    return "same_unit"


def current_store_id(db: Session, ticket: RmaTicket) -> Optional[str]:
    """Where the unit sits now: the RMA store it came back into (from the supplier, else from intake)."""
    receipt = complaint_service.stock_event(db, ticket.id, "receipt")
    if receipt is not None and receipt.reversed_at is None and receipt.dest_warehouse_id:
        return receipt.dest_warehouse_id
    intake = complaint_service.stock_event(db, ticket.id, "intake")
    if intake is not None and intake.reversed_at is None:
        return intake.warehouse_id
    return None


# ------------------------------------------------------------- summary


def summary(db: Session, ticket: RmaTicket) -> dict[str, Any]:
    """What a delivery can do right now: the charges, what is owed, which unit the RMA holds and whether it can go back."""
    total = _money(ticket.total)
    receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
    if receivable is not None:
        outstanding = _money(receivable.balance) if receivable.status in ("open", "partial") else ZERO
        paid = _money(receivable.amount_paid)
    else:
        outstanding, paid = total, ZERO

    blocker: Optional[str] = None
    if ticket.custody_state == "with_supplier":
        blocker = "The unit is with the supplier. Receive it back first."
    elif ticket.custody_state == "delivered":
        blocker = "This unit has already been delivered."
    elif ticket.custody_state == "cash_back":
        blocker = "The supplier kept the unit and paid cash back, so there is no unit to hand over. Pay the customer cash back instead."
    elif ticket.custody_state not in {"in_rma_store", "replacement_received"}:
        blocker = "The unit is not in the RMA store (it has to be approved and received first)."
    elif ticket.status not in DELIVERY_PHYSICAL_STATUSES:
        blocker = f"The RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}. Move it to Ready for delivery before handing the unit back."
    cash_blocker = None if ticket.customer_id else "This RMA has no linked customer, so money cannot be collected or paid back on the books."
    return {
        "total": total,
        "paid": paid,
        "outstanding": outstanding,
        "receivable_id": receivable.id if receivable is not None else None,
        "receivable_number": receivable.invoice_number if receivable is not None else None,
        "can_deliver_product": blocker is None,
        "deliver_blocker": blocker,
        "can_cash_back": cash_blocker is None,
        "cash_back_blocker": cash_blocker,
        "unit_outcome": unit_outcome(ticket),
        "held_serial": held_serial(ticket),
        "held_sku": ticket.held_sku or ticket.sku,
        "held_product_name": ticket.held_product_name or ticket.product_name,
        "original_serial": ticket.serial_number,
        "original_product_name": ticket.product_name,
        "refunded": _money(ticket.refund_amount),
        "charge_estimate": _money(ticket.charge_estimate),
    }


# --------------------------------------------------------- create / edit


def create_delivery(db: Session, ticket: RmaTicket, *, actor: Optional[str]) -> RmaDelivery:
    complaint_service.lock_ticket(db, ticket)
    if ticket.status in TERMINAL:
        raise HTTPException(status_code=400, detail=f"This RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status).lower()}.")
    if ticket.status in {"draft", "pending_approval", "correction_requested"}:
        raise HTTPException(status_code=400, detail="Approve the complaint first; there is nothing to deliver yet.")
    pending = open_delivery(db, ticket.id)
    if pending is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{pending.delivery_number} is already open for this RMA ({DELIVERY_STATUS_LABELS[pending.status]}).",
        )
    s = summary(db, ticket)
    d = RmaDelivery(
        company_id=ticket.company_id,
        rma_id=ticket.id,
        delivery_number=next_delivery_number(db, ticket.company_id),
        status="draft",
        # the type that matches the unit the RMA holds; cash back when there is no unit to hand over
        outcome=s["unit_outcome"] if s["can_deliver_product"] else "cash_back",
        amount_total=s["total"],
        amount_received=ZERO,
        delivery_date=date.today(),
        delivered_to=ticket.customer_name or None,
        serial_delivered=s["held_serial"],
        created_by=actor,
    )
    _normalize(d)
    db.add(d)
    db.flush()
    complaint_service.record_activity(db, ticket, "delivery_created", actor=actor, new_value=d.delivery_number)
    return d


def _normalize(d: RmaDelivery) -> None:
    """Keep only what the delivery's type uses, and the older fields in step with it."""
    if d.outcome != "cash_back":
        d.refund_amount = None
        d.refund_account_id = None
    d.deliver_product = d.outcome in DELIVERY_UNIT_OUTCOMES
    d.payment_state = "none"
    d.preset = "custom"
    d.due_date = None


def _check_account(db: Session, company_id: str, account_id: Optional[str]) -> None:
    if not account_id:
        return
    account = db.get(FinancePaymentAccount, account_id)
    if account is None or account.company_id != company_id or not account.is_active:
        raise HTTPException(status_code=400, detail="That cash / bank account is not available.")


def update_delivery(db: Session, d: RmaDelivery, changes: dict[str, Any]) -> RmaDelivery:
    if d.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"A delivery that is {DELIVERY_STATUS_LABELS[d.status].lower()} can no longer be edited.",
        )
    if "outcome" in changes and changes["outcome"] not in DELIVERY_OUTCOMES:
        raise HTTPException(status_code=400, detail=f"Unknown delivery type: {changes['outcome']}")
    for key in ("amount_received", "refund_amount"):
        if key in changes and changes[key] not in (None, "") and _money(changes[key]) < 0:
            raise HTTPException(status_code=400, detail="An amount cannot be negative.")
    for key in ("payment_account_id", "refund_account_id"):
        if key in changes:
            _check_account(db, d.company_id, changes[key])
    for key, value in changes.items():
        if key not in EDITABLE_FIELDS:
            continue
        if key == "amount_received":
            value = _money(value)
        elif key == "refund_amount":
            value = _money(value) if value not in (None, "") else None
        setattr(d, key, value)
    _normalize(d)
    db.flush()
    return d


# ------------------------------------------------------------ validation


def validate(db: Session, ticket: RmaTicket, d: RmaDelivery) -> dict[str, Any]:
    """Every rule that can refuse a delivery; returns the summary it was judged against."""
    if ticket.status in TERMINAL:
        raise HTTPException(status_code=400, detail=f"This RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status).lower()}.")
    if d.outcome not in DELIVERY_OUTCOMES:
        raise HTTPException(status_code=400, detail="Choose what the customer gets.")
    s = summary(db, ticket)

    if d.outcome in DELIVERY_UNIT_OUTCOMES:
        if not s["can_deliver_product"]:
            raise HTTPException(status_code=400, detail=s["deliver_blocker"])
        if d.outcome != s["unit_outcome"]:
            held = s["held_serial"] or "no serial"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"The RMA holds {s['held_product_name'] or 'the unit'} ({held}), which is \"{DELIVERY_OUTCOMES[s['unit_outcome']]}\" "
                    f"compared with what the customer brought. Choose that type, or Cash back."
                ),
            )
    else:
        if not s["can_cash_back"]:
            raise HTTPException(status_code=400, detail=s["cash_back_blocker"])
        if d.refund_amount is None or _money(d.refund_amount) <= 0:
            raise HTTPException(status_code=400, detail="Enter the amount paid back to the customer.")
        if not d.refund_account_id:
            raise HTTPException(status_code=400, detail="Pick the cash or bank account the cash back is paid from.")
        _check_account(db, d.company_id, d.refund_account_id)

    total: Decimal = s["total"]
    if total > 0 and not ticket.receivable_id and not ticket.customer_id:
        raise HTTPException(
            status_code=400,
            detail="This RMA has charges but no linked customer, so they cannot be invoiced. Link a customer or clear the charges first.",
        )
    collect = _money(d.amount_received)
    if collect > 0:
        if total <= 0:
            raise HTTPException(status_code=400, detail="There is nothing to collect: this RMA has no charges.")
        if collect > s["outstanding"]:
            raise HTTPException(status_code=400, detail=f"The amount collected ({collect}) is more than what is owed on this RMA ({s['outstanding']}).")
        if not d.payment_account_id:
            raise HTTPException(status_code=400, detail="Pick the cash or bank account the money is collected into.")
        _check_account(db, d.company_id, d.payment_account_id)
    return s


# ------------------------------------------------------------ workflow


def submit_delivery(db: Session, d: RmaDelivery, *, actor: Optional[str]) -> RmaDelivery:
    if d.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a delivery sent back for correction can be sent for approval (this one is {DELIVERY_STATUS_LABELS[d.status].lower()}).",
        )
    ticket = db.get(RmaTicket, d.rma_id)
    _normalize(d)
    validate(db, ticket, d)
    d.status = "pending_approval"
    d.decision = None
    db.flush()
    complaint_service.record_activity(db, ticket, "delivery_submitted", actor=actor, new_value=d.delivery_number)
    return d


def cancel_delivery(db: Session, d: RmaDelivery, *, actor: Optional[str], reason: Optional[str]) -> RmaDelivery:
    if d.status == "approved":
        raise HTTPException(
            status_code=400,
            detail="This delivery is approved and already posted. Nothing can be cancelled here; correct it with a new document.",
        )
    if d.status in {"cancelled", "rejected"}:
        raise HTTPException(status_code=400, detail=f"This delivery is already {d.status}.")
    d.status = "cancelled"
    db.flush()
    ticket = db.get(RmaTicket, d.rma_id)
    complaint_service.record_activity(
        db, ticket, "delivery_cancelled", actor=actor, new_value=d.delivery_number, details={"reason": (reason or "").strip() or None}
    )
    return d


def decide_delivery(
    db: Session, d: RmaDelivery, *, decision: str, reason: Optional[str], user: AuthUser
) -> RmaDelivery:
    """Approve (posts the charges, the money and the unit, once), reject, or send back. The caller has checked `rma_delivery_approve`."""
    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
    # an approver finalizes a draft in one step: it is sent and decided in this same call (docs/approval.md)
    if decision == "approved" and d.status in {"draft", "correction_requested"}:
        submit_delivery(db, d, actor=user.id)
    if d.status != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Only a delivery that is pending approval can be decided (this one is {DELIVERY_STATUS_LABELS[d.status].lower()}).",
        )
    text = (reason or "").strip()
    if decision != "approved" and not text:
        raise HTTPException(status_code=400, detail="A reason is required to reject a delivery or send it back.")
    ticket = db.get(RmaTicket, d.rma_id)
    if decision == "approved":
        _post(db, d, ticket, user=user)
    d.status = decision
    d.decision = decision
    d.decided_by = user.id
    d.decided_by_name = user.name or user.username
    d.decided_at = datetime.utcnow()
    d.decision_reason = text or None
    if decision == "approved":
        d.posted_at = datetime.utcnow()
    db.flush()
    complaint_service.record_activity(
        db, ticket, f"delivery_{decision}", actor=user.id, new_value=d.delivery_number, details={"reason": text or None}
    )
    return d


def _settle(
    db: Session,
    ticket: RmaTicket,
    user: AuthUser,
    *,
    direction: str,
    purpose: str,
    amount: Decimal,
    account_id: Optional[str],
    note: str,
    reference: str,
    when: date,
):
    """Money in / out with the customer: an RMA settlement made and approved in the same step (Finance posts it, once)."""
    from app.services.rma import settlement_service

    settlement = settlement_service.create_settlement(
        db,
        ticket,
        {
            "party_type": "customer",
            "party_id": ticket.customer_id,
            "direction": direction,
            "amount": amount,
            "purpose": purpose,
            "purpose_note": note,
            "payment_account_id": account_id,
            "transaction_date": when,
            "reference": reference,
        },
        user=user,
    )
    settlement_service.decide_settlement(db, settlement, decision="approved", reason=None, user=user)
    return settlement


def _post(db: Session, d: RmaDelivery, ticket: RmaTicket, *, user: AuthUser) -> None:
    """Everything approval does, each effect once. Anything that can refuse is checked before anything changes."""
    from app.services.rma import rma_service

    complaint_service.lock_ticket(db, ticket)
    s = validate(db, ticket, d)
    when = d.delivery_date or date.today()
    total: Decimal = s["total"]
    collect = _money(d.amount_received)

    # --- the charges (service charge, parts, labour, fine): invoiced once; what is collected now is posted at once
    receivable: Optional[FinanceReceivable] = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
    if total > 0:
        if collect > 0:
            settlement = _settle(
                db,
                ticket,
                user,
                direction="in",
                purpose="parts_service",
                amount=collect,
                account_id=d.payment_account_id,
                note=f"Delivery {d.delivery_number}: service charges collected from the customer",
                reference=d.payment_reference or d.delivery_number,
                when=when,
            )
            d.collect_settlement_id = settlement.id
            receivable = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else receivable
        elif receivable is None:
            receivable = rma_service.raise_bill(db, ticket)  # owed: nothing is collected now
    if receivable is not None:
        d.receivable_id = receivable.id
        d.receivable_number = receivable.invoice_number
        d.amount_due = _money(receivable.balance) if receivable.status in ("open", "partial") else ZERO
        if collect > 0:
            d.amount_received = collect
    d.amount_total = total
    d.payment_state = "received" if collect > 0 else ("due" if (d.amount_due or ZERO) > 0 else "none")

    # --- cash back: the money paid out to the customer
    if d.outcome == "cash_back":
        refund = _money(d.refund_amount)
        settlement = _settle(
            db,
            ticket,
            user,
            direction="out",
            purpose="refund_settlement",
            amount=refund,
            account_id=d.refund_account_id,
            note=f"Delivery {d.delivery_number}: cash back to the customer for {ticket.product_name or ticket.sku or 'the unit'}",
            reference=d.delivery_number,
            when=when,
        )
        d.refund_settlement_id = settlement.id
        ticket.refund_amount = _money(ticket.refund_amount) + refund
        ticket.resolution_type = "refund"
        ticket.resolution_status = "completed"
        complaint_service.record_activity(
            db, ticket, "cash_back_to_customer", actor=user.id, new_value=str(refund), details={"delivery": d.delivery_number}
        )
        # nothing is left to hand over when the supplier kept the unit; a unit still in the RMA store stays for its own decision
        # (restock, supplier, scrap), so the RMA stays open until then
        if ticket.custody_state == "cash_back":
            _complete_rma(db, ticket, user=user, note=f"Cash back paid to {d.delivered_to or ticket.customer_name} ({d.delivery_number})")
        return

    # --- the unit: out of the RMA store once, the serial back with the customer, the RMA completed
    _hand_over(db, d, ticket, user=user, when=when)
    d.stock_posted = True


def _complete_rma(db: Session, ticket: RmaTicket, *, user: AuthUser, note: str) -> None:
    from app.services.rma import rma_service

    steps = {
        "received": "diagnosing",
        "diagnosing": "ready_for_delivery",
        "in_repair": "ready_for_delivery",
        "returned_from_supplier": "ready_for_delivery",
        "ready_for_delivery": "delivered",
    }
    while ticket.status != "delivered":
        nxt = steps.get(ticket.status)
        if nxt is None:
            raise HTTPException(status_code=400, detail=f"The RMA cannot be completed from {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}.")
        rma_service.change_status(db, ticket, nxt, actor=user.id, note=note, _via_claim=True)
    rma_service.change_status(db, ticket, "closed", actor=user.id, note=f"Completed — {note}", _via_claim=True)


def _hand_over(db: Session, d: RmaDelivery, ticket: RmaTicket, *, user: AuthUser, when: date) -> None:
    from app.services.inventory import serial_service
    from app.services.inventory.constants import MOVEMENT_RMA_REPLACEMENT

    store_id = current_store_id(db, ticket)
    if not store_id:
        raise HTTPException(status_code=400, detail="The unit is not in an RMA store, so it cannot be handed over.")
    qty = ticket.quantity or 1
    _, posted = complaint_service.post_stock_event(
        db,
        ticket,
        "delivery",
        [complaint_service.StockLeg(store_id, MOVEMENT_RMA_REPLACEMENT, qty, f"Delivery {d.delivery_number} — handed over to the customer")],
        custody_state="delivered",
        actor=user.id,
        note=f"Delivered to {d.delivered_to or ticket.customer_name} ({d.delivery_number})",
    )
    if not posted:
        raise HTTPException(status_code=409, detail="This unit was already delivered.")

    held = held_serial(ticket)
    d.serial_delivered = held
    if held:
        row = serial_service.find_by_number(db, held, company_id=ticket.company_id)
        if row is not None:
            if row.status == "in_service":
                serial_service.release_from_rma(db, row, "returned")  # in service -> sold: back with the customer
            row.warehouse_id = None
            if row.replaces_serial:
                original = serial_service.find_by_number(db, row.replaces_serial, company_id=ticket.company_id)
                if original is not None:
                    for attr in ("customer_id", "customer_name", "order_id", "order_number", "sold_at"):
                        if not getattr(row, attr, None):
                            setattr(row, attr, getattr(original, attr, None))
            line = f"[{when.isoformat()}] Delivered to {d.delivered_to or ticket.customer_name} ({d.delivery_number}, RMA {ticket.rma_number})."
            row.notes = f"{row.notes}\n{line}".strip() if row.notes else line

    _complete_rma(db, ticket, user=user, note=f"Delivered to {d.delivered_to or ticket.customer_name} ({d.delivery_number})")
    complaint_service.record_activity(
        db, ticket, "stock_out_to_customer", actor=user.id, new_value=held, details={"delivery": d.delivery_number, "serial": held, "type": d.outcome}
    )


# ------------------------------------------------------------------ print


def delivery_payload(db: Session, d: RmaDelivery, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """Customer Delivery Copy. Built field by field: no internal notes and no supplier cost."""
    ticket = db.get(RmaTicket, d.rma_id)
    account = db.get(FinancePaymentAccount, d.payment_account_id) if d.payment_account_id else None
    charges = db.query(RmaCharge).filter(RmaCharge.rma_id == d.rma_id).order_by(RmaCharge.created_at).all()
    return {
        "delivery_no": d.delivery_number,
        "status": d.status,
        "status_label": DELIVERY_STATUS_LABELS[d.status],
        "reprint": reprint,
        "print_count": d.print_count,
        "printed_at": datetime.utcnow().isoformat(),
        "printed_by": printed_by,
        "rma_number": ticket.rma_number if ticket else "",
        "delivery_date": d.delivery_date.isoformat() if d.delivery_date else None,
        "customer_name": ticket.customer_name if ticket else "",
        "customer_phone": ticket.customer_phone if ticket else "",
        "delivered_to": d.delivered_to,
        "outcome": d.outcome,
        "outcome_label": DELIVERY_OUTCOMES.get(d.outcome, d.outcome),
        # a supplier that sent a different product back: that is the product the customer is handed
        "product_name": (ticket.held_product_name or ticket.product_name) if ticket else "",
        "sku": (ticket.held_sku or ticket.sku) if ticket else "",
        "original_product_name": ticket.product_name if ticket else "",
        "serial_delivered": d.serial_delivered,
        "serial_original": ticket.serial_number if ticket else None,
        "serial_changed": bool(ticket and d.serial_delivered and d.serial_delivered != ticket.serial_number),
        "problem": ticket.fault_reported if ticket else "",
        "diagnosis": ticket.fault_diagnosed if ticket else None,
        "deliver_product": d.deliver_product,
        "payment_state": d.payment_state,
        "preset": d.preset,
        "charges": [{"kind": CHARGE_LABELS.get(c.kind, c.kind), "description": c.description, "amount": str(_money(c.line_total))} for c in charges],
        "refund_amount": str(_money(d.refund_amount)) if d.refund_amount is not None else None,
        "amount_total": str(_money(d.amount_total)),
        "amount_received": str(_money(d.amount_received)),
        "amount_due": str(_money(d.amount_due)),
        "payment_method": account.name if account and _money(d.amount_received) > 0 else None,
        "payment_reference": d.payment_reference,
        "payment_number": d.payment_number,
        "invoice_number": d.receivable_number,
        "due_date": d.due_date.isoformat() if d.due_date else None,
        "approved_by": d.decided_by_name if d.decision == "approved" else None,
    }


def count_delivery_print(db: Session, d: RmaDelivery, *, actor: Optional[str]) -> None:
    d.print_count = (d.print_count or 0) + 1
    d.last_printed_at = datetime.utcnow()
    ticket = db.get(RmaTicket, d.rma_id)
    complaint_service.record_activity(
        db,
        ticket,
        "delivery_copy_printed" if d.print_count == 1 else "delivery_copy_reprinted",
        actor=actor,
        new_value=d.delivery_number,
        details={"print_count": d.print_count},
    )


def warehouse_name(db: Session, warehouse_id: Optional[str]) -> Optional[str]:
    row = db.get(InventoryWarehouse, warehouse_id) if warehouse_id else None
    return row.name if row else None
