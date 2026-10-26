"""Read-side serialisation for purchase orders and receipts.

PurchaseOrderService owns all the writes; this module only joins the display
names the admin grids need so they don't have to make extra requests.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_item import InventoryItem
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatusHistory
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine
from app.models.finance import FinancePayable
from app.models.purchase_return import PurchaseReturn, PurchaseReturnLine
from app.schemas.purchase.order import (
    PurchaseOrderLineRead,
    PurchaseOrderRead,
    PurchaseReceiptLineRead,
    PurchaseReceiptRead,
    PurchaseStatusHistoryRead,
)
from app.schemas.purchase.return_ import PurchaseReturnLineRead, PurchaseReturnRead
from app.services.inventory.constants import tracking_type_of


def _line_serials(line: PurchaseReceiptLine) -> list[str]:
    try:
        value = json.loads(line.serials_json or "[]")
    except json.JSONDecodeError:
        return []
    return [str(v) for v in value] if isinstance(value, list) else []


def _name_maps(
    db: Session, supplier_ids: set[str], warehouse_ids: set[str]
) -> tuple[dict[str, str], dict[str, str]]:
    suppliers: dict[str, str] = {}
    if supplier_ids:
        suppliers = {
            s.id: s.name
            for s in db.query(CommerceSupplier)
            .filter(CommerceSupplier.id.in_(supplier_ids))
            .all()
        }
    warehouses: dict[str, str] = {}
    if warehouse_ids:
        warehouses = {
            w.id: w.name
            for w in db.query(InventoryWarehouse)
            .filter(InventoryWarehouse.id.in_(warehouse_ids))
            .all()
        }
    return suppliers, warehouses


def _user_names(db: Session, user_ids: set[str]) -> dict[str, str]:
    user_ids = {uid for uid in user_ids if uid}
    if not user_ids:
        return {}
    return {u.id: u.name for u in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all()}


def _payment_status_map(
    db: Session, order_ids: set[str]
) -> dict[str, tuple[str, Decimal]]:
    """PO -> (payment_status, payment_due), via its receipt(s)' FinancePayable.

    A PO has no payable of its own — billing is posted against the goods
    receipt(s) raised from it, so this hops PO -> PurchaseReceipt -> payable.
    A PO with no receipt yet (nothing billed) is reported as "not_billed".
    """
    if not order_ids:
        return {}
    receipts = (
        db.query(PurchaseReceipt.id, PurchaseReceipt.purchase_order_id)
        .filter(PurchaseReceipt.purchase_order_id.in_(order_ids))
        .all()
    )
    receipt_to_order = {r.id: r.purchase_order_id for r in receipts}
    if not receipt_to_order:
        return {}
    payables = (
        db.query(FinancePayable.source_id, FinancePayable.status, FinancePayable.amount, FinancePayable.balance)
        .filter(
            FinancePayable.source_type == "purchase_receipt",
            FinancePayable.source_id.in_(receipt_to_order.keys()),
        )
        .all()
    )
    by_order: dict[str, dict] = {}
    for source_id, status, amount, balance in payables:
        order_id = receipt_to_order.get(source_id)
        if not order_id:
            continue
        bucket = by_order.setdefault(order_id, {"amount": 0, "balance": 0})
        bucket["amount"] += amount or 0
        bucket["balance"] += balance or 0
    result: dict[str, tuple[str, Decimal]] = {}
    for order_id, bucket in by_order.items():
        amount, balance = bucket["amount"], bucket["balance"]
        if balance <= 0:
            status_label = "paid"
        elif balance >= amount:
            status_label = "unpaid"
        else:
            status_label = "partial"
        result[order_id] = (status_label, balance)
    return result


def _tracking_map(db: Session, item_ids: set[str]) -> dict[str, str]:
    if not item_ids:
        return {}
    rows = db.query(InventoryItem).filter(InventoryItem.item_id.in_(item_ids)).all()
    return {
        row.item_id: tracking_type_of(bool(row.track_serial), bool(row.track_batch))
        for row in rows
    }


def line_to_read(line: PurchaseOrderLine, tracking_type: str = "none") -> PurchaseOrderLineRead:
    remaining = max(0, line.quantity_ordered - line.quantity_received)
    return PurchaseOrderLineRead(
        id=line.id,
        item_id=line.item_id,
        supplier_id=line.supplier_id,
        line_number=line.line_number,
        sku=line.sku,
        name=line.name,
        quantity_ordered=line.quantity_ordered,
        quantity_received=line.quantity_received,
        quantity_remaining=remaining,
        quantity_returned=line.quantity_returned,
        tracking_type=tracking_type,
        unit_cost=line.unit_cost,
        tax_rate=line.tax_rate,
        tax_amount=line.tax_amount,
        discount_amount=line.discount_amount,
        line_total=line.line_total,
        notes=line.notes,
    )


def order_to_read(
    db: Session,
    order: PurchaseOrder,
    supplier_names: Optional[dict[str, str]] = None,
    warehouse_names: Optional[dict[str, str]] = None,
    user_names: Optional[dict[str, str]] = None,
    payment_map: Optional[dict[str, tuple[str, Decimal]]] = None,
) -> PurchaseOrderRead:
    if supplier_names is None or warehouse_names is None:
        supplier_names, warehouse_names = _name_maps(
            db, {order.supplier_id}, {order.warehouse_id}
        )
    if user_names is None:
        user_names = _user_names(
            db, {order.created_by, order.confirmed_by, order.cancelled_by}
        )
    if payment_map is None:
        payment_map = _payment_status_map(db, {order.id})
    payment_status, payment_due = payment_map.get(order.id, ("not_billed", Decimal("0")))
    lines = (
        db.query(PurchaseOrderLine)
        .filter(PurchaseOrderLine.purchase_order_id == order.id)
        .order_by(PurchaseOrderLine.line_number.asc())
        .all()
    )
    tracking = _tracking_map(db, {l.item_id for l in lines})
    return PurchaseOrderRead(
        id=order.id,
        company_id=order.company_id,
        po_number=order.po_number,
        supplier_id=order.supplier_id,
        supplier_name=supplier_names.get(order.supplier_id),
        warehouse_id=order.warehouse_id,
        warehouse_name=warehouse_names.get(order.warehouse_id),
        status=order.status,
        order_date=order.order_date,
        expected_date=order.expected_date,
        buyer_name=order.buyer_name,
        notes=order.notes,
        subtotal=order.subtotal,
        tax_total=order.tax_total,
        discount_total=order.discount_total,
        total=order.total,
        allow_over_receive=order.allow_over_receive,
        payment_status=payment_status,
        payment_due=payment_due,
        created_by=order.created_by,
        created_by_name=user_names.get(order.created_by) or "Default",
        confirmed_by=order.confirmed_by,
        confirmed_by_name=user_names.get(order.confirmed_by),
        confirmed_at=order.confirmed_at,
        cancelled_by=order.cancelled_by,
        cancelled_by_name=user_names.get(order.cancelled_by),
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        lines=[line_to_read(l, tracking.get(l.item_id, "none")) for l in lines],
    )


def orders_to_read(db: Session, orders: Sequence[PurchaseOrder]) -> list[PurchaseOrderRead]:
    supplier_names, warehouse_names = _name_maps(
        db, {o.supplier_id for o in orders}, {o.warehouse_id for o in orders}
    )
    user_ids = {uid for o in orders for uid in (o.created_by, o.confirmed_by, o.cancelled_by)}
    user_names = _user_names(db, user_ids)
    payment_map = _payment_status_map(db, {o.id for o in orders})
    return [
        order_to_read(db, o, supplier_names, warehouse_names, user_names, payment_map)
        for o in orders
    ]


def history_to_read(rows: Sequence[PurchaseOrderStatusHistory]) -> list[PurchaseStatusHistoryRead]:
    return [
        PurchaseStatusHistoryRead(
            id=r.id,
            from_status=r.from_status,
            to_status=r.to_status,
            changed_by=r.changed_by,
            notes=r.notes,
            created_at=r.created_at,
        )
        for r in rows
    ]


def receipt_to_read(db: Session, receipt: PurchaseReceipt) -> PurchaseReceiptRead:
    supplier_names, warehouse_names = _name_maps(
        db, {receipt.supplier_id}, {receipt.warehouse_id}
    )
    lines = (
        db.query(PurchaseReceiptLine)
        .filter(PurchaseReceiptLine.purchase_receipt_id == receipt.id)
        .all()
    )
    item_ids = {l.item_id for l in lines if l.item_id}
    items = (
        {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids
        else {}
    )
    order = db.get(PurchaseOrder, receipt.purchase_order_id)
    user_names = _user_names(db, {receipt.posted_by})

    return PurchaseReceiptRead(
        id=receipt.id,
        company_id=receipt.company_id,
        receipt_number=receipt.receipt_number,
        purchase_order_id=receipt.purchase_order_id,
        po_number=order.po_number if order else None,
        supplier_id=receipt.supplier_id,
        supplier_name=supplier_names.get(receipt.supplier_id),
        warehouse_id=receipt.warehouse_id,
        warehouse_name=warehouse_names.get(receipt.warehouse_id),
        status=receipt.status,
        receive_type=receipt.receive_type,
        receipt_date=receipt.receipt_date,
        received_by=receipt.received_by,
        posted_by=receipt.posted_by,
        posted_by_name=user_names.get(receipt.posted_by) or "Default",
        notes=receipt.notes,
        posted_at=receipt.posted_at,
        created_at=receipt.created_at,
        updated_at=receipt.updated_at,
        lines=[
            PurchaseReceiptLineRead(
                id=l.id,
                purchase_order_line_id=l.purchase_order_line_id,
                item_id=l.item_id,
                sku=items[l.item_id].sku if l.item_id in items else None,
                name=items[l.item_id].name if l.item_id in items else None,
                quantity_received=l.quantity_received,
                serial_numbers=_line_serials(l),
                notes=l.notes,
            )
            for l in lines
        ],
    )


def receipts_to_read(db: Session, rows: Sequence[PurchaseReceipt]) -> list[PurchaseReceiptRead]:
    return [receipt_to_read(db, r) for r in rows]


def return_to_read(db: Session, ret: PurchaseReturn) -> PurchaseReturnRead:
    supplier_names, warehouse_names = _name_maps(db, {ret.supplier_id}, {ret.warehouse_id})
    lines = (
        db.query(PurchaseReturnLine)
        .filter(PurchaseReturnLine.purchase_return_id == ret.id)
        .all()
    )
    item_ids = {l.item_id for l in lines if l.item_id}
    items = (
        {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids)).all()}
        if item_ids
        else {}
    )
    order = db.get(PurchaseOrder, ret.purchase_order_id)
    receipt = db.get(PurchaseReceipt, ret.purchase_receipt_id) if ret.purchase_receipt_id else None

    return PurchaseReturnRead(
        id=ret.id,
        company_id=ret.company_id,
        return_number=ret.return_number,
        purchase_order_id=ret.purchase_order_id,
        po_number=order.po_number if order else None,
        purchase_receipt_id=ret.purchase_receipt_id,
        receipt_number=receipt.receipt_number if receipt else None,
        supplier_id=ret.supplier_id,
        supplier_name=supplier_names.get(ret.supplier_id),
        warehouse_id=ret.warehouse_id,
        warehouse_name=warehouse_names.get(ret.warehouse_id),
        status=ret.status,
        reason=ret.reason,
        return_date=ret.return_date,
        requested_by=ret.requested_by,
        notes=ret.notes,
        subtotal=ret.subtotal,
        tax_amount=ret.tax_amount,
        credit_amount=ret.credit_amount,
        payable_id=ret.payable_id,
        approved_at=ret.approved_at,
        credited_at=ret.credited_at,
        rejected_at=ret.rejected_at,
        cancelled_at=ret.cancelled_at,
        created_at=ret.created_at,
        updated_at=ret.updated_at,
        lines=[
            PurchaseReturnLineRead(
                id=l.id,
                purchase_order_line_id=l.purchase_order_line_id,
                item_id=l.item_id,
                sku=items[l.item_id].sku if l.item_id in items else None,
                name=items[l.item_id].name if l.item_id in items else None,
                quantity_returned=l.quantity_returned,
                unit_cost=l.unit_cost,
                tax_rate=l.tax_rate,
                line_total=(l.unit_cost * l.quantity_returned) * (1 + l.tax_rate / 100),
                reason=l.reason,
                notes=l.notes,
                serial_numbers=_json_list(l.serials_json),
            )
            for l in lines
        ],
    )


def _json_list(raw: Optional[str]) -> list[str]:
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def returns_to_read(db: Session, rows: Sequence[PurchaseReturn]) -> list[PurchaseReturnRead]:
    return [return_to_read(db, r) for r in rows]
