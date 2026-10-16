from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InventoryStockCount(Base):
    """A cycle-count session — snapshot expected qty, record counted qty, post variances."""

    __tablename__ = "inventory_stock_counts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    count_number: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    count_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    counted_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    posted_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list["InventoryStockCountLine"]] = relationship(
        "InventoryStockCountLine",
        back_populates="count",
        cascade="all, delete-orphan",
        order_by="InventoryStockCountLine.sku",
    )


class InventoryStockCountLine(Base):
    __tablename__ = "inventory_stock_count_lines"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    count_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_counts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    stock_level_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_levels.id", ondelete="SET NULL"),
        nullable=True,
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    counted_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tracking_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    count: Mapped[InventoryStockCount] = relationship("InventoryStockCount", back_populates="lines")
    serials: Mapped[list["InventoryStockCountSerial"]] = relationship(
        "InventoryStockCountSerial",
        back_populates="line",
        cascade="all, delete-orphan",
    )


class InventoryStockCountSerial(Base):
    """One expected or counted serial on a cycle-count line — never comma text."""

    __tablename__ = "inventory_stock_count_serials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    count_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_counts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    count_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_count_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    serial_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_serials.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    serial_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="expected", index=True)

    line: Mapped[InventoryStockCountLine] = relationship(
        "InventoryStockCountLine",
        back_populates="serials",
    )
