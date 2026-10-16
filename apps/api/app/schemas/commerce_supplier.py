from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = ""
    phone: str = ""
    vendor_code: Optional[str] = Field(default=None, max_length=50)
    payment_terms: str = "Net 30"
    lead_time_days: int = Field(default=7, ge=1, le=365)
    status: str = "active"
    country: str = "Bangladesh"
    tax_id: Optional[str] = Field(default=None, max_length=50)
    website: Optional[str] = Field(default=None, max_length=500)
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    contact_name: Optional[str] = Field(default=None, max_length=100)
    contact_role: Optional[str] = Field(default=None, max_length=100)


class SupplierRead(BaseModel):
    id: str
    company_id: str
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
    min_order_value: Optional[Decimal] = None
    incoterms: Optional[str] = None
    buyer_name: Optional[str] = None
    contacts: List[Dict[str, Any]] = Field(default_factory=list)
    addresses: List[Dict[str, Any]] = Field(default_factory=list)
    contracts: List[Dict[str, Any]] = Field(default_factory=list)
    bills: List[Dict[str, Any]] = Field(default_factory=list)
    performance: Dict[str, Any] = Field(default_factory=dict)
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    rfq_count: int
    receipt_count: int
    has_stock_feed: bool
    total_pos: int
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SupplierListMeta(BaseModel):
    count: int
    total_spend_ytd: Decimal


class SupplierListResponse(BaseModel):
    data: List[SupplierRead]
    meta: SupplierListMeta


class SupplierResponse(BaseModel):
    data: SupplierRead


class SupplierUpdate(BaseModel):
    status: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
