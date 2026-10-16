from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

SUPPLIER_STATUS_PATTERN = "^(active|blocked|preferred)$"


class SupplierContactIn(BaseModel):
    name: Optional[str] = Field(default="", max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)
    email: Optional[str] = Field(default="", max_length=255)
    phone: Optional[str] = Field(default="", max_length=50)


class SupplierCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    email: Optional[str] = Field(default="", max_length=255)
    phone: Optional[str] = Field(default="", max_length=50)
    vendor_code: Optional[str] = Field(default=None, max_length=50)
    payment_terms: str = Field(default="Net 30", max_length=50)
    lead_time_days: int = Field(default=7, ge=0)
    status: str = Field(default="active", pattern=SUPPLIER_STATUS_PATTERN)
    country: str = Field(default="Bangladesh", max_length=100)
    tax_id: Optional[str] = Field(default=None, max_length=50)
    website: Optional[str] = Field(default=None, max_length=500)
    currency: Optional[str] = Field(default=None, max_length=10)
    opening_balance: Decimal = Field(default=Decimal("0"))
    credit_limit: Decimal = Field(default=Decimal("0"))
    payment_schedule: Optional[str] = Field(default=None, max_length=50)
    min_order_value: Optional[Decimal] = Field(default=None, ge=0)
    incoterms: Optional[str] = Field(default=None, max_length=50)
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    address: Optional[str] = Field(default=None, max_length=500)
    # Seeds contacts_json. `contacts` wins when both are sent.
    contact_name: Optional[str] = Field(default=None, max_length=100)
    contact_role: Optional[str] = Field(default=None, max_length=100)
    contacts: Optional[List["SupplierContactIn"]] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    vendor_code: Optional[str] = Field(default=None, max_length=50)
    payment_terms: Optional[str] = Field(default=None, max_length=50)
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    status: Optional[str] = Field(default=None, pattern=SUPPLIER_STATUS_PATTERN)
    country: Optional[str] = Field(default=None, max_length=100)
    tax_id: Optional[str] = Field(default=None, max_length=50)
    website: Optional[str] = Field(default=None, max_length=500)
    currency: Optional[str] = Field(default=None, max_length=10)
    opening_balance: Optional[Decimal] = None
    credit_limit: Optional[Decimal] = None
    payment_schedule: Optional[str] = Field(default=None, max_length=50)
    min_order_value: Optional[Decimal] = Field(default=None, ge=0)
    incoterms: Optional[str] = Field(default=None, max_length=50)
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    address: Optional[str] = Field(default=None, max_length=500)
    contacts: Optional[List[SupplierContactIn]] = None


class SupplierRead(BaseModel):
    id: str
    company_id: str
    party_id: Optional[str] = None
    vendor_code: str
    name: str
    email: str
    phone: str
    payment_terms: str
    lead_time_days: int
    rating: Decimal
    open_pos: int
    spend_ytd: Decimal
    status: str
    country: str
    tax_id: Optional[str] = None
    website: Optional[str] = None
    currency: Optional[str] = None
    opening_balance: Decimal = Decimal("0")
    credit_limit: Decimal = Decimal("0")
    payment_schedule: Optional[str] = None
    min_order_value: Optional[Decimal] = None
    incoterms: Optional[str] = None
    buyer_name: Optional[str] = None
    # Denormalised JSON columns, returned parsed.
    contacts: List[Dict[str, Any]] = []
    addresses: List[Dict[str, Any]] = []
    contracts: List[Dict[str, Any]] = []
    bills: List[Dict[str, Any]] = []
    performance: Dict[str, Any] = {}
    timeline: List[Dict[str, Any]] = []
    rfq_count: int
    receipt_count: int
    has_stock_feed: bool
    total_pos: int
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    roles: List[str] = Field(default_factory=list)
    linked_customer_id: Optional[str] = None
    linked_customer_name: Optional[str] = None
    linked_vendor_id: Optional[str] = None
    linked_vendor_name: Optional[str] = None


class SupplierListMeta(BaseModel):
    count: int
    total_spend_ytd: Decimal


class SupplierListResponse(BaseModel):
    data: List[SupplierRead]
    meta: SupplierListMeta
    errors: List[str] = []


class SupplierResponse(BaseModel):
    data: SupplierRead
    errors: List[str] = []


class SupplierBulkDeleteRequest(BaseModel):
    ids: List[str] = Field(min_length=1)


class SupplierBulkDeleteResult(BaseModel):
    deleted: int
    skipped: List[str] = Field(default_factory=list)


class SupplierBulkDeleteResponse(BaseModel):
    data: SupplierBulkDeleteResult
