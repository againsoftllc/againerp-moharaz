"""Warehouse stock adjustment documents — draft snapshot, apply writes the ledger."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InventoryStockAdjustment(Base):
    __tablename__ = "inventory_stock_adjustments"
    __table_args__ = (
        UniqueConstraint("company_id", "adjustment_number", name="uq_inventory_stock_adjustment_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    adjustment_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    adjustment_date: Mapped[date] = mapped_column(Date, nullable=False)
    adjustment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="decrease")
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    reason_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    applied_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    lines: Mapped[list["InventoryStockAdjustmentLine"]] = relationship(
        "InventoryStockAdjustmentLine",
        back_populates="adjustment",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["InventoryStockAdjustmentEvent"]] = relationship(
        "InventoryStockAdjustmentEvent",
        back_populates="adjustment",
        cascade="all, delete-orphan",
        order_by="InventoryStockAdjustmentEvent.created_at",
    )


class InventoryStockAdjustmentLine(Base):
    __tablename__ = "inventory_stock_adjustment_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    adjustment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_adjustments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tracking_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    system_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    physical_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    adjustment_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    adjustment: Mapped[InventoryStockAdjustment] = relationship(
        "InventoryStockAdjustment",
        back_populates="lines",
    )
    serials: Mapped[list["InventoryStockAdjustmentSerial"]] = relationship(
        "InventoryStockAdjustmentSerial",
        back_populates="line",
        cascade="all, delete-orphan",
    )


class InventoryStockAdjustmentSerial(Base):
    """One row per serial action — never a comma-separated serial list."""

    __tablename__ = "inventory_stock_adjustment_serials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    adjustment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_adjustments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    adjustment_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_adjustment_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    serial_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("inventory_serials.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(20), nullable=False, default="keep", index=True)

    line: Mapped[InventoryStockAdjustmentLine] = relationship(
        "InventoryStockAdjustmentLine",
        back_populates="serials",
    )


class InventoryStockAdjustmentEvent(Base):
    __tablename__ = "inventory_stock_adjustment_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    adjustment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_adjustments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    performed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    adjustment: Mapped[InventoryStockAdjustment] = relationship(
        "InventoryStockAdjustment",
        back_populates="events",
    )
