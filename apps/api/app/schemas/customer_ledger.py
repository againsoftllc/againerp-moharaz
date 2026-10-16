from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class CustomerLedgerEntryRead(BaseModel):
    """One movement on the customer account — an invoice raised or a payment received."""

    id: str
    kind: str  # receivable | payment
    entry_date: Optional[date] = None
    reference: str
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    # Receivables increase what they owe us, payments reduce it.
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    due: Decimal = Field(
        default=Decimal("0"),
        description="Still unpaid on this invoice. Zero on payment rows.",
    )
    status: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime


class CustomerLedgerAgeing(BaseModel):
    current: Decimal = Decimal("0")
    days_30: Decimal = Decimal("0")
    days_60: Decimal = Decimal("0")
    days_90_plus: Decimal = Decimal("0")


class CustomerLedgerSummary(BaseModel):
    opening_balance: Decimal = Decimal("0")
    billed_total: Decimal
    paid_total: Decimal
    outstanding: Decimal
    advance: Decimal = Decimal("0")
    overdue: Decimal
    open_bill_count: int
    ageing: CustomerLedgerAgeing


class CustomerLedgerResponse(BaseModel):
    data: List[CustomerLedgerEntryRead]
    meta: CustomerLedgerSummary
    errors: List[str] = []


class CustomerPaymentCreate(BaseModel):
    amount: Decimal = Field(ge=0)
    payment_date: Optional[date] = None
    payment_method: str = Field(default="bank", max_length=32)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    reference: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None
    receivable_id: Optional[str] = Field(default=None, max_length=36)
    # "Pay dues": settle these invoices in this order; leftover goes oldest-first, then credit.
    receivable_ids: Optional[List[str]] = None
    write_off_amount: Optional[Decimal] = Field(default=None, ge=0)
    write_off_reason: Optional[str] = Field(default=None, max_length=255)


class CustomerPaymentAllocation(BaseModel):
    receivable_id: str
    invoice_number: str
    order_id: Optional[str] = None
    amount: Decimal


class CustomerPaymentRead(BaseModel):
    id: str
    payment_number: str
    payment_date: date
    amount: Decimal
    payment_method: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    applied_to: List[str] = []
    allocations: List[CustomerPaymentAllocation] = []
    write_off_amount: Optional[Decimal] = None
    created_at: datetime


class CustomerPaymentResponse(BaseModel):
    data: CustomerPaymentRead
    errors: List[str] = []


class CustomerInvoiceCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None


class CustomerInvoiceRead(BaseModel):
    id: str
    invoice_number: str
    amount: Decimal
    due_date: Optional[date] = None
    status: str
    created_at: datetime


class CustomerInvoiceResponse(BaseModel):
    data: CustomerInvoiceRead
    errors: List[str] = []
