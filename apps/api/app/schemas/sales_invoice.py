from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class SalesInvoiceLineCreate(BaseModel):
    item_id: Optional[str] = None
    name: str = Field(default="")
    description: Optional[str] = None
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    unit_type: str = Field(default="Unit")
    rate: Decimal = Field(default=Decimal("0"), ge=0)
    taxable: bool = True


class SalesInvoiceLineRead(BaseModel):
    id: str
    item_id: Optional[str] = None
    sort_order: int
    name: str
    description: Optional[str] = None
    quantity: Decimal
    unit_type: str
    rate: Decimal
    taxable: bool
    line_total: Decimal

    model_config = {"from_attributes": True}


class SalesInvoiceCreate(BaseModel):
    customer_id: str
    project_id: Optional[str] = None
    bill_date: date
    due_date: Optional[date] = None
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0)
    second_tax_rate: Decimal = Field(default=Decimal("0"), ge=0)
    tds_rate: Decimal = Field(default=Decimal("0"), ge=0)
    is_recurring: bool = False
    notes: Optional[str] = None
    lines: List[SalesInvoiceLineCreate] = Field(default_factory=list)


class SalesInvoiceUpdate(BaseModel):
    customer_id: Optional[str] = None
    project_id: Optional[str] = None
    bill_date: Optional[date] = None
    due_date: Optional[date] = None
    tax_rate: Optional[Decimal] = None
    second_tax_rate: Optional[Decimal] = None
    tds_rate: Optional[Decimal] = None
    is_recurring: Optional[bool] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    lines: Optional[List[SalesInvoiceLineCreate]] = None


class SalesInvoiceRead(BaseModel):
    id: str
    company_id: str
    invoice_number: str
    customer_id: str
    customer_name: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    status: str
    bill_date: date
    due_date: Optional[date] = None
    tax_rate: Decimal
    second_tax_rate: Decimal
    tds_rate: Decimal
    is_recurring: bool
    notes: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    tds_total: Decimal
    total: Decimal
    amount_paid: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    last_email_sent_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[SalesInvoiceLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SalesInvoiceListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class SalesInvoiceListResponse(BaseModel):
    data: List[SalesInvoiceRead]
    meta: SalesInvoiceListMeta


class SalesInvoiceResponse(BaseModel):
    data: SalesInvoiceRead


class SalesInvoicePaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_account_id: Optional[str] = None
    payment_date: Optional[date] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class SalesInvoicePaymentRead(BaseModel):
    id: str
    payment_number: str
    payment_date: date
    amount: Decimal
    payment_method: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SalesInvoicePaymentListResponse(BaseModel):
    data: List[SalesInvoicePaymentRead]
