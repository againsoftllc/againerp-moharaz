from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class LedgerEntryRead(BaseModel):
    """One movement on the supplier account — a bill raised or a payment made."""

    id: str
    kind: str  # payable | payment
    entry_date: Optional[date] = None
    reference: str
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    # Payables increase what we owe, payments reduce it.
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    due: Decimal = Field(default=Decimal("0"), description="Still unpaid on this bill. Zero on payment rows.")
    status: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime


class LedgerAgeing(BaseModel):
    current: Decimal = Decimal("0")
    days_30: Decimal = Decimal("0")
    days_60: Decimal = Decimal("0")
    days_90_plus: Decimal = Decimal("0")


class LedgerSummary(BaseModel):
    opening_balance: Decimal = Decimal("0")
    billed_total: Decimal
    paid_total: Decimal
    outstanding: Decimal
    advance: Decimal = Decimal("0")
    overdue: Decimal
    open_bill_count: int
    ageing: LedgerAgeing


class SupplierLedgerResponse(BaseModel):
    data: List[LedgerEntryRead]
    meta: LedgerSummary
    errors: List[str] = []


class SupplierPaymentCreate(BaseModel):
    amount: Decimal = Field(ge=0)
    payment_date: Optional[date] = None
    payment_method: str = Field(default="bank", max_length=32)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    reference: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None
    # Optional: settle a specific payable, otherwise oldest-first.
    payable_id: Optional[str] = Field(default=None, max_length=36)
    write_off_amount: Optional[Decimal] = Field(default=None, ge=0)
    write_off_reason: Optional[str] = Field(default=None, max_length=255)
    # outbound = a payment to the supplier; inbound = a refund received from the supplier (the "return due")
    direction: str = Field(default="outbound", pattern="^(outbound|inbound)$")


class SupplierPaymentRead(BaseModel):
    id: str
    payment_number: str
    payment_date: date
    amount: Decimal
    payment_method: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    applied_to: List[str] = []
    write_off_amount: Optional[Decimal] = None
    direction: str = "outbound"
    created_at: datetime


class SupplierPaymentResponse(BaseModel):
    data: SupplierPaymentRead
    errors: List[str] = []


class SupplierPaymentListResponse(BaseModel):
    data: List[SupplierPaymentRead]
    errors: List[str] = []


class SupplierStatementLine(BaseModel):
    """One line of the supplier statement. Cr raises what we owe (bills), Dr lowers it (payments)."""

    id: str
    date: date
    transaction_type: str
    particular: str
    transaction_no: Optional[str] = None
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    balance: Decimal = Field(default=Decimal("0"), description="Cr − Dr after this line: positive means we owe the supplier.")
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    journal_entry_id: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None


class SupplierStatementParty(BaseModel):
    id: str
    code: str
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    country: Optional[str] = None
    currency: Optional[str] = None
    payment_terms: Optional[str] = None


class SupplierStatementOpenOrder(BaseModel):
    id: str
    po_number: str
    order_date: date
    status: str
    total: Decimal
    unreceived: Decimal


class SupplierStatementCheque(BaseModel):
    """An issued cheque that is not honoured yet on the statement's last day."""

    id: str
    cheque_number: str
    cheque_date: date
    bank_name: str
    amount: Decimal
    status: str  # issued (not treated) | presented | bounced (dishonoured)
    status_date: date
    document_number: Optional[str] = None


class SupplierCreditSummary(BaseModel):
    """OnerERP's Credit Limit Summary. Amounts are Cr-positive like the statement: positive = we owe."""

    ledger_balance: Decimal = Field(description="The statement's closing balance.")
    adv_cheque_issued: Decimal = Field(
        default=Decimal("0"), description="Issued cheques already on the ledger as paid but not honoured: not treated + presented."
    )
    not_treated: Decimal = Decimal("0")
    presented: Decimal = Decimal("0")
    dishonoured: Decimal = Field(
        default=Decimal("0"),
        description="Dishonoured cheques still open. A bounce already puts the amount back on the ledger, so it is not deducted again.",
    )
    net_outstanding: Decimal = Field(description="Ledger balance as if the cheques not honoured yet were not paid.")
    unsettled_order_balance: Decimal = Field(description="Confirmed purchase orders not received yet.")
    net_outstanding_with_orders: Decimal
    credit_limit: Decimal
    available_credit: Optional[Decimal] = None
    credit_allowed_days: Optional[int] = None
    open_orders: List[SupplierStatementOpenOrder] = []


class SupplierTransactionSummary(BaseModel):
    transaction_type: str
    count: int
    debit: Decimal
    credit: Decimal


class SupplierStatementRead(BaseModel):
    supplier: SupplierStatementParty
    date_from: date
    date_to: date
    opening_balance: Decimal
    lines: List[SupplierStatementLine]
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    transaction_summary: List[SupplierTransactionSummary]
    credit_summary: SupplierCreditSummary
    pending_cheques: List[SupplierStatementCheque] = []


class SupplierStatementResponse(BaseModel):
    data: SupplierStatementRead
    errors: List[str] = []
