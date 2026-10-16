from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CustomerRead(BaseModel):
    id: str
    company_id: str
    customer_code: str
    name: str
    phone: str
    email: str
    profile_image: Optional[str] = None
    group: str
    status: str
    loyalty_tier: str
    city: str
    region: str
    country: str
    customer_since: date
    last_order_date: Optional[date] = None
    assigned_staff: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    total_orders: int
    total_spend: Decimal
    avg_order_value: Decimal
    return_rate: Decimal
    reward_points: int
    wallet_balance: Decimal
    opening_balance: Decimal = Decimal("0")
    credit_limit: Decimal = Decimal("0")
    payment_terms: Optional[str] = None
    payment_schedule: Optional[str] = None
    risk_score: int
    risk_level: str
    notes: Optional[str] = None
    phone_verified: bool = False
    email_verified: bool = False
    whatsapp_verified: bool = False
    addresses: List[Dict[str, Any]] = Field(default_factory=list)
    recent_orders: List[Dict[str, Any]] = Field(default_factory=list)
    wallet_transactions: List[Dict[str, Any]] = Field(default_factory=list)
    reward_events: List[Dict[str, Any]] = Field(default_factory=list)
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    comments: List[Dict[str, Any]] = Field(default_factory=list)
    activities: List[Dict[str, Any]] = Field(default_factory=list)
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    ai_insights: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    party_id: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    linked_supplier_id: Optional[str] = None
    linked_supplier_name: Optional[str] = None
    linked_vendor_id: Optional[str] = None
    linked_vendor_name: Optional[str] = None
    # AR snapshot (list endpoint only): what the customer owes us / what we hold for them.
    due: Decimal = Decimal("0")
    advance: Decimal = Decimal("0")
    open_invoice_count: int = 0


class CustomerListMeta(BaseModel):
    count: int
    total_spend: Decimal
    total_due: Decimal = Decimal("0")
    limit: int = 500
    offset: int = 0
    sort: str = "name"
    order: str = "asc"


class CustomerListResponse(BaseModel):
    data: List[CustomerRead]
    meta: CustomerListMeta


class CustomerResponse(BaseModel):
    data: CustomerRead


class CustomerUpdate(BaseModel):
    """PATCH body. Fields left out are untouched (exclude_unset); nullable
    fields (assigned_staff, notes, payment_terms, payment_schedule) are cleared
    by sending an explicit null."""

    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None
    group: Optional[str] = None
    loyalty_tier: Optional[str] = None
    assigned_staff: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    addresses: Optional[List[Dict[str, Any]]] = None
    comments: Optional[List[Dict[str, Any]]] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    opening_balance: Optional[Decimal] = None
    credit_limit: Optional[Decimal] = None
    payment_terms: Optional[str] = None
    payment_schedule: Optional[str] = None
    whatsapp_verified: Optional[bool] = None


class WalletRechargeRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: str = Field(..., min_length=1, max_length=30)
    payment_reference: str = Field(..., min_length=3, max_length=120)
    note: Optional[str] = Field(default=None, max_length=255)


class VerifyContactRequest(BaseModel):
    """Admin marks phone/email verified without storefront OTP."""

    channel: str = Field(..., pattern="^(phone|email)$")
    value: Optional[str] = Field(default=None, max_length=255)


class CustomerOrderSummaryRead(BaseModel):
    id: str
    order_number: str
    date: str
    product_label: str
    total: float
    paid: float
    due: float
    status: str
    payment_status: str
    source: str


class CustomerOrderLineRead(BaseModel):
    label: str
    qty: int
    unit_price: float


class CustomerOrderProductRead(BaseModel):
    name: str
    image_url: Optional[str] = None
    total_qty: int
    lines: List[CustomerOrderLineRead] = Field(default_factory=list)


class CustomerOrderDetailRead(CustomerOrderSummaryRead):
    customer_name: str = ""
    phone: str = ""
    email: str = ""
    delivery_address: str = ""
    delivery_method: str = ""
    shipping_method: str = ""
    products: List[CustomerOrderProductRead] = Field(default_factory=list)


class CustomerOrdersResponse(BaseModel):
    data: List[CustomerOrderSummaryRead]


class CustomerOrderDetailResponse(BaseModel):
    data: CustomerOrderDetailRead


class CustomerOrderRecordPaymentRequest(BaseModel):
    source: str = Field(..., pattern="^(sales|storefront)$")
    amount: Decimal = Field(..., gt=0)
    method: str = Field(default="Cash", min_length=1, max_length=60)
    note: Optional[str] = Field(default=None, max_length=255)


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(default="", max_length=50)
    email: str = Field(default="", max_length=255)
    profile_image: Optional[str] = None
    group: str = Field(default="retail", max_length=30)
    city: str = Field(default="", max_length=100)
    region: str = Field(default="", max_length=100)
    country: str = Field(default="Bangladesh", max_length=100)
    assigned_staff: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    addresses: Optional[List[Dict[str, Any]]] = None
    opening_balance: Optional[Decimal] = None
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    payment_terms: Optional[str] = None
    payment_schedule: Optional[str] = None


class CustomerBulkDeleteRequest(BaseModel):
    ids: List[str] = Field(min_length=1)


class CustomerBulkDeleteResult(BaseModel):
    deleted: int
    skipped: List[str] = Field(default_factory=list)


class CustomerBulkDeleteResponse(BaseModel):
    data: CustomerBulkDeleteResult


class CustomerPaymentHistoryItem(BaseModel):
    id: str
    at: str
    amount: float
    method: str
    label: str
    status: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    source: str = "sales"  # sales | storefront | wallet
    kind: str = "payment"  # payment | refund | wallet


class CustomerPaymentHistoryResponse(BaseModel):
    data: List[CustomerPaymentHistoryItem]
    meta: Dict[str, Any] = Field(default_factory=dict)


class CustomerCaseReplyRead(BaseModel):
    id: str
    at: str
    author: str
    role: str = "admin"
    message: str


class CustomerCaseRead(BaseModel):
    id: str
    case_number: str
    case_type: str
    date: str
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    subject: str
    message: str
    product_label: Optional[str] = None
    status: str
    manager_name: Optional[str] = None
    replies: List[CustomerCaseReplyRead] = Field(default_factory=list)


class CustomerCaseCreate(BaseModel):
    case_type: str = Field(..., pattern="^(support|complaint|qc)$")
    subject: str = Field(min_length=2, max_length=255)
    message: str = Field(min_length=2, max_length=5000)
    order_id: Optional[str] = None
    product_label: Optional[str] = None


class CustomerCaseReplyCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class CustomerCaseListResponse(BaseModel):
    data: List[CustomerCaseRead]


class CustomerCaseResponse(BaseModel):
    data: CustomerCaseRead


class CustomerContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False


class CustomerContactUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: Optional[bool] = None


class CustomerContactRead(BaseModel):
    id: str
    company_id: str
    customer_id: str
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool
    created_at: datetime
    updated_at: datetime


class CustomerContactListResponse(BaseModel):
    data: List[CustomerContactRead]


class CustomerContactResponse(BaseModel):
    data: CustomerContactRead


class CustomerCrmSummaryItem(BaseModel):
    customer_id: str
    primary_contact_name: Optional[str] = None
    contact_count: int = 0
    project_count: int = 0
    label_names: List[str] = []
    total_invoiced: Decimal = Decimal("0")
    payment_received: Decimal = Decimal("0")
    due: Decimal = Decimal("0")


class CustomerCrmSummaryResponse(BaseModel):
    data: List[CustomerCrmSummaryItem]
