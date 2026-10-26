"""Read-only inventory reports derived from stock levels and the movement ledger."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, case, cast, func
from sqlalchemy.orm import Session

from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceExpense
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.purchase_return import PurchaseReturn
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.sales_return import SalesReturn
from app.models.supplier_link import SupplierLink
from app.schemas.inventory.reports import (
    MovementSummaryLine,
    MovementSummaryMeta,
    MovementTypeBucket,
    OnHandLine,
    OnHandMeta,
    ProductReportItem,
    ProductReportListMeta,
    ProductReportListResponse,
    ProductReportMeta,
    ProductReportResponse,
    ProductReportRow,
    ProductReportStock,
    ProductReportTotals,
    ProductReportWarehouseStock,
    ProfitBreakdownMeta,
    ProfitBreakdownRow,
    ProfitLossReportResponse,
    SerialReportLine,
    SerialReportMeta,
    ValuationGroup,
    ValuationLine,
    ValuationMeta,
    ValuationSupplierGroup,
)
from app.services.inventory.constants import (
    INCOMING_HOLD_TYPES,
    MOVEMENT_PURCHASE_RECEIPT,
    ON_HAND_IN_TYPES,
    ON_HAND_OUT_TYPES,
    RESERVATION_RELEASE_TYPES,
    RESERVATION_TYPES,
)
from app.services.inventory.stock_level_service import movements_to_read, to_read_many
from app.services.inventory.stock_movement_service import movement_effect

# Rows that never touch on-hand: holds and reservations (same set used by the
# per-item ledger in product_history_service.py).
NON_ON_HAND_TYPES = frozenset(RESERVATION_TYPES | RESERVATION_RELEASE_TYPES | INCOMING_HOLD_TYPES)

# Confirmed/processed statuses only — draft and cancelled documents don't
# represent real purchase/sales activity yet.
PL_SALES_COUNTED_STATUSES = ("confirmed", "processing", "completed")
PL_PURCHASE_EXCLUDED_STATUSES = ("draft", "cancelled")
PL_EXPENSE_COUNTED_STATUSES = ("approved", "paid")

REPORT_ROW_CAP = 8000
MONEY = Decimal("0.01")

MOVEMENT_LABELS: dict[str, str] = {
    "purchase_receipt": "Purchase receipt",
    "purchase_return": "Purchase return",
    "sales_delivery": "Sales delivery",
    "pos_sale": "POS sale",
    "pos_return": "POS return",
    "commerce_sale": "Commerce sale",
    "transfer_out": "Transfer out",
    "transfer_in": "Transfer in",
    "transfer_in_transit": "In transit",
    "stock_adjustment_in": "Adjustment in",
    "stock_adjustment_out": "Adjustment out",
    "stock_count_in": "Count in",
    "stock_count_out": "Count out",
    "opening_stock": "Opening stock",
    "opening": "Opening stock",
    "customer_return": "Customer return",
    "rma_replacement": "RMA replacement",
    "scrap": "Scrap",
    "service_consumption": "Service consumption",
    "reservation": "Reservation",
    "reserve": "Reservation",
    "reservation_release": "Reservation release",
    "release": "Reservation release",
    "reversal": "Reversal",
    "in": "Stock in",
    "out": "Stock out",
    "transfer": "Transfer",
    "adjustment": "Adjustment",
}


def _label(movement_type: str) -> str:
    return MOVEMENT_LABELS.get(movement_type, movement_type.replace("_", " ").title())


def _stock_query(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(InventoryStockLevel).filter(InventoryStockLevel.company_id == company_id)
    if warehouse_id:
        query = query.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    if status:
        query = query.filter(InventoryStockLevel.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (InventoryStockLevel.sku.ilike(like)) | (InventoryStockLevel.name.ilike(like))
        )
    return query.order_by(InventoryStockLevel.name.asc()).limit(REPORT_ROW_CAP).all()


def on_hand_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> tuple[list[OnHandLine], OnHandMeta]:
    rows = _stock_query(
        db, company_id=company_id, warehouse_id=warehouse_id, status=status, q=q
    )
    reads = to_read_many(db, rows)
    lines = [
        OnHandLine(
            id=row.id,
            sku=row.sku,
            name=row.name,
            warehouse_id=row.warehouse_id,
            warehouse_name=row.warehouse_name,
            on_hand=row.on_hand,
            reserved=row.reserved,
            available=row.available,
            incoming=row.incoming,
            unit_cost=row.unit_cost,
            stock_value=row.stock_value,
            status=row.status,
        )
        for row in reads
    ]
    meta = OnHandMeta(
        count=len(lines),
        total_units=sum(line.on_hand for line in lines),
        total_value=sum((line.stock_value for line in lines), Decimal("0")),
        reserved_units=sum(line.reserved for line in lines),
        available_units=sum(line.available for line in lines),
        low_stock_count=sum(1 for line in lines if line.status == "low_stock"),
        out_of_stock_count=sum(1 for line in lines if line.status == "out_of_stock"),
    )
    return lines, meta


def _money(value: Decimal | int | float | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY)


def _sale_price_map(db: Session, rows: list[InventoryStockLevel]) -> dict[str, Decimal]:
    """Selling price per stock line: variant price if set, else catalog default price."""
    product_ids = {row.product_id for row in rows if row.product_id}
    variant_ids = {row.variant_id for row in rows if row.variant_id}
    products: dict[str, Decimal] = {}
    if product_ids:
        for product in db.query(CatalogProduct).filter(CatalogProduct.id.in_(product_ids)).all():
            products[product.id] = _money(product.price)
    variants: dict[str, Decimal] = {}
    if variant_ids:
        for variant in (
            db.query(CatalogProductVariant).filter(CatalogProductVariant.id.in_(variant_ids)).all()
        ):
            variants[variant.id] = _money(variant.price)
    prices: dict[str, Decimal] = {}
    for row in rows:
        variant_price = variants.get(row.variant_id or "", Decimal("0"))
        product_price = products.get(row.product_id or "", Decimal("0"))
        prices[row.id] = variant_price if variant_price > 0 else product_price
    return prices


def _supplier_map(db: Session, item_ids: set[str]) -> dict[str, tuple[str, str]]:
    """Preferred supplier link first; otherwise the latest purchase-order supplier."""
    if not item_ids:
        return {}
    links = (
        db.query(SupplierLink.item_id, CommerceSupplier.id, CommerceSupplier.name)
        .join(CommerceSupplier, CommerceSupplier.id == SupplierLink.supplier_id)
        .filter(SupplierLink.item_id.in_(item_ids))
        .order_by(
            SupplierLink.is_preferred.desc(),
            SupplierLink.sort_order.asc(),
            CommerceSupplier.name.asc(),
        )
        .all()
    )
    out: dict[str, tuple[str, str]] = {}
    for item_id, supplier_id, supplier_name in links:
        if item_id not in out:
            out[item_id] = (supplier_id, supplier_name)

    missing = {item_id for item_id in item_ids if item_id not in out}
    if missing:
        po_rows = (
            db.query(PurchaseOrderLine.item_id, PurchaseOrder.supplier_id, CommerceSupplier.name)
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .join(CommerceSupplier, CommerceSupplier.id == PurchaseOrder.supplier_id)
            .filter(PurchaseOrderLine.item_id.in_(missing))
            .order_by(PurchaseOrder.order_date.desc(), PurchaseOrder.created_at.desc())
            .all()
        )
        for item_id, supplier_id, supplier_name in po_rows:
            if item_id not in out:
                out[item_id] = (supplier_id, supplier_name)
    return out


def _empty_supplier_group(
    supplier_id: Optional[str], supplier_name: Optional[str]
) -> ValuationSupplierGroup:
    return ValuationSupplierGroup(
        id=supplier_id or "none",
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        sku_count=0,
        units=0,
        value=Decimal("0"),
        sales_value=Decimal("0"),
        profit=Decimal("0"),
    )


def valuation_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
) -> tuple[list[ValuationLine], list[ValuationGroup], list[ValuationSupplierGroup], ValuationMeta]:
    rows = _stock_query(db, company_id=company_id, warehouse_id=warehouse_id, q=q)
    reads = to_read_many(db, rows)
    sale_prices = _sale_price_map(db, rows)
    suppliers = _supplier_map(db, {row.item_id for row in rows if row.item_id})
    lines: list[ValuationLine] = []
    for row in reads:
        if row.on_hand == 0:
            continue
        sale_price = sale_prices.get(row.id, Decimal("0"))
        sales_value = _money(sale_price * row.on_hand) if sale_price > 0 else Decimal("0")
        stock_value = _money(row.stock_value)
        profit = _money(sales_value - stock_value) if sale_price > 0 else Decimal("0")
        supplier_id, supplier_name = suppliers.get(row.item_id or "", (None, None))
        lines.append(
            ValuationLine(
                id=row.id,
                sku=row.sku,
                name=row.name,
                warehouse_id=row.warehouse_id,
                warehouse_name=row.warehouse_name,
                supplier_id=supplier_id,
                supplier_name=supplier_name,
                on_hand=row.on_hand,
                unit_cost=row.unit_cost,
                stock_value=stock_value,
                sale_price=sale_price,
                sales_value=sales_value,
                profit=profit,
            )
        )
    grouped: dict[str, ValuationGroup] = {}
    by_supplier: dict[str, ValuationSupplierGroup] = {}
    for line in lines:
        bucket = grouped.get(line.warehouse_id)
        if bucket is None:
            bucket = ValuationGroup(
                warehouse_id=line.warehouse_id,
                warehouse_name=line.warehouse_name,
                sku_count=0,
                units=0,
                value=Decimal("0"),
                sales_value=Decimal("0"),
                profit=Decimal("0"),
            )
            grouped[line.warehouse_id] = bucket
        bucket.sku_count += 1
        bucket.units += line.on_hand
        bucket.value += line.stock_value
        bucket.sales_value += line.sales_value
        bucket.profit += line.profit

        supplier_key = line.supplier_id or ""
        supplier_bucket = by_supplier.get(supplier_key)
        if supplier_bucket is None:
            supplier_bucket = _empty_supplier_group(line.supplier_id, line.supplier_name)
            by_supplier[supplier_key] = supplier_bucket
        supplier_bucket.sku_count += 1
        supplier_bucket.units += line.on_hand
        supplier_bucket.value += line.stock_value
        supplier_bucket.sales_value += line.sales_value
        supplier_bucket.profit += line.profit

    groups = sorted(grouped.values(), key=lambda g: g.warehouse_name or "")
    supplier_groups = sorted(
        by_supplier.values(),
        key=lambda g: (-g.value, (g.supplier_name or "zzzz").lower()),
    )
    meta = ValuationMeta(
        count=len(lines),
        total_units=sum(line.on_hand for line in lines),
        total_value=sum((line.stock_value for line in lines), Decimal("0")),
        total_sales_value=sum((line.sales_value for line in lines), Decimal("0")),
        total_profit=sum((line.profit for line in lines), Decimal("0")),
        warehouse_count=len(groups),
        supplier_count=sum(1 for g in supplier_groups if g.supplier_id),
        missing_price_count=sum(1 for line in lines if line.sale_price <= 0),
        unassigned_supplier_count=sum(1 for line in lines if not line.supplier_id),
    )
    return lines, groups, supplier_groups, meta


def supplier_valuation_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
) -> tuple[list[ValuationSupplierGroup], ValuationMeta]:
    _, _, by_supplier, meta = valuation_report(
        db, company_id=company_id, warehouse_id=warehouse_id
    )
    return by_supplier, meta


def _movement_day_expr():
    return func.coalesce(
        InventoryStockMovement.posting_date,
        InventoryStockMovement.document_date,
        cast(InventoryStockMovement.created_at, Date),
    )


def movement_summary_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> tuple[list[MovementSummaryLine], list[MovementTypeBucket], MovementSummaryMeta]:
    day = _movement_day_expr()
    query = db.query(InventoryStockMovement).filter(
        InventoryStockMovement.company_id == company_id
    )
    if warehouse_id:
        query = query.filter(InventoryStockMovement.warehouse_id == warehouse_id)
    if date_from:
        query = query.filter(day >= date_from)
    if date_to:
        query = query.filter(day <= date_to)

    total = query.count()
    rows = (
        query.order_by(InventoryStockMovement.created_at.desc())
        .limit(REPORT_ROW_CAP)
        .all()
    )
    reads = movements_to_read(db, rows)

    buckets: dict[str, MovementTypeBucket] = {}
    qty_in = 0
    qty_out = 0
    lines: list[MovementSummaryLine] = []

    for row, read in zip(rows, reads):
        kind = row.movement_type
        try:
            effect = movement_effect(kind)
        except Exception:
            effect = "other"
        qty = abs(int(row.quantity or 0))
        bucket = buckets.get(kind)
        if bucket is None:
            bucket = MovementTypeBucket(
                movement_type=kind,
                movement_label=_label(kind),
                count=0,
                qty_in=0,
                qty_out=0,
            )
            buckets[kind] = bucket
        bucket.count += 1
        if effect == "on_hand_in":
            bucket.qty_in += qty
            qty_in += qty
        elif effect == "on_hand_out":
            bucket.qty_out += qty
            qty_out += qty

        moved_on = row.posting_date or row.document_date
        if moved_on is None and row.created_at:
            moved_on = row.created_at.date() if isinstance(row.created_at, datetime) else None

        lines.append(
            MovementSummaryLine(
                id=row.id,
                moved_on=moved_on,
                movement_type=kind,
                movement_label=_label(kind),
                effect=effect,
                sku=read.sku,
                name=read.name,
                warehouse_name=read.warehouse_name,
                quantity=int(row.quantity or 0),
                qty_before=int(row.qty_before or 0),
                qty_after=int(row.qty_after or 0),
                reference=row.reference,
                created_at=row.created_at,
            )
        )

    by_type = sorted(buckets.values(), key=lambda b: (-(b.qty_in + b.qty_out), b.movement_label))
    meta = MovementSummaryMeta(
        count=len(lines),
        total=total,
        qty_in=qty_in,
        qty_out=qty_out,
        date_from=date_from,
        date_to=date_to,
    )
    return lines, by_type, meta


def product_report(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    warehouse_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> ProductReportResponse:
    """One product end to end: stock now, movement ledger, sales/returns, profit."""
    from fastapi import HTTPException

    from app.models.item import Item
    from app.models.sales import SalesOrder, SalesOrderLine
    from app.models.sales_return import SalesReturn, SalesReturnLine
    from app.services.inventory.constants import (
        MOVEMENT_COMMERCE_SALE,
        MOVEMENT_CUSTOMER_RETURN,
        MOVEMENT_POS_RETURN,
        MOVEMENT_POS_SALE,
        MOVEMENT_PURCHASE_RECEIPT,
        MOVEMENT_PURCHASE_RETURN,
        MOVEMENT_SALES_DELIVERY,
        MOVEMENT_SCRAP,
        MOVEMENT_STOCK_ADJUSTMENT_IN,
        MOVEMENT_STOCK_ADJUSTMENT_OUT,
        MOVEMENT_STOCK_COUNT_IN,
        MOVEMENT_STOCK_COUNT_OUT,
    )

    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    product = db.query(CatalogProduct).filter(CatalogProduct.item_id == item_id).first()
    cost = _money(product.purchase_price) if product and product.purchase_price is not None else Decimal("0")
    sale = _money(product.price) if product else Decimal("0")
    supplier = _supplier_map(db, {item_id}).get(item_id)

    # ---- stock now -----------------------------------------------------------
    stock_q = db.query(InventoryStockLevel).filter(InventoryStockLevel.item_id == item_id)
    if warehouse_id:
        stock_q = stock_q.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    stock_rows = stock_q.all()
    wh_ids = {row.warehouse_id for row in stock_rows}
    wh_names: dict[str, str] = {}
    if wh_ids:
        for wh in db.query(InventoryWarehouse).filter(InventoryWarehouse.id.in_(wh_ids)).all():
            wh_names[wh.id] = wh.name
    per_wh: dict[str, ProductReportWarehouseStock] = {}
    for row in stock_rows:
        bucket = per_wh.get(row.warehouse_id)
        if bucket is None:
            bucket = ProductReportWarehouseStock(
                warehouse_id=row.warehouse_id,
                warehouse_name=wh_names.get(row.warehouse_id),
                on_hand=0,
                reserved=0,
            )
            per_wh[row.warehouse_id] = bucket
        bucket.on_hand += int(row.on_hand or 0)
        bucket.reserved += int(row.reserved or 0)
    on_hand = sum(b.on_hand for b in per_wh.values())
    reserved = sum(b.reserved for b in per_wh.values())
    stock = ProductReportStock(
        on_hand=on_hand,
        reserved=reserved,
        available=on_hand - reserved,
        cost_value=_money(Decimal(on_hand) * cost),
        sale_value=_money(Decimal(on_hand) * sale),
        warehouses=sorted(per_wh.values(), key=lambda b: b.warehouse_name or b.warehouse_id),
    )

    # ---- movement ledger --------------------------------------------------------
    day = _movement_day_expr()
    mq = db.query(InventoryStockMovement).filter(
        InventoryStockMovement.company_id == company_id,
        InventoryStockMovement.item_id == item_id,
    )
    if warehouse_id:
        mq = mq.filter(InventoryStockMovement.warehouse_id == warehouse_id)
    if date_from:
        mq = mq.filter(day >= date_from)
    if date_to:
        mq = mq.filter(day <= date_to)
    movement_total = mq.count()
    rows = mq.order_by(InventoryStockMovement.created_at.desc()).limit(REPORT_ROW_CAP).all()
    reads = movements_to_read(db, rows)

    purchased_qty = 0
    purchased_value = Decimal("0")
    purchase_return_qty = 0
    delivered_qty = 0
    adjustment_in = 0
    adjustment_out = 0
    other_in = 0
    other_out = 0
    buckets: dict[str, MovementTypeBucket] = {}
    lines: list[MovementSummaryLine] = []
    for row, read in zip(rows, reads):
        kind = row.movement_type
        try:
            effect = movement_effect(kind)
        except Exception:
            effect = "other"
        qty = abs(int(row.quantity or 0))
        bucket = buckets.get(kind)
        if bucket is None:
            bucket = MovementTypeBucket(
                movement_type=kind, movement_label=_label(kind), count=0, qty_in=0, qty_out=0
            )
            buckets[kind] = bucket
        bucket.count += 1
        if effect == "on_hand_in":
            bucket.qty_in += qty
            if kind == MOVEMENT_PURCHASE_RECEIPT:
                purchased_qty += qty
                purchased_value += Decimal(qty) * (_money(row.unit_cost) if row.unit_cost else cost)
            elif kind in (MOVEMENT_STOCK_ADJUSTMENT_IN, MOVEMENT_STOCK_COUNT_IN):
                adjustment_in += qty
            elif kind in (MOVEMENT_CUSTOMER_RETURN, MOVEMENT_POS_RETURN):
                pass  # returns are reported from the return documents below
            else:
                other_in += qty
        elif effect == "on_hand_out":
            bucket.qty_out += qty
            if kind in (MOVEMENT_SALES_DELIVERY, MOVEMENT_POS_SALE, MOVEMENT_COMMERCE_SALE):
                delivered_qty += qty
            elif kind == MOVEMENT_PURCHASE_RETURN:
                purchase_return_qty += qty
            elif kind in (MOVEMENT_STOCK_ADJUSTMENT_OUT, MOVEMENT_STOCK_COUNT_OUT, MOVEMENT_SCRAP):
                adjustment_out += qty
            else:
                other_out += qty
        moved_on = row.posting_date or row.document_date
        if moved_on is None and row.created_at:
            moved_on = row.created_at.date() if isinstance(row.created_at, datetime) else None
        lines.append(
            MovementSummaryLine(
                id=row.id,
                moved_on=moved_on,
                movement_type=kind,
                movement_label=_label(kind),
                effect=effect,
                sku=read.sku,
                name=read.name,
                warehouse_name=read.warehouse_name,
                quantity=int(row.quantity or 0),
                qty_before=int(row.qty_before or 0),
                qty_after=int(row.qty_after or 0),
                reference=row.reference,
                created_at=row.created_at,
            )
        )

    # ---- sales & returns (documents) -----------------------------------------
    sq = (
        db.query(SalesOrderLine, SalesOrder)
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(
            SalesOrderLine.item_id == item_id,
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status.in_(["confirmed", "processing", "completed"]),
        )
    )
    if warehouse_id:
        sq = sq.filter(SalesOrder.warehouse_id == warehouse_id)
    if date_from:
        sq = sq.filter(SalesOrder.order_date >= date_from)
    if date_to:
        sq = sq.filter(SalesOrder.order_date <= date_to)
    sold_qty = 0
    revenue = Decimal("0")
    for line, _order in sq.all():
        q = int(line.quantity_ordered or 0)
        sold_qty += q
        revenue += _money(line.unit_price) * q - _money(line.discount_amount)

    rq = (
        db.query(SalesReturnLine, SalesReturn)
        .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
        .filter(
            SalesReturnLine.item_id == item_id,
            SalesReturn.company_id == company_id,
            SalesReturn.status.in_(["confirmed", "credited"]),
        )
    )
    if warehouse_id:
        rq = rq.filter(SalesReturn.warehouse_id == warehouse_id)
    if date_from:
        rq = rq.filter(SalesReturn.return_date >= date_from)
    if date_to:
        rq = rq.filter(SalesReturn.return_date <= date_to)
    return_qty = 0
    return_value = Decimal("0")
    for rline, _ret in rq.all():
        q = int(rline.quantity_returned or 0)
        return_qty += q
        return_value += _money(rline.unit_price) * q - _money(rline.discount_amount)

    net_sold = sold_qty - return_qty
    net_revenue = _money(revenue - return_value)
    cogs = _money(Decimal(net_sold) * cost)
    profit = _money(net_revenue - cogs)
    margin = _money(profit / net_revenue * 100) if net_revenue > 0 else None

    # ---- warranty of the serial units sold in the period ----------------------------
    from app.models.inventory_serial import InventorySerial

    wq = db.query(InventorySerial.warranty_expires_on).filter(
        InventorySerial.company_id == company_id,
        InventorySerial.item_id == item_id,
        InventorySerial.status.in_(["sold", "in_service"]),  # a unit at the repair desk is still the customer's, under warranty
    )
    if date_from:
        wq = wq.filter(func.date(InventorySerial.sold_at) >= date_from)
    if date_to:
        wq = wq.filter(func.date(InventorySerial.sold_at) <= date_to)
    today = date.today()
    warranty_active = warranty_expired = warranty_unknown = 0
    for (expires_on,) in wq.all():
        if expires_on is None:
            warranty_unknown += 1
        elif expires_on >= today:
            warranty_active += 1
        else:
            warranty_expired += 1

    totals = ProductReportTotals(
        purchased_qty=purchased_qty,
        purchased_value=_money(purchased_value),
        purchase_return_qty=purchase_return_qty,
        delivered_qty=delivered_qty,
        adjustment_in_qty=adjustment_in,
        adjustment_out_qty=adjustment_out,
        other_in_qty=other_in,
        other_out_qty=other_out,
        sold_qty=sold_qty,
        sales_revenue=_money(revenue),
        customer_return_qty=return_qty,
        customer_return_value=_money(return_value),
        net_sold_qty=net_sold,
        net_revenue=net_revenue,
        cogs=cogs,
        profit=profit,
        margin_pct=margin,
        warranty_active_qty=warranty_active,
        warranty_expired_qty=warranty_expired,
        warranty_unknown_qty=warranty_unknown,
    )
    by_type = sorted(buckets.values(), key=lambda b: (-(b.qty_in + b.qty_out), b.movement_label))
    return ProductReportResponse(
        item=ProductReportItem(
            item_id=item.id,
            product_id=product.id if product else None,
            name=product.name if product else item.name,
            sku=product.sku if product else item.sku,
            supplier_id=supplier[0] if supplier else None,
            supplier_name=supplier[1] if supplier else None,
            cost_price=cost,
            sale_price=sale,
            track_quantity=bool(product.track_quantity) if product else True,
        ),
        stock=stock,
        totals=totals,
        by_type=by_type,
        movements=lines,
        meta=ProductReportMeta(
            date_from=date_from,
            date_to=date_to,
            movement_count=len(lines),
            movement_total=movement_total,
        ),
    )


def product_report_list(
    db: Session,
    *,
    company_id: str,
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    page: int = 1,
    per_page: int = 25,
) -> ProductReportListResponse:
    """The product report as a datatable: one row per catalog product, lifetime
    figures (no date range — that stays a per-product drill-down via `product_report`).

    Paginates over `CatalogProduct` first, then runs a handful of grouped
    aggregate queries scoped to just that page's item ids — the same figures
    `product_report` computes per item, batched instead of looped, so listing
    hundreds of products stays a handful of queries rather than hundreds."""
    from app.models.sales import SalesOrder, SalesOrderLine
    from app.models.sales_return import SalesReturn, SalesReturnLine
    from app.services.inventory.constants import MOVEMENT_PURCHASE_RECEIPT

    base = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.company_id == company_id, CatalogProduct.item_id.isnot(None))
    )
    if search:
        like = f"%{search.strip()}%"
        base = base.filter(
            (CatalogProduct.name.ilike(like)) | (CatalogProduct.sku.ilike(like))
        )
    if category_id:
        base = base.filter(CatalogProduct.category_id == category_id)

    sort_column = {
        "name": CatalogProduct.name,
        "sku": CatalogProduct.sku,
    }.get(sort_by, CatalogProduct.name)
    order = sort_column.asc() if sort_dir != "desc" else sort_column.desc()

    total = base.count()
    page = max(page, 1)
    per_page = max(1, min(per_page, 200))
    products = (
        base.order_by(order, CatalogProduct.id.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    item_ids = [p.item_id for p in products if p.item_id]
    item_id_set = set(item_ids)

    # ---- stock now (grouped) --------------------------------------------------
    stock_q = db.query(
        InventoryStockLevel.item_id,
        func.coalesce(func.sum(InventoryStockLevel.on_hand), 0),
        func.coalesce(func.sum(InventoryStockLevel.reserved), 0),
    ).filter(InventoryStockLevel.item_id.in_(item_id_set))
    if warehouse_id:
        stock_q = stock_q.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    stock_by_item = {
        item_id: (int(on_hand or 0), int(reserved or 0))
        for item_id, on_hand, reserved in stock_q.group_by(InventoryStockLevel.item_id).all()
    }

    # ---- purchased (lifetime, from the movement ledger) ------------------------
    purchase_q = (
        db.query(
            InventoryStockMovement.item_id,
            func.coalesce(func.sum(func.abs(InventoryStockMovement.quantity)), 0),
            func.coalesce(
                func.sum(
                    func.abs(InventoryStockMovement.quantity)
                    * func.coalesce(InventoryStockMovement.unit_cost, 0)
                ),
                0,
            ),
        )
        .filter(
            InventoryStockMovement.company_id == company_id,
            InventoryStockMovement.item_id.in_(item_id_set),
            InventoryStockMovement.movement_type == MOVEMENT_PURCHASE_RECEIPT,
        )
        .group_by(InventoryStockMovement.item_id)
    )
    if warehouse_id:
        purchase_q = purchase_q.filter(InventoryStockMovement.warehouse_id == warehouse_id)
    purchased_by_item = {
        item_id: (int(qty or 0), _money(value)) for item_id, qty, value in purchase_q.all()
    }

    # ---- sales (lifetime, confirmed+) ------------------------------------------
    sales_q = (
        db.query(
            SalesOrderLine.item_id,
            func.coalesce(func.sum(SalesOrderLine.quantity_ordered), 0),
            func.coalesce(
                func.sum(
                    SalesOrderLine.unit_price * SalesOrderLine.quantity_ordered
                    - SalesOrderLine.discount_amount
                ),
                0,
            ),
        )
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .filter(
            SalesOrderLine.item_id.in_(item_id_set),
            SalesOrder.company_id == company_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status.in_(["confirmed", "processing", "completed"]),
        )
    )
    if warehouse_id:
        sales_q = sales_q.filter(SalesOrder.warehouse_id == warehouse_id)
    sales_by_item = {
        item_id: (int(qty or 0), _money(value))
        for item_id, qty, value in sales_q.group_by(SalesOrderLine.item_id).all()
    }

    # ---- customer returns (lifetime) -------------------------------------------
    return_q = (
        db.query(
            SalesReturnLine.item_id,
            func.coalesce(func.sum(SalesReturnLine.quantity_returned), 0),
            func.coalesce(
                func.sum(
                    SalesReturnLine.unit_price * SalesReturnLine.quantity_returned
                    - SalesReturnLine.discount_amount
                ),
                0,
            ),
        )
        .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
        .filter(
            SalesReturnLine.item_id.in_(item_id_set),
            SalesReturn.company_id == company_id,
            SalesReturn.status.in_(["confirmed", "credited"]),
        )
    )
    if warehouse_id:
        return_q = return_q.filter(SalesReturn.warehouse_id == warehouse_id)
    returns_by_item = {
        item_id: (int(qty or 0), _money(value))
        for item_id, qty, value in return_q.group_by(SalesReturnLine.item_id).all()
    }

    suppliers = _supplier_map(db, item_id_set)

    rows: list[ProductReportRow] = []
    sum_stock_value = Decimal("0")
    sum_sold_qty = 0
    sum_sales_revenue = Decimal("0")
    sum_profit = Decimal("0")
    for product in products:
        item_id = product.item_id
        cost = _money(product.purchase_price) if product.purchase_price is not None else Decimal("0")
        sale = _money(product.price)
        on_hand, reserved = stock_by_item.get(item_id, (0, 0))
        purchased_qty, purchased_value = purchased_by_item.get(item_id, (0, Decimal("0")))
        sold_qty, sales_revenue = sales_by_item.get(item_id, (0, Decimal("0")))
        return_qty, return_value = returns_by_item.get(item_id, (0, Decimal("0")))
        net_sold = sold_qty - return_qty
        net_revenue = _money(sales_revenue - return_value)
        cogs = _money(Decimal(net_sold) * cost)
        profit = _money(net_revenue - cogs)
        margin = _money(profit / net_revenue * 100) if net_revenue > 0 else None
        stock_value = _money(Decimal(on_hand) * cost)
        supplier = suppliers.get(item_id)
        rows.append(
            ProductReportRow(
                item_id=item_id,
                product_id=product.id,
                name=product.name,
                sku=product.sku,
                category=product.category,
                brand=product.brand,
                supplier_id=supplier[0] if supplier else None,
                supplier_name=supplier[1] if supplier else None,
                cost_price=cost,
                sale_price=sale,
                on_hand=on_hand,
                reserved=reserved,
                available=on_hand - reserved,
                stock_value=stock_value,
                purchased_qty=purchased_qty,
                purchased_value=purchased_value,
                sold_qty=sold_qty,
                sales_revenue=_money(sales_revenue),
                return_qty=return_qty,
                return_value=_money(return_value),
                net_sold_qty=net_sold,
                net_revenue=net_revenue,
                cogs=cogs,
                profit=profit,
                margin_pct=margin,
            )
        )
        sum_stock_value += stock_value
        sum_sold_qty += sold_qty
        sum_sales_revenue += sales_revenue
        sum_profit += profit

    return ProductReportListResponse(
        data=rows,
        meta=ProductReportListMeta(
            total=total,
            page=page,
            per_page=per_page,
            sum_stock_value=_money(sum_stock_value),
            sum_sold_qty=sum_sold_qty,
            sum_sales_revenue=_money(sum_sales_revenue),
            sum_profit=_money(sum_profit),
        ),
    )


def _as_date(value: datetime | date | None) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _pl_signed_qty_expr():
    qty = func.abs(InventoryStockMovement.quantity)
    return case(
        (InventoryStockMovement.movement_type.in_(ON_HAND_IN_TYPES), qty),
        (InventoryStockMovement.movement_type.in_(ON_HAND_OUT_TYPES), -qty),
        else_=0,
    )


def profit_loss_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> ProfitLossReportResponse:
    """AgainPOS-style Profit / Loss report — periodic-inventory formula.

    Opening/closing stock are reconstructed from today's on-hand by backing
    out movements after the cutoff (same trick ledger_history uses per item,
    just run across every stock level row at once).
    """
    day = _movement_day_expr()

    stock_q = db.query(InventoryStockLevel).filter(InventoryStockLevel.company_id == company_id)
    if warehouse_id:
        stock_q = stock_q.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    stock_rows = stock_q.all()
    sale_prices = _sale_price_map(db, stock_rows)

    def _future_net(after_date: Optional[date]) -> dict[str, int]:
        if after_date is None:
            return {}
        q = db.query(
            InventoryStockMovement.stock_level_id,
            func.coalesce(func.sum(_pl_signed_qty_expr()), 0),
        ).filter(
            InventoryStockMovement.company_id == company_id,
            InventoryStockMovement.stock_level_id.isnot(None),
            InventoryStockMovement.movement_type.notin_(NON_ON_HAND_TYPES),
            day > after_date,
        )
        if warehouse_id:
            q = q.filter(InventoryStockMovement.warehouse_id == warehouse_id)
        return {sid: int(total or 0) for sid, total in q.group_by(InventoryStockMovement.stock_level_id).all()}

    closing_future = _future_net(date_to)
    opening_future = _future_net(date_from - timedelta(days=1)) if date_from else {}

    opening_cost = Decimal("0")
    opening_sale = Decimal("0")
    closing_cost = Decimal("0")
    closing_sale = Decimal("0")
    for row in stock_rows:
        now = int(row.on_hand or 0)
        cost = _money(row.unit_cost)
        sale = sale_prices.get(row.id, Decimal("0"))
        opening_qty = now - opening_future.get(row.id, 0)
        closing_qty = now - closing_future.get(row.id, 0)
        opening_cost += Decimal(opening_qty) * cost
        opening_sale += Decimal(opening_qty) * sale
        closing_cost += Decimal(closing_qty) * cost
        closing_sale += Decimal(closing_qty) * sale

    # ---- purchases (receipt-valued, matches product_report's per-item calc) ----
    purchase_q = db.query(
        func.coalesce(
            func.sum(func.abs(InventoryStockMovement.quantity) * InventoryStockMovement.unit_cost), 0
        )
    ).filter(
        InventoryStockMovement.company_id == company_id,
        InventoryStockMovement.movement_type == MOVEMENT_PURCHASE_RECEIPT,
    )
    if warehouse_id:
        purchase_q = purchase_q.filter(InventoryStockMovement.warehouse_id == warehouse_id)
    if date_from:
        purchase_q = purchase_q.filter(day >= date_from)
    if date_to:
        purchase_q = purchase_q.filter(day <= date_to)
    total_purchase = _money(purchase_q.scalar())

    # ---- net stock adjustment value (in - out, at each row's own cost) ----
    adj_q = db.query(
        func.coalesce(
            func.sum(
                case(
                    (
                        InventoryStockMovement.movement_type.in_(("stock_adjustment_in", "stock_count_in")),
                        func.abs(InventoryStockMovement.quantity) * InventoryStockMovement.unit_cost,
                    ),
                    (
                        InventoryStockMovement.movement_type.in_(("stock_adjustment_out", "stock_count_out")),
                        -func.abs(InventoryStockMovement.quantity) * InventoryStockMovement.unit_cost,
                    ),
                    else_=0,
                )
            ),
            0,
        )
    ).filter(
        InventoryStockMovement.company_id == company_id,
        InventoryStockMovement.movement_type.in_(
            ("stock_adjustment_in", "stock_adjustment_out", "stock_count_in", "stock_count_out")
        ),
    )
    if warehouse_id:
        adj_q = adj_q.filter(InventoryStockMovement.warehouse_id == warehouse_id)
    if date_from:
        adj_q = adj_q.filter(day >= date_from)
    if date_to:
        adj_q = adj_q.filter(day <= date_to)
    total_stock_adjustment = _money(adj_q.scalar())

    # ---- purchase orders: discount ----
    po_q = db.query(func.coalesce(func.sum(PurchaseOrder.discount_total), 0)).filter(
        PurchaseOrder.company_id == company_id,
        PurchaseOrder.status.notin_(PL_PURCHASE_EXCLUDED_STATUSES),
    )
    if warehouse_id:
        po_q = po_q.filter(PurchaseOrder.warehouse_id == warehouse_id)
    if date_from:
        po_q = po_q.filter(PurchaseOrder.order_date >= date_from)
    if date_to:
        po_q = po_q.filter(PurchaseOrder.order_date <= date_to)
    total_purchase_discount = _money(po_q.scalar())

    # ---- purchase returns ----
    pr_q = db.query(func.coalesce(func.sum(PurchaseReturn.credit_amount), 0)).filter(
        PurchaseReturn.company_id == company_id,
        PurchaseReturn.status == "credited",
    )
    if warehouse_id:
        pr_q = pr_q.filter(PurchaseReturn.warehouse_id == warehouse_id)
    if date_from:
        pr_q = pr_q.filter(PurchaseReturn.return_date >= date_from)
    if date_to:
        pr_q = pr_q.filter(PurchaseReturn.return_date <= date_to)
    total_purchase_return = _money(pr_q.scalar())

    # ---- sales orders: revenue, discount, shipping, additional expenses ----
    so_q = db.query(SalesOrder).filter(
        SalesOrder.company_id == company_id,
        SalesOrder.deleted_at.is_(None),
        SalesOrder.status.in_(PL_SALES_COUNTED_STATUSES),
    )
    if warehouse_id:
        so_q = so_q.filter(SalesOrder.warehouse_id == warehouse_id)
    if date_from:
        so_q = so_q.filter(SalesOrder.order_date >= date_from)
    if date_to:
        so_q = so_q.filter(SalesOrder.order_date <= date_to)
    sales_orders = so_q.all()
    order_ids = [o.id for o in sales_orders]
    total_sell_discount = _money(sum((o.discount_total or 0) for o in sales_orders))
    total_sell_shipping_charge = _money(sum((o.shipping_charge or 0) for o in sales_orders))
    sell_additional_expenses = Decimal("0")
    for o in sales_orders:
        try:
            items = json.loads(o.additional_expenses_json or "[]")
        except (TypeError, ValueError):
            items = []
        for entry in items if isinstance(items, list) else []:
            if isinstance(entry, dict):
                sell_additional_expenses += Decimal(str(entry.get("amount") or 0))
    sell_additional_expenses = _money(sell_additional_expenses)

    total_sales = Decimal("0")
    if order_ids:
        line_q = (
            db.query(
                func.coalesce(
                    func.sum(
                        SalesOrderLine.unit_price * SalesOrderLine.quantity_ordered
                        - SalesOrderLine.discount_amount
                    ),
                    0,
                )
            )
            .filter(SalesOrderLine.sales_order_id.in_(order_ids))
        )
        total_sales = _money(line_q.scalar())

    # ---- sales returns ----
    sr_q = db.query(func.coalesce(func.sum(SalesReturn.credit_amount), 0)).filter(
        SalesReturn.company_id == company_id,
        SalesReturn.status == "credited",
    )
    if warehouse_id:
        sr_q = sr_q.filter(SalesReturn.warehouse_id == warehouse_id)
    if date_from:
        sr_q = sr_q.filter(SalesReturn.return_date >= date_from)
    if date_to:
        sr_q = sr_q.filter(SalesReturn.return_date <= date_to)
    total_sell_return = _money(sr_q.scalar())

    # ---- general business expenses ----
    exp_q = db.query(func.coalesce(func.sum(FinanceExpense.total), 0)).filter(
        FinanceExpense.company_id == company_id,
        FinanceExpense.status.in_(PL_EXPENSE_COUNTED_STATUSES),
    )
    if date_from:
        exp_q = exp_q.filter(FinanceExpense.expense_date >= date_from)
    if date_to:
        exp_q = exp_q.filter(FinanceExpense.expense_date <= date_to)
    total_expense = _money(exp_q.scalar())

    # ---- fields with no backing data anywhere in this codebase yet ----
    # Neither PurchaseOrder/PurchaseReceipt nor InventoryStockTransfer carry a
    # shipping-charge or additional-expenses column, CommerceCustomer's reward
    # ledger is never written to, "stock recovered" isn't a distinct concept
    # from a plain customer/purchase return, and no model anywhere has a
    # rounding column on a sale. Kept as explicit zeros — not fabricated —
    # so the report's shape matches AgainPOS even before that data exists.
    total_purchase_shipping_charge = Decimal("0")
    purchase_additional_expenses = Decimal("0")
    total_transfer_shipping_charge = Decimal("0")
    total_customer_reward = Decimal("0")
    total_stock_recovered = Decimal("0")
    total_sell_round_off = Decimal("0")

    # Formulas per AgainPOS's own Profit/Loss page (as given, verbatim):
    #   COGS         = Opening stock + Purchases − Closing stock
    #   Gross Profit  = Total sell price − COGS  ("total purchase price" in
    #                   their label means the cost of what was sold, i.e. COGS)
    #   Net Profit    = Gross Profit
    #                   + (sell shipping charge + sell additional expenses
    #                      + stock recovered + purchase discount + sell round off)
    #                   − (stock adjustment + expense + purchase shipping charge
    #                      + transfer shipping charge + purchase additional expenses
    #                      + sell discount + customer reward)
    # Total Sell Return / Total Purchase Return are shown as their own line
    # items but are NOT part of either formula — that omission is AgainPOS's
    # own, not a bug here.
    cogs = _money(opening_cost + total_purchase - closing_cost)
    gross_profit = _money(total_sales - cogs)
    net_profit = _money(
        gross_profit
        + total_sell_shipping_charge
        + sell_additional_expenses
        + total_stock_recovered
        + total_purchase_discount
        + total_sell_round_off
        - total_stock_adjustment
        - total_expense
        - total_purchase_shipping_charge
        - total_transfer_shipping_charge
        - purchase_additional_expenses
        - total_sell_discount
        - total_customer_reward
    )

    return ProfitLossReportResponse(
        date_from=date_from,
        date_to=date_to,
        warehouse_id=warehouse_id,
        opening_stock_by_purchase_price=_money(opening_cost),
        opening_stock_by_sale_price=_money(opening_sale),
        closing_stock_by_purchase_price=_money(closing_cost),
        closing_stock_by_sale_price=_money(closing_sale),
        total_purchase=total_purchase,
        total_stock_adjustment=total_stock_adjustment,
        total_expense=total_expense,
        total_purchase_shipping_charge=total_purchase_shipping_charge,
        purchase_additional_expenses=purchase_additional_expenses,
        total_transfer_shipping_charge=total_transfer_shipping_charge,
        total_sell_discount=total_sell_discount,
        total_customer_reward=total_customer_reward,
        total_sell_return=total_sell_return,
        total_sales=total_sales,
        total_sell_shipping_charge=total_sell_shipping_charge,
        sell_additional_expenses=sell_additional_expenses,
        total_stock_recovered=total_stock_recovered,
        total_purchase_return=total_purchase_return,
        total_purchase_discount=total_purchase_discount,
        total_sell_round_off=total_sell_round_off,
        cogs=cogs,
        gross_profit=gross_profit,
        net_profit=net_profit,
    )


PROFIT_BREAKDOWN_GROUPS = frozenset(
    {"product", "category", "brand", "location", "invoice", "customer", "day", "date", "staff"}
)


def profit_breakdown_report(
    db: Session,
    *,
    company_id: str,
    group_by: str,
    warehouse_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> tuple[list[ProfitBreakdownRow], ProfitBreakdownMeta]:
    """Gross profit grouped by product/category/brand/location/invoice/customer/day/staff.

    Matches AgainPOS's own note: only the per-line (inline) discount is
    netted out of revenue here — the order/invoice-level discount is not,
    same as their "Profit by products/categories/brands" tables. "day" and
    "date" group identically (by the order's calendar date); nothing in this
    codebase distinguishes them as separate concepts.
    """
    empty_meta = ProfitBreakdownMeta(count=0, total=0, page=page, per_page=per_page, total_gross_profit=Decimal("0"))

    so_q = db.query(SalesOrder).filter(
        SalesOrder.company_id == company_id,
        SalesOrder.deleted_at.is_(None),
        SalesOrder.status.in_(PL_SALES_COUNTED_STATUSES),
    )
    if warehouse_id:
        so_q = so_q.filter(SalesOrder.warehouse_id == warehouse_id)
    if date_from:
        so_q = so_q.filter(SalesOrder.order_date >= date_from)
    if date_to:
        so_q = so_q.filter(SalesOrder.order_date <= date_to)
    orders = {o.id: o for o in so_q.all()}
    if not orders:
        return [], empty_meta

    lines = (
        db.query(SalesOrderLine)
        .filter(SalesOrderLine.sales_order_id.in_(list(orders.keys())))
        .all()
    )
    if not lines:
        return [], empty_meta

    item_ids = {line.item_id for line in lines if line.item_id}
    products: dict[str, CatalogProduct] = {}
    if item_ids:
        for p in db.query(CatalogProduct).filter(CatalogProduct.item_id.in_(item_ids)).all():
            if p.item_id:
                products[p.item_id] = p

    category_names: dict[str, str] = {}
    if group_by == "category":
        cat_ids = {p.category_id for p in products.values() if p.category_id}
        if cat_ids:
            for c in db.query(CatalogCategory).filter(CatalogCategory.id.in_(cat_ids)).all():
                category_names[c.id] = c.name

    brand_names: dict[str, str] = {}
    if group_by == "brand":
        brand_ids = {p.brand_id for p in products.values() if p.brand_id}
        if brand_ids:
            for b in db.query(CatalogBrand).filter(CatalogBrand.id.in_(brand_ids)).all():
                brand_names[b.id] = b.name

    warehouse_names: dict[str, str] = {}
    if group_by == "location":
        wh_ids = {o.warehouse_id for o in orders.values()}
        if wh_ids:
            for w in db.query(InventoryWarehouse).filter(InventoryWarehouse.id.in_(wh_ids)).all():
                warehouse_names[w.id] = w.name

    customer_names: dict[str, str] = {}
    if group_by == "customer":
        cust_ids = {o.customer_id for o in orders.values()}
        if cust_ids:
            for c in db.query(CommerceCustomer).filter(CommerceCustomer.id.in_(cust_ids)).all():
                customer_names[c.id] = c.name

    buckets: dict[str, dict] = {}
    for line in lines:
        order = orders.get(line.sales_order_id)
        if order is None:
            continue
        product = products.get(line.item_id or "")
        qty = int(line.quantity_ordered or 0)
        # Inline (line-level) discount only — invoice/order-level discount is
        # deliberately excluded here, matching AgainPOS's own note.
        revenue = _money(line.unit_price) * qty - _money(line.discount_amount)
        cost_price = (
            _money(product.purchase_price)
            if product and product.purchase_price is not None
            else Decimal("0")
        )
        cost = cost_price * qty

        if group_by == "product":
            key = line.item_id or "unknown"
            label = product.name if product else (line.name or key)
        elif group_by == "category":
            key = product.category_id if product and product.category_id else "uncategorized"
            label = category_names.get(key, "Uncategorized")
        elif group_by == "brand":
            key = product.brand_id if product and product.brand_id else "no-brand"
            label = brand_names.get(key, "No brand")
        elif group_by == "location":
            key = order.warehouse_id
            label = warehouse_names.get(key, key)
        elif group_by == "invoice":
            key = order.id
            label = order.invoice_number or order.order_number
        elif group_by == "customer":
            key = order.customer_id
            label = customer_names.get(key, "Walk-in customer")
        elif group_by in ("day", "date"):
            key = order.order_date.isoformat() if order.order_date else "unknown"
            label = key
        elif group_by == "staff":
            key = order.sales_rep or "unassigned"
            label = order.sales_rep or "Unassigned"
        else:
            key = "all"
            label = "All"

        bucket = buckets.setdefault(
            key, {"label": label, "qty": 0, "revenue": Decimal("0"), "cost": Decimal("0")}
        )
        bucket["qty"] += qty
        bucket["revenue"] += revenue
        bucket["cost"] += cost

    rows = [
        ProfitBreakdownRow(
            key=k,
            label=b["label"],
            qty=b["qty"],
            revenue=_money(b["revenue"]),
            cost=_money(b["cost"]),
            gross_profit=_money(b["revenue"] - b["cost"]),
        )
        for k, b in buckets.items()
    ]
    if search:
        needle = search.strip().lower()
        rows = [r for r in rows if needle in r.label.lower()]
    rows.sort(key=lambda r: r.gross_profit, reverse=True)

    total = len(rows)
    total_gross_profit = _money(sum((r.gross_profit for r in rows), Decimal("0")))
    offset = max(0, (page - 1) * per_page)
    page_rows = rows[offset : offset + per_page]
    meta = ProfitBreakdownMeta(
        count=len(page_rows),
        total=total,
        page=page,
        per_page=per_page,
        total_gross_profit=total_gross_profit,
    )
    return page_rows, meta


def serials_report(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    status: Optional[str] = None,
) -> tuple[list[SerialReportLine], SerialReportMeta]:
    query = db.query(InventorySerial).filter(InventorySerial.company_id == company_id)
    if warehouse_id:
        query = query.filter(InventorySerial.warehouse_id == warehouse_id)
    if status:
        query = query.filter(InventorySerial.status == status)
    rows = (
        query.order_by(InventorySerial.product_name.asc(), InventorySerial.serial_number.asc())
        .limit(REPORT_ROW_CAP)
        .all()
    )

    warehouse_ids = {row.warehouse_id for row in rows if row.warehouse_id}
    warehouses: dict[str, str] = {}
    if warehouse_ids:
        warehouses = {
            row.id: row.name
            for row in db.query(InventoryWarehouse)
            .filter(InventoryWarehouse.id.in_(warehouse_ids))
            .all()
        }

    supplier_ids = {row.supplier_id for row in rows if row.supplier_id}
    suppliers: dict[str, str] = {}
    if supplier_ids:
        suppliers = {
            row.id: row.name
            for row in db.query(CommerceSupplier)
            .filter(CommerceSupplier.id.in_(supplier_ids))
            .all()
        }

    today = date.today()
    lines: list[SerialReportLine] = []
    counts = {
        "in_stock": 0,
        "in_transit": 0,
        "sold": 0,
        "in_service": 0,
        "replaced": 0,
        "scrapped": 0,
        "lost": 0,
        "damaged": 0,
    }
    warranty_expiring = 0
    warranty_expired = 0
    aging_90 = 0
    open_rma = 0
    no_warranty = 0

    for row in rows:
        received_on = _as_date(row.received_at)
        sold_on = _as_date(row.sold_at)
        expires = row.warranty_expires_on
        days_to_warranty: Optional[int] = None
        warranty_status = "unknown"
        if expires is not None:
            days_to_warranty = (expires - today).days
            if days_to_warranty < 0:
                warranty_status = "expired"
                warranty_expired += 1
            elif days_to_warranty <= 30:
                warranty_status = "expiring"
                warranty_expiring += 1
            else:
                warranty_status = "active"
        elif row.status in {"sold", "in_service"}:
            no_warranty += 1

        days_in_stock: Optional[int] = None
        if row.status == "in_stock":
            start = received_on or _as_date(row.created_at)
            if start:
                days_in_stock = (today - start).days
                if days_in_stock >= 90:
                    aging_90 += 1

        days_since_sold: Optional[int] = None
        if sold_on and row.status in {"sold", "in_service", "replaced"}:
            days_since_sold = (today - sold_on).days

        has_rma = bool(row.rma_id)
        if has_rma:
            open_rma += 1
        if row.status in counts:
            counts[row.status] += 1

        lines.append(
            SerialReportLine(
                id=row.id,
                serial_number=row.serial_number,
                sku=row.sku or "",
                name=row.product_name or "",
                status=row.status,
                warehouse_id=row.warehouse_id,
                warehouse_name=warehouses.get(row.warehouse_id or ""),
                supplier_id=row.supplier_id,
                supplier_name=suppliers.get(row.supplier_id or ""),
                source_type=row.source_type or "manual",
                received_on=received_on,
                sold_on=sold_on,
                customer_name=row.customer_name or "",
                order_number=row.order_number,
                warranty_expires_on=expires,
                warranty_status=warranty_status,
                days_to_warranty=days_to_warranty,
                days_in_stock=days_in_stock,
                days_since_sold=days_since_sold,
                rma_id=row.rma_id,
                has_open_rma=has_rma,
            )
        )

    meta = SerialReportMeta(
        count=len(lines),
        in_stock=counts["in_stock"],
        in_transit=counts["in_transit"],
        sold=counts["sold"],
        in_service=counts["in_service"],
        replaced=counts["replaced"],
        scrapped=counts["scrapped"],
        lost=counts["lost"],
        damaged=counts["damaged"],
        warranty_expiring_count=warranty_expiring,
        warranty_expired_count=warranty_expired,
        aging_90_count=aging_90,
        open_rma_count=open_rma,
        no_warranty_count=no_warranty,
    )
    return lines, meta
