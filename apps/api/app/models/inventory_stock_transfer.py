"""Warehouse-to-warehouse stock transfer documents (two-step ship → receive)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InventoryStockTransfer(Base):
    __tablename__ = "inventory_stock_transfers"
    __table_args__ = (
        UniqueConstraint("company_id", "transfer_number", name="uq_inventory_stock_transfer_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    transfer_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    from_warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    to_warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    requested_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    shipped_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    received_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    lines: Mapped[list["InventoryStockTransferLine"]] = relationship(
        "InventoryStockTransferLine",
        back_populates="transfer",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["InventoryStockTransferEvent"]] = relationship(
        "InventoryStockTransferEvent",
        back_populates="transfer",
        cascade="all, delete-orphan",
        order_by="InventoryStockTransferEvent.created_at",
    )


class InventoryStockTransferLine(Base):
    __tablename__ = "inventory_stock_transfer_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    transfer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_transfers.id", ondelete="CASCADE"),
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
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shipped_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    transfer: Mapped[InventoryStockTransfer] = relationship("InventoryStockTransfer", back_populates="lines")
    serials: Mapped[list["InventoryStockTransferSerial"]] = relationship(
        "InventoryStockTransferSerial",
        back_populates="line",
        cascade="all, delete-orphan",
    )


class InventoryStockTransferSerial(Base):
    """Links a transfer line to an existing inventory serial — never stores the serial as text."""

    __tablename__ = "inventory_stock_transfer_serials"
    __table_args__ = (
        UniqueConstraint("transfer_id", "serial_id", name="uq_inventory_stock_transfer_serial"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    transfer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_transfer_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    serial_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_serials.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="selected", index=True)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    line: Mapped[InventoryStockTransferLine] = relationship(
        "InventoryStockTransferLine",
        back_populates="serials",
    )


class InventoryStockTransferEvent(Base):
    __tablename__ = "inventory_stock_transfer_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    transfer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    performed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    transfer: Mapped[InventoryStockTransfer] = relationship("InventoryStockTransfer", back_populates="events")
