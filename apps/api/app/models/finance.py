from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinanceAccount(Base):
    """Chart of accounts — foundation only, not full GL."""

    __tablename__ = "finance_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_finance_account_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # False = a group: it takes no postings, its children do (services/finance/master_service.py)
    is_postable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinancePaymentAccount(Base):
    """Money-holding account (cash box, bank, mobile wallet) — where the company's money actually sits."""

    __tablename__ = "finance_payment_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_finance_payment_account_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    gl_account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Money may not go out beyond the balance (OnerERP CheckAccountsBalance).
    check_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # A bank account: its bank branch (finance_bank_branches) and the account number and title at the bank.
    bank_branch_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    account_title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceJournalEntry(Base):
    __tablename__ = "finance_journal_entries"
    __table_args__ = (
        UniqueConstraint("company_id", "entry_number", name="uq_finance_journal_entry_number"),
        UniqueConstraint("company_id", "source_type", "source_id", name="uq_finance_journal_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    entry_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="posted")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class FinanceJournalLine(Base):
    __tablename__ = "finance_journal_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    journal_entry_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_journal_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    party_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    party_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cost_center_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)


class FinancePayment(Base):
    __tablename__ = "finance_payments"
    __table_args__ = (
        UniqueConstraint("company_id", "payment_number", name="uq_finance_payment_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    payment_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    payment_method: Mapped[str] = mapped_column(String(32), nullable=False, default="cash")
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="inbound")
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    party_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    party_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Optional link to the CRM project this payment belongs to (e.g. a client deposit).
    project_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("crm_projects.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class FinanceReceivable(Base):
    __tablename__ = "finance_receivables"
    __table_args__ = (
        UniqueConstraint("company_id", "source_type", "source_id", name="uq_finance_receivable_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    customer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    posting_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    posting_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Optional link to the CRM project this invoice/receivable belongs to.
    project_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("crm_projects.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceExpenseCategory(Base):
    __tablename__ = "finance_expense_categories"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_finance_expense_category_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceExpense(Base):
    __tablename__ = "finance_expenses"
    __table_args__ = (
        UniqueConstraint("company_id", "expense_number", name="uq_finance_expense_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    expense_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    category_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_expense_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    payee: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    payment_method: Mapped[str] = mapped_column(String(32), nullable=False, default="cash")
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    allocation_rule_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    allocation_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    allocation_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allocation_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Optional link to the CRM project this expense was incurred for.
    project_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("crm_projects.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    # Optional link to the Customer/Supplier/Vendor party this expense was paid to.
    party_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinancePayable(Base):
    __tablename__ = "finance_payables"
    __table_args__ = (
        UniqueConstraint("company_id", "source_type", "source_id", name="uq_finance_payable_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    supplier_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    reference_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    posting_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    posting_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceCostCenter(Base):
    """Concern / cost-center dimension on the same books — not a separate legal entity."""

    __tablename__ = "finance_cost_centers"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_finance_cost_center_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="concern")
    branch_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceAllocationRule(Base):
    __tablename__ = "finance_allocation_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="quantity")
    unit_label: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class FinanceAllocationRuleLine(Base):
    __tablename__ = "finance_allocation_rule_lines"
    __table_args__ = (
        UniqueConstraint("rule_id", "cost_center_id", name="uq_finance_allocation_rule_line_cc"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_allocation_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cost_center_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("finance_cost_centers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    basis_value: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    percentage: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=0)
    fixed_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)


class FinanceCheque(Base):
    """Received / issued cheque. Accounting lives in the normal journal — rows here only track lifecycle."""

    __tablename__ = "finance_cheques"
    # Duplicate numbers are blocked in ChequeService (cancelled cheques free their number),
    # so there is deliberately no DB unique constraint.

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # received | issued
    cheque_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    cheque_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="received", index=True)
    party_type: Mapped[str] = mapped_column(String(20), nullable=False)  # customer | supplier
    party_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    receivable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("finance_receivables.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    payable_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("finance_payables.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    # Bank the cheque is deposited into / drawn on. Set on deposit (received) or clearance (issued).
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    receipt_journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    deposit_journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    clearance_journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reversal_journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    bank_charge_journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    bank_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )


class FinanceChequeEvent(Base):
    """Append-only audit trail of cheque status changes."""

    __tablename__ = "finance_cheque_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cheque_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("finance_cheques.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    to_status: Mapped[str] = mapped_column(String(16), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    actor: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
