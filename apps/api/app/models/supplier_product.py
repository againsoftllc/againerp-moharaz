from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SupplierProduct(Base):
    """External supplier catalog entry — NOT an ERP item."""

    __tablename__ = "supplier_products"
    __table_args__ = (
        UniqueConstraint("supplier_id", "supplier_sku", "company_id", name="uq_supplier_product_sku"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    supplier_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("commerce_suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_sku: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    supplier_title: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BDT")
    supplier_stock: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    min_order_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    warranty: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    api_source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", index=True)
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
