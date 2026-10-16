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
    created_at: datetime


class SupplierPaymentResponse(BaseModel):
    data: SupplierPaymentRead
    errors: List[str] = []


class SupplierPaymentListResponse(BaseModel):
    data: List[SupplierPaymentRead]
    errors: List[str] = []
