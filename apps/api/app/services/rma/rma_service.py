"""RMA ticket lifecycle: intake, warranty verdict, repair, supplier leg, billing.

Follows the purchase service's contract — this layer flushes, the router owns
the transaction and calls commit().
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.commerce_order_refund import CommerceOrderRefund
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceReceivable
from app.models.inventory_serial import InventorySerial
from app.models.item import Item
from app.models.rma import RmaCharge, RmaReason, RmaStatusHistory, RmaSupplierJob, RmaTicket
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.rma import warranty as warranty_rules
from app.services.rma.constants import (
    BILL_STATUSES,
    CHARGE_KINDS,
    FUNCTIONAL_RESULTS,
    PHYSICAL_CONDITIONS,
    QC_RESULTS,
    RESOLUTION_TYPES,
    RMA_STATUS_TRANSITIONS,
    RMA_STATUSES,
    RMA_TYPES,
    SUPPLIER_JOB_STATUSES,
    WARRANTY_STATUSES,
)

ZERO = Decimal("0")


@dataclass(frozen=True)
class TicketIntake:
    fault_reported: str
    company_id: str = "default"
    order_number: Optional[str] = None
    order_item_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    serial_number: Optional[str] = None
    quantity: int = 1
    received_by: Optional[str] = None
    accessories: Optional[str] = None
    condition_notes: Optional[str] = None
    priority: str = "normal"
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    rma_type: str = "customer"
    reason_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    start_status: str = "received"
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    internal_notes: Optional[str] = None
    claim_group_id: Optional[str] = None


# --------------------------------------------------------------- numbering


def next_rma_number(db: Session, company_id: str) -> str:
    year = date.today().year
    prefix = f"RMA-{year}-"
    count = (
        db.query(func.count(RmaTicket.id))
        .filter(RmaTicket.company_id == company_id, RmaTicket.rma_number.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not db.query(RmaTicket.id).filter(RmaTicket.rma_number == number).first():
            return number
    raise HTTPException(status_code=500, detail="Could not allocate an RMA number")


# ---------------------------------------------------------------- warranty


def lookup_sale(
    db: Session, *, order_number: Optional[str], sku: Optional[str]
) -> tuple[Optional[CommerceOrder], Optional[CommerceOrderItem], Optional[CatalogProduct]]:
    """Find the sale a claim refers to, so warranty can be measured from it.

    Commerce storefront orders are tried first; ERP sales orders are a fallback
    so POS / counter sales still resolve warranty.
    """
    order = None
    if order_number:
        order = (
            db.query(CommerceOrder)
            .filter(CommerceOrder.order_number == order_number)
            .first()
        )
        if not order:
            sales = (
                db.query(SalesOrder)
                .filter(SalesOrder.order_number == order_number, SalesOrder.deleted_at.is_(None))
                .first()
            )
            if sales:
                return _sale_from_erp_order(db, sales, sku)
            raise HTTPException(status_code=404, detail=f"No order found for {order_number}")

    item = None
    if order:
        items = (
            db.query(CommerceOrderItem)
            .filter(CommerceOrderItem.order_id == order.id)
            .all()
        )
        if sku:
            item = next((i for i in items if i.sku == sku), None)
            if not item:
                raise HTTPException(
                    status_code=404, detail=f"{sku} is not on order {order_number}"
                )
        elif len(items) == 1:
            item = items[0]

    product = None
    lookup_sku = sku or (item.sku if item else None)
    if lookup_sku:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == lookup_sku).first()
    return order, item, product


def _sale_from_erp_order(
    db: Session, sales: SalesOrder, sku: Optional[str]
) -> tuple[Optional[CommerceOrder], Optional[CommerceOrderItem], Optional[CatalogProduct]]:
    """Adapt an ERP sales order into the commerce-shaped tuple warranty_for expects."""
    customer = db.get(CommerceCustomer, sales.customer_id)
    lines = (
        db.query(SalesOrderLine)
        .filter(SalesOrderLine.sales_order_id == sales.id)
        .order_by(SalesOrderLine.sort_order)
        .all()
    )
    line = None
    if sku:
        line = next((row for row in lines if row.sku == sku), None)
        if not line:
            raise HTTPException(status_code=404, detail=f"{sku} is not on order {sales.order_number}")
    elif len(lines) == 1:
        line = lines[0]

    product = None
    lookup_sku = sku or (line.sku if line else None)
    if lookup_sku:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == lookup_sku).first()

    class _OrderShim:
        id = sales.id
        order_number = sales.order_number
        customer_id = sales.customer_id
        customer_name = customer.name if customer else ""
        customer_phone = customer.phone if customer else ""
        customer_email = customer.email if customer else ""
        created_at = datetime.combine(sales.order_date, datetime.min.time()) if sales.order_date else None

    class _ItemShim:
        id = line.id if line else None
        sku = line.sku if line else lookup_sku

    return _OrderShim(), _ItemShim() if line else None, product  # type: ignore[return-value]


def warranty_for(
    order: Optional[CommerceOrder], product: Optional[CatalogProduct]
) -> tuple[warranty_rules.WarrantyVerdict, Optional[date]]:
    purchased = None
    if order is not None:
        purchased = order.created_at.date() if order.created_at else None
    verdict = warranty_rules.evaluate(
        warranty_text=product.warranty if product else None, purchased_on=purchased
    )
    return verdict, purchased


def normalize_phone_digits(value: str) -> str:
    """Strip a phone to local digits so +88017… and 017… match each other."""
    digits = "".join(c for c in value if c.isdigit())
    if digits.startswith("880") and len(digits) >= 13:
        digits = digits[2:]
    elif digits.startswith("88") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) == 10 and not digits.startswith("0"):
        digits = f"0{digits}"
    return digits


def looks_like_phone(query: str) -> bool:
    digits = "".join(c for c in query if c.isdigit())
    extras = "".join(c for c in query if not c.isdigit() and c not in "+-() .")
    return len(digits) >= 7 and not extras


def _phone_digits_expr(column):
    return func.regexp_replace(column, r"[^0-9]", "", "g")


def _serials_for_order(db: Session, *, order_id: str, order_number: str) -> list[InventorySerial]:
    return (
        db.query(InventorySerial)
        .filter(
            or_(
                InventorySerial.order_id == order_id,
                InventorySerial.order_number == order_number,
            )
        )
        .all()
    )


def _commerce_order_hit(
    db: Session,
    order: CommerceOrder,
    *,
    matched_by: str,
    matched_serial: Optional[str] = None,
) -> dict:
    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order.id)
        .order_by(CommerceOrderItem.sort_order)
        .all()
    )
    serials = _serials_for_order(db, order_id=order.id, order_number=order.order_number)
    by_sku: dict[str, list[str]] = {}
    for row in serials:
        if row.sku:
            by_sku.setdefault(row.sku, []).append(row.serial_number)
    lines = []
    for item in items:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == item.sku).first()
        verdict, _ = warranty_for(order, product)
        lines.append(
            {
                "id": item.id,
                "sku": item.sku,
                "name": item.name,
                "quantity": item.quantity,
                "serial_numbers": by_sku.get(item.sku, []),
                "warranty_status": verdict.status,
                "warranty_note": verdict.note,
            }
        )
    purchased = None
    if order.created_at:
        purchased = order.created_at.date()
    elif order.order_date:
        purchased = order.order_date.date() if hasattr(order.order_date, "date") else order.order_date
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "source": "commerce",
        "customer_id": order.customer_id,
        "customer_name": order.customer_name or "",
        "customer_phone": order.customer_phone or "",
        "customer_email": order.customer_email or "",
        "purchased_at": purchased,
        "matched_by": matched_by,
        "matched_serial": matched_serial,
        "lines": lines,
    }


def _sales_order_hit(
    db: Session,
    sales: SalesOrder,
    *,
    matched_by: str,
    matched_serial: Optional[str] = None,
) -> dict:
    customer = db.get(CommerceCustomer, sales.customer_id)
    lines_rows = (
        db.query(SalesOrderLine)
        .filter(SalesOrderLine.sales_order_id == sales.id)
        .order_by(SalesOrderLine.sort_order)
        .all()
    )
    serials = _serials_for_order(db, order_id=sales.id, order_number=sales.order_number)
    by_sku: dict[str, list[str]] = {}
    for row in serials:
        if row.sku:
            by_sku.setdefault(row.sku, []).append(row.serial_number)

    class _OrderShim:
        created_at = datetime.combine(sales.order_date, datetime.min.time()) if sales.order_date else None

    lines = []
    for line in lines_rows:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == line.sku).first()
        verdict, _ = warranty_for(_OrderShim(), product)  # type: ignore[arg-type]
        lines.append(
            {
                "id": line.id,
                "sku": line.sku,
                "name": line.name,
                "quantity": line.quantity_ordered,
                "serial_numbers": by_sku.get(line.sku, []),
                "warranty_status": verdict.status,
                "warranty_note": verdict.note,
            }
        )
    return {
        "order_id": sales.id,
        "order_number": sales.order_number,
        "source": "sales",
        "customer_id": sales.customer_id,
        "customer_name": customer.name if customer else "",
        "customer_phone": customer.phone if customer else "",
        "customer_email": customer.email if customer else "",
        "purchased_at": sales.order_date,
        "matched_by": matched_by,
        "matched_serial": matched_serial,
        "lines": lines,
    }


def search_orders(db: Session, query: str, *, limit: int = 20) -> list[dict]:
    """Find sales by order number, customer phone, or product serial."""
    q = (query or "").strip()
    if len(q) < 2:
        return []

    hits: dict[tuple[str, str], dict] = {}

    def put(hit: dict) -> None:
        key = (hit["source"], hit["order_id"])
        existing = hits.get(key)
        if existing is None:
            hits[key] = hit
            return
        # Prefer the more specific match (serial > order number > phone).
        rank = {"serial": 3, "order_number": 2, "phone": 1}
        if rank.get(hit["matched_by"], 0) >= rank.get(existing["matched_by"], 0):
            if hit.get("matched_serial") and not existing.get("matched_serial"):
                existing["matched_serial"] = hit["matched_serial"]
            existing["matched_by"] = hit["matched_by"]

    like = f"%{q}%"
    commerce_by_number = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.order_number.ilike(like))
        .order_by(CommerceOrder.created_at.desc())
        .limit(limit)
        .all()
    )
    for order in commerce_by_number:
        put(_commerce_order_hit(db, order, matched_by="order_number"))

    sales_by_number = (
        db.query(SalesOrder)
        .filter(SalesOrder.order_number.ilike(like), SalesOrder.deleted_at.is_(None))
        .order_by(SalesOrder.order_date.desc())
        .limit(limit)
        .all()
    )
    for sales in sales_by_number:
        put(_sales_order_hit(db, sales, matched_by="order_number"))

    if looks_like_phone(q):
        suffix = normalize_phone_digits(q)
        if len(suffix) >= 7:
            commerce_by_phone = (
                db.query(CommerceOrder)
                .filter(_phone_digits_expr(CommerceOrder.customer_phone).like(f"%{suffix}%"))
                .order_by(CommerceOrder.created_at.desc())
                .limit(limit)
                .all()
            )
            for order in commerce_by_phone:
                put(_commerce_order_hit(db, order, matched_by="phone"))

            sales_by_phone = (
                db.query(SalesOrder)
                .join(CommerceCustomer, CommerceCustomer.id == SalesOrder.customer_id)
                .filter(
                    SalesOrder.deleted_at.is_(None),
                    _phone_digits_expr(CommerceCustomer.phone).like(f"%{suffix}%"),
                )
                .order_by(SalesOrder.order_date.desc())
                .limit(limit)
                .all()
            )
            for sales in sales_by_phone:
                put(_sales_order_hit(db, sales, matched_by="phone"))

    serial_rows = (
        db.query(InventorySerial)
        .filter(InventorySerial.serial_number.ilike(like))
        .limit(limit)
        .all()
    )
    for serial in serial_rows:
        order = None
        if serial.order_id:
            order = db.get(CommerceOrder, serial.order_id)
        if order is None and serial.order_number:
            order = (
                db.query(CommerceOrder)
                .filter(CommerceOrder.order_number == serial.order_number)
                .first()
            )
        if order is not None:
            put(
                _commerce_order_hit(
                    db, order, matched_by="serial", matched_serial=serial.serial_number
                )
            )
            continue
        sales = None
        if serial.order_id:
            sales = (
                db.query(SalesOrder)
                .filter(SalesOrder.id == serial.order_id, SalesOrder.deleted_at.is_(None))
                .first()
            )
        if sales is None and serial.order_number:
            sales = (
                db.query(SalesOrder)
                .filter(
                    SalesOrder.order_number == serial.order_number,
                    SalesOrder.deleted_at.is_(None),
                )
                .first()
            )
        if sales is not None:
            put(
                _sales_order_hit(
                    db, sales, matched_by="serial", matched_serial=serial.serial_number
                )
            )

    ranked = {"serial": 3, "order_number": 2, "phone": 1}
    result = sorted(
        hits.values(),
        key=lambda hit: (ranked.get(hit["matched_by"], 0), hit["order_number"] or ""),
        reverse=True,
    )
    return result[:limit]


# ------------------------------------------------------------------ tickets


def lookup_by_serial(db: Session, serial_number: str, company_id: str = "default"):
    """The registry's view of a unit, or None when the serial is unknown.

    An unregistered serial is not an error — the claim simply falls back to the
    order number, the way it worked before the registry existed.
    """
    from app.services.inventory import serial_service

    return serial_service.lookup_for_claim(db, serial_number, company_id=company_id)


def create_ticket(db: Session, intake: TicketIntake) -> RmaTicket:
    # A registered serial identifies the unit itself, so it settles both the
    # duplicate-claim question and the sale behind the warranty.
    serial_ctx = None
    if intake.serial_number:
        serial_ctx = lookup_by_serial(db, intake.serial_number, intake.company_id)
        if serial_ctx is not None and serial_ctx.open_claim is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{intake.serial_number} is already on open claim "
                    f"{serial_ctx.open_claim.rma_number}."
                ),
            )

    serial_row = serial_ctx.serial if serial_ctx else None

    try:
        order, item, product = lookup_sale(
            db, order_number=intake.order_number, sku=intake.sku
        )
    except HTTPException:
        # The order/SKU lookup is strict — it enforces that the SKU is really a
        # line on that order. When a registered serial backs the claim, its own
        # order/product association is trustworthy on its own, so a mismatch
        # here (e.g. the order number was only auto-filled from the registry)
        # should fall through to that instead of failing the whole intake.
        if serial_row is None:
            raise
        order, item, product = None, None, None

    verdict, purchased = warranty_for(order, product)
    warranty_source = "order" if order else "unknown"

    if serial_ctx is not None and order is None:
        # No order number was given, but the registry knows what this unit is
        # and who bought it — a better answer than "unknown".
        if serial_row.order_id:
            order = (
                db.query(CommerceOrder).filter(CommerceOrder.id == serial_row.order_id).first()
            )
        if product is None and serial_row.sku:
            product = (
                db.query(CatalogProduct).filter(CatalogProduct.sku == serial_row.sku).first()
            )
        verdict = serial_ctx.verdict
        purchased = serial_ctx.purchased_on
        warranty_source = "serial"

    ticket = RmaTicket(
        company_id=intake.company_id,
        rma_number=next_rma_number(db, intake.company_id),
        customer_id=intake.customer_id
        or (order.customer_id if order else None)
        or (serial_row.customer_id if serial_row else None),
        customer_name=intake.customer_name
        or (order.customer_name if order else "")
        or (serial_row.customer_name if serial_row else ""),
        customer_phone=intake.customer_phone or (order.customer_phone if order else ""),
        customer_email=intake.customer_email or (order.customer_email if order else ""),
        order_id=order.id if order else (serial_row.order_id if serial_row else None),
        order_number=order.order_number
        if order
        else (serial_row.order_number if serial_row else None),
        order_item_id=intake.order_item_id or (item.id if item else None),
        purchased_at=purchased,
        product_id=product.id if product else None,
        item_id=product.item_id if product else None,
        sku=intake.sku or (item.sku if item else "") or (serial_row.sku if serial_row else ""),
        product_name=intake.product_name
        or (product.name if product else "")
        or (serial_row.product_name if serial_row else ""),
        serial_number=intake.serial_number,
        quantity=intake.quantity,
        received_by=intake.received_by,
        accessories=intake.accessories,
        condition_notes=intake.condition_notes,
        fault_reported=intake.fault_reported,
        warranty_status=verdict.status,
        warranty_source=warranty_source,
        warranty_expires_on=verdict.expires_on,
        warranty_note=verdict.note,
        # Out of warranty starts billable; in-warranty work is free unless an
        # agent later adds chargeable parts and flips it.
        is_billable=verdict.status == "out_of_warranty",
        status=intake.start_status if intake.start_status in RMA_STATUSES else "received",
        priority=intake.priority,
        assigned_to=intake.assigned_to,
        created_by=intake.created_by,
        rma_type=intake.rma_type if intake.rma_type in RMA_TYPES else "customer",
        reason_id=intake.reason_id,
        claim_group_id=intake.claim_group_id,
        warehouse_id=intake.warehouse_id,
        courier=intake.courier,
        tracking_number=intake.tracking_number,
        internal_notes=intake.internal_notes,
        order_source="sales" if order is not None and not isinstance(order, CommerceOrder) else "commerce",
    )
    db.add(ticket)
    db.flush()
    _record_status(db, ticket, None, ticket.status, intake.created_by, "Claim opened")

    # Only a sold unit can legitimately move to in_service — a serial that is
    # still in_stock (never sold), or already replaced/scrapped, has nothing to
    # claim against. The ticket still records the serial as free text; it just
    # is not linked into the registry's lifecycle.
    if serial_row is not None and serial_row.status == "sold" and ticket.status in {
        "received",
        "diagnosing",
        "awaiting_approval",
        "in_repair",
    }:
        from app.services.inventory import serial_service

        serial_service.attach_to_rma(db, serial_row, rma_id=ticket.id)

    return ticket


def get_ticket(db: Session, ticket_id: str, company_id: Optional[str] = None) -> RmaTicket:
    row = db.get(RmaTicket, ticket_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="RMA ticket not found")
    return row


def list_tickets(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    warranty_status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    rma_type: Optional[str] = None,
    item_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[Sequence[RmaTicket], int]:
    query = db.query(RmaTicket).filter(RmaTicket.company_id == company_id)
    if status:
        query = query.filter(RmaTicket.status == status)
    if item_id:
        query = query.filter(RmaTicket.item_id == item_id)
    if warranty_status:
        query = query.filter(RmaTicket.warranty_status == warranty_status)
    if rma_type:
        query = query.filter(RmaTicket.rma_type == rma_type)
    if supplier_id:
        query = query.filter(
            RmaTicket.id.in_(
                db.query(RmaSupplierJob.rma_id).filter(RmaSupplierJob.supplier_id == supplier_id)
            )
        )
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (RmaTicket.rma_number.ilike(like))
            | (RmaTicket.customer_name.ilike(like))
            | (RmaTicket.sku.ilike(like))
            | (RmaTicket.product_name.ilike(like))
            | (RmaTicket.serial_number.ilike(like))
            | (RmaTicket.order_number.ilike(like))
        )
    total = query.count()
    rows = (
        query.order_by(RmaTicket.created_at.desc()).offset(offset).limit(limit).all()
    )
    return rows, total


def set_warranty(
    db: Session,
    ticket: RmaTicket,
    *,
    status: str,
    note: Optional[str],
    expires_on: Optional[date],
    actor: Optional[str],
) -> RmaTicket:
    """Manual override — recorded as such so it is never mistaken for computed."""
    if status not in WARRANTY_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid warranty status: {status}")
    ticket.warranty_status = status
    ticket.warranty_source = "manual"
    ticket.warranty_expires_on = expires_on
    ticket.warranty_note = note or f"Set manually by {actor or 'an agent'}."
    if status == "out_of_warranty" and ticket.bill_status == "not_billed":
        ticket.is_billable = True
    db.flush()
    return ticket


def recheck_warranty(db: Session, ticket: RmaTicket) -> RmaTicket:
    """Recompute from the order and product — undoes a manual override."""
    order = db.get(CommerceOrder, ticket.order_id) if ticket.order_id else None
    product = db.get(CatalogProduct, ticket.product_id) if ticket.product_id else None
    verdict, purchased = warranty_for(order, product)
    ticket.warranty_status = verdict.status
    ticket.warranty_source = "order" if order else "unknown"
    ticket.warranty_expires_on = verdict.expires_on
    ticket.warranty_note = verdict.note
    ticket.purchased_at = purchased or ticket.purchased_at
    db.flush()
    return ticket


# ------------------------------------------------------------------ status


def _record_status(
    db: Session,
    ticket: RmaTicket,
    from_status: Optional[str],
    to_status: str,
    actor: Optional[str],
    note: Optional[str],
) -> None:
    db.add(
        RmaStatusHistory(
            rma_id=ticket.id,
            from_status=from_status,
            to_status=to_status,
            changed_by=actor,
            note=note,
        )
    )
    db.flush()


def change_status(
    db: Session,
    ticket: RmaTicket,
    to_status: str,
    *,
    actor: Optional[str] = None,
    note: Optional[str] = None,
) -> RmaTicket:
    if to_status not in RMA_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unknown status: {to_status}")
    allowed = RMA_STATUS_TRANSITIONS.get(ticket.status, frozenset())
    if to_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot move an RMA from {ticket.status} to {to_status}. "
                f"Allowed: {', '.join(sorted(allowed)) or 'none — this stage is final'}."
            ),
        )

    if to_status == "sent_to_supplier":
        # Query rather than read ticket.supplier_job — the relationship caches a
        # None loaded before the job was added in the same session.
        has_job = (
            db.query(RmaSupplierJob.id).filter(RmaSupplierJob.rma_id == ticket.id).first()
            is not None
        )
        if not has_job:
            raise HTTPException(
                status_code=400,
                detail="Record the supplier job before marking the unit sent to a supplier.",
            )

    previous = ticket.status
    ticket.status = to_status
    if to_status in {"closed", "rejected", "cancelled"}:
        ticket.closed_at = datetime.utcnow()
    _record_status(db, ticket, previous, to_status, actor, note)
    _release_serial(db, ticket, to_status)
    return ticket


# Statuses where the unit stops being the workshop's problem, and what that
# means for the registered unit.
_SERIAL_RELEASE = {
    "delivered": "returned",
    "closed": "returned",
    "rejected": "returned",
    "cancelled": "returned",
}


def _release_serial(db: Session, ticket: RmaTicket, to_status: str) -> None:
    """Hand a registered unit back once its claim reaches a final stage."""
    outcome = _SERIAL_RELEASE.get(to_status)
    if outcome is None or not ticket.serial_number:
        return

    from app.services.inventory import serial_service

    row = serial_service.find_by_number(
        db, ticket.serial_number, company_id=ticket.company_id
    )
    # Only let go of the unit this claim is actually holding.
    if row is None or row.rma_id != ticket.id:
        return

    # A replaced unit is retired in favour of the new one, whatever the closing
    # status happened to be.
    if ticket.resolution_type == "replace":
        outcome = "replaced"
    serial_service.release_from_rma(db, row, outcome)


def history(db: Session, ticket_id: str) -> list[RmaStatusHistory]:
    return (
        db.query(RmaStatusHistory)
        .filter(RmaStatusHistory.rma_id == ticket_id)
        .order_by(RmaStatusHistory.created_at.desc())
        .all()
    )


# ----------------------------------------------------------------- charges


def _recalculate(db: Session, ticket: RmaTicket) -> None:
    charges = db.query(RmaCharge).filter(RmaCharge.rma_id == ticket.id).all()
    parts = sum((c.line_total for c in charges if c.kind == "part"), ZERO)
    labour = sum((c.line_total for c in charges if c.kind == "labour"), ZERO)
    misc = sum((c.line_total for c in charges if c.kind == "misc"), ZERO)
    tax = sum(
        ((c.line_total * (c.tax_rate or ZERO)) / Decimal("100") for c in charges), ZERO
    )
    ticket.parts_total = parts
    ticket.labour_total = labour + misc
    ticket.tax_total = tax.quantize(Decimal("0.01"))
    ticket.total = (parts + labour + misc + ticket.tax_total).quantize(Decimal("0.01"))
    db.flush()


def add_charge(
    db: Session,
    ticket: RmaTicket,
    *,
    kind: str,
    description: str,
    quantity: Decimal,
    unit_price: Decimal,
    tax_rate: Decimal = ZERO,
    item_id: Optional[str] = None,
    sku: Optional[str] = None,
    notes: Optional[str] = None,
) -> RmaCharge:
    if kind not in CHARGE_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid charge kind: {kind}")
    if ticket.bill_status == "billed":
        raise HTTPException(
            status_code=400,
            detail="This RMA is already billed — cancel the bill before changing charges.",
        )

    charge = RmaCharge(
        rma_id=ticket.id,
        kind=kind,
        item_id=item_id,
        sku=sku,
        description=description,
        quantity=quantity,
        unit_price=unit_price,
        tax_rate=tax_rate,
        line_total=(quantity * unit_price).quantize(Decimal("0.01")),
        notes=notes,
    )
    db.add(charge)
    db.flush()
    _recalculate(db, ticket)
    return charge


def remove_charge(db: Session, ticket: RmaTicket, charge_id: str) -> None:
    if ticket.bill_status == "billed":
        raise HTTPException(
            status_code=400,
            detail="This RMA is already billed — cancel the bill before changing charges.",
        )
    charge = db.get(RmaCharge, charge_id)
    if not charge or charge.rma_id != ticket.id:
        raise HTTPException(status_code=404, detail="Charge not found on this RMA")
    db.delete(charge)
    db.flush()
    _recalculate(db, ticket)


def charges(db: Session, ticket_id: str) -> list[RmaCharge]:
    return (
        db.query(RmaCharge)
        .filter(RmaCharge.rma_id == ticket_id)
        .order_by(RmaCharge.created_at.asc())
        .all()
    )


# ------------------------------------------------------------ supplier job


def upsert_supplier_job(
    db: Session,
    ticket: RmaTicket,
    *,
    supplier_id: str,
    status: str = "draft",
    dispatched_at: Optional[date] = None,
    supplier_reference: Optional[str] = None,
    expected_return_date: Optional[date] = None,
    returned_at: Optional[date] = None,
    outcome: Optional[str] = None,
    cost: Decimal = ZERO,
    notes: Optional[str] = None,
) -> RmaSupplierJob:
    if status not in SUPPLIER_JOB_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid supplier job status: {status}")
    supplier = db.get(CommerceSupplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    job = ticket.supplier_job
    if job is None:
        job = RmaSupplierJob(rma_id=ticket.id, supplier_id=supplier_id)
        db.add(job)

    job.supplier_id = supplier_id
    job.supplier_name = supplier.name
    job.status = status
    job.dispatched_at = dispatched_at
    job.supplier_reference = supplier_reference
    job.expected_return_date = expected_return_date
    job.returned_at = returned_at
    job.outcome = outcome
    job.cost = cost
    job.notes = notes
    db.flush()
    return job


# ----------------------------------------------------------------- billing


def _next_invoice_number(db: Session, company_id: str) -> str:
    prefix = f"RMA-INV-{date.today().year}-"
    count = (
        db.query(func.count(FinanceReceivable.id))
        .filter(
            FinanceReceivable.company_id == company_id,
            FinanceReceivable.invoice_number.like(f"{prefix}%"),
        )
        .scalar()
        or 0
    )
    for n in range(count + 1, count + 1000):
        number = f"{prefix}{n:04d}"
        if not (
            db.query(FinanceReceivable.id)
            .filter(FinanceReceivable.invoice_number == number)
            .first()
        ):
            return number
    raise HTTPException(status_code=500, detail="Could not allocate an invoice number")


def raise_bill(db: Session, ticket: RmaTicket, *, due_date: Optional[date] = None) -> FinanceReceivable:
    """Turn the charges into a customer receivable, same as any other invoice."""
    if ticket.bill_status == "billed":
        raise HTTPException(status_code=400, detail="This RMA has already been billed")
    if ticket.total <= 0:
        raise HTTPException(status_code=400, detail="There is nothing to bill on this RMA")
    if not ticket.customer_id:
        raise HTTPException(
            status_code=400,
            detail="This RMA has no linked customer, so the bill has nowhere to go.",
        )

    receivable = FinanceReceivable(
        company_id=ticket.company_id,
        customer_id=ticket.customer_id,
        source_type="rma",
        source_id=ticket.id,
        invoice_number=_next_invoice_number(db, ticket.company_id),
        amount=ticket.total,
        amount_paid=ZERO,
        balance=ticket.total,
        tax_amount=ticket.tax_total,
        due_date=due_date,
        status="open",
        posting_status="pending",
    )
    db.add(receivable)
    db.flush()

    ticket.is_billable = True
    ticket.bill_status = "billed"
    ticket.receivable_id = receivable.id
    db.flush()

    from app.services.finance.finance_service import FinanceService

    FinanceService(db).try_post(
        lambda: FinanceService(db).record_rma_invoice(ticket.id),
        source_type="rma",
        source_id=ticket.id,
        company_id=ticket.company_id,
    )
    db.refresh(receivable)
    return receivable


def set_bill_status(db: Session, ticket: RmaTicket, status: str) -> RmaTicket:
    if status not in BILL_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid bill status: {status}")
    ticket.bill_status = status
    if status == "waived":
        ticket.is_billable = False
    db.flush()
    return ticket


# --------------------------------------------------------------- dashboard


def dashboard(db: Session, company_id: str) -> dict:
    rows = db.query(RmaTicket).filter(RmaTicket.company_id == company_id).all()
    breakdown: dict[str, int] = {}
    for row in rows:
        breakdown[row.status] = breakdown.get(row.status, 0) + 1

    open_count = sum(
        1 for r in rows if r.status not in {"closed", "rejected", "cancelled", "delivered"}
    )
    return {
        "total": len(rows),
        "open_count": open_count,
        "at_supplier_count": sum(
            1 for r in rows if r.status in {"sent_to_supplier", "at_supplier"}
        ),
        "in_warranty_count": sum(1 for r in rows if r.warranty_status == "in_warranty"),
        "unbilled_total": sum(
            (r.total for r in rows if r.is_billable and r.bill_status == "not_billed"), ZERO
        ),
        "pending_approval_count": sum(
            1 for r in rows if r.status in {"draft", "pending_approval", "awaiting_approval"}
        ),
        "awaiting_return_count": sum(1 for r in rows if r.status == "awaiting_return"),
        "status_breakdown": breakdown,
    }


def list_reasons(db: Session, *, company_id: str, active_only: bool = True) -> list[RmaReason]:
    query = db.query(RmaReason).filter(RmaReason.company_id == company_id)
    if active_only:
        query = query.filter(RmaReason.is_active.is_(True))
    return query.order_by(RmaReason.sort_order, RmaReason.name).all()


def inspect_ticket(
    db: Session,
    ticket: RmaTicket,
    *,
    physical_condition: str,
    functional_result: str,
    qc_result: str,
    notes: Optional[str] = None,
    accessories: Optional[str] = None,
    actor: Optional[str] = None,
) -> RmaTicket:
    if ticket.status in {"draft", "pending_approval", "approved", "awaiting_return"}:
        raise HTTPException(status_code=400, detail="Receive the unit before inspection")
    if physical_condition not in PHYSICAL_CONDITIONS:
        raise HTTPException(status_code=400, detail="Invalid physical condition")
    if functional_result not in FUNCTIONAL_RESULTS:
        raise HTTPException(status_code=400, detail="Invalid functional result")
    if qc_result not in QC_RESULTS:
        raise HTTPException(status_code=400, detail="Invalid QC result")

    ticket.physical_condition = physical_condition
    ticket.functional_result = functional_result
    ticket.qc_result = qc_result
    ticket.inspection_notes = notes
    ticket.inspected_by = actor
    ticket.inspected_at = datetime.utcnow()
    if accessories is not None:
        ticket.accessories = accessories
    if ticket.status == "received":
        change_status(db, ticket, "diagnosing", actor=actor, note="Inspection recorded")
    db.flush()
    return ticket


def set_resolution(
    db: Session,
    ticket: RmaTicket,
    *,
    resolution_type: str,
    actor: Optional[str] = None,
    note: Optional[str] = None,
) -> RmaTicket:
    if resolution_type not in RESOLUTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid resolution: {resolution_type}")
    if ticket.status in {"closed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Closed claims cannot change resolution")
    ticket.resolution_type = resolution_type
    ticket.resolution_status = "pending"
    if ticket.status == "diagnosing":
        change_status(db, ticket, "awaiting_approval", actor=actor, note=note or f"Resolution {resolution_type}")
    db.flush()
    return ticket


def create_service_from_rma(
    db: Session,
    ticket: RmaTicket,
    *,
    actor: Optional[str] = None,
    labour_total: Decimal = ZERO,
    parts_total: Decimal = ZERO,
) -> RmaTicket:
    if ticket.status in {"draft", "pending_approval", "approved", "awaiting_return"}:
        raise HTTPException(status_code=400, detail="Receive the unit before opening a service job")
    if ticket.service_job_id:
        raise HTTPException(status_code=409, detail="A service job is already linked to this RMA")
    if not ticket.customer_name and not ticket.customer_id:
        raise HTTPException(status_code=400, detail="Customer is required to open a service job")
    if ticket.warranty_status == "in_warranty":
        service_type = "warranty_repair"
        ticket.resolution_type = ticket.resolution_type or "warranty_repair"
    else:
        service_type = "paid_repair"
        ticket.resolution_type = ticket.resolution_type or "paid_repair"

    from app.services.service.service_job_service import ServiceJobIntake, create_job

    job = create_job(
        db,
        ServiceJobIntake(
            issue=ticket.fault_diagnosed or ticket.fault_reported,
            company_id=ticket.company_id,
            service_type=service_type,
            rma_id=ticket.id,
            customer_id=ticket.customer_id,
            customer_name=ticket.customer_name,
            product_id=ticket.product_id,
            item_id=ticket.item_id,
            sku=ticket.sku,
            product_name=ticket.product_name,
            serial_number=ticket.serial_number,
            warehouse_id=ticket.warehouse_id,
            warranty_status=ticket.warranty_status,
            labour_total=labour_total,
            parts_total=parts_total,
            created_by=actor,
        ),
    )
    ticket.service_job_id = job.id
    ticket.resolution_status = "processing"
    if ticket.status in {"received", "diagnosing", "awaiting_approval"}:
        change_status(db, ticket, "in_repair", actor=actor, note=f"Service job {job.job_number}")
    db.flush()
    return ticket


def process_refund(
    db: Session,
    ticket: RmaTicket,
    *,
    amount: Decimal,
    method: str = "original",
    actor: Optional[str] = None,
) -> RmaTicket:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be positive")
    if not ticket.order_id or not ticket.order_number:
        raise HTTPException(status_code=400, detail="Refunds require the original sales order")
    if ticket.refund_id:
        raise HTTPException(status_code=409, detail="A refund is already recorded on this RMA")

    order = db.get(CommerceOrder, ticket.order_id)
    if order is None:
        raise HTTPException(
            status_code=400,
            detail="ERP sales-order refunds must be processed in Sales/Finance. This claim has no commerce order.",
        )
    remaining = order.grand_total - order.refund_amount
    if amount > remaining:
        raise HTTPException(status_code=400, detail="Refund exceeds remaining order total")

    import uuid as uuid_mod

    refund = CommerceOrderRefund(
        company_id=ticket.company_id,
        refund_number=f"REF-{uuid_mod.uuid4().hex[:8].upper()}",
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        amount=amount,
        method=method,
        reason=f"RMA {ticket.rma_number}",
        status="pending",
        approved_by=actor,
    )
    db.add(refund)
    db.flush()
    order.refund_amount += amount
    ticket.refund_id = refund.id
    ticket.refund_amount = amount
    ticket.resolution_type = "refund" if amount >= remaining else "partial_refund"
    ticket.resolution_status = "completed"
    db.flush()
    _record_status(db, ticket, ticket.status, ticket.status, actor, f"Refund {refund.refund_number}")
    return ticket


def issue_replacement(
    db: Session,
    ticket: RmaTicket,
    *,
    item_id: str,
    warehouse_id: str,
    quantity: int = 1,
    actor: Optional[str] = None,
) -> RmaTicket:
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Replacement quantity must be positive")
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Replacement item not found")

    from app.services.inventory.constants import MOVEMENT_RMA_REPLACEMENT
    from app.services.inventory.stock_movement_service import MovementInput, StockMovementService

    StockMovementService(db).apply_movement(
        MovementInput(
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=MOVEMENT_RMA_REPLACEMENT,
            quantity=quantity,
            company_id=ticket.company_id,
            reference=ticket.rma_number,
            notes=f"Replacement for {ticket.sku}",
            created_by=actor,
            source_type="rma",
            source_id=ticket.id,
        )
    )
    ticket.replacement_item_id = item_id
    ticket.replacement_sku = item.sku
    ticket.replacement_warehouse_id = warehouse_id
    ticket.resolution_type = "replace"
    ticket.resolution_status = "completed"
    db.flush()
    _record_status(db, ticket, ticket.status, ticket.status, actor, f"Replacement {item.sku}")
    return ticket


def release_to_stock(
    db: Session,
    ticket: RmaTicket,
    *,
    warehouse_id: str,
    actor: Optional[str] = None,
) -> RmaTicket:
    if not ticket.item_id:
        raise HTTPException(status_code=400, detail="This claim has no inventory item to restock")
    from app.services.inventory.constants import MOVEMENT_CUSTOMER_RETURN
    from app.services.inventory.stock_movement_service import MovementInput, StockMovementService

    StockMovementService(db).apply_movement(
        MovementInput(
            item_id=ticket.item_id,
            warehouse_id=warehouse_id,
            movement_type=MOVEMENT_CUSTOMER_RETURN,
            quantity=ticket.quantity or 1,
            company_id=ticket.company_id,
            reference=ticket.rma_number,
            notes="QC resellable — returned to stock",
            created_by=actor,
            source_type="rma",
            source_id=ticket.id,
        )
    )
    ticket.qc_result = ticket.qc_result or "resellable"
    ticket.resolution_type = "resellable"
    ticket.resolution_status = "completed"
    ticket.warehouse_id = warehouse_id
    db.flush()
    return ticket


def scrap_unit(db: Session, ticket: RmaTicket, *, actor: Optional[str] = None) -> RmaTicket:
    if ticket.serial_number:
        from app.services.inventory import serial_service

        row = serial_service.find_by_number(db, ticket.serial_number, company_id=ticket.company_id)
        if row is not None and row.rma_id == ticket.id:
            serial_service.release_from_rma(db, row, "scrapped")
    if ticket.item_id and ticket.warehouse_id:
        from app.services.inventory.constants import MOVEMENT_SCRAP
        from app.services.inventory.stock_movement_service import MovementInput, StockMovementService

        try:
            StockMovementService(db).apply_movement(
                MovementInput(
                    item_id=ticket.item_id,
                    warehouse_id=ticket.warehouse_id,
                    movement_type=MOVEMENT_SCRAP,
                    quantity=ticket.quantity or 1,
                    company_id=ticket.company_id,
                    reference=ticket.rma_number,
                    notes="RMA scrap",
                    created_by=actor,
                    source_type="rma",
                    source_id=ticket.id,
                )
            )
        except HTTPException:
            pass
    ticket.resolution_type = "scrap"
    ticket.qc_result = "scrap"
    ticket.resolution_status = "completed"
    db.flush()
    return ticket


def reports(db: Session, company_id: str) -> dict:
    rows = db.query(RmaTicket).filter(RmaTicket.company_id == company_id).all()
    by_reason: dict[str, int] = {}
    by_warranty: dict[str, int] = {}
    by_resolution: dict[str, int] = {}
    reasons = {row.id: row.name for row in list_reasons(db, company_id=company_id, active_only=False)}
    closed = [r for r in rows if r.closed_at and r.created_at]
    durations = [max((r.closed_at - r.created_at).total_seconds() / 86400, 0) for r in closed]
    for row in rows:
        reason_name = reasons.get(row.reason_id or "", "Unspecified")
        by_reason[reason_name] = by_reason.get(reason_name, 0) + 1
        by_warranty[row.warranty_status] = by_warranty.get(row.warranty_status, 0) + 1
        key = row.resolution_type or "unset"
        by_resolution[key] = by_resolution.get(key, 0) + 1
    return {
        "total": len(rows),
        "open": sum(1 for r in rows if r.status not in {"closed", "rejected", "cancelled", "delivered"}),
        "refund_amount": sum((r.refund_amount for r in rows), ZERO),
        "repair_charges": sum((r.total for r in rows), ZERO),
        "avg_resolution_days": round(sum(durations) / len(durations), 1) if durations else 0,
        "by_reason": by_reason,
        "by_warranty": by_warranty,
        "by_resolution": by_resolution,
        "by_product": _top_counts([(r.sku, r.product_name) for r in rows]),
    }


def _top_counts(pairs: list[tuple[str, str]], limit: int = 12) -> list[dict]:
    tallies: dict[str, dict] = {}
    for sku, name in pairs:
        key = sku or name or "unknown"
        row = tallies.setdefault(key, {"sku": sku, "name": name, "count": 0})
        row["count"] += 1
    return sorted(tallies.values(), key=lambda r: r["count"], reverse=True)[:limit]

