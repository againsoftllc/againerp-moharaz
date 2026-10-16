"""Inventory item extension — activate and configure items for stock tracking."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.inventory_item import InventoryItem
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product


class InventoryItemService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_item_id(self, item_id: str) -> Optional[InventoryItem]:
        return (
            self._db.query(InventoryItem)
            .filter(InventoryItem.item_id == item_id)
            .first()
        )

    def ensure_for_item(
        self,
        item_id: str,
        *,
        company_id: str = "default",
        track_stock: bool = True,
        default_warehouse_id: Optional[str] = None,
    ) -> InventoryItem:
        row = self.get_by_item_id(item_id)
        if row:
            if track_stock and not row.track_stock:
                row.track_stock = True
                row.is_active = True
            if default_warehouse_id and not row.default_warehouse_id:
                row.default_warehouse_id = default_warehouse_id
            self._db.flush()
            return row

        row = InventoryItem(
            item_id=item_id,
            company_id=company_id,
            inventory_status="active",
            track_stock=track_stock,
            track_serial=False,
            track_batch=False,
            tracking_mode="quantity" if track_stock else "none",
            default_warehouse_id=default_warehouse_id,
            is_active=track_stock,
        )
        self._db.add(row)
        self._db.flush()
        return row

    def ensure_for_catalog_product(
        self,
        product: CatalogProduct,
        *,
        track_stock: Optional[bool] = None,
    ) -> InventoryItem:
        item_id = ensure_item_for_catalog_product(self._db, product)
        default_wh = self._default_warehouse_id(product.company_id)
        should_track = track_stock if track_stock is not None else bool(product.track_quantity)
        return self.ensure_for_item(
            item_id,
            company_id=product.company_id,
            track_stock=should_track,
            default_warehouse_id=default_wh,
        )

    def _default_warehouse_id(self, company_id: str) -> Optional[str]:
        row = (
            self._db.query(InventoryWarehouse)
            .filter(
                InventoryWarehouse.company_id == company_id,
                InventoryWarehouse.is_default.is_(True),
                InventoryWarehouse.is_active.is_(True),
            )
            .order_by(InventoryWarehouse.sort_order)
            .first()
        )
        if row:
            return row.id
        fallback = (
            self._db.query(InventoryWarehouse)
            .filter(
                InventoryWarehouse.company_id == company_id,
                InventoryWarehouse.is_active.is_(True),
            )
            .order_by(InventoryWarehouse.sort_order)
            .first()
        )
        return fallback.id if fallback else None

    def update_extension(
        self,
        item_id: str,
        *,
        inventory_status: Optional[str] = None,
        track_stock: Optional[bool] = None,
        track_serial: Optional[bool] = None,
        track_batch: Optional[bool] = None,
        default_warehouse_id: Optional[str] = None,
        base_uom: Optional[str] = None,
        purchase_uom: Optional[str] = None,
        sales_uom: Optional[str] = None,
        purchase_conversion: Optional[Decimal] = None,
        sales_conversion: Optional[Decimal] = None,
        qr_code: Optional[str] = None,
        scanner_ready: Optional[bool] = None,
        reorder_level: Optional[int] = None,
        min_stock: Optional[int] = None,
        max_stock: Optional[int] = None,
    ) -> Optional[InventoryItem]:
        row = self.get_by_item_id(item_id)
        if not row:
            row = self.ensure_for_item(item_id)

        updates = {
            "inventory_status": inventory_status,
            "track_stock": track_stock,
            "track_serial": track_serial,
            "track_batch": track_batch,
            "default_warehouse_id": default_warehouse_id,
            "base_uom": base_uom,
            "purchase_uom": purchase_uom,
            "sales_uom": sales_uom,
            "purchase_conversion": purchase_conversion,
            "sales_conversion": sales_conversion,
            "qr_code": qr_code,
            "scanner_ready": scanner_ready,
            "reorder_level": reorder_level,
            "min_stock": min_stock,
            "max_stock": max_stock,
        }
        for key, value in updates.items():
            if value is not None:
                setattr(row, key, value)

        if track_stock is not None:
            row.tracking_mode = "quantity" if track_stock else "none"
            row.is_active = track_stock

        self._db.flush()
        return row

    def sync_barcode_from_item(self, item_id: str) -> None:
        """Copy items.barcode into scanner_ready when barcode exists."""
        item = self._db.get(Item, item_id)
        if not item:
            return
        row = self.get_by_item_id(item_id)
        if not row:
            return
        if item.barcode:
            row.scanner_ready = True
            if not row.qr_code:
                row.qr_code = item.barcode
            self._db.flush()
