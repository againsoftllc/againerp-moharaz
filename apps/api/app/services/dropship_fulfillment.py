"""Dropship fulfillment helpers for commerce orders (manual 1688 place)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.catalog_product import CatalogProduct
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem


SUPPLIER_STATUSES = frozenset({"pending", "ordered", "shipped", "done"})


def ensure_dropship_order_columns() -> None:
    statements = [
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS supplier_order_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS supplier_order_id VARCHAR(100)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS supplier_notes TEXT",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _specs_for_product(db: Session, product_id: str) -> dict[str, Any]:
    row = db.get(CatalogProduct, product_id)
    if not row or not row.custom_specs_json:
        return {}
    try:
        data = json.loads(row.custom_specs_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def line_dropship_info(db: Session, item: CommerceOrderItem) -> Optional[dict[str, Any]]:
    specs = _specs_for_product(db, item.product_id)
    is_elim = bool(specs.get("dropship") or specs.get("source") == "elim" or str(item.sku).startswith("ELIM-"))
    if not is_elim:
        # Fallback: parse SKU ELIM-{platform}-{id}
        if not str(item.sku).startswith("ELIM-"):
            return None
        parts = str(item.sku).split("-", 2)
        platform = parts[1] if len(parts) > 2 else "alibaba"
        elim_id = parts[2] if len(parts) > 2 else ""
        link = (
            f"https://detail.1688.com/offer/{elim_id}.html"
            if platform == "alibaba"
            else f"https://item.taobao.com/item.htm?id={elim_id}"
        )
        return {
            "product_id": item.product_id,
            "sku": item.sku,
            "name": item.name,
            "quantity": item.quantity,
            "unit_price_bdt": float(item.unit_price),
            "elim_id": elim_id,
            "platform": platform,
            "supplier_link": link,
            "cost_cny": None,
            "profit_bdt": None,
            "server_charge_bdt": None,
        }

    return {
        "product_id": item.product_id,
        "sku": item.sku,
        "name": item.name,
        "quantity": item.quantity,
        "unit_price_bdt": float(item.unit_price),
        "elim_id": specs.get("elim_id"),
        "platform": specs.get("platform"),
        "supplier_link": specs.get("supplier_link"),
        "cost_cny": specs.get("cost_cny"),
        "cost_bdt": specs.get("cost_bdt"),
        "profit_bdt": specs.get("profit_bdt"),
        "server_charge_bdt": specs.get("server_charge_bdt"),
        "exchange_rate": specs.get("exchange_rate"),
    }


def order_dropship_payload(db: Session, order: CommerceOrder) -> dict[str, Any]:
    items = (
        db.query(CommerceOrderItem)
        .filter(CommerceOrderItem.order_id == order.id)
        .order_by(CommerceOrderItem.sort_order)
        .all()
    )
    dropship_lines = []
    for item in items:
        info = line_dropship_info(db, item)
        if info:
            dropship_lines.append(info)

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "status": order.status,
        "grand_total": float(order.grand_total),
        "supplier_order_status": getattr(order, "supplier_order_status", None) or "pending",
        "supplier_order_id": getattr(order, "supplier_order_id", None),
        "supplier_notes": getattr(order, "supplier_notes", None),
        "has_dropship_items": len(dropship_lines) > 0,
        "lines": dropship_lines,
    }


def list_dropship_orders(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    ensure_dropship_order_columns()
    orders = (
        db.query(CommerceOrder)
        .order_by(CommerceOrder.created_at.desc())
        .limit(200)
        .all()
    )
    out: list[dict[str, Any]] = []
    for order in orders:
        payload = order_dropship_payload(db, order)
        if payload["has_dropship_items"]:
            out.append(payload)
        if len(out) >= limit:
            break
    return out
