"""Stock level (on-hand) reads and threshold writes.

Quantity changes never happen here — they go through StockMovementService so
every change is recorded in the movement ledger.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.inventory_item import InventoryItem
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.commerce_supplier import CommerceSupplier
from app.models.supplier_link import SupplierLink
from app.schemas.inventory.movement import MovementRead
from app.schemas.inventory.stock_level import (
    InventoryDashboardAlert,
    InventoryDashboardRead,
    ReorderSuggestionRead,
    StockLevelRead,
    StockLevelUpdate,
)
from app.services.inventory.constants import tracking_type_of
from app.services.inventory.stock_status import compute_stock_status


def _warehouse_map(db: Session, ids: set[str]) -> dict[str, InventoryWarehouse]:
    if not ids:
        return {}
    rows = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.id.in_(ids))
        .all()
    )
    return {row.id: row for row in rows}


def list_stock_levels(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
    warehouse: Optional[str] = None,
    product_id: Optional[str] = None,
    item_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[Sequence[InventoryStockLevel], int]:
    query = db.query(InventoryStockLevel).filter(
        InventoryStockLevel.company_id == company_id
    )
    if warehouse_id:
        query = query.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    if warehouse:
        # Callers may pass a warehouse name or code instead of an id.
        query = query.filter(
            InventoryStockLevel.warehouse_id.in_(
                db.query(InventoryWarehouse.id).filter(
                    (InventoryWarehouse.name == warehouse)
                    | (InventoryWarehouse.code == warehouse)
                )
            )
        )
    if product_id:
        query = query.filter(InventoryStockLevel.product_id == product_id)
    if item_id:
        query = query.filter(InventoryStockLevel.item_id == item_id)
    if status:
        query = query.filter(InventoryStockLevel.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (InventoryStockLevel.sku.ilike(like)) | (InventoryStockLevel.name.ilike(like))
        )

    total = query.count()
    rows = (
        query.order_by(InventoryStockLevel.name.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows, total


def rollups(rows: Sequence[InventoryStockLevel]) -> tuple[int, Decimal]:
    """Unit and value totals for the rows on the current page."""
    total_units = sum(row.on_hand for row in rows)
    total_value = sum(
        ((row.unit_cost or Decimal("0")) * row.on_hand for row in rows), Decimal("0")
    )
    return total_units, total_value


def get_stock_level(
    db: Session, stock_level_id: str, company_id: Optional[str] = None
) -> InventoryStockLevel:
    row = db.get(InventoryStockLevel, stock_level_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Stock level not found")
    return row


def to_read(
    row: InventoryStockLevel,
    warehouses: dict[str, InventoryWarehouse],
    tracking_type: str = "none",
) -> StockLevelRead:
    warehouse = warehouses.get(row.warehouse_id)
    unit_cost = row.unit_cost or Decimal("0")
    return StockLevelRead(
        id=row.id,
        company_id=row.company_id,
        warehouse_id=row.warehouse_id,
        warehouse_name=warehouse.name if warehouse else None,
        warehouse_code=warehouse.code if warehouse else None,
        product_id=row.product_id,
        variant_id=row.variant_id,
        item_id=row.item_id,
        sku=row.sku,
        name=row.name,
        on_hand=row.on_hand,
        reserved=row.reserved,
        available=row.on_hand - row.reserved,
        incoming=row.incoming,
        projected=(row.on_hand - row.reserved) + row.incoming,
        tracking_type=tracking_type,
        min_qty=row.min_qty,
        max_qty=row.max_qty,
        reorder_level=row.reorder_level,
        unit_cost=unit_cost,
        stock_value=unit_cost * row.on_hand,
        status=row.status,
        thumbnail=row.thumbnail,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _tracking_map(db: Session, item_ids: set[str]) -> dict[str, str]:
    if not item_ids:
        return {}
    rows = db.query(InventoryItem).filter(InventoryItem.item_id.in_(item_ids)).all()
    return {
        row.item_id: tracking_type_of(bool(row.track_serial), bool(row.track_batch))
        for row in rows
    }


def to_read_many(
    db: Session, rows: Sequence[InventoryStockLevel]
) -> list[StockLevelRead]:
    warehouses = _warehouse_map(db, {row.warehouse_id for row in rows})
    tracking = _tracking_map(db, {row.item_id for row in rows if row.item_id})
    return [
        to_read(row, warehouses, tracking.get(row.item_id or "", "none"))
        for row in rows
    ]


def to_read_one(db: Session, row: InventoryStockLevel) -> StockLevelRead:
    tracking = _tracking_map(db, {row.item_id} if row.item_id else set())
    return to_read(
        row,
        _warehouse_map(db, {row.warehouse_id}),
        tracking.get(row.item_id or "", "none"),
    )


def update_stock_level(
    db: Session,
    stock_level_id: str,
    payload: StockLevelUpdate,
    *,
    company_id: str,
) -> InventoryStockLevel:
    row = get_stock_level(db, stock_level_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    blocked = {"on_hand", "reserved", "incoming"}
    if blocked & data.keys():
        raise HTTPException(
            status_code=410,
            detail=(
                "On-hand, reserved, and incoming cannot be patched. "
                "Use Stock Adjustments, Stock Transfers, or Stock Counts."
            ),
        )

    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)

    if row.max_qty and row.min_qty > row.max_qty:
        raise HTTPException(status_code=400, detail="min_qty cannot exceed max_qty")

    reorder = row.reorder_level or row.min_qty
    row.status = compute_stock_status(row.on_hand, reorder, row.max_qty)
    db.commit()
    db.refresh(row)
    return row


def dashboard(db: Session, *, company_id: str) -> InventoryDashboardRead:
    rows = (
        db.query(InventoryStockLevel)
        .filter(InventoryStockLevel.company_id == company_id)
        .all()
    )
    total_units, total_value = rollups(rows)
    week_ago = datetime.utcnow() - timedelta(days=7)
    alert_rows = sorted(
        [r for r in rows if r.status in ("low_stock", "out_of_stock")],
        key=lambda r: (0 if r.status == "out_of_stock" else 1, r.on_hand or 0),
    )[:6]
    alerts = [
        InventoryDashboardAlert(
            sku=r.sku or "",
            product=r.name or r.sku or "Item",
            stock=int(r.on_hand or 0),
            threshold=int(r.reorder_level or r.min_qty or 0),
            status=r.status or "low_stock",
        )
        for r in alert_rows
    ]
    return InventoryDashboardRead(
        total_skus=len(rows),
        total_units=total_units,
        total_value=total_value,
        low_stock_count=sum(1 for r in rows if r.status == "low_stock"),
        out_of_stock_count=sum(1 for r in rows if r.status == "out_of_stock"),
        warehouse_count=(
            db.query(func.count(InventoryWarehouse.id))
            .filter(InventoryWarehouse.company_id == company_id)
            .scalar()
            or 0
        ),
        movement_count_7d=(
            db.query(func.count(InventoryStockMovement.id))
            .filter(
                InventoryStockMovement.company_id == company_id,
                InventoryStockMovement.created_at >= week_ago,
            )
            .scalar()
            or 0
        ),
        alerts=alerts,
    )


def reorder_suggestions(
    db: Session,
    *,
    company_id: str,
    warehouse_id: Optional[str] = None,
) -> list[ReorderSuggestionRead]:
    query = db.query(InventoryStockLevel).filter(
        InventoryStockLevel.company_id == company_id,
        InventoryStockLevel.reorder_level > 0,
    )
    if warehouse_id:
        query = query.filter(InventoryStockLevel.warehouse_id == warehouse_id)
    rows = [
        row
        for row in query.all()
        if (row.on_hand - row.reserved) <= row.reorder_level
    ]
    if not rows:
        return []

    warehouses = _warehouse_map(db, {r.warehouse_id for r in rows})
    item_ids = {r.item_id for r in rows if r.item_id}
    preferred = (
        db.query(SupplierLink.item_id, CommerceSupplier.id, CommerceSupplier.name)
        .join(CommerceSupplier, CommerceSupplier.id == SupplierLink.supplier_id)
        .filter(SupplierLink.item_id.in_(item_ids), SupplierLink.is_preferred.is_(True))
        .all()
        if item_ids
        else []
    )
    preferred_map = {item_id: (sid, sname) for item_id, sid, sname in preferred}

    out: list[ReorderSuggestionRead] = []
    for row in rows:
        available = row.on_hand - row.reserved
        target = row.max_qty if row.max_qty > 0 else row.reorder_level * 2
        suggested = max(target - row.on_hand, row.reorder_level - row.on_hand, 1)
        supplier_id, supplier_name = preferred_map.get(row.item_id, (None, None))
        warehouse = warehouses.get(row.warehouse_id)
        out.append(
            ReorderSuggestionRead(
                item_id=row.item_id or "",
                sku=row.sku,
                name=row.name,
                warehouse_id=row.warehouse_id,
                warehouse_name=warehouse.name if warehouse else None,
                on_hand=row.on_hand,
                reserved=row.reserved,
                available=available,
                incoming=row.incoming,
                projected=available + row.incoming,
                reorder_level=row.reorder_level,
                max_qty=row.max_qty,
                suggested_qty=suggested,
                preferred_supplier_id=supplier_id,
                preferred_supplier_name=supplier_name,
            )
        )
    out.sort(key=lambda r: r.available)
    return out


def warehouse_unit_totals(db: Session, company_id: str) -> dict[str, int]:
    """on-hand units per warehouse — WarehouseRead.total_units."""
    rows = (
        db.query(
            InventoryStockLevel.warehouse_id,
            func.coalesce(func.sum(InventoryStockLevel.on_hand), 0),
        )
        .filter(InventoryStockLevel.company_id == company_id)
        .group_by(InventoryStockLevel.warehouse_id)
        .all()
    )
    return {warehouse_id: int(total) for warehouse_id, total in rows}


def require_item_id(row: InventoryStockLevel) -> str:
    """Adjustments need an Item — legacy rows may predate the items table."""
    if not row.item_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Stock line {row.sku} has no linked item. "
                "Link it to an item before adjusting quantity."
            ),
        )
    return row.item_id


def movements_to_read(
    db: Session, rows: Sequence[InventoryStockMovement]
) -> list[MovementRead]:
    warehouse_ids: set[str] = set()
    for row in rows:
        warehouse_ids.add(row.warehouse_id)
        if row.source_warehouse_id:
            warehouse_ids.add(row.source_warehouse_id)
        if row.dest_warehouse_id:
            warehouse_ids.add(row.dest_warehouse_id)
    warehouses = _warehouse_map(db, warehouse_ids)

    item_ids = {row.item_id for row in rows if row.item_id}
    items: dict[str, Item] = {}
    products_by_item: dict[str, CatalogProduct] = {}
    if item_ids:
        items = {
            item.id: item
            for item in db.query(Item).filter(Item.id.in_(item_ids)).all()
        }
        for product in (
            db.query(CatalogProduct).filter(CatalogProduct.item_id.in_(item_ids)).all()
        ):
            if product.item_id:
                products_by_item[product.item_id] = product

    out: list[MovementRead] = []
    for row in rows:
        item = items.get(row.item_id)
        product = products_by_item.get(row.item_id)
        source = warehouses.get(row.source_warehouse_id or "")
        dest = warehouses.get(row.dest_warehouse_id or "")
        warehouse = warehouses.get(row.warehouse_id)
        out.append(
            MovementRead(
                id=row.id,
                company_id=row.company_id,
                item_id=row.item_id,
                sku=item.sku if item else None,
                name=item.name if item else None,
                thumbnail=product.thumbnail if product else None,
                warehouse_id=row.warehouse_id,
                warehouse_name=warehouse.name if warehouse else None,
                stock_level_id=row.stock_level_id,
                movement_type=row.movement_type,
                quantity=row.quantity,
                qty_before=row.qty_before,
                qty_after=row.qty_after,
                source_warehouse_id=row.source_warehouse_id,
                source_warehouse_name=source.name if source else None,
                dest_warehouse_id=row.dest_warehouse_id,
                dest_warehouse_name=dest.name if dest else None,
                reference=row.reference,
                notes=row.notes,
                created_by=row.created_by,
                created_at=row.created_at,
                source_type=getattr(row, "source_type", None),
                source_id=getattr(row, "source_id", None),
                posting_date=getattr(row, "posting_date", None),
                document_date=getattr(row, "document_date", None),
                value_delta=getattr(row, "value_delta", None),
                reverses_id=getattr(row, "reverses_id", None),
                reversed_by_id=getattr(row, "reversed_by_id", None),
            )
        )
    return out
