from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    quantity: Decimal
    unit: Optional[str] = None
    rate: Decimal


class InvoiceItemInput(BaseModel):
    description: str = Field(default="", max_length=2000)
    quantity: Decimal = Field(default=1)
    unit: Optional[str] = Field(default=None, max_length=30)
    rate: Decimal = Field(default=0)


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    invoice_number: str
    customer_id: str
    bill_date: date
    due_date: date
    status: str
    discount: Decimal
    created_at: datetime
    updated_at: datetime
    items: List[InvoiceItemRead] = []
    customer_name: Optional[str] = None
    subtotal: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")


class InvoiceListMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class InvoiceListResponse(BaseModel):
    data: List[InvoiceRead]
    meta: InvoiceListMeta


class InvoiceResponse(BaseModel):
    data: InvoiceRead


class InvoiceCreate(BaseModel):
    customer_id: str
    bill_date: date
    due_date: date
    status: str = Field(default="draft", pattern="^(draft|sent|paid|overdue)$")
    discount: Decimal = Field(default=0, ge=0)
    company_id: str = Field(default="default", max_length=36)
    items: List[InvoiceItemInput] = []


class InvoiceUpdate(BaseModel):
    customer_id: Optional[str] = None
    bill_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(draft|sent|paid|overdue)$")
    discount: Optional[Decimal] = Field(default=None, ge=0)
    items: Optional[List[InvoiceItemInput]] = None
