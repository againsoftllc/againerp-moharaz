"""SKU purchase-price analytics from posted purchase orders."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_supplier import CommerceSupplier
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.schemas.purchase.reports import PurchasePriceLine, PurchasePriceMeta

MONEY = Decimal("0.01")
REPORT_ROW_CAP = 8000
SKIP_PO_STATUSES = frozenset({"draft", "cancelled"})


def _money(value: Decimal | int | float | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY)


def _opt_money(value: Decimal | int | float | None) -> Optional[Decimal]:
    if value is None:
        return None
    return _money(value)


class _Acc:
    sku: str = ""
    name: str = ""
    last_price: Optional[Decimal] = None
    last_date: Optional[date] = None
    last_po: Optional[str] = None
    last_supplier_id: Optional[str] = None
    last_supplier_name: Optional[str] = None
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    qty: int = 0
    spend: Decimal = Decimal("0")
    po_ids: set[str]


def purchase_price_report(
    db: Session,
    *,
    company_id: str,
    supplier_id: Optional[str] = None,
) -> tuple[list[PurchasePriceLine], PurchasePriceMeta]:
    query = (
        db.query(PurchaseOrderLine, PurchaseOrder, CommerceSupplier.name)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .join(CommerceSupplier, CommerceSupplier.id == PurchaseOrder.supplier_id)
        .filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.notin_(SKIP_PO_STATUSES),
        )
        .order_by(
            PurchaseOrder.order_date.desc(),
            PurchaseOrder.created_at.desc(),
            PurchaseOrderLine.id.desc(),
        )
    )
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)

    buckets: dict[str, _Acc] = {}
    for line, order, supplier_name in query.all():
        item_id = line.item_id
        if not item_id:
            continue
        acc = buckets.get(item_id)
        if acc is None:
            acc = _Acc()
            acc.po_ids = set()
            buckets[item_id] = acc
            acc.sku = line.sku or ""
            acc.name = line.name or ""
            acc.last_price = line.unit_cost
            acc.last_date = order.order_date
            acc.last_po = order.po_number
            acc.last_supplier_id = order.supplier_id
            acc.last_supplier_name = supplier_name
        qty = int(line.quantity_ordered or 0)
        cost = line.unit_cost or Decimal("0")
        if qty > 0:
            acc.qty += qty
            acc.spend += cost * qty
        if cost > 0:
            acc.min_price = cost if acc.min_price is None else min(acc.min_price, cost)
            acc.max_price = cost if acc.max_price is None else max(acc.max_price, cost)
        acc.po_ids.add(order.id)

    extra_ids: list[str] = []
    if not supplier_id:
        seen = set(buckets.keys())
        for (iid,) in (
            db.query(CatalogProduct.item_id)
            .filter(
                CatalogProduct.company_id == company_id,
                CatalogProduct.item_id.isnot(None),
            )
            .all()
        ):
            if iid and iid not in seen:
                extra_ids.append(iid)
                seen.add(iid)

    item_ids = list(buckets.keys()) + extra_ids
    items: dict[str, Item] = {}
    defaults: dict[str, Decimal] = {}
    stock_qty: dict[str, int] = {}
    stock_value: dict[str, Decimal] = {}
    if item_ids:
        items = {
            row.id: row
            for row in db.query(Item).filter(Item.id.in_(item_ids)).all()
        }
        for product in (
            db.query(CatalogProduct)
            .filter(CatalogProduct.item_id.in_(item_ids), CatalogProduct.company_id == company_id)
            .all()
        ):
            if product.item_id and product.purchase_price is not None and product.item_id not in defaults:
                defaults[product.item_id] = _money(product.purchase_price)
        stock_rows = (
            db.query(
                InventoryStockLevel.item_id,
                func.coalesce(func.sum(InventoryStockLevel.on_hand), 0),
                func.coalesce(
                    func.sum(InventoryStockLevel.unit_cost * InventoryStockLevel.on_hand),
                    0,
                ),
            )
            .filter(
                InventoryStockLevel.company_id == company_id,
                InventoryStockLevel.item_id.in_(item_ids),
            )
            .group_by(InventoryStockLevel.item_id)
            .all()
        )
        for item_id, units, value in stock_rows:
            stock_qty[item_id] = int(units or 0)
            stock_value[item_id] = _money(value)

    today = date.today()
    lines: list[PurchasePriceLine] = []
    last_above_avg = 0
    last_below_avg = 0
    last_above_default = 0
    last_below_default = 0
    missing_default = 0
    never_purchased = 0
    stale_90d = 0

    for item_id, acc in buckets.items():
        item = items.get(item_id)
        avg = _money(acc.spend / acc.qty) if acc.qty > 0 else None
        last = _opt_money(acc.last_price)
        default = defaults.get(item_id)
        vs_avg = _money(last - avg) if last is not None and avg is not None else None
        vs_default = _money(last - default) if last is not None and default is not None else None
        days = (today - acc.last_date).days if acc.last_date else None
        on_hand = stock_qty.get(item_id, 0)
        stock_cost = (
            _money(stock_value.get(item_id, Decimal("0")) / on_hand) if on_hand > 0 else Decimal("0")
        )
        if vs_avg is not None and vs_avg > 0:
            last_above_avg += 1
        if vs_avg is not None and vs_avg < 0:
            last_below_avg += 1
        if vs_default is not None and vs_default > 0:
            last_above_default += 1
        if vs_default is not None and vs_default < 0:
            last_below_default += 1
        if default is None:
            missing_default += 1
        if days is not None and days >= 90:
            stale_90d += 1
        lines.append(
            PurchasePriceLine(
                id=item_id,
                sku=(item.sku if item else None) or acc.sku,
                name=(item.name if item else None) or acc.name,
                supplier_id=acc.last_supplier_id,
                supplier_name=acc.last_supplier_name,
                on_hand=on_hand,
                stock_cost=stock_cost,
                default_purchase_price=default,
                last_purchase_price=last,
                avg_purchase_price=avg,
                min_purchase_price=_opt_money(acc.min_price),
                max_purchase_price=_opt_money(acc.max_price),
                last_purchase_date=acc.last_date,
                last_po_number=acc.last_po,
                days_since_last=days,
                po_count=len(acc.po_ids),
                qty_purchased=acc.qty,
                total_spend=_money(acc.spend),
                vs_avg=vs_avg,
                vs_default=vs_default,
            )
        )

    for item_id in extra_ids:
        item = items.get(item_id)
        default = defaults.get(item_id)
        on_hand = stock_qty.get(item_id, 0)
        if default is None and on_hand <= 0:
            continue
        never_purchased += 1
        if default is None:
            missing_default += 1
        stock_cost = (
            _money(stock_value.get(item_id, Decimal("0")) / on_hand) if on_hand > 0 else Decimal("0")
        )
        lines.append(
            PurchasePriceLine(
                id=item_id,
                sku=(item.sku if item else "") or "",
                name=(item.name if item else "") or "",
                on_hand=on_hand,
                stock_cost=stock_cost,
                default_purchase_price=default,
            )
        )

    lines.sort(key=lambda row: ((row.name or "").lower(), row.sku))
    lines = lines[:REPORT_ROW_CAP]
    meta = PurchasePriceMeta(
        count=len(lines),
        sku_count=len(lines),
        total_on_hand=sum(row.on_hand for row in lines),
        total_spend=sum((row.total_spend for row in lines), Decimal("0")),
        last_above_avg_count=last_above_avg,
        last_below_avg_count=last_below_avg,
        last_above_default_count=last_above_default,
        last_below_default_count=last_below_default,
        missing_default_count=missing_default,
        never_purchased_count=never_purchased,
        stale_90d_count=stale_90d,
    )
    return lines, meta
