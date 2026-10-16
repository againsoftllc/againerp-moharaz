from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PortalLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class PortalUserRead(BaseModel):
    id: str
    email: str
    name: str
    supplier_id: str
    supplier_name: Optional[str] = None
    is_active: bool
    accepted_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime


class PortalSessionResponse(BaseModel):
    token: str
    expires_at: datetime
    user: PortalUserRead


class PortalMeResponse(BaseModel):
    data: PortalUserRead
    # Company localisation so portal screens format money/dates like the ERP.
    company_format: Dict[str, Any] = Field(default_factory=dict)


class PortalAcceptInviteRequest(BaseModel):
    token: str = Field(min_length=10, max_length=128)
    password: str = Field(min_length=8, max_length=200)


class PortalChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class OkResponse(BaseModel):
    ok: bool = True


# ------------------------------------------------------ admin-side management


class PortalInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(default="", max_length=255)


class PortalUserAdminRead(PortalUserRead):
    has_password: bool
    invite_pending: bool
    invite_expires_at: Optional[datetime] = None
    # Returned only right after creating an invite so the buyer can pass it on;
    # there is no email sender in this deployment yet.
    invite_token: Optional[str] = None


class PortalUserListResponse(BaseModel):
    data: List[PortalUserAdminRead]


class PortalUserResponse(BaseModel):
    data: PortalUserAdminRead


# --------------------------------------------------------------- portal data


class PortalSupplierProductRead(BaseModel):
    id: str
    supplier_sku: str
    supplier_title: str
    supplier_price: Decimal
    currency: str
    supplier_stock: Optional[int] = None
    stock_status: str
    lead_time_days: int
    min_order_qty: int
    warranty: Optional[str] = None
    is_active: bool
    mapped_item_sku: Optional[str] = None
    mapped_item_name: Optional[str] = None
    is_preferred: bool = False
    updated_at: datetime


class PortalProductListResponse(BaseModel):
    data: List[PortalSupplierProductRead]
    meta: dict


class PortalProductUpsert(BaseModel):
    supplier_sku: str = Field(min_length=1, max_length=128)
    supplier_title: str = Field(min_length=1, max_length=255)
    supplier_price: Decimal = Field(ge=0)
    supplier_stock: Optional[int] = Field(default=None, ge=0)
    stock_status: Optional[str] = Field(default=None, pattern="^(in_stock|low|out|unknown)$")
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    min_order_qty: Optional[int] = Field(default=None, ge=1)
    warranty: Optional[str] = Field(default=None, max_length=128)
    currency: Optional[str] = Field(default=None, max_length=3)


class PortalMapRequest(BaseModel):
    """Supplier maps one of their own products onto a buyer item."""

    supplier_product_id: str = Field(min_length=1, max_length=36)
    item_id: str = Field(min_length=1, max_length=36)


class PortalItemOption(BaseModel):
    id: str
    sku: str
    name: str


class PortalItemListResponse(BaseModel):
    data: List[PortalItemOption]


class PortalOrderLineRead(BaseModel):
    sku: str
    name: str
    quantity_ordered: int
    quantity_received: int
    unit_cost: Decimal
    line_total: Decimal


class PortalOrderRead(BaseModel):
    id: str
    po_number: str
    status: str
    order_date: str
    expected_date: Optional[str] = None
    warehouse_name: Optional[str] = None
    total: Decimal
    lines: List[PortalOrderLineRead] = []


class PortalOrderListResponse(BaseModel):
    data: List[PortalOrderRead]
    meta: dict


# ---------------------------------------------------------------------- rfqs


class PortalRfqLineRead(BaseModel):
    id: str
    sku: str
    name: str
    quantity: int


class PortalRfqQuoteLineRead(BaseModel):
    rfq_line_id: str
    unit_price: Decimal


class PortalRfqQuoteRead(BaseModel):
    """The signed-in supplier's own quote only — a portal response must never
    include another supplier's bid or pricing."""

    id: str
    quote_number: Optional[str] = None
    status: str
    valid_until: Optional[date] = None
    lead_time_days: int
    moq: int
    total_amount: Decimal
    submitted_at: Optional[datetime] = None
    notes: Optional[str] = None
    line_quotes: List[PortalRfqQuoteLineRead] = []


class PortalRfqRead(BaseModel):
    id: str
    rfq_number: str
    title: str
    status: str
    deadline: Optional[date] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
    lines: List[PortalRfqLineRead] = []
    my_quote: Optional[PortalRfqQuoteRead] = None


class PortalRfqResponse(BaseModel):
    data: PortalRfqRead


class PortalRfqListResponse(BaseModel):
    data: List[PortalRfqRead]
    meta: dict


class PortalRfqQuoteLineCreate(BaseModel):
    rfq_line_id: str = Field(min_length=1, max_length=36)
    unit_price: Decimal = Field(ge=0)


class PortalRfqQuoteCreate(BaseModel):
    quote_number: Optional[str] = Field(default=None, max_length=64)
    valid_until: Optional[date] = None
    lead_time_days: int = Field(default=0, ge=0)
    moq: int = Field(default=0, ge=0)
    notes: Optional[str] = None
    line_quotes: List[PortalRfqQuoteLineCreate] = Field(min_length=1)
