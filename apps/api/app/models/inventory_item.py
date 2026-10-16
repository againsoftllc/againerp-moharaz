from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryItem(Base):
    """Inventory module extension — tracking, UoM, reorder, barcode config per item."""

    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("item_id", name="uq_inventory_items_item_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    track_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    track_serial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    track_batch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tracking_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="quantity")
    default_warehouse_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    base_uom: Mapped[str] = mapped_column(String(20), nullable=False, default="ea")
    purchase_uom: Mapped[str] = mapped_column(String(20), nullable=False, default="ea")
    sales_uom: Mapped[str] = mapped_column(String(20), nullable=False, default="ea")
    purchase_conversion: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=1)
    sales_conversion: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=1)
    qr_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    scanner_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
