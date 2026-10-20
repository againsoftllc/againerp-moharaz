"""Single inventory mutation engine.

Business documents never write inventory_stock_levels.on_hand / reserved / incoming.
They call this service. The ledger is the audit history; stock_levels is the balance.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.models.catalog_product import CatalogProduct
from app.models.inventory_incoming import InventoryIncoming
from app.models.inventory_reservation import InventoryReservation
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.services.inventory.constants import (
    INCOMING_HOLD_TYPES,
    MOVEMENT_OPENING_STOCK,
    MOVEMENT_REVERSAL,
    MOVEMENT_TYPE_ALIASES,
    MOVEMENT_TYPES,
    ON_HAND_IN_TYPES,
    ON_HAND_OUT_TYPES,
    RESERVATION_RELEASE_TYPES,
    RESERVATION_TYPES,
    RETIRED_MOVEMENT_TYPES,
)
from app.services.inventory.stock_status import compute_stock_status
from app.services.items.catalog_item_bridge import ensure_default_variant


def ensure_inventory_stock_movement_columns() -> None:
    statements = [
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS location_id VARCHAR(36) REFERENCES inventory_locations(id) ON DELETE SET NULL",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2)",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS source_type VARCHAR(40)",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS source_id VARCHAR(36)",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS document_date DATE",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS posting_date DATE",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS value_delta NUMERIC(14, 2)",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS reverses_id VARCHAR(36)",
        "ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS reversed_by_id VARCHAR(36)",
        "ALTER TABLE inventory_stock_count_lines ADD COLUMN IF NOT EXISTS tracking_type VARCHAR(20) NOT NULL DEFAULT 'none'",
        "CREATE INDEX IF NOT EXISTS ix_inventory_stock_movements_location_id ON inventory_stock_movements (location_id)",
        "CREATE INDEX IF NOT EXISTS ix_inventory_stock_movements_source_id ON inventory_stock_movements (source_id)",
        "CREATE INDEX IF NOT EXISTS ix_inventory_stock_movements_posting_date ON inventory_stock_movements (posting_date)",
        "ALTER TABLE inventory_stock_movements ALTER COLUMN movement_type TYPE VARCHAR(40)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def normalize_movement_type(raw: str) -> str:
    return MOVEMENT_TYPE_ALIASES.get(raw, raw)


def movement_effect(movement_type: str) -> str:
    """Return on_hand_in | on_hand_out | reservation | release | incoming_hold | reversal."""
    kind = normalize_movement_type(movement_type)
    if kind in ON_HAND_IN_TYPES:
        return "on_hand_in"
    if kind in ON_HAND_OUT_TYPES:
        return "on_hand_out"
    if kind in RESERVATION_TYPES:
        return "reservation"
    if kind in RESERVATION_RELEASE_TYPES:
        return "release"
    if kind in INCOMING_HOLD_TYPES:
        return "incoming_hold"
    if kind == MOVEMENT_REVERSAL:
        return "reversal"
    raise HTTPException(status_code=400, detail=f"Invalid movement type: {movement_type}")


def available_qty(on_hand: int, reserved: int) -> int:
    return max(int(on_hand) - int(reserved), 0)


def projected_qty(on_hand: int, reserved: int, incoming: int) -> int:
    return available_qty(on_hand, reserved) + max(int(incoming), 0)


@dataclass(frozen=True)
class MovementInput:
    item_id: str
    warehouse_id: str
    movement_type: str
    quantity: int
    company_id: str = "default"
    source_warehouse_id: Optional[str] = None
    dest_warehouse_id: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    stock_level_id: Optional[str] = None
    location_id: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    source_line_id: Optional[str] = None
    document_date: Optional[date] = None
    posting_date: Optional[date] = None
    consume_reserved: bool = False


class StockMovementService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_movements(
        self,
        *,
        company_id: Optional[str] = None,
        item_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        movement_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[InventoryStockMovement]:
        query = self._db.query(InventoryStockMovement)
        if company_id:
            query = query.filter(InventoryStockMovement.company_id == company_id)
        if item_id:
            query = query.filter(InventoryStockMovement.item_id == item_id)
        if warehouse_id:
            query = query.filter(InventoryStockMovement.warehouse_id == warehouse_id)
        if movement_type:
            query = query.filter(InventoryStockMovement.movement_type == movement_type)
        return (
            query.order_by(InventoryStockMovement.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_movements(
        self,
        *,
        company_id: Optional[str] = None,
        item_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        movement_type: Optional[str] = None,
    ) -> int:
        query = self._db.query(InventoryStockMovement)
        if company_id:
            query = query.filter(InventoryStockMovement.company_id == company_id)
        if item_id:
            query = query.filter(InventoryStockMovement.item_id == item_id)
        if warehouse_id:
            query = query.filter(InventoryStockMovement.warehouse_id == warehouse_id)
        if movement_type:
            query = query.filter(InventoryStockMovement.movement_type == movement_type)
        return query.count()

    def apply_movement(self, data: MovementInput) -> InventoryStockMovement:
        """Apply an on-hand in/out (or consume_reserved shipment). No absolute SET. No immediate transfer."""
        if data.quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity must be non-negative")
        if data.movement_type in RETIRED_MOVEMENT_TYPES:
            raise HTTPException(
                status_code=410,
                detail=(
                    "Immediate transfer and absolute stock SET are retired. "
                    "Use Stock Transfers, Stock Adjustments, or Stock Counts."
                ),
            )
        if not self._db.get(Item, data.item_id):
            raise HTTPException(status_code=404, detail="Item not found")

        kind = normalize_movement_type(data.movement_type)
        effect = movement_effect(kind)
        if effect in {"reservation", "release", "incoming_hold"}:
            raise HTTPException(
                status_code=400,
                detail=f"{kind} must go through reserve(), release(), or incoming helpers — not apply_movement",
            )
        if data.quantity == 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

        stock = self.lock_stock(data.item_id, data.warehouse_id, data.company_id, stock_level_id=data.stock_level_id)
        qty_before = stock.on_hand
        reserved_release = 0

        if effect == "on_hand_in":
            qty_after = qty_before + data.quantity
        elif effect == "on_hand_out":
            from app.services.inventory.inventory_settings_service import allow_negative_stock

            allow_negative = allow_negative_stock(self._db, data.company_id)
            if data.consume_reserved:
                reserved_release = min(data.quantity, stock.reserved)
            if not allow_negative and qty_before < data.quantity:
                raise HTTPException(status_code=400, detail="Insufficient stock for OUT movement")
            qty_after = qty_before - data.quantity
            if not allow_negative and qty_after < (stock.reserved - reserved_release):
                raise HTTPException(
                    status_code=400,
                    detail="Cannot reduce on-hand below reserved quantity",
                )
            stock.reserved = max(stock.reserved - reserved_release, 0)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported movement type: {kind}")

        return self._commit_on_hand(stock, data, kind, qty_before, qty_after)

    def reserve(
        self,
        *,
        item_id: str,
        warehouse_id: str,
        quantity: int,
        company_id: str = "default",
        source_type: str,
        source_id: str,
        source_line_id: Optional[str] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> InventoryStockMovement:
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Reserve quantity must be positive")
        stock = self.lock_stock(item_id, warehouse_id, company_id)
        avail = available_qty(stock.on_hand, stock.reserved)
        if avail < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient available stock: need {quantity}, available {avail}",
            )
        line_key = source_line_id or ""
        row = self._reservation_row(company_id, source_type, source_id, line_key, item_id, warehouse_id)
        if row is None:
            row = InventoryReservation(
                company_id=company_id,
                item_id=item_id,
                warehouse_id=warehouse_id,
                source_type=source_type,
                source_id=source_id,
                source_line_id=line_key,
                quantity=0,
                status="open",
                reference=reference,
                created_by=created_by,
            )
            self._db.add(row)
        if row.status != "open":
            row.status = "open"
        row.quantity += quantity
        stock.reserved += quantity
        self._refresh_status(stock)
        movement = self._write_ledger(
            stock,
            movement_type=normalize_movement_type("reserve"),
            quantity=quantity,
            qty_before=stock.on_hand,
            qty_after=stock.on_hand,
            reference=reference,
            notes=notes or "Reservation",
            created_by=created_by,
            source_type=source_type,
            source_id=source_id,
            unit_cost=stock.unit_cost,
            value_delta=Decimal("0"),
        )
        self._db.flush()
        return movement

    def release(
        self,
        *,
        item_id: str,
        warehouse_id: str,
        quantity: int,
        company_id: str = "default",
        source_type: str,
        source_id: str,
        source_line_id: Optional[str] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> Optional[InventoryStockMovement]:
        if quantity <= 0:
            return None
        stock = self.lock_stock(item_id, warehouse_id, company_id)
        line_key = source_line_id or ""
        row = self._reservation_row(company_id, source_type, source_id, line_key, item_id, warehouse_id)
        release_qty = quantity
        if row and row.status == "open":
            release_qty = min(quantity, row.quantity)
            row.quantity -= release_qty
            if row.quantity <= 0:
                row.status = "released"
                row.quantity = 0
        else:
            release_qty = min(quantity, stock.reserved)
        if release_qty <= 0:
            return None
        stock.reserved = max(stock.reserved - release_qty, 0)
        self._refresh_status(stock)
        movement = self._write_ledger(
            stock,
            movement_type=normalize_movement_type("release"),
            quantity=release_qty,
            qty_before=stock.on_hand,
            qty_after=stock.on_hand,
            reference=reference,
            notes=notes or "Reservation released",
            created_by=created_by,
            source_type=source_type,
            source_id=source_id,
            unit_cost=stock.unit_cost,
            value_delta=Decimal("0"),
        )
        self._db.flush()
        return movement

    def consume_reserved(
        self,
        data: MovementInput,
        *,
        source_type: str,
        source_id: str,
        source_line_id: Optional[str] = None,
    ) -> InventoryStockMovement:
        """Ship reserved (or unreserved) stock: on_hand ↓ and reserved ↓, one ledger row."""
        payload = MovementInput(
            **{**data.__dict__, "consume_reserved": True},
        )
        movement = self.apply_movement(payload)
        line_key = source_line_id or ""
        row = self._reservation_row(
            data.company_id, source_type, source_id, line_key, data.item_id, data.warehouse_id
        )
        if row and row.status == "open":
            take = min(data.quantity, row.quantity)
            row.quantity -= take
            if row.quantity <= 0:
                row.status = "consumed"
                row.quantity = 0
            self._db.flush()
        return movement

    def add_incoming(
        self,
        *,
        item_id: str,
        warehouse_id: str,
        quantity: int,
        company_id: str = "default",
        source_type: str,
        source_id: str,
        source_line_id: Optional[str] = None,
        expected_date: Optional[date] = None,
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[str] = None,
        movement_type: str = "transfer_in_transit",
        source_warehouse_id: Optional[str] = None,
        dest_warehouse_id: Optional[str] = None,
    ) -> InventoryStockMovement:
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Incoming quantity must be positive")
        stock = self.lock_stock(item_id, warehouse_id, company_id)
        incoming_before = stock.incoming
        stock.incoming += quantity
        self._refresh_status(stock)
        row = InventoryIncoming(
            company_id=company_id,
            item_id=item_id,
            warehouse_id=warehouse_id,
            source_type=source_type,
            source_id=source_id,
            source_line_id=source_line_id,
            quantity=quantity,
            received_qty=0,
            status="open",
            expected_date=expected_date,
            reference=reference,
            created_by=created_by,
        )
        self._db.add(row)
        movement = self._write_ledger(
            stock,
            movement_type=normalize_movement_type(movement_type),
            quantity=quantity,
            qty_before=incoming_before,
            qty_after=stock.incoming,
            reference=reference,
            notes=notes or "Incoming hold",
            created_by=created_by,
            source_type=source_type,
            source_id=source_id,
            source_warehouse_id=source_warehouse_id,
            dest_warehouse_id=dest_warehouse_id or warehouse_id,
            unit_cost=stock.unit_cost,
            value_delta=Decimal("0"),
        )
        self._db.flush()
        return movement

    def consume_incoming(
        self,
        *,
        item_id: str,
        warehouse_id: str,
        quantity: int,
        company_id: str = "default",
        source_type: str,
        source_id: str,
        source_line_id: Optional[str] = None,
    ) -> None:
        if quantity <= 0:
            return
        stock = self.lock_stock(item_id, warehouse_id, company_id)
        if stock.incoming < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"In-transit quantity is {stock.incoming}",
            )
        remaining = quantity
        rows = (
            self._db.query(InventoryIncoming)
            .filter(
                InventoryIncoming.company_id == company_id,
                InventoryIncoming.item_id == item_id,
                InventoryIncoming.warehouse_id == warehouse_id,
                InventoryIncoming.source_type == source_type,
                InventoryIncoming.source_id == source_id,
                InventoryIncoming.status == "open",
            )
            .all()
        )
        if source_line_id:
            rows = [row for row in rows if row.source_line_id == source_line_id]
        for row in rows:
            open_qty = row.quantity - row.received_qty
            if open_qty <= 0:
                row.status = "received"
                continue
            take = min(remaining, open_qty)
            row.received_qty += take
            remaining -= take
            if row.received_qty >= row.quantity:
                row.status = "received"
            if remaining <= 0:
                break
        stock.incoming -= quantity
        self._refresh_status(stock)
        self._db.flush()

    def reverse_movement(
        self,
        movement_id: str,
        *,
        actor_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> InventoryStockMovement:
        original = self._db.get(InventoryStockMovement, movement_id)
        if not original:
            raise HTTPException(status_code=404, detail="Movement not found")
        if original.reversed_by_id:
            existing = self._db.get(InventoryStockMovement, original.reversed_by_id)
            if existing:
                return existing
        effect = movement_effect(original.movement_type)
        if effect not in {"on_hand_in", "on_hand_out"}:
            raise HTTPException(
                status_code=400,
                detail="Only on-hand movements can be reversed through the ledger engine",
            )
        opposite = "on_hand_out" if effect == "on_hand_in" else "on_hand_in"
        reverse_type = MOVEMENT_REVERSAL
        payload = MovementInput(
            item_id=original.item_id,
            warehouse_id=original.warehouse_id,
            movement_type="out" if opposite == "on_hand_out" else "in",
            quantity=original.quantity,
            company_id=original.company_id,
            source_warehouse_id=original.source_warehouse_id,
            dest_warehouse_id=original.dest_warehouse_id,
            reference=original.reference,
            notes=notes or f"REVERSAL of {original.movement_type} {original.id}",
            created_by=actor_id,
            location_id=original.location_id,
            unit_cost=original.unit_cost,
            source_type=original.source_type,
            source_id=original.source_id,
        )
        reversal = self.apply_movement(payload)
        reversal.movement_type = reverse_type
        reversal.reverses_id = original.id
        original.reversed_by_id = reversal.id
        self._db.flush()
        return reversal

    def record_audit_movement(
        self,
        data: MovementInput,
        *,
        qty_before: int,
        qty_after: int,
    ) -> InventoryStockMovement:
        """Write a ledger row without changing on-hand. Prefer add_incoming for in-transit holds."""
        stock = self.lock_stock(data.item_id, data.warehouse_id, data.company_id, stock_level_id=data.stock_level_id)
        movement = self._write_ledger(
            stock,
            movement_type=normalize_movement_type(data.movement_type),
            quantity=data.quantity,
            qty_before=qty_before,
            qty_after=qty_after,
            reference=data.reference,
            notes=data.notes,
            created_by=data.created_by,
            source_type=data.source_type,
            source_id=data.source_id,
            source_warehouse_id=data.source_warehouse_id,
            dest_warehouse_id=data.dest_warehouse_id,
            location_id=data.location_id,
            unit_cost=data.unit_cost if data.unit_cost is not None else stock.unit_cost,
            value_delta=Decimal("0"),
            document_date=data.document_date,
            posting_date=data.posting_date,
        )
        self._db.flush()
        return movement

    def lock_stock(
        self,
        item_id: str,
        warehouse_id: str,
        company_id: str,
        *,
        stock_level_id: Optional[str] = None,
    ) -> InventoryStockLevel:
        query = self._db.query(InventoryStockLevel)
        if stock_level_id:
            query = query.filter(InventoryStockLevel.id == stock_level_id)
        else:
            query = query.filter(
                InventoryStockLevel.item_id == item_id,
                InventoryStockLevel.warehouse_id == warehouse_id,
            )
        row = query.with_for_update().first()
        if row:
            return row
        created = self._get_or_create_stock(item_id, warehouse_id, company_id)
        locked = (
            self._db.query(InventoryStockLevel)
            .filter(InventoryStockLevel.id == created.id)
            .with_for_update()
            .one()
        )
        return locked

    def _get_or_create_stock(
        self,
        item_id: str,
        warehouse_id: str,
        company_id: str,
    ) -> InventoryStockLevel:
        row = (
            self._db.query(InventoryStockLevel)
            .filter(
                InventoryStockLevel.item_id == item_id,
                InventoryStockLevel.warehouse_id == warehouse_id,
            )
            .first()
        )
        if row:
            return row

        item = self._db.get(Item, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        if item.item_type in ("service", "digital", "combo"):
            raise HTTPException(
                status_code=400,
                detail=f"Stock tracking is not applicable for {item.item_type} item: {item.sku}",
            )
        warehouse = self._db.get(InventoryWarehouse, warehouse_id)
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")

        product = (
            self._db.query(CatalogProduct)
            .filter((CatalogProduct.item_id == item_id) | (CatalogProduct.sku == item.sku))
            .first()
        )
        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"No catalog product for item {item.sku}. Link it to catalog before stocking.",
            )
        variant = ensure_default_variant(self._db, product)
        has_other_line = (
            self._db.query(InventoryStockLevel.id)
            .filter(InventoryStockLevel.item_id == item_id)
            .first()
            is not None
        )
        opening = (
            int(product.stock or 0)
            if product.track_quantity and not has_other_line
            else 0
        )

        row = InventoryStockLevel(
            company_id=company_id,
            warehouse_id=warehouse_id,
            item_id=item_id,
            product_id=product.id,
            variant_id=variant.id,
            sku=item.sku,
            name=item.name,
            on_hand=0,
            reorder_level=0,
        )
        self._db.add(row)
        self._db.flush()
        if opening > 0:
            self.apply_movement(
                MovementInput(
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                    movement_type=MOVEMENT_OPENING_STOCK,
                    quantity=opening,
                    company_id=company_id,
                    notes="Seeded from catalog stock on first warehouse line",
                    stock_level_id=row.id,
                )
            )
        return row

    def _commit_on_hand(
        self,
        stock: InventoryStockLevel,
        data: MovementInput,
        kind: str,
        qty_before: int,
        qty_after: int,
    ) -> InventoryStockMovement:
        stock.on_hand = qty_after
        unit_cost = data.unit_cost if data.unit_cost is not None else stock.unit_cost
        if data.unit_cost is not None and kind in ON_HAND_IN_TYPES and qty_after > 0:
            self._apply_moving_average(stock, qty_before, data.quantity, data.unit_cost)
            unit_cost = stock.unit_cost
        self._refresh_status(stock)
        sign = 1 if kind in ON_HAND_IN_TYPES else -1
        value_delta = (unit_cost or Decimal("0")) * data.quantity * sign
        notes = data.notes
        if data.consume_reserved and notes:
            notes = notes
        movement = self._write_ledger(
            stock,
            movement_type=kind,
            quantity=data.quantity,
            qty_before=qty_before,
            qty_after=qty_after,
            reference=data.reference,
            notes=notes,
            created_by=data.created_by,
            source_type=data.source_type,
            source_id=data.source_id,
            source_warehouse_id=data.source_warehouse_id,
            dest_warehouse_id=data.dest_warehouse_id,
            location_id=data.location_id,
            unit_cost=unit_cost,
            value_delta=value_delta,
            document_date=data.document_date,
            posting_date=data.posting_date,
        )
        self._sync_catalog_stock(data.item_id)
        self._db.flush()
        return movement

    def _apply_moving_average(
        self,
        stock: InventoryStockLevel,
        qty_before: int,
        inbound_qty: int,
        inbound_cost: Decimal,
    ) -> None:
        if inbound_qty <= 0:
            return
        prev_cost = stock.unit_cost or Decimal("0")
        if qty_before <= 0:
            stock.unit_cost = inbound_cost
            return
        total = (prev_cost * qty_before) + (inbound_cost * inbound_qty)
        stock.unit_cost = (total / (qty_before + inbound_qty)).quantize(Decimal("0.01"))

    def _sync_catalog_stock(self, item_id: str) -> None:
        from sqlalchemy import func

        self._db.flush()
        from app.models.inventory_warehouse import InventoryWarehouse

        # The product's stock is what can be SOLD: units in the RMA store (returned faulty / under claim) and in the supplier
        # transit place are not part of it.
        total = (
            self._db.query(func.coalesce(func.sum(InventoryStockLevel.on_hand), 0))
            .join(InventoryWarehouse, InventoryWarehouse.id == InventoryStockLevel.warehouse_id)
            .filter(
                InventoryStockLevel.item_id == item_id,
                InventoryWarehouse.is_rma_store.is_(False),
                InventoryWarehouse.is_supplier_transit.is_(False),
            )
            .scalar()
        )
        product = (
            self._db.query(CatalogProduct)
            .filter((CatalogProduct.item_id == item_id))
            .first()
        )
        if product is not None:
            product.stock = int(total or 0)

    def _refresh_status(self, stock: InventoryStockLevel) -> None:
        reorder = stock.reorder_level or stock.min_qty
        stock.status = compute_stock_status(stock.on_hand, reorder, stock.max_qty)

    def _reservation_row(
        self,
        company_id: str,
        source_type: str,
        source_id: str,
        source_line_id: str,
        item_id: str,
        warehouse_id: str,
    ) -> Optional[InventoryReservation]:
        return (
            self._db.query(InventoryReservation)
            .filter(
                InventoryReservation.company_id == company_id,
                InventoryReservation.source_type == source_type,
                InventoryReservation.source_id == source_id,
                InventoryReservation.source_line_id == source_line_id,
                InventoryReservation.item_id == item_id,
                InventoryReservation.warehouse_id == warehouse_id,
            )
            .with_for_update()
            .first()
        )

    def _write_ledger(
        self,
        stock: InventoryStockLevel,
        *,
        movement_type: str,
        quantity: int,
        qty_before: int,
        qty_after: int,
        reference: Optional[str],
        notes: Optional[str],
        created_by: Optional[str],
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        source_warehouse_id: Optional[str] = None,
        dest_warehouse_id: Optional[str] = None,
        location_id: Optional[str] = None,
        unit_cost: Optional[Decimal] = None,
        value_delta: Optional[Decimal] = None,
        document_date: Optional[date] = None,
        posting_date: Optional[date] = None,
        reverses_id: Optional[str] = None,
    ) -> InventoryStockMovement:
        today = date.today()
        movement = InventoryStockMovement(
            company_id=stock.company_id,
            item_id=stock.item_id or "",
            warehouse_id=stock.warehouse_id,
            stock_level_id=stock.id,
            movement_type=movement_type,
            quantity=quantity,
            qty_before=qty_before,
            qty_after=qty_after,
            location_id=location_id,
            unit_cost=unit_cost,
            value_delta=value_delta,
            source_type=source_type,
            source_id=source_id,
            source_warehouse_id=source_warehouse_id,
            dest_warehouse_id=dest_warehouse_id,
            reference=reference,
            notes=notes,
            created_by=created_by,
            document_date=document_date or today,
            posting_date=posting_date or today,
            reverses_id=reverses_id,
        )
        self._db.add(movement)
        return movement
