from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class VendorAddress(BaseModel):
    type: str = Field(default="shipping", max_length=20)  # billing | shipping
    label: str = Field(default="", max_length=100)
    line1: str = Field(default="", max_length=255)
    line2: str = Field(default="", max_length=255)
    city: str = Field(default="", max_length=100)
    state_division: str = Field(default="", max_length=100)
    country: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    is_default: bool = False


class VendorTypeRead(BaseModel):
    id: str
    code: str
    name: str
    is_system: bool
    is_active: bool


class VendorTypeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)


class VendorGroupRead(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    price_list_id: Optional[str] = None
    default_discount_percent: Decimal
    default_credit_limit: Decimal
    default_payment_terms: str
    min_order_quantity: Optional[int] = None
    order_limit: Optional[Decimal] = None
    requires_order_approval: bool
    stock_visibility_mode: str
    negotiation_enabled: bool
    is_active: bool
    created_at: datetime


class VendorGroupWrite(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    price_list_id: Optional[str] = None
    default_discount_percent: Decimal = Decimal("0")
    default_credit_limit: Decimal = Decimal("0")
    default_payment_terms: str = ""
    min_order_quantity: Optional[int] = None
    order_limit: Optional[Decimal] = None
    requires_order_approval: bool = True
    stock_visibility_mode: str = "availability"
    negotiation_enabled: bool = False
    is_active: bool = True


class VendorGroupListResponse(BaseModel):
    data: List[VendorGroupRead]


class VendorGroupResponse(BaseModel):
    data: VendorGroupRead


class VendorRead(BaseModel):
    id: str
    vendor_code: str
    company_name: str
    legal_name: str
    display_name: str
    contact_person: str
    phone: str
    email: str
    website: str
    logo: Optional[str] = None
    vendor_type_id: Optional[str] = None
    vendor_group_id: Optional[str] = None
    price_list_id: Optional[str] = None
    status: str
    addresses: List[Dict[str, Any]] = Field(default_factory=list)
    city: str
    state_division: str
    country: str
    postal_code: str
    trade_license: str
    vat_tax_id: str
    bin_tin: str
    business_registration_number: str
    payment_terms: str
    payment_schedule: Optional[str] = None
    credit_limit: Decimal
    opening_balance: Decimal = Decimal("0")
    currency: str
    preferred_payment_method: str
    account_manager_id: Optional[str] = None
    sales_rep_id: Optional[str] = None
    onboarding_date: Optional[date] = None
    last_order_date: Optional[date] = None
    last_payment_date: Optional[date] = None
    notes: Optional[str] = None
    portal_enabled: bool
    created_at: datetime
    updated_at: datetime
    party_id: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    linked_customer_id: Optional[str] = None
    linked_customer_name: Optional[str] = None
    linked_supplier_id: Optional[str] = None
    linked_supplier_name: Optional[str] = None


class VendorWrite(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    legal_name: str = ""
    display_name: str = ""
    contact_person: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    logo: Optional[str] = None
    vendor_type_id: Optional[str] = None
    vendor_group_id: Optional[str] = None
    price_list_id: Optional[str] = None
    status: str = Field(
        default="pending",
        pattern="^(invited|pending|under_review|approved|active|suspended|blocked|archived)$",
    )
    addresses: List[VendorAddress] = Field(default_factory=list)
    city: str = ""
    state_division: str = ""
    country: str = "Bangladesh"
    postal_code: str = ""
    trade_license: str = ""
    vat_tax_id: str = ""
    bin_tin: str = ""
    business_registration_number: str = ""
    payment_terms: str = ""
    payment_schedule: Optional[str] = None
    credit_limit: Decimal = Field(default=Decimal("0"), ge=0)
    opening_balance: Decimal = Field(default=Decimal("0"))
    currency: str = "BDT"
    preferred_payment_method: str = ""
    account_manager_id: Optional[str] = None
    sales_rep_id: Optional[str] = None
    onboarding_date: Optional[date] = None
    notes: Optional[str] = None
    portal_enabled: bool = False


class VendorListResponse(BaseModel):
    data: List[VendorRead]
    total: int


class VendorResponse(BaseModel):
    data: VendorRead
