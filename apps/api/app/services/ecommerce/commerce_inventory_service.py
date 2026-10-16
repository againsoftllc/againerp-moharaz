"""Commerce ↔ inventory bridge — reservations, releases, deductions (STEP 08).

Inventory never owns products; it extends Items via item_id.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.services.ecommerce.checkout_constants import DEFAULT_COMPANY_ID
from app.services.inventory.constants import (
    MOVEMENT_COMMERCE_SALE,
    RESERVATION_SOURCE_COMMERCE,
)
from app.services.inventory.stock_movement_service import MovementInput, StockMovementService
from app.services.inventory.stock_status import compute_stock_status


class CommerceInventoryError(ValueError):
    """Inventory reservation or deduction failure."""


@dataclass(frozen=True)
class ItemAvailability:
    item_id: str
    warehouse_id: str
    on_hand: int
    reserved: int
    available: int
    reorder_level: int
    status: str
    low_stock: bool


@dataclass(frozen=True)
class LowStockAlert:
    item_id: str
    warehouse_id: str
    sku: str
    name: str
    available: int
    reorder_level: int
    message: str


class CommerceInventoryService:
    def __init__(self, db: Session, *, company_id: str = DEFAULT_COMPANY_ID) -> None:
        self._db = db
        self._company_id = company_id
        self._movement = StockMovementService(db)

    def resolve_warehouse(self, warehouse_id: Optional[str] = None) -> str:
        if warehouse_id:
            row = self._db.get(InventoryWarehouse, warehouse_id)
            if row and row.is_active:
                return row.id
        row = (
            self._db.query(InventoryWarehouse)
            .filter(
                InventoryWarehouse.company_id == self._company_id,
                InventoryWarehouse.is_active.is_(True),
            )
            .order_by(InventoryWarehouse.is_default.desc(), InventoryWarehouse.sort_order)
            .first()
        )
        if not row:
            raise CommerceInventoryError("No active warehouse configured")
        return row.id

    def availability(
        self,
        item_id: str,
        *,
        warehouse_id: Optional[str] = None,
    ) -> ItemAvailability:
        wh = self.resolve_warehouse(warehouse_id)
        stock = self._movement._get_or_create_stock(item_id, wh, self._company_id)
        reorder = stock.reorder_level or stock.min_qty
        available = max(stock.on_hand - stock.reserved, 0)
        status = compute_stock_status(stock.on_hand, reorder, stock.max_qty)
        return ItemAvailability(
            item_id=item_id,
            warehouse_id=wh,
            on_hand=stock.on_hand,
            reserved=stock.reserved,
            available=available,
            reorder_level=reorder,
            status=status,
            low_stock=status == "low_stock",
        )

    def available_qty(
        self,
        item_id: str,
        *,
        warehouse_id: Optional[str] = None,
    ) -> int:
        return self.availability(item_id, warehouse_id=warehouse_id).available

    def reserve(
        self,
        item_id: str,
        quantity: int,
        *,
        warehouse_id: Optional[str] = None,
        reference: Optional[str] = None,
        source_type: str = "commerce_order",
        source_id: Optional[str] = None,
        notes: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> InventoryStockMovement:
        if quantity <= 0:
            raise CommerceInventoryError("Reserve quantity must be positive")
        if not source_id:
            raise CommerceInventoryError("source_id is required to reserve stock")
        try:
            return self._movement.reserve(
                item_id=item_id,
                warehouse_id=self.resolve_warehouse(warehouse_id),
                quantity=quantity,
                company_id=self._company_id,
                source_type=source_type or RESERVATION_SOURCE_COMMERCE,
                source_id=source_id,
                reference=reference,
                notes=notes or "Commerce reservation",
                created_by=actor,
            )
        except Exception as exc:
            raise CommerceInventoryError(str(getattr(exc, "detail", exc))) from exc

    def release(
        self,
        item_id: str,
        quantity: int,
        *,
        warehouse_id: Optional[str] = None,
        reference: Optional[str] = None,
        source_type: str = "commerce_order",
        source_id: Optional[str] = None,
        notes: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> Optional[InventoryStockMovement]:
        if quantity <= 0:
            return None
        if not source_id:
            return None
        try:
            return self._movement.release(
                item_id=item_id,
                warehouse_id=self.resolve_warehouse(warehouse_id),
                quantity=quantity,
                company_id=self._company_id,
                source_type=source_type or RESERVATION_SOURCE_COMMERCE,
                source_id=source_id,
                reference=reference,
                notes=notes or "Commerce reservation released",
                created_by=actor,
            )
        except Exception as exc:
            raise CommerceInventoryError(str(getattr(exc, "detail", exc))) from exc

    def deduct_shipped(
        self,
        item_id: str,
        quantity: int,
        *,
        warehouse_id: Optional[str] = None,
        reference: Optional[str] = None,
        source_type: str = "commerce_shipment",
        source_id: Optional[str] = None,
        notes: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> InventoryStockMovement:
        if quantity <= 0:
            raise CommerceInventoryError("Ship quantity must be positive")
        wh = self.resolve_warehouse(warehouse_id)
        try:
            return self._movement.consume_reserved(
                MovementInput(
                    item_id=item_id,
                    warehouse_id=wh,
                    movement_type=MOVEMENT_COMMERCE_SALE,
                    quantity=quantity,
                    company_id=self._company_id,
                    reference=reference,
                    notes=notes or "Commerce shipment deduct",
                    created_by=actor,
                    source_type=source_type,
                    source_id=source_id,
                ),
                source_type=source_type or RESERVATION_SOURCE_COMMERCE,
                source_id=source_id or "",
            )
        except Exception as exc:
            raise CommerceInventoryError(str(getattr(exc, "detail", exc))) from exc

    def list_history(
        self,
        *,
        item_id: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        reference: Optional[str] = None,
        limit: int = 100,
    ) -> List[InventoryStockMovement]:
        query = self._db.query(InventoryStockMovement).filter(
            InventoryStockMovement.company_id == self._company_id,
        )
        if item_id:
            query = query.filter(InventoryStockMovement.item_id == item_id)
        if warehouse_id:
            query = query.filter(InventoryStockMovement.warehouse_id == warehouse_id)
        if reference:
            query = query.filter(InventoryStockMovement.reference == reference)
        return (
            query.order_by(InventoryStockMovement.created_at.desc())
            .limit(limit)
            .all()
        )

    def low_stock_alerts(
        self,
        *,
        warehouse_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[LowStockAlert]:
        wh = self.resolve_warehouse(warehouse_id) if warehouse_id else None
        query = self._db.query(InventoryStockLevel).filter(
            InventoryStockLevel.company_id == self._company_id,
            InventoryStockLevel.status == "low_stock",
        )
        if wh:
            query = query.filter(InventoryStockLevel.warehouse_id == wh)
        rows = query.order_by(InventoryStockLevel.updated_at.desc()).limit(limit).all()
        alerts: List[LowStockAlert] = []
        for row in rows:
            if not row.item_id:
                continue
            available = max(row.on_hand - row.reserved, 0)
            reorder = row.reorder_level or row.min_qty
            alerts.append(
                LowStockAlert(
                    item_id=row.item_id,
                    warehouse_id=row.warehouse_id,
                    sku=row.sku,
                    name=row.name,
                    available=available,
                    reorder_level=reorder,
                    message=f"{row.name} below reorder ({available} available, reorder {reorder})",
                ),
            )
        return alerts

    def _refresh_stock_status(self, stock: InventoryStockLevel) -> Optional[LowStockAlert]:
        reorder = stock.reorder_level or stock.min_qty
        before = stock.status
        stock.status = compute_stock_status(stock.on_hand, reorder, stock.max_qty)
        self._db.flush()
        if stock.status == "low_stock" and before != "low_stock" and stock.item_id:
            available = max(stock.on_hand - stock.reserved, 0)
            return LowStockAlert(
                item_id=stock.item_id,
                warehouse_id=stock.warehouse_id,
                sku=stock.sku,
                name=stock.name,
                available=available,
                reorder_level=reorder,
                message=f"Low stock: {stock.name} ({available} available)",
            )
        return None
