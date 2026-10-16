from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryStockQuant(Base):
    """stock.quant — on-hand quantity line (physical inventory count)."""

    __tablename__ = "inventory_stock_quants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_categ_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    product_categ_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lot_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    location_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, default="WH/Stock")
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    inventory_quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    inventory_diff_quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    inventory_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scheduled_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    accounting_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
