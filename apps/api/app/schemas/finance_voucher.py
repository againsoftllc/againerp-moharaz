from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

VOUCHER_TYPE_PATTERN = "^(debit|credit|contra|journal)$"


class VoucherLineInput(BaseModel):
    account_id: str = Field(min_length=1, max_length=36)
    description: Optional[str] = Field(default=None, max_length=255)
    debit: Decimal = Field(default=Decimal("0"), ge=0)
    credit: Decimal = Field(default=Decimal("0"), ge=0)
    cost_center_id: Optional[str] = Field(default=None, max_length=36)


class VoucherCreate(BaseModel):
    voucher_type: str = Field(pattern=VOUCHER_TYPE_PATTERN)
    voucher_date: Optional[date] = None
    description: str = Field(default="", max_length=255)
    reference: Optional[str] = Field(default=None, max_length=64)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    to_payment_account_id: Optional[str] = Field(default=None, max_length=36)
    amount: Decimal = Field(default=Decimal("0"), ge=0)  # contra only; the other types total their lines
    template_id: Optional[str] = Field(default=None, max_length=36)
    lines: List[VoucherLineInput] = Field(default_factory=list)


class VoucherUpdate(BaseModel):
    voucher_date: Optional[date] = None
    description: Optional[str] = Field(default=None, max_length=255)
    reference: Optional[str] = Field(default=None, max_length=64)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    to_payment_account_id: Optional[str] = Field(default=None, max_length=36)
    amount: Optional[Decimal] = Field(default=None, ge=0)
    lines: Optional[List[VoucherLineInput]] = None


class VoucherCancelRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class VoucherLineRead(BaseModel):
    id: str
    line_no: int
    account_id: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    debit: Decimal
    credit: Decimal
    cost_center_id: Optional[str] = None


class VoucherRead(BaseModel):
    id: str
    voucher_number: str
    voucher_type: str
    voucher_date: date
    description: str
    reference: Optional[str] = None
    payment_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None
    to_payment_account_id: Optional[str] = None
    to_payment_account_name: Optional[str] = None
    amount: Decimal
    status: str
    template_id: Optional[str] = None
    journal_entry_id: Optional[str] = None
    journal_entry_number: Optional[str] = None
    reversal_entry_id: Optional[str] = None
    reversal_entry_number: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    lines: List[VoucherLineRead] = Field(default_factory=list)


class VoucherResponse(BaseModel):
    data: VoucherRead


class VoucherListResponse(BaseModel):
    data: List[VoucherRead]
    meta: dict


class VoucherTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    voucher_type: str = Field(pattern=VOUCHER_TYPE_PATTERN)
    description: str = Field(default="", max_length=255)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    to_payment_account_id: Optional[str] = Field(default=None, max_length=36)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    is_active: bool = True
    lines: List[VoucherLineInput] = Field(default_factory=list)


class VoucherTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=255)
    payment_account_id: Optional[str] = Field(default=None, max_length=36)
    to_payment_account_id: Optional[str] = Field(default=None, max_length=36)
    amount: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    lines: Optional[List[VoucherLineInput]] = None


class VoucherTemplateRead(BaseModel):
    id: str
    name: str
    voucher_type: str
    description: str
    payment_account_id: Optional[str] = None
    payment_account_name: Optional[str] = None
    to_payment_account_id: Optional[str] = None
    to_payment_account_name: Optional[str] = None
    amount: Decimal
    is_active: bool
    created_at: datetime
    lines: List[VoucherLineRead] = Field(default_factory=list)


class VoucherTemplateResponse(BaseModel):
    data: VoucherTemplateRead


class VoucherTemplateListResponse(BaseModel):
    data: List[VoucherTemplateRead]
