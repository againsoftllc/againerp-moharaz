from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    status: str
    branch_count: int
    legal_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    vat_number: Optional[str] = None
    registration_no: Optional[str] = None
    currency_code: Optional[str] = None
    language_code: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    decimal_places: Optional[int] = None
    number_grouping: Optional[str] = None
    fiscal_year_start_month: Optional[int] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_routing: Optional[str] = None
    invoice_prefix: Optional[str] = None
    invoice_include_year: Optional[bool] = None
    invoice_padding: Optional[int] = None
    invoice_next_sequence: Optional[int] = None
    invoice_due_days: Optional[int] = None
    invoice_payment_terms: Optional[str] = None
    invoice_tax_rate: Optional[Decimal] = None
    invoice_prices_include_tax: Optional[bool] = None
    tax_enabled: Optional[bool] = None
    invoice_footer: Optional[str] = None
    credit_note_prefix: Optional[str] = None
    invoice_layout: Optional[dict[str, Any]] = None
    packing_layout: Optional[dict[str, Any]] = None
    purchase_layout: Optional[dict[str, Any]] = None
    payment_layout: Optional[dict[str, Any]] = None
    invoice_next_preview: Optional[str] = None
    packing_next_preview: Optional[str] = None
    purchase_next_preview: Optional[str] = None
    payment_next_preview: Optional[str] = None


class WorkspaceCompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    legal_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    mobile: Optional[str] = Field(default=None, max_length=50)
    website: Optional[str] = Field(default=None, max_length=255)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    street: Optional[str] = Field(default=None, max_length=255)
    street2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    zip_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=100)
    tax_id: Optional[str] = Field(default=None, max_length=64)
    vat_number: Optional[str] = Field(default=None, max_length=64)
    registration_no: Optional[str] = Field(default=None, max_length=64)
    currency_code: Optional[str] = Field(default=None, max_length=8)
    language_code: Optional[str] = Field(default=None, max_length=8)
    timezone: Optional[str] = Field(default=None, max_length=64)
    date_format: Optional[str] = Field(default=None, max_length=24)
    time_format: Optional[str] = Field(default=None, max_length=24)
    decimal_places: Optional[int] = Field(default=None, ge=0, le=4)
    number_grouping: Optional[str] = Field(default=None, max_length=24)
    fiscal_year_start_month: Optional[int] = Field(default=None, ge=1, le=12)
    bank_name: Optional[str] = Field(default=None, max_length=255)
    bank_account: Optional[str] = Field(default=None, max_length=64)
    bank_branch: Optional[str] = Field(default=None, max_length=255)
    bank_routing: Optional[str] = Field(default=None, max_length=64)
    invoice_prefix: Optional[str] = Field(default=None, max_length=32)
    invoice_include_year: Optional[bool] = None
    invoice_padding: Optional[int] = Field(default=None, ge=1, le=8)
    invoice_next_sequence: Optional[int] = Field(default=None, ge=1, le=99_999_999)
    invoice_due_days: Optional[int] = Field(default=None, ge=0, le=365)
    invoice_payment_terms: Optional[str] = Field(default=None, max_length=64)
    invoice_tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    invoice_prices_include_tax: Optional[bool] = None
    tax_enabled: Optional[bool] = None
    invoice_footer: Optional[str] = Field(default=None, max_length=4000)
    credit_note_prefix: Optional[str] = Field(default=None, max_length=32)
    invoice_layout: Optional[dict[str, Any]] = None
    packing_layout: Optional[dict[str, Any]] = None
    purchase_layout: Optional[dict[str, Any]] = None
    payment_layout: Optional[dict[str, Any]] = None


class WorkspaceCompanyResponse(BaseModel):
    data: WorkspaceCompanyRead
