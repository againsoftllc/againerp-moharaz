"""Repository and module-extension interfaces for Universal Item platform."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class ItemRecord:
    id: str
    company_id: str
    sku: str
    barcode: Optional[str]
    name: str
    item_type: str
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ItemCreateInput:
    sku: str
    name: str
    item_type: str = "physical"
    status: str = "draft"
    company_id: str = "default"
    barcode: Optional[str] = None
    id: Optional[str] = None


@dataclass(frozen=True)
class ItemUpdateInput:
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    item_type: Optional[str] = None
    status: Optional[str] = None


@runtime_checkable
class ItemRepository(Protocol):
    def get_by_id(self, item_id: str) -> Optional[ItemRecord]: ...

    def get_by_sku(self, company_id: str, sku: str) -> Optional[ItemRecord]: ...

    def list_items(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ItemRecord]: ...

    def create(self, data: ItemCreateInput) -> ItemRecord: ...

    def update(self, item_id: str, data: ItemUpdateInput) -> Optional[ItemRecord]: ...


@runtime_checkable
class ModuleExtensionRepository(Protocol):
    """Base contract for module extension tables keyed by item_id."""

    module_key: str

    def has_extension(self, item_id: str) -> bool: ...

    def ensure_extension(self, item_id: str, *, company_id: str = "default") -> None: ...


class InventoryItemRepository(ModuleExtensionRepository, Protocol):
    def set_default_warehouse(self, item_id: str, warehouse_id: Optional[str]) -> None: ...


class EcommerceItemRepository(ModuleExtensionRepository, Protocol):
    def link_catalog_product(self, item_id: str, catalog_product_id: str) -> None: ...


class ServiceItemRepository(ModuleExtensionRepository, Protocol):
    ...


class ManufacturingItemRepository(ModuleExtensionRepository, Protocol):
    ...


class SupplierLinkRepository(ModuleExtensionRepository, Protocol):
    def link_supplier(
        self,
        item_id: str,
        supplier_id: str,
        *,
        is_preferred: bool = False,
        sort_order: int = 0,
    ) -> None: ...
