"""The serial registry — which physical unit is where, and who bought it.

Serials used to exist only as free text on an RMA ticket, so a claim could not
say when the unit was sold or to whom, and nothing stopped the same serial being
claimed twice. This module is the record those answers come from.

Warranty expiry is computed with `app.services.rma.warranty`, the parser the RMA
module already uses, so a unit's warranty never depends on which screen asked.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_order import CommerceOrder
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.schemas.inventory.serial import SerialRead
from app.services.inventory.constants import (
    SERIAL_RMA_OUTCOMES,
    SERIAL_SOURCE_TYPES,
    SERIAL_STATUS_LABELS,
    SERIAL_STATUS_TRANSITIONS,
    SERIAL_STATUSES,
)
from app.services.rma import warranty as warranty_rules

COMPANY_DEFAULT = "default"

# A claim on a unit in one of these states is still live, so the unit is not
# free to be claimed again.
OPEN_RMA_STATUSES = (
    "draft",
    "pending_approval",
    "correction_requested",
    "approved",
    "awaiting_return",
    "received",
    "diagnosing",
    "awaiting_approval",
    "in_repair",
    "sent_to_supplier",
    "at_supplier",
    "returned_from_supplier",
    "ready_for_delivery",
    "on_hold",
)


@dataclass(frozen=True)
class SerialResult:
    """Outcome for one serial in a bulk register — never an exception.

    Pasting fifty serials of which two are already known should register the
    forty-eight, not fail the whole batch.
    """

    serial_number: str
    outcome: str  # created | duplicate | rejected
    detail: str = ""
    serial_id: Optional[str] = None


def clean_serial(value: Optional[str]) -> str:
    return (value or "").strip()


def find_by_number(
    db: Session, serial_number: str, *, company_id: str = COMPANY_DEFAULT
) -> Optional[InventorySerial]:
    """Case-insensitive lookup; the serial is stored exactly as it was typed."""
    cleaned = clean_serial(serial_number)
    if not cleaned:
        return None
    return (
        db.query(InventorySerial)
        .filter(
            InventorySerial.company_id == company_id,
            func.lower(InventorySerial.serial_number) == cleaned.lower(),
        )
        .first()
    )


def get_serial(
    db: Session, serial_id: str, *, company_id: str = COMPANY_DEFAULT
) -> InventorySerial:
    row = (
        db.query(InventorySerial)
        .filter(InventorySerial.id == serial_id, InventorySerial.company_id == company_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Serial not found")
    return row


def serials_to_read(db: Session, rows: Sequence[InventorySerial]) -> list[SerialRead]:
    """Attach product thumbnail and warehouse name for list grids."""
    warehouse_ids = {row.warehouse_id for row in rows if row.warehouse_id}
    warehouses: dict[str, InventoryWarehouse] = {}
    if warehouse_ids:
        warehouses = {
            row.id: row
            for row in db.query(InventoryWarehouse)
            .filter(InventoryWarehouse.id.in_(warehouse_ids))
            .all()
        }

    item_ids = {row.item_id for row in rows if row.item_id}
    skus = {row.sku for row in rows if row.sku}
    products_by_item: dict[str, CatalogProduct] = {}
    products_by_sku: dict[str, CatalogProduct] = {}
    if item_ids:
        for product in (
            db.query(CatalogProduct).filter(CatalogProduct.item_id.in_(item_ids)).all()
        ):
            if product.item_id:
                products_by_item[product.item_id] = product
    if skus:
        for product in db.query(CatalogProduct).filter(CatalogProduct.sku.in_(skus)).all():
            if product.sku:
                products_by_sku.setdefault(product.sku, product)

    trace = _trace_context(db, rows)
    out: list[SerialRead] = []
    for row in rows:
        product = (
            products_by_item.get(row.item_id) if row.item_id else None
        ) or products_by_sku.get(row.sku)
        warehouse = warehouses.get(row.warehouse_id or "")
        data = SerialRead.model_validate(row)
        out.append(
            data.model_copy(
                update={
                    "thumbnail": product.thumbnail if product else None,
                    "warehouse_name": warehouse.name if warehouse else None,
                    **trace.get(row.id, {}),
                }
            )
        )
    return out


def _trace_context(db: Session, rows: Sequence[InventorySerial]) -> dict[str, dict]:
    """Where each unit came from and where it went, resolved in a few batched
    queries: supplier + receipt number for purchases, adjustment number for
    opening stock / counts, and whether `order_id` is a sales or storefront order."""
    from app.models.commerce_supplier import CommerceSupplier
    from app.models.inventory_stock_adjustment import InventoryStockAdjustment
    from app.models.purchase_order import PurchaseOrder
    from app.models.purchase_receipt import PurchaseReceipt
    from app.models.sales import SalesOrder

    receipt_ids = {r.source_id for r in rows if r.source_type == "receipt" and r.source_id}
    receipts: dict[str, PurchaseReceipt] = {}
    orders_by_id: dict[str, PurchaseOrder] = {}
    if receipt_ids:
        receipts = {
            r.id: r for r in db.query(PurchaseReceipt).filter(PurchaseReceipt.id.in_(receipt_ids)).all()
        }
        po_ids = {r.purchase_order_id for r in receipts.values() if r.purchase_order_id}
        if po_ids:
            orders_by_id = {
                o.id: o for o in db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(po_ids)).all()
            }
    supplier_ids = {r.supplier_id for r in rows if r.supplier_id} | {
        o.supplier_id for o in orders_by_id.values() if o.supplier_id
    }
    suppliers: dict[str, str] = {}
    if supplier_ids:
        suppliers = {
            s.id: s.name
            for s in db.query(CommerceSupplier).filter(CommerceSupplier.id.in_(supplier_ids)).all()
        }
    adjustment_ids = {r.source_id for r in rows if r.source_type == "adjustment" and r.source_id}
    adjustments: dict[str, InventoryStockAdjustment] = {}
    if adjustment_ids:
        adjustments = {
            a.id: a
            for a in db.query(InventoryStockAdjustment)
            .filter(InventoryStockAdjustment.id.in_(adjustment_ids))
            .all()
        }
    order_ids = {r.order_id for r in rows if r.order_id}
    sales_orders: dict[str, SalesOrder] = {}
    if order_ids:
        sales_orders = {
            o.id: o for o in db.query(SalesOrder).filter(SalesOrder.id.in_(order_ids)).all()
        }
    sales_order_ids = set(sales_orders)

    # What this exact unit was bought for and sold for — the line prices already
    # on the purchase order / sales order, not a new cost calculation.
    from app.models.purchase_order import PurchaseOrderLine
    from app.models.sales import SalesOrderLine

    po_ids_for_cost = {po.id for po in orders_by_id.values()}
    purchase_cost_by_po_item: dict[tuple[str, str], Decimal] = {}
    if po_ids_for_cost:
        for po_id, item_id, unit_cost in (
            db.query(PurchaseOrderLine.purchase_order_id, PurchaseOrderLine.item_id, PurchaseOrderLine.unit_cost)
            .filter(PurchaseOrderLine.purchase_order_id.in_(po_ids_for_cost))
            .all()
        ):
            purchase_cost_by_po_item[(po_id, item_id)] = unit_cost
    sale_price_by_order_item: dict[tuple[str, str], Decimal] = {}
    if sales_order_ids:
        for order_id, item_id, unit_price in (
            db.query(SalesOrderLine.sales_order_id, SalesOrderLine.item_id, SalesOrderLine.unit_price)
            .filter(SalesOrderLine.sales_order_id.in_(sales_order_ids))
            .all()
        ):
            sale_price_by_order_item[(order_id, item_id)] = unit_price

    # Who handled each step: the staff who received / purchased and the staff who sold.
    from app.models.auth_user import AuthUser

    user_ids = (
        {o.created_by for o in sales_orders.values() if o.created_by}
        | {po.created_by for po in orders_by_id.values() if po.created_by}
        | {a.applied_by or a.created_by for a in adjustments.values() if (a.applied_by or a.created_by)}
    )
    user_names: dict[str, str] = {}
    if user_ids:
        user_names = {
            u.id: (u.name or u.username or u.email)
            for u in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all()
        }

    out: dict[str, dict] = {}
    for row in rows:
        supplier_name = suppliers.get(row.supplier_id or "")
        source_number = None
        received_by_name: Optional[str] = None
        purchase_unit_cost: Optional[Decimal] = None
        if row.source_type == "receipt":
            receipt = receipts.get(row.source_id or "")
            source_number = receipt.receipt_number if receipt else None
            po = orders_by_id.get(receipt.purchase_order_id or "") if receipt else None
            if receipt and not supplier_name:
                supplier_name = suppliers.get(po.supplier_id) if po else None
            received_by_name = (receipt.received_by or "").strip() if receipt else None
            if not received_by_name and po and po.created_by:
                received_by_name = user_names.get(po.created_by)
            if po:
                purchase_unit_cost = purchase_cost_by_po_item.get((po.id, row.item_id or ""))
            label = "Purchase"
        elif row.source_type == "adjustment":
            adj = adjustments.get(row.source_id or "")
            source_number = adj.adjustment_number if adj else None
            reason = (adj.reason if adj else "") or ""
            label = "Opening stock" if reason in ("opening", "opening_stock", "found") else "Stock adjustment"
            if adj:
                received_by_name = user_names.get(adj.applied_by or adj.created_by or "")
        elif row.source_type == "rma_replacement":
            label = "RMA replacement"
        elif row.source_type == "opening":
            label = "Opening stock"
        else:
            label = "Manual entry"
        sold_by_name: Optional[str] = None
        sold_unit_price: Optional[Decimal] = None
        if row.order_id:
            so = sales_orders.get(row.order_id)
            if so is not None:
                sold_by_name = user_names.get(so.created_by or "") or (so.sales_rep or "").strip() or None
                sold_unit_price = sale_price_by_order_item.get((row.order_id, row.item_id or ""))
            else:
                sold_by_name = "Online store"
        source_label = f"{label} · {source_number}" if source_number else label
        notes = (row.notes or "").strip()
        last_note = notes.splitlines()[-1].strip() if notes else None
        returned_at = None
        if last_note and last_note.startswith("Returned "):
            try:
                returned_at = datetime.strptime(last_note[9:19], "%Y-%m-%d")
            except ValueError:
                returned_at = row.updated_at
        out[row.id] = {
            "supplier_name": supplier_name,
            "source_label": source_label,
            "source_number": source_number,
            "order_kind": ("sales" if row.order_id in sales_order_ids else "commerce") if row.order_id else None,
            "returned_at": returned_at,
            "last_note": last_note,
            "received_by_name": received_by_name or None,
            "sold_by_name": sold_by_name,
            "purchase_unit_cost": purchase_unit_cost,
            "sold_unit_price": sold_unit_price,
        }
    return out


def serial_to_read(db: Session, row: InventorySerial) -> SerialRead:
    return serials_to_read(db, [row])[0]


def _serial_query(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    item_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(InventorySerial).filter(InventorySerial.company_id == company_id)
    if status:
        query = query.filter(InventorySerial.status == status)
    if item_id:
        query = query.filter(InventorySerial.item_id == item_id)
    if warehouse_id:
        query = query.filter(InventorySerial.warehouse_id == warehouse_id)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(InventorySerial.serial_number).like(term)
            | func.lower(InventorySerial.sku).like(term)
            | func.lower(InventorySerial.product_name).like(term)
            | func.lower(func.coalesce(InventorySerial.customer_name, "")).like(term)
            | func.lower(func.coalesce(InventorySerial.order_number, "")).like(term)
        )
    return query


def list_serials(
    db: Session,
    *,
    company_id: str = COMPANY_DEFAULT,
    status: Optional[str] = None,
    item_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> list[InventorySerial]:
    query = _serial_query(
        db, company_id=company_id, status=status, item_id=item_id, warehouse_id=warehouse_id, q=q
    )
    return (
        query.order_by(InventorySerial.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_serials(
    db: Session,
    *,
    company_id: str = COMPANY_DEFAULT,
    status: Optional[str] = None,
    item_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
) -> int:
    return _serial_query(
        db, company_id=company_id, status=status, item_id=item_id, warehouse_id=warehouse_id, q=q
    ).count()


def _resolve_item(
    db: Session, *, item_id: Optional[str], sku: Optional[str]
) -> tuple[Optional[Item], Optional[CatalogProduct]]:
    item: Optional[Item] = None
    if item_id:
        item = db.get(Item, item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Item not found")
    elif sku:
        item = db.query(Item).filter(Item.sku == sku).first()
        if item is None:
            raise HTTPException(status_code=404, detail=f"No item for SKU: {sku}")

    lookup_sku = sku or (item.sku if item else None)
    product = None
    if lookup_sku:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == lookup_sku).first()
    return item, product


def register_serials(
    db: Session,
    serial_numbers: Iterable[str],
    *,
    company_id: str = COMPANY_DEFAULT,
    item_id: Optional[str] = None,
    sku: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    source_type: str = "manual",
    source_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    received_at: Optional[datetime] = None,
    notes: Optional[str] = None,
) -> list[SerialResult]:
    """Register units into stock. Already-known serials are reported, not raised."""
    if source_type not in SERIAL_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid source type: {source_type}")

    item, product = _resolve_item(db, item_id=item_id, sku=sku)
    resolved_sku = (sku or (item.sku if item else "") or "").strip()
    product_name = (product.name if product else None) or (item.name if item else "") or ""

    results: list[SerialResult] = []
    seen_in_batch: set[str] = set()

    for raw in serial_numbers:
        cleaned = clean_serial(raw)
        if not cleaned:
            continue

        key = cleaned.lower()
        if key in seen_in_batch:
            results.append(SerialResult(cleaned, "duplicate", "Repeated in this batch"))
            continue
        seen_in_batch.add(key)

        existing = find_by_number(db, cleaned, company_id=company_id)
        if existing is not None:
            results.append(
                SerialResult(
                    cleaned,
                    "duplicate",
                    f"Already registered as {existing.sku or 'unknown SKU'} ({existing.status})",
                    serial_id=existing.id,
                )
            )
            continue

        row = InventorySerial(
            company_id=company_id,
            serial_number=cleaned,
            item_id=item.id if item else None,
            product_id=product.id if product else None,
            sku=resolved_sku,
            product_name=product_name,
            status="in_stock",
            warehouse_id=warehouse_id,
            source_type=source_type,
            source_id=source_id,
            supplier_id=supplier_id,
            received_at=received_at or datetime.utcnow(),
            notes=notes,
        )
        db.add(row)
        db.flush()
        results.append(SerialResult(cleaned, "created", serial_id=row.id))

    return results


def register_serials_or_raise(
    db: Session,
    serial_numbers: Iterable[str],
    **kwargs,
) -> list[SerialResult]:
    """Same as register_serials, but duplicates/rejects abort the whole receipt."""
    results = register_serials(db, serial_numbers, **kwargs)
    failed = [row for row in results if row.outcome != "created"]
    if failed:
        first = failed[0]
        raise HTTPException(
            status_code=400,
            detail=f"Serial number {first.serial_number} already exists in inventory.",
        )
    return results


def _require_transition(row: InventorySerial, target: str) -> None:
    if target not in SERIAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid serial status: {target}")
    allowed = SERIAL_STATUS_TRANSITIONS.get(row.status, frozenset())
    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"A {row.status} unit cannot become {target}.",
        )


def set_status(db: Session, row: InventorySerial, status: str) -> InventorySerial:
    if status == row.status:
        return row
    _require_transition(row, status)
    row.status = status
    db.flush()
    return row


def assign_to_order(
    db: Session,
    serial_numbers: Iterable[str],
    *,
    order_number: str,
    company_id: str = COMPANY_DEFAULT,
) -> list[SerialResult]:
    """Bind units to the sale they went out on and stamp warranty expiry."""
    order = (
        db.query(CommerceOrder).filter(CommerceOrder.order_number == order_number).first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail=f"No order found for {order_number}")

    purchased_on = order.created_at.date() if order.created_at else None
    results: list[SerialResult] = []

    for raw in serial_numbers:
        cleaned = clean_serial(raw)
        if not cleaned:
            continue

        row = find_by_number(db, cleaned, company_id=company_id)
        if row is None:
            results.append(SerialResult(cleaned, "rejected", "Not in the registry"))
            continue
        if row.status != "in_stock":
            results.append(
                SerialResult(cleaned, "rejected", f"Unit is {row.status}", serial_id=row.id)
            )
            continue

        product = None
        if row.sku:
            product = db.query(CatalogProduct).filter(CatalogProduct.sku == row.sku).first()
        from app.services.inventory.inventory_settings_service import warranty_anchor_date

        verdict = warranty_rules.evaluate(
            warranty_text=product.warranty if product else None,
            purchased_on=warranty_anchor_date(
                db, company_id, sold_on=purchased_on, received_at=row.received_at
            ),
        )

        row.status = "sold"
        row.sold_at = order.created_at or datetime.utcnow()
        row.order_id = order.id
        row.order_number = order.order_number
        row.customer_id = order.customer_id
        row.customer_name = order.customer_name or ""
        # Null means the warranty text could not be read — not "no warranty".
        row.warranty_expires_on = verdict.expires_on
        db.flush()
        results.append(SerialResult(cleaned, "created", "Marked sold", serial_id=row.id))

    return results


def validate_for_sale(
    db: Session,
    serial_numbers: Iterable[str],
    *,
    item: Item,
    company_id: str = COMPANY_DEFAULT,
    order_id: Optional[str] = None,
) -> list[str]:
    """Units named on a sales line: each must exist, be this item, and be in stock
    (or already sold on this very order — re-saving a confirmed order)."""
    cleaned: list[str] = []
    for raw in serial_numbers:
        number = clean_serial(raw)
        if not number or number.lower() in {c.lower() for c in cleaned}:
            continue
        row = find_by_number(db, number, company_id=company_id)
        if row is None:
            raise HTTPException(status_code=400, detail=f"Serial {number} is not registered in inventory")
        same_item = (row.item_id and row.item_id == item.id) or (
            row.sku and item.sku and row.sku.lower() == item.sku.lower()
        )
        if not same_item:
            raise HTTPException(
                status_code=400,
                detail=f"Serial {number} belongs to SKU {row.sku or '?'}, not {item.sku}",
            )
        on_this_order = bool(order_id) and row.order_id == order_id
        if row.status != "in_stock" and not on_this_order:
            label = SERIAL_STATUS_LABELS.get(row.status, row.status).lower()
            detail = f"Serial {number} is not in stock ({label}"
            if row.order_number and row.status == "sold":
                detail += f" on {row.order_number}"
            raise HTTPException(status_code=400, detail=detail + ")")
        cleaned.append(number)
    return cleaned


def assign_to_sales_order(
    db: Session,
    serial_numbers: Iterable[str],
    *,
    order,
    customer_name: str = "",
    skip_unavailable: bool = False,
) -> list[InventorySerial]:
    """Mark units sold on a sales order (the counter-sale flow), with warranty stamped
    from the product's warranty text. With `skip_unavailable`, units that are not in
    stock are left alone instead of failing the save (used to reconcile an order's
    lines with the registry on every edit)."""
    from app.services.inventory.inventory_settings_service import warranty_anchor_date

    sold_on = order.confirmed_at or order.created_at or datetime.utcnow()
    touched: list[InventorySerial] = []
    for raw in serial_numbers:
        number = clean_serial(raw)
        if not number:
            continue
        row = find_by_number(db, number, company_id=order.company_id or COMPANY_DEFAULT)
        if row is None:
            continue
        if row.status == "sold" and row.order_id == order.id:
            continue
        if row.status != "in_stock":
            if skip_unavailable:
                continue
            raise HTTPException(
                status_code=400,
                detail=f"Serial {number} is {SERIAL_STATUS_LABELS.get(row.status, row.status).lower()}",
            )
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == row.sku).first() if row.sku else None
        verdict = warranty_rules.evaluate(
            warranty_text=product.warranty if product else None,
            purchased_on=warranty_anchor_date(
                db, order.company_id or COMPANY_DEFAULT, sold_on=sold_on, received_at=row.received_at
            ),
        )
        row.status = "sold"
        row.sold_at = sold_on if isinstance(sold_on, datetime) else datetime.utcnow()
        row.order_id = order.id
        row.order_number = order.order_number
        row.customer_id = order.customer_id
        row.customer_name = customer_name or ""
        row.warranty_expires_on = verdict.expires_on
        touched.append(row)
    if touched:
        db.flush()
    return touched


def release_to_stock(
    db: Session,
    serial_numbers: Iterable[str],
    *,
    warehouse_id: Optional[str],
    note: str,
    company_id: str = COMPANY_DEFAULT,
) -> list[InventorySerial]:
    """A sold unit comes back (return / cancelled sale): in stock again at the
    given warehouse. The sale it came back from stays in the notes for the trace."""
    touched: list[InventorySerial] = []
    for raw in serial_numbers:
        number = clean_serial(raw)
        if not number:
            continue
        row = find_by_number(db, number, company_id=company_id)
        if row is None or row.status != "sold":
            continue
        history = f"Returned {datetime.utcnow():%Y-%m-%d} from {row.order_number or 'sale'}"
        if row.customer_name:
            history += f" ({row.customer_name})"
        history += f" — {note}"
        row.status = "in_stock"
        if warehouse_id:
            row.warehouse_id = warehouse_id
        row.notes = f"{(row.notes or '').rstrip()}\n{history}".strip()
        row.order_id = None
        row.order_number = None
        row.customer_id = None
        row.customer_name = ""
        row.sold_at = None
        touched.append(row)
    if touched:
        db.flush()
    return touched


def open_claim_for(db: Session, row: InventorySerial):
    """The live RMA holding this unit, if any. Imported lazily to avoid a cycle."""
    from app.models.rma import RmaTicket

    return (
        db.query(RmaTicket)
        .filter(
            RmaTicket.company_id == row.company_id,
            or_(RmaTicket.serial_number == row.serial_number, RmaTicket.received_serial_number == row.serial_number),
            RmaTicket.status.in_(OPEN_RMA_STATUSES),
        )
        .first()
    )


def attach_to_rma(db: Session, row: InventorySerial, *, rma_id: str) -> InventorySerial:
    """Hand the unit to a claim. Refuses if another claim already holds it."""
    blocking = open_claim_for(db, row)
    if blocking is not None and blocking.id != rma_id:
        raise HTTPException(
            status_code=409,
            detail=f"{row.serial_number} is already on open claim {blocking.rma_number}.",
        )

    if row.status != "in_service":
        _require_transition(row, "in_service")
        row.status = "in_service"
    row.rma_id = rma_id
    db.flush()
    return row


def release_from_rma(db: Session, row: InventorySerial, outcome: str) -> InventorySerial:
    """Let go of a unit when its claim ends.

    `returned` puts it back with the customer, `replaced` retires it in favour of
    a new unit, `scrapped` writes it off.
    """
    target = SERIAL_RMA_OUTCOMES.get(outcome)
    if target is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown outcome: {outcome} (expected {', '.join(SERIAL_RMA_OUTCOMES)})",
        )
    if row.status != "in_service":
        # Nothing to release — the unit was never handed over.
        return row

    # `rma_id` stays put either way — it is the claim this unit last went through.
    row.status = target
    db.flush()
    return row


@dataclass(frozen=True)
class SerialClaimContext:
    """Everything intake needs to judge a claim from a serial alone."""

    serial: InventorySerial
    verdict: warranty_rules.WarrantyVerdict
    purchased_on: Optional[date]
    open_claim: Optional[object] = None


def scan_code(
    db: Session, code: str, *, company_id: str = COMPANY_DEFAULT
) -> Optional[dict]:
    """Resolve a scanner dump — serial, item barcode, or SKU — to a product."""
    cleaned = (code or "").strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    serial = find_by_number(db, cleaned, company_id=company_id)
    item: Optional[Item] = None
    match = ""
    if serial:
        match = "serial"
        if serial.item_id:
            item = db.get(Item, serial.item_id)
        if item is None and serial.sku:
            item = (
                db.query(Item)
                .filter(Item.company_id == company_id, func.lower(Item.sku) == serial.sku.lower())
                .first()
            )
        if item is None:
            return {
                "item_id": serial.item_id,
                "sku": serial.sku or "",
                "name": serial.product_name or serial.sku or cleaned,
                "barcode": None,
                "serial_number": serial.serial_number,
                "serial_status": serial.status,
                "match": "serial",
            }
    if item is None:
        item = (
            db.query(Item)
            .filter(
                Item.company_id == company_id,
                or_(
                    and_(Item.barcode.isnot(None), func.lower(Item.barcode) == lowered),
                    func.lower(Item.sku) == lowered,
                ),
            )
            .first()
        )
        if item is None:
            return None
        match = "barcode" if (item.barcode or "").lower() == lowered else "sku"
    return {
        "item_id": item.id,
        "sku": item.sku,
        "name": item.name,
        "barcode": item.barcode,
        "serial_number": serial.serial_number if serial else None,
        "serial_status": serial.status if serial else None,
        "match": match or "sku",
    }


def lookup_for_claim(
    db: Session, serial_number: str, *, company_id: str = COMPANY_DEFAULT
) -> Optional[SerialClaimContext]:
    """Resolve a serial into its sale and warranty verdict.

    Returns None when the serial is unknown — an unregistered serial is not an
    error, it just means the claim has to fall back to the order number.
    """
    row = find_by_number(db, serial_number, company_id=company_id)
    if row is None:
        return None

    from app.services.inventory.inventory_settings_service import warranty_anchor_date

    purchased_on = warranty_anchor_date(
        db, row.company_id or COMPANY_DEFAULT, sold_on=row.sold_at, received_at=row.received_at
    )
    product = None
    if row.sku:
        product = db.query(CatalogProduct).filter(CatalogProduct.sku == row.sku).first()

    verdict = warranty_rules.evaluate(
        warranty_text=product.warranty if product else None,
        purchased_on=purchased_on,
    )
    return SerialClaimContext(
        serial=row,
        verdict=verdict,
        purchased_on=purchased_on,
        open_claim=open_claim_for(db, row),
    )


def dashboard(db: Session, *, company_id: str = COMPANY_DEFAULT) -> dict:
    rows = db.query(InventorySerial).filter(InventorySerial.company_id == company_id).all()
    counts = {status: 0 for status in SERIAL_STATUSES}
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1
    return {"total": len(rows), **counts}
