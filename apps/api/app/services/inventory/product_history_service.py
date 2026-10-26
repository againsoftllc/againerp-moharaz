"""Per-item history feeds for the product drawer.

Every feed is read-only and keyed by `items.id`. Nothing here recalculates
stock: the ledger balance is a running walk over the movement rows the stock
engine already wrote, and the document feeds read sales/purchase lines as-is.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_receipt import PurchaseReceipt
from app.models.purchase_return import PurchaseReturn
from app.models.rma import RmaTicket
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.sales_return import SalesReturn
from app.schemas.inventory.product_history import (
    LabelValue,
    PageMeta,
    ProductLedgerMeta,
    ProductLedgerResponse,
    ProductLedgerRow,
    ProductPriceMeta,
    ProductPriceResponse,
    ProductPriceRow,
    ProductPurchaseMeta,
    ProductPurchaseResponse,
    ProductPurchaseRow,
    ProductRmaResponse,
    ProductRmaRow,
    ProductSalesMeta,
    ProductSalesResponse,
    ProductSalesRow,
)
from app.services.collaboration.constants import (
    ACTIVITY_PRICE_CHANGE,
    ACTIVITY_UPDATED,
    ENTITY_TYPE_ITEM,
)
from app.services.inventory.constants import (
    INCOMING_HOLD_TYPES,
    ON_HAND_IN_TYPES,
    ON_HAND_OUT_TYPES,
    RESERVATION_RELEASE_TYPES,
    RESERVATION_TYPES,
)
from app.services.inventory.inventory_reports import (
    REPORT_ROW_CAP,
    _label,
    _money,
    _movement_day_expr,
)

SALES_COUNTED_STATUSES = ("confirmed", "processing", "completed")
PURCHASE_EXCLUDED_STATUSES = ("draft", "cancelled")

# Rows that never touch on-hand: holds and reservations. Everything else
# (including reversals and legacy types) is shown and contributes to the balance.
NON_ON_HAND_TYPES = frozenset(RESERVATION_TYPES | RESERVATION_RELEASE_TYPES | INCOMING_HOLD_TYPES)

# CatalogProduct fields that carry a price, as they appear in
# CollabActivity `updated` change sets. Adding a price kind = adding a line here.
PRICE_FIELDS: dict[str, tuple[str, str]] = {
    "price": ("selling", "Selling price"),
    "purchase_price": ("cost", "Cost price"),
    "compare_at_price": ("compare_at", "Compare-at price"),
    "last_selling_price": ("last_selling", "Last selling price"),
}
PRICE_TYPE_LABELS: dict[str, str] = {kind: label for kind, label in PRICE_FIELDS.values()}


def resolve_item(db: Session, *, company_id: str, item_id: str) -> Item:
    item = db.query(Item).filter(Item.id == item_id, Item.company_id == company_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _page_slice(page: int, per_page: int) -> tuple[int, int]:
    return (page - 1) * per_page, per_page


# ---- sales -----------------------------------------------------------------------


def sales_history(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    customer_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    per_page: int = 25,
) -> ProductSalesResponse:
    base = (
        db.query(SalesOrderLine)
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(
            SalesOrderLine.item_id == item_id,
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status.in_(SALES_COUNTED_STATUSES),
        )
    )
    if customer_id:
        base = base.filter(SalesOrder.customer_id == customer_id)
    if date_from:
        base = base.filter(SalesOrder.order_date >= date_from)
    if date_to:
        base = base.filter(SalesOrder.order_date <= date_to)

    total, sum_qty, sum_total = base.with_entities(
        func.count(SalesOrderLine.id),
        func.coalesce(func.sum(SalesOrderLine.quantity_ordered), 0),
        func.coalesce(func.sum(SalesOrderLine.line_total), 0),
    ).one()

    offset, limit = _page_slice(page, per_page)
    rows = (
        base.with_entities(SalesOrderLine, SalesOrder, CommerceCustomer.name)
        .outerjoin(CommerceCustomer, CommerceCustomer.id == SalesOrder.customer_id)
        .order_by(SalesOrder.order_date.desc(), SalesOrder.created_at.desc(), SalesOrderLine.line_number.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    data = [
        ProductSalesRow(
            id=line.id,
            date=order.order_date,
            order_id=order.id,
            order_number=order.order_number,
            invoice_number=order.invoice_number,
            customer_id=order.customer_id,
            customer_name=customer_name,
            quantity=int(line.quantity_ordered or 0),
            unit_price=_money(line.unit_price),
            line_total=_money(line.line_total),
            status=order.status,
        )
        for line, order, customer_name in rows
    ]
    return ProductSalesResponse(
        data=data,
        meta=ProductSalesMeta(
            total=int(total or 0),
            page=page,
            per_page=per_page,
            sum_qty=int(sum_qty or 0),
            sum_total=_money(sum_total),
        ),
    )


# ---- purchases ----------------------------------------------------------------------


def purchase_history(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    per_page: int = 25,
) -> ProductPurchaseResponse:
    base = (
        db.query(PurchaseOrderLine)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(
            PurchaseOrderLine.item_id == item_id,
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.notin_(PURCHASE_EXCLUDED_STATUSES),
        )
    )
    if date_from:
        base = base.filter(PurchaseOrder.order_date >= date_from)
    if date_to:
        base = base.filter(PurchaseOrder.order_date <= date_to)

    ordered_value = PurchaseOrderLine.quantity_ordered * PurchaseOrderLine.unit_cost
    total, sum_qty, sum_total = base.with_entities(
        func.count(PurchaseOrderLine.id),
        func.coalesce(func.sum(PurchaseOrderLine.quantity_ordered), 0),
        func.coalesce(func.sum(ordered_value), 0),
    ).one()

    # cheapest cost ignores free (0) lines, like the purchase price report
    min_cost, max_cost = base.with_entities(
        func.min(case((PurchaseOrderLine.unit_cost > 0, PurchaseOrderLine.unit_cost))),
        func.max(PurchaseOrderLine.unit_cost),
    ).one()
    avg_cost = (Decimal(sum_total or 0) / Decimal(sum_qty)) if sum_qty else None

    offset, limit = _page_slice(page, per_page)
    rows = (
        base.with_entities(PurchaseOrderLine, PurchaseOrder, CommerceSupplier.name)
        .outerjoin(CommerceSupplier, CommerceSupplier.id == PurchaseOrder.supplier_id)
        .order_by(PurchaseOrder.order_date.desc(), PurchaseOrder.created_at.desc(), PurchaseOrderLine.line_number.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    data = []
    for line, order, supplier_name in rows:
        qty = int(line.quantity_ordered or 0)
        unit_cost = _money(line.unit_cost)
        data.append(
            ProductPurchaseRow(
                id=line.id,
                date=order.order_date,
                po_id=order.id,
                po_number=order.po_number,
                supplier_id=order.supplier_id,
                supplier_name=supplier_name,
                quantity_ordered=qty,
                quantity_received=int(line.quantity_received or 0),
                unit_cost=unit_cost,
                line_total=_money(Decimal(qty) * unit_cost),
                status=order.status,
            )
        )
    return ProductPurchaseResponse(
        data=data,
        meta=ProductPurchaseMeta(
            total=int(total or 0),
            page=page,
            per_page=per_page,
            sum_qty=int(sum_qty or 0),
            sum_total=_money(sum_total),
            min_cost=_money(min_cost) if min_cost is not None else None,
            max_cost=_money(max_cost) if max_cost is not None and sum_qty else None,
            avg_cost=_money(avg_cost) if avg_cost is not None else None,
        ),
    )


# ---- stock ledger -------------------------------------------------------------------


def _signed_qty_expr():
    """On-hand delta of a movement row, by type.

    Reversals and retired legacy types carry no direction in their type, so
    they fall back to the row's own before/after delta.
    """
    qty = func.abs(InventoryStockMovement.quantity)
    return case(
        (InventoryStockMovement.movement_type.in_(ON_HAND_IN_TYPES), qty),
        (InventoryStockMovement.movement_type.in_(ON_HAND_OUT_TYPES), -qty),
        (InventoryStockMovement.movement_type.in_(NON_ON_HAND_TYPES), 0),
        else_=InventoryStockMovement.qty_after - InventoryStockMovement.qty_before,
    )


def _signed_qty(row: InventoryStockMovement) -> int:
    kind = row.movement_type
    qty = abs(int(row.quantity or 0))
    if kind in ON_HAND_IN_TYPES:
        return qty
    if kind in ON_HAND_OUT_TYPES:
        return -qty
    if kind in NON_ON_HAND_TYPES:
        return 0
    return int(row.qty_after or 0) - int(row.qty_before or 0)


def ledger_history(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    movement_type: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> ProductLedgerResponse:
    day = _movement_day_expr()
    scope = db.query(InventoryStockMovement).filter(
        InventoryStockMovement.company_id == company_id,
        InventoryStockMovement.item_id == item_id,
        InventoryStockMovement.movement_type.notin_(NON_ON_HAND_TYPES),
    )
    if warehouse_id:
        scope = scope.filter(InventoryStockMovement.warehouse_id == warehouse_id)

    # Closing balance comes from one aggregate over everything up to date_to, so
    # it stays right even when the walk below is capped or type-filtered.
    closing_q = scope.with_entities(func.coalesce(func.sum(_signed_qty_expr()), 0))
    if date_to:
        closing_q = closing_q.filter(day <= date_to)
    closing_balance = int(closing_q.scalar() or 0)

    ranged = scope
    if date_from:
        ranged = ranged.filter(day >= date_from)
    if date_to:
        ranged = ranged.filter(day <= date_to)
    # Newest rows first so the cap drops the oldest; walked forward below.
    walk_rows = (
        ranged.order_by(day.desc(), InventoryStockMovement.created_at.desc(), InventoryStockMovement.id.desc())
        .limit(REPORT_ROW_CAP)
        .all()
    )
    walk_rows.reverse()

    present_types = sorted({row.movement_type for row in walk_rows})
    opening_balance = closing_balance - sum(_signed_qty(row) for row in walk_rows)

    balance = opening_balance
    computed: list[tuple[InventoryStockMovement, int, int]] = []
    for row in walk_rows:
        delta = _signed_qty(row)
        balance += delta
        if movement_type and row.movement_type != movement_type:
            continue
        computed.append((row, delta, balance))
    computed.reverse()

    total = len(computed)
    offset, limit = _page_slice(page, per_page)
    page_rows = computed[offset : offset + limit]

    wh_ids = {row.warehouse_id for row, _d, _b in page_rows}
    wh_names: dict[str, str] = {}
    if wh_ids:
        for wh in db.query(InventoryWarehouse.id, InventoryWarehouse.name).filter(InventoryWarehouse.id.in_(wh_ids)).all():
            wh_names[wh.id] = wh.name

    # Party (customer/supplier) resolution — batched per source_type, mirroring
    # the join pattern sales_history()/purchase_history() already use, since
    # InventoryStockMovement itself carries no customer/supplier reference.
    party_names: dict[tuple[str, str], str] = {}
    ids_by_type: dict[str, set[str]] = {}
    for row, _delta, _bal in page_rows:
        if row.source_type and row.source_id:
            ids_by_type.setdefault(row.source_type, set()).add(row.source_id)

    sales_order_ids = ids_by_type.get("sales_order")
    if sales_order_ids:
        for oid, name in (
            db.query(SalesOrder.id, CommerceCustomer.name)
            .outerjoin(CommerceCustomer, CommerceCustomer.id == SalesOrder.customer_id)
            .filter(SalesOrder.id.in_(sales_order_ids))
            .all()
        ):
            if name:
                party_names[("sales_order", oid)] = name

    sales_return_ids = ids_by_type.get("sales_return")
    if sales_return_ids:
        for rid, name in (
            db.query(SalesReturn.id, CommerceCustomer.name)
            .outerjoin(CommerceCustomer, CommerceCustomer.id == SalesReturn.customer_id)
            .filter(SalesReturn.id.in_(sales_return_ids))
            .all()
        ):
            if name:
                party_names[("sales_return", rid)] = name

    purchase_receipt_ids = ids_by_type.get("purchase_receipt")
    if purchase_receipt_ids:
        for rid, name in (
            db.query(PurchaseReceipt.id, CommerceSupplier.name)
            .outerjoin(CommerceSupplier, CommerceSupplier.id == PurchaseReceipt.supplier_id)
            .filter(PurchaseReceipt.id.in_(purchase_receipt_ids))
            .all()
        ):
            if name:
                party_names[("purchase_receipt", rid)] = name

    purchase_return_ids = ids_by_type.get("purchase_return")
    if purchase_return_ids:
        for rid, name in (
            db.query(PurchaseReturn.id, CommerceSupplier.name)
            .outerjoin(CommerceSupplier, CommerceSupplier.id == PurchaseReturn.supplier_id)
            .filter(PurchaseReturn.id.in_(purchase_return_ids))
            .all()
        ):
            if name:
                party_names[("purchase_return", rid)] = name

    data = []
    for row, delta, running in page_rows:
        moved_on = row.posting_date or row.document_date
        if moved_on is None and isinstance(row.created_at, datetime):
            moved_on = row.created_at.date()
        data.append(
            ProductLedgerRow(
                id=row.id,
                date=moved_on,
                reference=row.reference,
                movement_type=row.movement_type,
                movement_label=_label(row.movement_type),
                direction="in" if delta >= 0 else "out",
                qty_in=delta if delta > 0 else 0,
                qty_out=-delta if delta < 0 else 0,
                balance=running,
                warehouse_id=row.warehouse_id,
                warehouse_name=wh_names.get(row.warehouse_id),
                source_type=row.source_type,
                source_id=row.source_id,
                party_name=(
                    party_names.get((row.source_type, row.source_id))
                    if row.source_type and row.source_id
                    else None
                ),
                notes=row.notes,
                created_at=row.created_at,
            )
        )
    return ProductLedgerResponse(
        data=data,
        meta=ProductLedgerMeta(
            total=total,
            page=page,
            per_page=per_page,
            opening_balance=opening_balance,
            closing_balance=closing_balance,
            movement_types=[LabelValue(value=kind, label=_label(kind)) for kind in present_types],
        ),
    )


# ---- RMA ------------------------------------------------------------------------------


def rma_history(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    page: int = 1,
    per_page: int = 25,
) -> ProductRmaResponse:
    product_id = (
        db.query(CatalogProduct.id).filter(CatalogProduct.item_id == item_id).scalar()
    )
    match = RmaTicket.item_id == item_id
    if product_id and product_id != item_id:
        match = match | (RmaTicket.product_id == product_id)
    query = db.query(RmaTicket).filter(RmaTicket.company_id == company_id, match)
    total = query.count()
    offset, limit = _page_slice(page, per_page)
    rows = query.order_by(RmaTicket.created_at.desc()).offset(offset).limit(limit).all()
    data = [
        ProductRmaRow(
            id=row.id,
            rma_number=row.rma_number,
            serial_number=row.serial_number,
            customer_name=row.customer_name,
            order_number=row.order_number,
            warranty_status=row.warranty_status,
            warranty_expires_on=row.warranty_expires_on,
            status=row.status,
            resolution_type=row.resolution_type,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return ProductRmaResponse(data=data, meta=PageMeta(total=total, page=page, per_page=per_page))


# ---- price history ----------------------------------------------------------------------


def _as_price(value: Any) -> Optional[Decimal]:
    if value is None or value == "" or value == "None":
        return None
    try:
        return _money(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


def _dedup_key(created_at: Optional[datetime], price_type: str) -> tuple[str, str]:
    stamp = created_at.replace(microsecond=0).isoformat() if isinstance(created_at, datetime) else ""
    return stamp, price_type


def price_history(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    page: int = 1,
    per_page: int = 25,
) -> ProductPriceResponse:
    activities = (
        db.query(CollabActivity)
        .filter(
            CollabActivity.entity_type == ENTITY_TYPE_ITEM,
            CollabActivity.entity_id == item_id,
            CollabActivity.company_id == company_id,
            CollabActivity.action.in_([ACTIVITY_PRICE_CHANGE, ACTIVITY_UPDATED]),
        )
        .order_by(CollabActivity.created_at.desc(), CollabActivity.id.desc())
        .limit(REPORT_ROW_CAP)
        .all()
    )

    # A product PATCH writes both a `price_change` and an `updated` activity in
    # the same transaction; keep the dedicated one and drop the duplicate field.
    seen: set[tuple[str, str]] = set()
    rows: list[dict[str, Any]] = []
    for act in activities:
        if act.action != ACTIVITY_PRICE_CHANGE:
            continue
        old, new = _as_price(act.old_value), _as_price(act.new_value)
        if old == new:
            continue
        seen.add(_dedup_key(act.created_at, "selling"))
        rows.append(
            {"id": act.id, "date": act.created_at, "price_type": "selling", "old": old, "new": new, "by": act.performed_by}
        )
    for act in activities:
        if act.action != ACTIVITY_UPDATED:
            continue
        try:
            changes = (json.loads(act.details_json or "{}") or {}).get("changes") or {}
        except (TypeError, ValueError):
            continue
        for field, (price_type, _label_text) in PRICE_FIELDS.items():
            change = changes.get(field)
            if not isinstance(change, dict):
                continue
            old, new = _as_price(change.get("old")), _as_price(change.get("new"))
            if old == new:
                continue
            key = _dedup_key(act.created_at, price_type)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {"id": f"{act.id}:{field}", "date": act.created_at, "price_type": price_type, "old": old, "new": new, "by": act.performed_by}
            )

    rows.sort(key=lambda r: (r["date"] or datetime.min, r["id"]), reverse=True)
    present = sorted({r["price_type"] for r in rows}, key=lambda k: list(PRICE_TYPE_LABELS).index(k) if k in PRICE_TYPE_LABELS else 99)

    total = len(rows)
    offset, limit = _page_slice(page, per_page)
    page_rows = rows[offset : offset + limit]

    user_ids = {r["by"] for r in page_rows if r["by"]}
    user_names: dict[str, str] = {}
    if user_ids:
        for uid, name in db.query(AuthUser.id, AuthUser.name).filter(AuthUser.id.in_(user_ids)).all():
            user_names[uid] = name

    data = [
        ProductPriceRow(
            id=r["id"],
            date=r["date"],
            price_type=r["price_type"],
            price_label=PRICE_TYPE_LABELS.get(r["price_type"], r["price_type"].replace("_", " ").title()),
            old_price=r["old"],
            new_price=r["new"],
            changed_by_name=user_names.get(r["by"]) if r["by"] else None,
        )
        for r in page_rows
    ]
    return ProductPriceResponse(
        data=data,
        meta=ProductPriceMeta(
            total=total,
            page=page,
            per_page=per_page,
            price_types=[LabelValue(value=kind, label=PRICE_TYPE_LABELS.get(kind, kind)) for kind in present],
        ),
    )
