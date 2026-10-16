from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryStockMovement(Base):
    """Immutable stock movement ledger — audit-ready history."""

    __tablename__ = "inventory_stock_movements"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_level_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_levels.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    movement_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qty_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qty_after: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    document_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    posting_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    value_delta: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    reverses_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_movements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reversed_by_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_movements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_warehouse_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    dest_warehouse_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    location_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        index=True,
    )
