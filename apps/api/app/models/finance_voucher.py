from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# debit = money paid out of a cash / bank account (OnerERP Debit / Payment), credit = money received into one (Credit / Receive),
# contra = cash <-> bank or bank <-> bank, journal = any heads, debits equal credits.
VOUCHER_TYPES = ("debit", "credit", "contra", "journal")
VOUCHER_STATUSES = ("draft", "approved", "cancelled")


class FinanceVoucher(Base):
    """A hand-entered voucher. Draft until approved; approving posts the journal (and the cash / bank movement), cancelling posts
    the mirror entry. Nothing posted is ever edited or deleted."""

    __tablename__ = "finance_vouchers"
    __table_args__ = (UniqueConstraint("company_id", "voucher_number", name="uq_finance_voucher_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    voucher_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    voucher_type: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    voucher_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # debit / credit: the cash or bank account the money leaves / enters; contra: the account it leaves
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    # contra only: the account the money goes to
    to_payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft", index=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    reversal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FinanceVoucherLine(Base):
    __tablename__ = "finance_voucher_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    voucher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("finance_vouchers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("finance_accounts.id", ondelete="RESTRICT"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cost_center_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)


class FinanceVoucherTemplate(Base):
    """A voucher kept for re-use (rent, salaries, the daily cash deposit): "Voucher from template" copies it into a new draft."""

    __tablename__ = "finance_voucher_templates"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_finance_voucher_template_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(12), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    to_payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FinanceVoucherTemplateLine(Base):
    __tablename__ = "finance_voucher_template_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("finance_voucher_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("finance_accounts.id", ondelete="RESTRICT"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cost_center_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
