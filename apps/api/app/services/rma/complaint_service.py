"""RMA complaint intake and approval (docs/RMA.md Stage A–B).

What lives here, on top of the ticket lifecycle in `rma_service`:
- supplier / purchase-invoice traceability resolved from the serial (no second source of truth),
- previous-RMA history for a unit,
- send-for-approval and the approve / reject / return-for-correction decision,
- the ONE guarded way an RMA posts stock (`post_stock_event`): an event key can be posted once per ticket, so
  approving the same complaint twice can never stock the unit twice,
- protected-field rules (an auto-filled value changes only with the override permission and a reason),
- the complaint-receipt payload (customer-facing: no internal notes, no costs),
- activity records through the shared collaboration service.

Like the rest of the RMA layer this flushes; the router owns the transaction and commits.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.rma import RmaStockEvent, RmaTicket
from app.services.rma.constants import CUSTODY_LABELS, OPEN_STATUSES, RMA_STATUS_LABELS

ENTITY_TYPE = "rma"

# Values a user may not change on an existing ticket without `rma_override` + a reason: they come from the sale, the
# serial registry or the purchase trace, and silently overwriting them would break the audit trail.
PROTECTED_FIELDS = frozenset(
    {
        "serial_number",
        "customer_name",
        "customer_phone",
        "customer_email",
        "supplier_id",
        "supplier_name",
        "vendor_invoice_no",
    }
)


# --------------------------------------------------------------- item


def resolve_item_id(db: Session, ticket: RmaTicket) -> Optional[str]:
    """The inventory item behind a ticket: its own, else the registered serial's, else the item with that SKU.

    A sale line can name a SKU that has no catalog product row; the inventory item (the SSOT) is still there.
    """
    from app.models.item import Item
    from app.services.inventory import serial_service

    if ticket.item_id:
        return ticket.item_id
    if ticket.serial_number:
        serial = serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id)
        if serial is not None and serial.item_id:
            return serial.item_id
    if ticket.sku:
        item = db.query(Item).filter(Item.company_id == ticket.company_id, Item.sku == ticket.sku).first()
        if item is not None:
            return item.id
    return None


def held_item_id(ticket: RmaTicket) -> Optional[str]:
    """The inventory item that is physically held for this RMA: the claimed one, unless the supplier sent a different product."""
    return ticket.held_item_id or ticket.item_id


def ensure_catalog_link(db: Session, ticket: RmaTicket, *, actor: Optional[str], item_id: Optional[str] = None) -> None:
    """Make sure the claim's item can be stocked.

    The stock engine keeps its levels per catalog product, so an item with no catalog product (an archived or legacy
    item that a customer still brings back) cannot be stocked anywhere. Rather than fail the approval, the missing link is
    repaired with a minimal **archived** catalog product for that item: not for sale, not on the website, and written to
    the claim's activity log.
    """
    import re
    import uuid

    from app.models.catalog_product import CatalogProduct
    from app.models.item import Item

    target = item_id or ticket.item_id
    if not target:
        return
    item = db.get(Item, target)
    if item is None:
        return
    exists = (
        db.query(CatalogProduct.id)
        .filter((CatalogProduct.item_id == item.id) | (CatalogProduct.sku == item.sku))
        .first()
    )
    if exists:
        return
    base = re.sub(r"[^a-z0-9]+", "-", f"{item.sku}".lower()).strip("-") or "item"
    slug, n = base, 1
    while db.query(CatalogProduct.id).filter(CatalogProduct.slug == slug).first():
        n += 1
        slug = f"{base}-{n}"
    product = CatalogProduct(
        id=str(uuid.uuid4()),
        company_id=item.company_id,
        item_id=item.id,
        name=item.name,
        slug=slug,
        sku=item.sku,
        status="archived",
        product_type="simple",
        visibility="private",
        price=Decimal("0"),
        stock=0,
        track_quantity=True,
        not_for_selling=True,
        in_inventory=True,
        on_website=False,
    )
    db.add(product)
    db.flush()
    record_activity(
        db,
        ticket,
        "catalog_link_created",
        actor=actor,
        new_value=item.sku,
        details={"reason": "Item had no catalog product; an archived one was created so the unit can be stocked in the RMA store"},
    )


# ---------------------------------------------------------------- activity


def record_activity(
    db: Session,
    ticket: RmaTicket,
    action: str,
    *,
    actor: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """One line in the record's activity feed (the shared collaboration log)."""
    from app.services.collaboration.collaboration_service import CollaborationService

    CollaborationService(db, ticket.company_id).record_activity(
        ENTITY_TYPE,
        ticket.id,
        action,
        performed_by=actor,
        old_value=old_value,
        new_value=new_value,
        details={"rma_number": ticket.rma_number, **(details or {})},
    )


# ------------------------------------------------------------ RMA store


def rma_stores(db: Session, company_id: str, *, ensure: bool = True) -> list[InventoryWarehouse]:
    """The warehouses flagged as RMA stores; creates a default "RMA Store" when the company has none yet."""
    query = db.query(InventoryWarehouse).filter(
        InventoryWarehouse.company_id == company_id,
        InventoryWarehouse.is_rma_store.is_(True),
        InventoryWarehouse.is_active.is_(True),
    )
    rows = query.order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name).all()
    if rows or not ensure:
        return rows
    code = "RMA"
    taken = (
        db.query(InventoryWarehouse.id)
        .filter(InventoryWarehouse.company_id == company_id, func.lower(InventoryWarehouse.code) == code.lower())
        .first()
    )
    if taken:
        code = "RMA-STORE"
    store = InventoryWarehouse(
        company_id=company_id,
        code=code,
        name="RMA Store",
        type="Returns / Damaged",
        is_active=True,
        is_default=False,
        is_rma_store=True,
        sort_order=900,
    )
    db.add(store)
    db.flush()
    return [store]


def default_rma_store_id(db: Session, company_id: str) -> Optional[str]:
    """The receiving store when nobody chose one: the company's only RMA store. With several, the choice is the user's."""
    stores = rma_stores(db, company_id)
    return stores[0].id if len(stores) == 1 else None


def require_rma_store(db: Session, company_id: str, warehouse_id: Optional[str]) -> InventoryWarehouse:
    if not warehouse_id:
        raise HTTPException(status_code=400, detail="Choose the receiving RMA store first (there is more than one).")
    row = db.get(InventoryWarehouse, warehouse_id)
    if row is None or row.company_id != company_id or not row.is_active:
        raise HTTPException(status_code=400, detail="The receiving store was not found.")
    if not row.is_rma_store:
        raise HTTPException(
            status_code=400,
            detail=f"{row.name} is not an RMA store. Pick a warehouse marked as an RMA store.",
        )
    return row


# ------------------------------------------------------------- traceability


def trace_purchase(db: Session, serial_number: Optional[str], company_id: str = "default") -> dict[str, Any]:
    """Who supplied this unit, resolved from the registry and the purchase documents.

    serial.source_id -> purchase receipt -> purchase order -> purchase bill (vendor invoice no.). Units that were not
    received through a purchase (manual / opening / adjustment) have no trace: `source` is "none" and the caller may
    only fill the supplier by hand with the override permission and a reason.
    """
    result: dict[str, Any] = {
        "source": "none",
        "supplier_id": None,
        "supplier_name": None,
        "purchase_receipt_id": None,
        "purchase_receipt_no": None,
        "purchase_bill_id": None,
        "purchase_bill_no": None,
        "vendor_invoice_no": None,
    }
    number = (serial_number or "").strip()
    if not number:
        return result

    from app.models.purchase_bill import PurchaseBill
    from app.models.purchase_receipt import PurchaseReceipt
    from app.services.inventory import serial_service

    serial = serial_service.find_by_number(db, number, company_id=company_id)
    if serial is None:
        return result

    supplier_id = serial.supplier_id
    receipt = None
    if serial.source_type == "receipt" and serial.source_id:
        receipt = db.get(PurchaseReceipt, serial.source_id)
        if receipt is not None:
            supplier_id = supplier_id or receipt.supplier_id
            result["purchase_receipt_id"] = receipt.id
            result["purchase_receipt_no"] = receipt.receipt_number
            bill = (
                db.query(PurchaseBill)
                .filter(PurchaseBill.company_id == company_id, PurchaseBill.purchase_receipt_id == receipt.id)
                .order_by(PurchaseBill.created_at.desc())
                .first()
            )
            if bill is None and receipt.purchase_order_id:
                bill = (
                    db.query(PurchaseBill)
                    .filter(
                        PurchaseBill.company_id == company_id,
                        PurchaseBill.purchase_order_id == receipt.purchase_order_id,
                    )
                    .order_by(PurchaseBill.created_at.desc())
                    .first()
                )
            if bill is not None:
                result["purchase_bill_id"] = bill.id
                result["purchase_bill_no"] = bill.bill_number
                result["vendor_invoice_no"] = bill.vendor_invoice_number

    if supplier_id:
        supplier = db.get(CommerceSupplier, supplier_id)
        result["supplier_id"] = supplier_id
        result["supplier_name"] = supplier.name if supplier else None
        result["source"] = "traced"
    return result


def apply_trace(ticket: RmaTicket, trace: dict[str, Any]) -> None:
    if trace.get("source") != "traced":
        return
    ticket.supplier_id = trace["supplier_id"]
    ticket.supplier_name = trace["supplier_name"]
    ticket.purchase_receipt_id = trace["purchase_receipt_id"]
    ticket.purchase_receipt_no = trace["purchase_receipt_no"]
    ticket.purchase_bill_id = trace["purchase_bill_id"]
    ticket.purchase_bill_no = trace["purchase_bill_no"]
    ticket.vendor_invoice_no = trace["vendor_invoice_no"]
    ticket.supplier_source = "traced"


def set_supplier_manually(
    db: Session, ticket: RmaTicket, *, supplier_id: str, reason: str, actor: Optional[str]
) -> None:
    """Authorized manual choice when the trace is missing or wrong. The caller has checked `rma_override`."""
    if not reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to set the supplier by hand.")
    supplier = db.get(CommerceSupplier, supplier_id)
    if supplier is None or supplier.company_id != ticket.company_id:
        raise HTTPException(status_code=404, detail="Supplier not found")
    previous = ticket.supplier_name
    ticket.supplier_id = supplier.id
    ticket.supplier_name = supplier.name
    ticket.supplier_source = "manual"
    ticket.supplier_override_reason = reason.strip()
    record_activity(
        db,
        ticket,
        "supplier_override",
        actor=actor,
        old_value=previous,
        new_value=supplier.name,
        details={"reason": reason.strip()},
    )


# ------------------------------------------------------------ prior history


def prior_tickets(
    db: Session,
    company_id: str,
    *,
    serial_number: Optional[str] = None,
    item_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    exclude_id: Optional[str] = None,
    limit: int = 10,
) -> list[RmaTicket]:
    """Earlier claims on the same unit (serial), or the same product for the same customer. Never blocks."""
    serial = (serial_number or "").strip()
    query = db.query(RmaTicket).filter(RmaTicket.company_id == company_id)
    if exclude_id:
        query = query.filter(RmaTicket.id != exclude_id)
    if serial:
        query = query.filter(func.lower(RmaTicket.serial_number) == serial.lower())
    elif item_id and customer_id:
        query = query.filter(RmaTicket.item_id == item_id, RmaTicket.customer_id == customer_id)
    else:
        return []
    return query.order_by(RmaTicket.created_at.desc()).limit(limit).all()


# ------------------------------------------------------ idempotent stock posting


@dataclass(frozen=True)
class StockLeg:
    """One ledger movement of an RMA event."""

    warehouse_id: str
    movement_type: str
    quantity: int
    notes: str = ""
    # the item this leg moves; empty = the item held for the RMA (the claimed one, or the different product that came back)
    item_id: Optional[str] = None


def lock_ticket(db: Session, ticket: RmaTicket) -> RmaTicket:
    """Serialize concurrent postings for one ticket (row lock held until the router commits)."""
    locked = db.query(RmaTicket).filter(RmaTicket.id == ticket.id).with_for_update().one()
    return locked


def stock_event(db: Session, ticket_id: str, event_key: str) -> Optional[RmaStockEvent]:
    return (
        db.query(RmaStockEvent)
        .filter(RmaStockEvent.rma_id == ticket_id, RmaStockEvent.event_key == event_key)
        .first()
    )


def post_stock_event(
    db: Session,
    ticket: RmaTicket,
    event_key: str,
    legs: Sequence[StockLeg],
    *,
    custody_state: Optional[str],
    actor: Optional[str],
    note: str = "",
) -> tuple[RmaStockEvent, bool]:
    """Post an RMA stock event exactly once.

    Returns (event, posted). A repeat call with the same key finds the existing event and posts nothing, so
    approving the same document twice cannot stock, dispatch or deliver a unit twice. The unique
    (rma_id, event_key) constraint backs the check up if two requests race past it.
    """
    from app.services.inventory.stock_movement_service import MovementInput, StockMovementService

    lock_ticket(db, ticket)
    existing = stock_event(db, ticket.id, event_key)
    if existing is not None:
        return existing, False
    if not ticket.item_id:
        ticket.item_id = resolve_item_id(db, ticket)
    if not ticket.item_id:
        raise HTTPException(status_code=400, detail="This claim has no inventory item, so no stock can be posted.")
    default_item = held_item_id(ticket)
    for leg_item in {leg.item_id or default_item for leg in legs}:
        ensure_catalog_link(db, ticket, actor=actor, item_id=leg_item)

    first_movement_id: Optional[str] = None
    first_type: Optional[str] = None
    first_wh: Optional[str] = None
    dest_wh: Optional[str] = None
    qty = 0
    service = StockMovementService(db)
    for leg in legs:
        movement = service.apply_movement(
            MovementInput(
                item_id=leg.item_id or default_item,
                warehouse_id=leg.warehouse_id,
                movement_type=leg.movement_type,
                quantity=leg.quantity,
                company_id=ticket.company_id,
                reference=ticket.rma_number,
                notes=leg.notes or note or f"RMA {event_key}",
                created_by=actor,
                source_type="rma",
                source_id=ticket.id,
                source_line_id=event_key,
            )
        )
        if first_movement_id is None:
            first_movement_id, first_type, first_wh, qty = movement.id, leg.movement_type, leg.warehouse_id, leg.quantity
        else:
            dest_wh = leg.warehouse_id

    event = RmaStockEvent(
        rma_id=ticket.id,
        event_key=event_key,
        movement_id=first_movement_id,
        movement_type=first_type,
        warehouse_id=first_wh,
        dest_warehouse_id=dest_wh,
        quantity=qty,
        custody_state=custody_state,
        note=note or None,
        created_by=actor,
    )
    try:
        with db.begin_nested():
            db.add(event)
            db.flush()
    except IntegrityError:
        # Another request posted the same event between our check and insert; the ledger rows above belong to this
        # transaction, so make it fail loudly rather than leave a double posting behind.
        raise HTTPException(status_code=409, detail="This stock event was just posted by another request. Reload.")
    if custody_state:
        ticket.custody_state = custody_state
    db.flush()
    return event, True


def post_intake_stock(db: Session, ticket: RmaTicket, *, actor: Optional[str]) -> bool:
    """Stock the received unit into the RMA store — once. Returns True when it posted now.

    Also hands a sold serial to the claim and sets the serial's warehouse to the RMA store.
    """
    from app.services.inventory import serial_service
    from app.services.inventory.constants import MOVEMENT_CUSTOMER_RETURN

    if not ticket.warehouse_id:
        ticket.warehouse_id = default_rma_store_id(db, ticket.company_id)
    store = require_rma_store(db, ticket.company_id, ticket.warehouse_id)
    if stock_event(db, ticket.id, "intake") is None:
        # a serial-tracked unit enters the RMA store as a registered serial, never as a bare quantity: otherwise the
        # store's stock counts a unit the serial registry has never heard of
        item_id = resolve_item_id(db, ticket)
        if serial_service.is_serial_tracked(db, item_id):
            number = (ticket.received_serial_number or ticket.serial_number or "").strip()
            registered = serial_service.find_by_number(db, number, company_id=ticket.company_id) if number else None
            if registered is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{ticket.sku} is serial-tracked: the RMA needs the unit's registered serial number "
                        f"({'“' + number + '” is not in the serial registry' if number else 'none entered'}). "
                        "Correct the serial on the RMA before approving it."
                    ),
                )
    event, posted = post_stock_event(
        db,
        ticket,
        "intake",
        [StockLeg(store.id, MOVEMENT_CUSTOMER_RETURN, ticket.quantity or 1, f"RMA intake — {ticket.rma_number}")],
        custody_state="in_rma_store",
        actor=actor,
        note="Complaint approved — unit received into the RMA store",
    )
    if ticket.serial_number:
        serial = serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id)
        if serial is not None:
            if serial.status == "sold":
                serial_service.attach_to_rma(db, serial, rma_id=ticket.id)
            if serial.rma_id == ticket.id:
                serial.warehouse_id = store.id
    db.flush()
    if posted:
        record_activity(
            db,
            ticket,
            "stock_in_rma_store",
            actor=actor,
            new_value=store.name,
            details={"event": "intake", "warehouse_id": store.id, "quantity": event.quantity},
        )
    return posted


def reverse_intake_stock(db: Session, ticket: RmaTicket, *, actor: Optional[str], reason: str) -> bool:
    """Take the intake posting back out (the unit goes back to the customer), through the ledger's reversal.

    Only while the unit is still where intake put it: once it has been dispatched, replaced, restocked or scrapped
    the stock moved on and has to be reversed through those documents instead.
    """
    from app.services.inventory.stock_movement_service import StockMovementService

    lock_ticket(db, ticket)
    event = stock_event(db, ticket.id, "intake")
    if event is None or event.reversed_at is not None or not event.movement_id:
        return False
    later = (
        db.query(RmaStockEvent)
        .filter(RmaStockEvent.rma_id == ticket.id, RmaStockEvent.event_key != "intake")
        .count()
    )
    if later:
        raise HTTPException(
            status_code=400,
            detail="This unit has already moved on from the RMA store — reverse the later stock step first.",
        )
    StockMovementService(db).reverse_movement(event.movement_id, actor_id=actor, notes=f"RMA {ticket.rma_number}: {reason}")
    event.reversed_at = datetime.utcnow()
    ticket.custody_state = None
    db.flush()
    record_activity(db, ticket, "stock_reversed", actor=actor, details={"event": "intake", "reason": reason})
    return True


# --------------------------------------------------------- submit & decision


def customer_rma_lock(db: Session, customer_id: Optional[str], company_id: str) -> Optional[dict[str, Any]]:
    """The customer's RMA lock (OnerERP IsRMALocked) as {customer_id, name, reason}, or None when not locked."""
    from app.models.commerce_customer import CommerceCustomer

    from sqlalchemy.exc import OperationalError, ProgrammingError

    if not customer_id:
        return None
    try:
        # a savepoint, so a database without the customer table (a lean test schema) reads as "not locked", not a crash
        with db.begin_nested():
            customer = db.get(CommerceCustomer, customer_id)
    except (OperationalError, ProgrammingError):
        return None
    if customer is None or (customer.company_id or "default") != company_id or not getattr(customer, "rma_locked", False):
        return None
    return {"customer_id": customer.id, "name": customer.name, "reason": customer.rma_lock_reason or ""}


def assert_customer_not_rma_locked(db: Session, customer_id: Optional[str], company_id: str) -> None:
    lock = customer_rma_lock(db, customer_id, company_id)
    if lock is not None:
        reason = f" Reason: {lock['reason']}." if lock["reason"] else ""
        raise HTTPException(
            status_code=400,
            detail=f"RMA is locked for {lock['name']}: no complaint can be taken or approved.{reason} Unlock it on the customer first.",
        )


# 8 characters, no look-alikes (0/O, 1/I/L), so a generated serial can be read off a label and typed back
_SERIAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SERIAL_LENGTH = 8


def _serial_taken(db: Session, number: str, company_id: str, *, exclude_ticket_id: Optional[str] = None) -> bool:
    key = number.lower()
    if (
        db.query(InventorySerial.id)
        .filter(InventorySerial.company_id == company_id, func.lower(InventorySerial.serial_number) == key)
        .first()
    ):
        return True
    query = db.query(RmaTicket.id).filter(
        RmaTicket.company_id == company_id,
        (func.lower(RmaTicket.serial_number) == key) | (func.lower(RmaTicket.received_serial_number) == key),
    )
    if exclude_ticket_id:
        query = query.filter(RmaTicket.id != exclude_ticket_id)
    return query.first() is not None


def generate_serials(db: Session, company_id: str, count: int) -> list[str]:
    """`count` new serials no unit, RMA or registry entry uses yet (OnerERP GenerateProductSerial(8), with Bulk Qty)."""
    import secrets

    if count < 1 or count > 100:
        raise HTTPException(status_code=400, detail="Generate between 1 and 100 serials at a time.")
    out: list[str] = []
    for _ in range(count * 20):
        if len(out) == count:
            break
        number = "".join(secrets.choice(_SERIAL_ALPHABET) for _ in range(SERIAL_LENGTH))
        if number not in out and not _serial_taken(db, number, company_id):
            out.append(number)
    if len(out) < count:
        raise HTTPException(status_code=500, detail="Could not generate unique serials; try again.")
    return out


def check_generated_serial(
    db: Session, *, serial_number: Optional[str], item_id: Optional[str], sku: str, company_id: str, ticket_id: Optional[str] = None
) -> None:
    """A generated serial is only for a unit that has none: never for a serial-tracked product, never one already in use."""
    from app.services.inventory import serial_service

    number = (serial_number or "").strip()
    if not number:
        raise HTTPException(status_code=400, detail="Generate the serial before saving the complaint.")
    if serial_service.is_serial_tracked(db, item_id):
        raise HTTPException(
            status_code=400,
            detail=f"{sku or 'This product'} is serial-tracked: use the serial printed on the unit, not a generated one.",
        )
    if _serial_taken(db, number, company_id, exclude_ticket_id=ticket_id):
        raise HTTPException(status_code=409, detail=f"Serial {number} is already in use; generate a new one.")


def submit_for_approval(db: Session, ticket: RmaTicket, *, actor: Optional[str]) -> RmaTicket:
    from app.services.rma import rma_service

    assert_customer_not_rma_locked(db, ticket.customer_id, ticket.company_id)
    if ticket.status not in {"draft", "correction_requested"}:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or a complaint sent back for correction can be sent for approval (this one is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}).",
        )
    if ticket.diagnosis_required and not (ticket.diagnosis_report or "").strip():
        raise HTTPException(
            status_code=400,
            detail="This complaint needs a diagnosis report before it can be sent for approval.",
        )
    if not (ticket.fault_reported or "").strip():
        raise HTTPException(status_code=400, detail="Describe the problem before sending for approval.")
    rma_service.change_status(db, ticket, "pending_approval", actor=actor, note="Sent for approval", _allow_decision=True)
    ticket.complaint_decision = None
    record_activity(db, ticket, "sent_for_approval", actor=actor)
    return ticket


def decide(
    db: Session,
    ticket: RmaTicket,
    *,
    decision: str,
    reason: Optional[str],
    user: AuthUser,
) -> RmaTicket:
    """Approve, reject or return a complaint for correction. The caller has checked `rma_approve`."""
    from app.services.rma import rma_service

    if decision not in {"approved", "rejected", "correction_requested"}:
        raise HTTPException(status_code=400, detail=f"Unknown decision: {decision}")
    # an approver finalizes a draft in one step: it is sent and decided in this same call (docs/approval.md)
    if decision == "approved" and ticket.status in {"draft", "correction_requested"}:
        submit_for_approval(db, ticket, actor=user.id)
    if decision == "approved":
        assert_customer_not_rma_locked(db, ticket.customer_id, ticket.company_id)
    if ticket.status != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Only a complaint that is pending approval can be decided (this one is {RMA_STATUS_LABELS.get(ticket.status, ticket.status)}).",
        )
    text = (reason or "").strip()
    if decision in {"rejected", "correction_requested"} and not text:
        raise HTTPException(status_code=400, detail="A reason is required to reject a complaint or send it back.")
    if decision == "approved" and ticket.unit_received:
        # Fail before anything changes: an approved, physically held unit is stocked into the RMA store.
        if not ticket.warehouse_id:
            ticket.warehouse_id = default_rma_store_id(db, ticket.company_id)  # the only RMA store, when nobody picked one
        require_rma_store(db, ticket.company_id, ticket.warehouse_id)

    ticket.complaint_decision = decision
    ticket.complaint_decided_by = user.id
    ticket.complaint_decided_by_name = user.name or user.username
    ticket.complaint_decided_at = datetime.utcnow()
    ticket.complaint_decision_reason = text or None
    label = {"approved": "Complaint approved", "rejected": "Complaint rejected", "correction_requested": "Returned for correction"}[decision]
    note = f"{label}: {text}" if text else label
    rma_service.change_status(db, ticket, decision, actor=user.id, note=note, _allow_decision=True)
    record_activity(db, ticket, f"complaint_{decision}", actor=user.id, new_value=text or None, details={"decision": decision})

    if decision == "approved":
        if ticket.unit_received:
            # The unit is here: it goes into the RMA store (received hook posts the stock exactly once).
            rma_service.change_status(db, ticket, "received", actor=user.id, note="Unit received into the RMA store", _allow_decision=True)
        else:
            ticket.custody_state = None
    return ticket


# ------------------------------------------------------- protected fields


def check_protected_changes(
    ticket: RmaTicket,
    changes: dict[str, Any],
    *,
    can_override: bool,
    reason: Optional[str],
) -> dict[str, tuple[Any, Any]]:
    """Which protected fields would actually change, and refuse when the user may not (or gave no reason).

    A walk-in with no sale on file has hand-typed customer details, so those stay free to edit.
    """
    changed: dict[str, tuple[Any, Any]] = {}
    for key, value in changes.items():
        if key not in PROTECTED_FIELDS or value is None:
            continue
        current = getattr(ticket, key, None)
        if (current or "") == (value or ""):
            continue
        if key.startswith("customer_") and not ticket.order_id:
            continue
        changed[key] = (current, value)
    if not changed:
        return changed
    if not can_override:
        names = ", ".join(sorted(k.replace("_", " ") for k in changed))
        raise HTTPException(
            status_code=403,
            detail=f"Changing {names} needs the RMA override permission. These values come from the sale and the unit's history.",
        )
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Give a reason for overriding the protected fields.")
    return changed


# ---------------------------------------------------------------- receipt


def next_receipt_no(ticket: RmaTicket) -> str:
    return f"CR-{ticket.rma_number.replace('RMA-', '', 1)}"


def receipt_payload(db: Session, ticket: RmaTicket, *, printed_by: str, reprint: bool) -> dict[str, Any]:
    """Customer-facing complaint receipt. Built field by field: internal notes, costs and charge lines never go in."""
    prior = prior_tickets(
        db,
        ticket.company_id,
        serial_number=ticket.serial_number,
        item_id=ticket.item_id,
        customer_id=ticket.customer_id,
        exclude_id=ticket.id,
        limit=1,
    )
    warranty_labels = {"in_warranty": "In warranty", "out_of_warranty": "Out of warranty", "unknown": "Unverified"}

    return {
        "receipt_no": ticket.receipt_no or next_receipt_no(ticket),
        "reprint": reprint,
        "print_count": ticket.receipt_print_count,
        "printed_at": datetime.utcnow().isoformat(),
        "printed_by": printed_by,
        "rma_number": ticket.rma_number,
        "complaint_date": ticket.received_at.date().isoformat() if ticket.received_at else None,
        "customer_name": ticket.customer_name,
        "customer_phone": ticket.customer_phone,
        "customer_email": ticket.customer_email,
        "product_name": ticket.product_name,
        "sku": ticket.sku,
        "serial_number": ticket.serial_number,
        "under_warranty": ticket.warranty_status == "in_warranty",
        "warranty_status": ticket.warranty_status,
        "warranty_label": warranty_labels.get(ticket.warranty_status, ticket.warranty_status),
        "sales_invoice_no": ticket.order_number,
        "sales_date": ticket.purchased_at.isoformat() if ticket.purchased_at else None,
        "problem": ticket.fault_reported,
        "narration": " · ".join(part for part in (ticket.accessories, ticket.condition_notes) if part) or None,
        "accessories": ticket.accessories,
        "condition_on_arrival": ticket.condition_notes,
        "prior_job_ref": prior[0].rma_number if prior else None,
        "times_before": ticket.prior_rma_count,
        "engineer": ticket.assigned_to,
        "delivery_date": ticket.promised_delivery_date.isoformat() if ticket.promised_delivery_date else None,
        "charge_estimate": str(ticket.charge_estimate),
        "approved_by": ticket.complaint_decided_by_name if ticket.complaint_decision == "approved" else None,
    }


def count_receipt_print(db: Session, ticket: RmaTicket, *, actor: Optional[str]) -> None:
    ticket.receipt_no = ticket.receipt_no or next_receipt_no(ticket)
    ticket.receipt_print_count = (ticket.receipt_print_count or 0) + 1
    ticket.receipt_last_printed_at = datetime.utcnow()
    record_activity(
        db,
        ticket,
        "receipt_printed" if ticket.receipt_print_count == 1 else "receipt_reprinted",
        actor=actor,
        details={"print_count": ticket.receipt_print_count},
    )


# ------------------------------------------------------------ stock events view


def stock_events_view(db: Session, ticket: RmaTicket) -> list[dict[str, Any]]:
    from app.models.inventory_stock_movement import InventoryStockMovement

    events = (
        db.query(RmaStockEvent).filter(RmaStockEvent.rma_id == ticket.id).order_by(RmaStockEvent.created_at.asc()).all()
    )
    warehouses = {
        w.id: w.name
        for w in db.query(InventoryWarehouse).filter(
            InventoryWarehouse.id.in_(
                {e.warehouse_id for e in events if e.warehouse_id} | {e.dest_warehouse_id for e in events if e.dest_warehouse_id} or {""}
            )
        )
    }
    moves = {
        m.id: m
        for m in db.query(InventoryStockMovement).filter(
            InventoryStockMovement.id.in_({e.movement_id for e in events if e.movement_id} or {""})
        )
    }
    return [
        {
            "id": e.id,
            "event_key": e.event_key,
            "state": CUSTODY_LABELS.get(e.custody_state or "", None),
            "movement_type": e.movement_type,
            "warehouse": warehouses.get(e.warehouse_id or "", None),
            "to_warehouse": warehouses.get(e.dest_warehouse_id or "", None),
            "quantity": e.quantity,
            "reversed": e.reversed_at is not None,
            "reference": moves[e.movement_id].reference if e.movement_id in moves else None,
            "note": e.note,
            "created_at": e.created_at,
        }
        for e in events
    ]


def is_open(status: str) -> bool:
    return status in OPEN_STATUSES
