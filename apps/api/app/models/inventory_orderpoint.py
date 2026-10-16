from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryOrderpoint(Base):
    """stock.warehouse.orderpoint — replenishment / reorder rule."""

    __tablename__ = "inventory_orderpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    qty_on_hand: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    qty_forecast: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    route_name: Mapped[str] = mapped_column(String(64), nullable=False, default="Buy")
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    vendor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    product_min_qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    product_max_qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    qty_multiple: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=1)
    qty_to_order: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    snoozed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
