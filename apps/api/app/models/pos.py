from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PosSession(Base):
    """Cash drawer session — open/close with float tracking."""

    __tablename__ = "pos_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    terminal_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("pos_terminals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    register_name: Mapped[str] = mapped_column(String(64), nullable=False, default="Register 1")
    cashier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    cashier_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)
    opening_float: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    closing_cash: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    expected_cash: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    cash_variance: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    total_sales: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_returns: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    sale_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opened_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    opening_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closing_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PosCart(Base):
    """POS cart — active, held, completed, or voided."""

    __tablename__ = "pos_carts"
    __table_args__ = (
        UniqueConstraint("company_id", "cart_number", name="uq_pos_cart_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    customer_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("commerce_customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cart_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    order_discount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    sales_order_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    client_mutation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="synced")
    held_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    held_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PosCartLine(Base):
    __tablename__ = "pos_cart_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pos_cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    warranty_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class PosPayment(Base):
    __tablename__ = "pos_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pos_cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_method: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    card_last4: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PosReceipt(Base):
    __tablename__ = "pos_receipts"
    __table_args__ = (
        UniqueConstraint("company_id", "receipt_number", name="uq_pos_receipt_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    pos_cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    receipt_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    sales_order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    receipt_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PosReturn(Base):
    __tablename__ = "pos_returns"
    __table_args__ = (
        UniqueConstraint("company_id", "return_number", name="uq_pos_return_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    original_sales_order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    return_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="posted", index=True)
    refund_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    refund_method: Mapped[str] = mapped_column(String(32), nullable=False, default="cash")
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    client_mutation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PosReturnLine(Base):
    __tablename__ = "pos_return_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pos_return_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sales_order_line_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)


class PosTerminal(Base):
    """Physical register belonging to a warehouse (store)."""

    __tablename__ = "pos_terminals"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_pos_terminal_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    default_cash_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    payment_methods_json: Mapped[str] = mapped_column(Text, nullable=False, default='["cash","card"]')
    receipt_printer: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    barcode_scanner: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    customer_display: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PosCashMovement(Base):
    """Drawer cash in / cash out during an open session."""

    __tablename__ = "pos_cash_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pos_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False, default="other")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PosSetting(Base):
    """One POS settings row per company — does not replace global inventory/tax config."""

    __tablename__ = "pos_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    settings_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
