"""Supplier bill (vendor invoice) — the 3-way-match document between a PO, its
Goods Receipt(s), and the supplier's actual invoice. Posting to Finance is careful
not to double the AP/COGS entry a Goods Receipt already created (see
PurchaseBillService.post_to_finance)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PurchaseBill(Base):
    __tablename__ = "purchase_bills"
    __table_args__ = (
        UniqueConstraint("company_id", "bill_number", name="uq_purchase_bill_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    bill_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vendor_invoice_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    purchase_order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("purchase_orders.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    purchase_receipt_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("purchase_receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    supplier_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    match_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unmatched")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    # The FinancePayable this bill is tied to — either a brand-new one this bill
    # created, or an existing Goods-Receipt-sourced one it matched against
    # (in which case posting this bill does NOT create a second journal entry).
    payable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    matched_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    posted_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PurchaseBillLine(Base):
    __tablename__ = "purchase_bill_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_bill_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("purchase_bills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purchase_order_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("purchase_order_lines.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    quantity_po: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_receipt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity_bill: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit_price_po: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    unit_price_bill: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
