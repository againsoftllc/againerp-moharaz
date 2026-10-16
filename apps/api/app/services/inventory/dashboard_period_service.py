"""Inventory dashboard for a chosen period (Today, This month …) — the module's landing page.

Right now: stock on hand (SKUs, units, value, low / out of stock, per warehouse), product availability as the
shop shows it (catalogue stock status), what needs doing (reorder suggestions, open purchase orders, transfers
on the way, stock counts in progress, draft adjustments), and the lowest stock.
In the period: stock in and out (a movement's quantity change), by movement type, the period before it for the
change, a trend (by day up to 3 months, by month beyond), the most moved products and the latest movements.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.inventory_stock_adjustment import InventoryStockAdjustment
from app.models.inventory_stock_count import InventoryStockCount
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_stock_transfer import InventoryStockTransfer
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.purchase_order import PurchaseOrder
from app.services.inventory import stock_level_service

OPEN_PO_STATUSES = ("draft", "sent", "confirmed", "partial", "partially_received")


def _move_day():
    """The day a movement counts on: its posting date, else the day it was made."""
    return func.coalesce(InventoryStockMovement.posting_date, func.date(InventoryStockMovement.created_at))


def _delta():
    return InventoryStockMovement.qty_after - InventoryStockMovement.qty_before


def _in_period(q, date_from: Optional[date], date_to: Optional[date]):
    day = _move_day()
    if date_from:
        q = q.filter(day >= date_from)
    if date_to:
        q = q.filter(day <= date_to)
    return q


def _totals(db: Session, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    delta = _delta()
    rows = (
        _in_period(db.query(InventoryStockMovement), date_from, date_to)
        .filter(InventoryStockMovement.company_id == company_id)
        .with_entities(
            InventoryStockMovement.movement_type,
            func.count(InventoryStockMovement.id),
            func.coalesce(func.sum(case((delta > 0, delta), else_=0)), 0),
            func.coalesce(func.sum(case((delta < 0, -delta), else_=0)), 0),
            func.coalesce(func.sum(case((delta > 0, InventoryStockMovement.value_delta), else_=0)), 0),
            func.coalesce(func.sum(case((delta < 0, -InventoryStockMovement.value_delta), else_=0)), 0),
        )
        .group_by(InventoryStockMovement.movement_type)
        .all()
    )
    by_type = {
        t: {"count": int(c or 0), "units_in": int(i or 0), "units_out": int(o or 0)} for t, c, i, o, _vi, _vo in rows
    }
    return {
        "movement_count": sum(v["count"] for v in by_type.values()),
        "units_in": sum(v["units_in"] for v in by_type.values()),
        "units_out": sum(v["units_out"] for v in by_type.values()),
        "value_in": sum((Decimal(str(r[4] or 0)) for r in rows), Decimal("0")),
        "value_out": sum((Decimal(str(r[5] or 0)) for r in rows), Decimal("0")),
        "by_type": by_type,
    }


def dashboard_period(db: Session, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    # ── right now ──
    levels = db.query(InventoryStockLevel).filter(InventoryStockLevel.company_id == company_id).all()
    total_units, total_value = stock_level_service.rollups(levels)
    warehouses = {
        w.id: w.name
        for w in db.query(InventoryWarehouse).filter(InventoryWarehouse.company_id == company_id).all()
    }
    per_wh: dict[str, dict[str, Any]] = {}
    for r in levels:
        row = per_wh.setdefault(r.warehouse_id, {"warehouse": warehouses.get(r.warehouse_id, "—"), "skus": 0, "units": 0,
                                                 "value": Decimal("0")})
        row["skus"] += 1
        row["units"] += int(r.on_hand or 0)
        row["value"] += (r.unit_cost or Decimal("0")) * int(r.on_hand or 0)
    low = sorted(
        (r for r in levels if r.status in ("low_stock", "out_of_stock")),
        key=lambda r: (0 if r.status == "out_of_stock" else 1, r.on_hand or 0),
    )[:8]
    availability = {
        (status or "unknown"): int(n)
        for status, n in db.query(CatalogProduct.stock_status, func.count(CatalogProduct.id))
        .filter(CatalogProduct.company_id == company_id)
        .group_by(CatalogProduct.stock_status)
        .all()
    }
    attention = {
        "reorder_suggestions": len(stock_level_service.reorder_suggestions(db, company_id=company_id)),
        "open_purchase_orders": db.query(PurchaseOrder)
        .filter(PurchaseOrder.company_id == company_id, PurchaseOrder.status.in_(OPEN_PO_STATUSES))
        .count(),
        "transfers_in_transit": db.query(InventoryStockTransfer)
        .filter(InventoryStockTransfer.company_id == company_id,
                InventoryStockTransfer.status.in_(("draft", "in_transit", "partial_received")))
        .count(),
        "stock_counts_open": db.query(InventoryStockCount)
        .filter(InventoryStockCount.company_id == company_id, InventoryStockCount.status == "draft")
        .count(),
        "adjustments_draft": db.query(InventoryStockAdjustment)
        .filter(InventoryStockAdjustment.company_id == company_id, InventoryStockAdjustment.status == "draft")
        .count(),
    }

    # ── in the period ──
    current = _totals(db, company_id, date_from, date_to)
    previous = None
    if date_from and date_to:
        span = date_to.toordinal() - date_from.toordinal() + 1
        prev_to = date.fromordinal(date_from.toordinal() - 1)
        previous = _totals(db, company_id, date.fromordinal(prev_to.toordinal() - span + 1), prev_to)

    day = _move_day()
    first, last = date_from, date_to or date.today()
    if first is None:
        first = (
            db.query(func.min(day)).filter(InventoryStockMovement.company_id == company_id).scalar() or last
        )
        if isinstance(first, datetime):
            first = first.date()
    by_month = (last.toordinal() - first.toordinal()) > 92
    bucket = func.date_trunc("month", day) if by_month else day
    delta = _delta()
    trend_rows = (
        _in_period(db.query(InventoryStockMovement), first, last)
        .filter(InventoryStockMovement.company_id == company_id)
        .with_entities(
            bucket,
            func.coalesce(func.sum(case((delta > 0, delta), else_=0)), 0),
            func.coalesce(func.sum(case((delta < 0, -delta), else_=0)), 0),
        )
        .group_by(bucket)
        .all()
    )
    points = {}
    for key, units_in, units_out in trend_rows:
        d = key.date() if isinstance(key, datetime) else key
        points[d.replace(day=1) if by_month else d] = (int(units_in or 0), int(units_out or 0))
    series = []
    cursor = first.replace(day=1) if by_month else first
    while cursor <= last:
        units_in, units_out = points.get(cursor, (0, 0))
        series.append({"date": cursor.isoformat(), "label": cursor.strftime("%b %Y") if by_month else cursor.strftime("%b %d"),
                       "units_in": units_in, "units_out": units_out})
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1) if by_month else cursor + timedelta(days=1)

    moved = func.sum(func.abs(delta))
    top = (
        _in_period(db.query(InventoryStockMovement), date_from, date_to)
        .filter(InventoryStockMovement.company_id == company_id)
        .join(Item, Item.id == InventoryStockMovement.item_id)
        .with_entities(
            Item.id, Item.sku, Item.name,
            func.coalesce(func.sum(case((delta > 0, delta), else_=0)), 0),
            func.coalesce(func.sum(case((delta < 0, -delta), else_=0)), 0),
        )
        .group_by(Item.id, Item.sku, Item.name)
        .order_by(moved.desc())
        .limit(8)
        .all()
    )
    recent = (
        _in_period(db.query(InventoryStockMovement, Item.sku, Item.name), date_from, date_to)
        .outerjoin(Item, Item.id == InventoryStockMovement.item_id)
        .filter(InventoryStockMovement.company_id == company_id)
        .order_by(InventoryStockMovement.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "date_from": date_from,
        "date_to": date_to,
        "snapshot": {
            "total_skus": len(levels),
            "total_units": int(total_units),
            "total_value": total_value,
            "low_stock_count": sum(1 for r in levels if r.status == "low_stock"),
            "out_of_stock_count": sum(1 for r in levels if r.status == "out_of_stock"),
            "warehouse_count": len(warehouses),
        },
        "availability": availability,
        "attention": attention,
        "by_warehouse": sorted(per_wh.values(), key=lambda r: -r["value"]),
        "low_stock": [
            {"item_id": r.item_id, "sku": r.sku or "", "name": r.name or r.sku or "Item", "on_hand": int(r.on_hand or 0),
             "reorder_level": int(r.reorder_level or r.min_qty or 0), "status": r.status,
             "warehouse": warehouses.get(r.warehouse_id, "—")}
            for r in low
        ],
        "current": current,
        "previous": previous,
        "series": series,
        "by_month": by_month,
        "top_moved": [
            {"item_id": item_id, "sku": sku or "", "name": name or sku or "Item", "units_in": int(i or 0), "units_out": int(o or 0)}
            for item_id, sku, name, i, o in top
        ],
        "recent_movements": [
            {
                "id": m.id,
                "date": (m.posting_date or (m.created_at.date() if m.created_at else None)),
                "movement_type": m.movement_type,
                "item_id": m.item_id,
                "sku": sku or "",
                "name": name or sku or "Item",
                "change": int((m.qty_after or 0) - (m.qty_before or 0)),
                "warehouse": warehouses.get(m.warehouse_id, "—"),
                "reference": m.reference,
            }
            for m, sku, name in recent
        ],
    }
