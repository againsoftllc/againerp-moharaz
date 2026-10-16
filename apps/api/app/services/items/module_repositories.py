"""Module extension repositories — inventory integration for STEP 03."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.ecommerce_item import EcommerceItem
from app.models.inventory_item import InventoryItem
from app.models.manufacturing_item import ManufacturingItem
from app.models.service_item import ServiceItem
from app.models.supplier_link import SupplierLink


class SqlAlchemyInventoryItemRepository:
    module_key = "inventory"

    def __init__(self, db: Session) -> None:
        self._db = db

    def has_extension(self, item_id: str) -> bool:
        return (
            self._db.query(InventoryItem.id)
            .filter(InventoryItem.item_id == item_id)
            .first()
            is not None
        )

    def ensure_extension(
        self,
        item_id: str,
        *,
        company_id: str = "default",
        track_stock: bool = True,
        default_warehouse_id: Optional[str] = None,
    ) -> None:
        if self.has_extension(item_id):
            row = (
                self._db.query(InventoryItem)
                .filter(InventoryItem.item_id == item_id)
                .first()
            )
            if row and track_stock:
                row.track_stock = True
                row.is_active = True
                if default_warehouse_id and not row.default_warehouse_id:
                    row.default_warehouse_id = default_warehouse_id
                self._db.flush()
            return
        self._db.add(
            InventoryItem(
                item_id=item_id,
                company_id=company_id,
                inventory_status="active",
                track_stock=track_stock,
                track_serial=False,
                track_batch=False,
                tracking_mode="quantity" if track_stock else "none",
                default_warehouse_id=default_warehouse_id,
                is_active=track_stock,
            ),
        )
        self._db.flush()

    def set_default_warehouse(self, item_id: str, warehouse_id: Optional[str]) -> None:
        row = (
            self._db.query(InventoryItem)
            .filter(InventoryItem.item_id == item_id)
            .first()
        )
        if not row:
            self.ensure_extension(item_id)
            row = (
                self._db.query(InventoryItem)
                .filter(InventoryItem.item_id == item_id)
                .first()
            )
        if row:
            row.default_warehouse_id = warehouse_id
            self._db.flush()


class SqlAlchemyEcommerceItemRepository:
    module_key = "ecommerce"

    def __init__(self, db: Session) -> None:
        self._db = db

    def has_extension(self, item_id: str) -> bool:
        return (
            self._db.query(EcommerceItem.id)
            .filter(EcommerceItem.item_id == item_id)
            .first()
            is not None
        )

    def ensure_extension(self, item_id: str, *, company_id: str = "default") -> None:
        if self.has_extension(item_id):
            return
        self._db.add(
            EcommerceItem(
                item_id=item_id,
                company_id=company_id,
                slug=f"draft-{item_id[:8]}",
                publish_status="draft",
                is_active=False,
            ),
        )
        self._db.flush()

    def link_catalog_product(self, item_id: str, catalog_product_id: str) -> None:
        row = (
            self._db.query(EcommerceItem)
            .filter(EcommerceItem.item_id == item_id)
            .first()
        )
        if not row:
            self.ensure_extension(item_id)
            row = (
                self._db.query(EcommerceItem)
                .filter(EcommerceItem.item_id == item_id)
                .first()
            )
        if row:
            row.catalog_product_id = catalog_product_id
            self._db.flush()


class SqlAlchemyServiceItemRepository:
    module_key = "service"

    def __init__(self, db: Session) -> None:
        self._db = db

    def has_extension(self, item_id: str) -> bool:
        return (
            self._db.query(ServiceItem.id)
            .filter(ServiceItem.item_id == item_id)
            .first()
            is not None
        )

    def get(self, item_id: str) -> Optional[ServiceItem]:
        return (
            self._db.query(ServiceItem)
            .filter(ServiceItem.item_id == item_id)
            .first()
        )

    def ensure_extension(
        self,
        item_id: str,
        *,
        company_id: str = "default",
        description: Optional[str] = None,
        category: Optional[str] = None,
        unit_type: Optional[str] = None,
        rate: Optional[Decimal] = None,
        show_in_client_portal: bool = False,
        image_url: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> None:
        if self.has_extension(item_id):
            return
        self._db.add(
            ServiceItem(
                item_id=item_id,
                company_id=company_id,
                is_active=False,
                description=description,
                category=category,
                unit_type=unit_type,
                rate=rate if rate is not None else Decimal("0"),
                show_in_client_portal=show_in_client_portal,
                image_url=image_url,
                created_by=created_by,
            ),
        )
        self._db.flush()

    def update_extension(
        self,
        item_id: str,
        *,
        description: Optional[str] = None,
        category: Optional[str] = None,
        unit_type: Optional[str] = None,
        rate: Optional[Decimal] = None,
        show_in_client_portal: Optional[bool] = None,
        image_url: Optional[str] = None,
    ) -> None:
        row = self.get(item_id)
        if not row:
            return
        if description is not None:
            row.description = description
        if category is not None:
            row.category = category
        if unit_type is not None:
            row.unit_type = unit_type
        if rate is not None:
            row.rate = rate
        if show_in_client_portal is not None:
            row.show_in_client_portal = show_in_client_portal
        if image_url is not None:
            row.image_url = image_url
        self._db.flush()


class SqlAlchemyManufacturingItemRepository:
    module_key = "manufacturing"

    def __init__(self, db: Session) -> None:
        self._db = db

    def has_extension(self, item_id: str) -> bool:
        return (
            self._db.query(ManufacturingItem.id)
            .filter(ManufacturingItem.item_id == item_id)
            .first()
            is not None
        )

    def ensure_extension(self, item_id: str, *, company_id: str = "default") -> None:
        if self.has_extension(item_id):
            return
        self._db.add(
            ManufacturingItem(
                item_id=item_id,
                company_id=company_id,
                is_active=False,
            ),
        )
        self._db.flush()


class SqlAlchemySupplierLinkRepository:
    module_key = "supplier"

    def __init__(self, db: Session) -> None:
        self._db = db

    def has_extension(self, item_id: str) -> bool:
        return (
            self._db.query(SupplierLink.id)
            .filter(SupplierLink.item_id == item_id)
            .first()
            is not None
        )

    def ensure_extension(self, item_id: str, *, company_id: str = "default") -> None:
        return

    def link_supplier(
        self,
        item_id: str,
        supplier_id: str,
        *,
        company_id: str = "default",
        is_preferred: bool = False,
        sort_order: int = 0,
    ) -> None:
        existing = (
            self._db.query(SupplierLink)
            .filter(
                SupplierLink.item_id == item_id,
                SupplierLink.supplier_id == supplier_id,
            )
            .first()
        )
        if existing:
            existing.is_preferred = is_preferred
            existing.sort_order = sort_order
            self._db.flush()
            return
        self._db.add(
            SupplierLink(
                item_id=item_id,
                supplier_id=supplier_id,
                company_id=company_id,
                is_preferred=is_preferred,
                sort_order=sort_order,
            ),
        )
        self._db.flush()
