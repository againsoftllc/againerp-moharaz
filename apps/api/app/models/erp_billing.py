from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

BILL_TYPES = ("subscription", "module", "plugin")
BILL_STATUSES = ("unpaid", "paid", "cancelled")


def new_pay_token() -> str:
    return secrets.token_urlsafe(24)


class ErpBill(Base):
    """A bill for the ERP itself (subscription, a module or a plugin) — paid from a link, through the billing
    gateway set up in Workspace → Billing (the ERP vendor's merchant account, not the shop's own gateway)."""

    __tablename__ = "erp_bills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    bill_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    bill_type: Mapped[str] = mapped_column(String(20), nullable=False, default="subscription", index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # the plan slug / module id / plugin id the bill is for
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    period_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BDT")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unpaid", index=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True, default=new_pay_token)
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    paid_method: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    paid_ref: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ErpBillPayment(Base):
    """One gateway checkout attempt for a bill."""

    __tablename__ = "erp_bill_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bill_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("erp_bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gateway: Mapped[str] = mapped_column(String(30), nullable=False, default="sslcommerz")
    tran_id: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    session_key: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")
    gateway_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    return_origin: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    val_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bank_tran_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    raw_result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
