"""RMA customer delivery (docs/RMA.md Stage E): handing the repaired / replacement unit back to the customer.

A delivery is the physical hand-over only. Money (a payment, a refund, an amount owed) is a separate document, the RMA
settlement (`settlement_service`): a delivery never posts a payment and a settlement never moves stock. Nothing is posted
until the delivery is approved; approval takes the unit out of the RMA store once (one guarded "delivery" stock event), puts
the serial back with the customer and completes the RMA. If the RMA has charges they are invoiced as the RMA's own receivable
(once, unpaid): the amount owed stays visible and is collected through a settlement. A zero-charge delivery creates no receivable.

Older deliveries that carried a payment keep their history; new ones never do.

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
from app.models.rma import RmaDelivery, RmaTicket
from app.services.rma import complaint_service
from app.services.rma.constants import (
    DELIVERY_OPEN_STATUSES,
    DELIVERY_PHYSICAL_STATUSES,
    DELIVERY_PRESETS,
    DELIVERY_STATUS_LABELS,
    RMA_STATUS_LABELS,
)

ZERO = Decimal("0")
CENT = Decimal("0.01")
TERMINAL = {"closed", "rejected", "cancelled"}

EDITABLE_FIELDS = frozenset({"delivery_date", "delivered_to", "notes"})


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


def preset_of(deliver_product: bool, payment_state: str) -> str:
    for name, (deliver, state) in DELIVERY_PRESETS.items():
        if deliver == deliver_product and state == payment_state:
            return name
    return "custom"


# ------------------------------------------------------------- summary


def current_store_id(db: Session, ticket: RmaTicket) -> Optional[str]:
    """Where the unit sits now: the RMA store it came back into (from the supplier, else from intake)."""
    receipt = complaint_service.stock_event(db, ticket.id, "receipt")
    if receipt is not None and receipt.reversed_at is None and receipt.dest_warehouse_id:
        return receipt.dest_warehouse_id
    intake = complaint_service.stock_event(db, ticket.id, "intake")
    if intake is not None and intake.reversed_at is None:
        return intake.warehouse_id
    return None


def summary(db: Session, ticket: RmaTicket) -> dict[str, Any]:
    """What a delivery can do right now: the charges, what is owed, and whether the product can be handed over."""
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
    elif ticket.custody_state not in {"in_rma_store", "replacement_received"}:
        blocker = "The unit is not in the RMA store (it has to be approved and received first)."
    elif ticket.status not in DELIVERY_PHYSICAL_STATUSES:
        blocker = f"The RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}. Inspect it or move it to Ready for delivery before handing the unit back."
    return {
        "total": total,
        "paid": paid,
        "outstanding": outstanding,
        "receivable_id": receivable.id if receivable is not None else None,
        "receivable_number": receivable.invoice_number if receivable is not None else None,
        "can_deliver_product": blocker is None,
        "deliver_blocker": blocker,
        "held_serial": ticket.received_serial_number or ticket.serial_number,
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
        deliver_product=True,
        payment_state="none",
        amount_total=s["total"],
        amount_received=ZERO,
        delivery_date=date.today(),
        delivered_to=ticket.customer_name or None,
        serial_delivered=s["held_serial"],
        created_by=actor,
    )
    d.preset = preset_of(d.deliver_product, d.payment_state)
    db.add(d)
    db.flush()
    complaint_service.record_activity(db, ticket, "delivery_created", actor=actor, new_value=d.delivery_number)
    return d


def update_delivery(db: Session, d: RmaDelivery, changes: dict[str, Any]) -> RmaDelivery:
    if d.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"A delivery that is {DELIVERY_STATUS_LABELS[d.status].lower()} can no longer be edited.",
        )
    for key, value in changes.items():
        if key in EDITABLE_FIELDS:
            setattr(d, key, value)
    _clear_legacy_payment(d)
    db.flush()
    return d


def _clear_legacy_payment(d: RmaDelivery) -> None:
    """A delivery is the hand-over only. A draft started before settlements existed loses its payment part (nothing was posted)."""
    d.deliver_product = True
    d.payment_state = "none"
    d.amount_received = ZERO
    d.due_date = None
    d.preset = preset_of(True, "none")


# ------------------------------------------------------------ validation


def validate(db: Session, ticket: RmaTicket, d: RmaDelivery) -> dict[str, Any]:
    """Every rule that can refuse a delivery; returns the summary it was judged against."""
    if ticket.status in TERMINAL:
        raise HTTPException(status_code=400, detail=f"This RMA is {RMA_STATUS_LABELS.get(ticket.status, ticket.status).lower()}.")
    if d.payment_state != "none" or _money(d.amount_received) > 0 or not d.deliver_product:
        raise HTTPException(
            status_code=400,
            detail="This delivery was started with a payment. Send it back for correction; money is recorded as a Settlement now.",
        )
    s = summary(db, ticket)
    if not s["can_deliver_product"]:
        raise HTTPException(status_code=400, detail=s["deliver_blocker"])
    if s["total"] > 0 and not ticket.receivable_id and not ticket.customer_id:
        raise HTTPException(
            status_code=400,
            detail="This RMA has charges but no linked customer, so they cannot be invoiced. Link a customer or clear the charges first.",
        )
    return s


# ------------------------------------------------------------ workflow


def submit_delivery(db: Session, d: RmaDelivery, *, actor: Optional[str]) -> RmaDelivery:
    if d.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a delivery sent back for correction can be sent for approval (this one is {DELIVERY_STATUS_LABELS[d.status].lower()}).",
        )
    ticket = db.get(RmaTicket, d.rma_id)
    _clear_legacy_payment(d)
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
    """Approve (posts stock, payment and receivable, once), reject, or send back. The caller has checked `rma_delivery_approve`."""
    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
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


def _post(db: Session, d: RmaDelivery, ticket: RmaTicket, *, user: AuthUser) -> None:
    """Everything approval does, each effect once. Anything that can refuse is checked before anything changes."""
    from app.services.rma import rma_service

    complaint_service.lock_ticket(db, ticket)
    s = validate(db, ticket, d)
    when = d.delivery_date or date.today()
    total: Decimal = s["total"]

    # --- the RMA's own charges are invoiced once (unpaid); collecting them is a settlement, not part of the delivery
    receivable: Optional[FinanceReceivable] = db.get(FinanceReceivable, ticket.receivable_id) if ticket.receivable_id else None
    if receivable is None and total > 0:
        receivable = rma_service.raise_bill(db, ticket)
    if receivable is not None:
        d.receivable_id = receivable.id
        d.receivable_number = receivable.invoice_number
        d.amount_received = _money(receivable.amount_paid)
        d.amount_due = _money(receivable.balance) if receivable.status in ("open", "partial") else ZERO
    d.amount_total = total

    # --- the product: out of the RMA store once, the serial back with the customer, the RMA completed
    _hand_over(db, d, ticket, user=user, when=when)
    d.stock_posted = True


def _hand_over(db: Session, d: RmaDelivery, ticket: RmaTicket, *, user: AuthUser, when: date) -> None:
    from app.services.inventory import serial_service
    from app.services.inventory.constants import MOVEMENT_RMA_REPLACEMENT
    from app.services.rma import rma_service

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

    held = ticket.received_serial_number or ticket.serial_number
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

    note = f"Delivered to {d.delivered_to or ticket.customer_name} ({d.delivery_number})"
    steps = {"diagnosing": "ready_for_delivery", "in_repair": "ready_for_delivery", "returned_from_supplier": "ready_for_delivery", "ready_for_delivery": "delivered"}
    while ticket.status != "delivered":
        nxt = steps.get(ticket.status)
        if nxt is None:
            raise HTTPException(status_code=400, detail=f"The RMA cannot be delivered from {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}.")
        rma_service.change_status(db, ticket, nxt, actor=user.id, note=note, _via_claim=True)
    rma_service.change_status(db, ticket, "closed", actor=user.id, note=f"Completed — {note}", _via_claim=True)
    complaint_service.record_activity(
        db, ticket, "stock_out_to_customer", actor=user.id, new_value=held, details={"delivery": d.delivery_number, "serial": held}
    )


# ------------------------------------------------------------------ print


def delivery_payload(db: Session, d: RmaDelivery, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """Customer Delivery Copy. Built field by field: no internal notes and no supplier cost."""
    ticket = db.get(RmaTicket, d.rma_id)
    account = db.get(FinancePaymentAccount, d.payment_account_id) if d.payment_account_id else None
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
        "product_name": ticket.product_name if ticket else "",
        "sku": ticket.sku if ticket else "",
        "serial_delivered": d.serial_delivered,
        "serial_original": ticket.serial_number if ticket else None,
        "serial_changed": bool(ticket and d.serial_delivered and d.serial_delivered != ticket.serial_number),
        "problem": ticket.fault_reported if ticket else "",
        "diagnosis": ticket.fault_diagnosed if ticket else None,
        "deliver_product": d.deliver_product,
        "payment_state": d.payment_state,
        "preset": d.preset,
        "amount_total": str(_money(d.amount_total)),
        "amount_received": str(_money(d.amount_received)),
        "amount_due": str(_money(d.amount_due)),
        "payment_method": account.name if account and d.payment_state == "received" else None,
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
