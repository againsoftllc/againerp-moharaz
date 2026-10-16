from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SalesReturn(Base):
    """Customer return / credit note against a delivered sales order (Odoo RE / credit memo)."""

    __tablename__ = "sales_returns"
    __table_args__ = (UniqueConstraint("company_id", "return_number", name="uq_sales_return_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    return_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    sales_order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sales_orders.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    reason: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    requested_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    receivable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    confirmed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    credited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    credited_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class SalesReturnLine(Base):
    __tablename__ = "sales_return_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sales_return_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sales_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sales_order_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sales_order_lines.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity_returned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    reason: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Serial units coming back on this line (JSON list).
    serial_numbers_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    @property
    def serial_numbers(self) -> list[str]:
        raw = self.serial_numbers_json
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return []
        return [str(v) for v in data if str(v).strip()] if isinstance(data, list) else []

    @serial_numbers.setter
    def serial_numbers(self, values: list[str]) -> None:
        cleaned = [str(v).strip() for v in (values or []) if str(v).strip()]
        self.serial_numbers_json = json.dumps(cleaned) if cleaned else None
