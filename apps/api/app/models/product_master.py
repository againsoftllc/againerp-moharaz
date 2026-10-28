from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryUnitType(Base):
    """Unit type master (OnerERP Unit Type: Code, Name, FractionalLength). `code` is what `inventory_items.base_uom` and the
    product's unit type hold. Before this, custom units lived in each browser's localStorage (INV-08)."""

    __tablename__ = "inventory_unit_types"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_inventory_unit_type_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    fraction_length: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # decimals a quantity may carry
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class InventoryWarehouseType(Base):
    """Warehouse type list (Showroom, Main store, ...). Kept per company instead of per browser (INV-08)."""

    __tablename__ = "inventory_warehouse_types"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_inventory_warehouse_type_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CatalogProductRelation(Base):
    """Related or spare product (OnerERP RelatedOrSpareProduct): `kind` related = shown alongside, spare = a part RMA can use."""

    __tablename__ = "catalog_product_relations"
    __table_args__ = (UniqueConstraint("product_id", "related_product_id", "kind", name="uq_catalog_product_relation"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    related_product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="related")  # related | spare
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
