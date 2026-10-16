from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class IdentifierRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)


class AuthMethodResponse(BaseModel):
    method: Literal["otp", "pin"]
    identifier: str
    identifier_type: Literal["phone", "email"]
    masked: str
    has_pin: bool = False
    is_registered: bool = False


class RequestOtpResponse(BaseModel):
    ok: bool = True
    expires_in: int = 60
    masked: str
    # the fixed development code — only off the live server when no SMS gateway is set up
    development_otp: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    otp: str = Field(min_length=4, max_length=4)
    # Applied only when creating a new storefront customer (register flow).
    name: Optional[str] = Field(default=None, max_length=120)


class LoginPinRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    pin: str = Field(min_length=4, max_length=4)


class SetPinRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=4)
    confirm_pin: str = Field(min_length=4, max_length=4)


class CustomerMeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_code: str
    name: str
    phone: str
    email: str
    profile_image: Optional[str] = None
    city: str = ""
    region: str = ""
    country: str = "Bangladesh"
    reward_points: int = 0
    total_orders: int = 0
    wallet_balance: Decimal = Decimal("0")
    has_pin: bool = False
    identifier: str = ""
    identifier_type: str = ""
    assigned_staff: Optional[str] = None


class AuthSessionResponse(BaseModel):
    token: str
    expires_at: datetime
    customer: CustomerMeRead


class MeResponse(BaseModel):
    data: CustomerMeRead


class OkResponse(BaseModel):
    ok: bool = True


class AddressItem(BaseModel):
    id: Optional[str] = None
    label: str = "Home"
    line1: str = ""
    city: str = ""
    region: str = ""
    postal_code: str = ""
    country: str = "Bangladesh"
    is_default: bool = False


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    emergency_number: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    profile_image: Optional[str] = None
    addresses: Optional[List[AddressItem]] = None


class ProfileRead(CustomerMeRead):
    emergency_number: str = ""
    address: str = ""
    addresses: List[AddressItem] = Field(default_factory=list)
    customer_since: Optional[date] = None


class ProfileResponse(BaseModel):
    data: ProfileRead


class OrderStatusStat(BaseModel):
    key: str
    label: str
    count: int
    pct: int


class RecentOrderRead(BaseModel):
    id: str
    order_number: str
    title: str
    status: str
    date: str
    amount: Decimal


class AccountSummaryRead(BaseModel):
    customer: CustomerMeRead
    status_stats: List[OrderStatusStat] = Field(default_factory=list)
    recent_orders: List[RecentOrderRead] = Field(default_factory=list)
    account_manager: Optional[dict[str, Any]] = None


class AccountSummaryResponse(BaseModel):
    data: AccountSummaryRead


class AccountOrderLineRead(BaseModel):
    label: str
    qty: int
    unit_price: Decimal
    line_total: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")


class AccountOrderProductRead(BaseModel):
    name: str
    image_url: Optional[str] = None
    total_qty: int
    lines: List[AccountOrderLineRead] = Field(default_factory=list)


class AccountOrderRead(BaseModel):
    id: str
    order_number: str
    date: str
    product_label: str
    total: Decimal
    paid: Decimal
    due: Decimal
    status: str
    payment_status: str
    shipment_status: str
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    shipping_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    coupon_code: Optional[str] = None


class AccountOrderDetailRead(AccountOrderRead):
    customer_name: str
    phone: str
    email: str
    delivery_address: str
    delivery_method: str
    shipping_method: str
    advance_paid: Decimal
    products: List[AccountOrderProductRead] = Field(default_factory=list)
    notes: Optional[str] = None


class AccountOrderListResponse(BaseModel):
    data: List[AccountOrderRead]
    total: int


class AccountOrderDetailResponse(BaseModel):
    data: AccountOrderDetailRead


class AccountPaymentRead(BaseModel):
    id: str
    date: str
    order_id: str
    order_number: str
    amount: Decimal
    method: str
    status: str
    trx_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    note: Optional[str] = None


class AccountPaymentListResponse(BaseModel):
    data: List[AccountPaymentRead]


class AccountDeliveryRead(BaseModel):
    id: str
    invoice: str
    date: str
    orders: str
    method: str
    amount: Decimal
    status: str
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None


class AccountDeliveryListResponse(BaseModel):
    data: List[AccountDeliveryRead]


class AccountRefundRead(BaseModel):
    id: str
    refund_number: str
    date: str
    order_id: str
    order_number: str
    amount: Decimal
    method: str
    reason: str
    status: str
    # "return" rows come from commerce_order_returns, "refund" from refunds.
    kind: str = "refund"
    product_name: str = ""
    quantity: int = 0


class AccountRefundCreate(BaseModel):
    order_id: str
    amount: Optional[Decimal] = None
    reason: str = Field(min_length=3, max_length=1000)
    method: str = "original"


class AccountRefundListResponse(BaseModel):
    data: List[AccountRefundRead]


class AccountRefundResponse(BaseModel):
    data: AccountRefundRead


class AccountPointsEventRead(BaseModel):
    date: str
    type: str
    purpose: str
    orders: str = ""
    payment_id: str = ""
    amount: Decimal


class AccountPointsRead(BaseModel):
    balance: int
    events: List[AccountPointsEventRead] = Field(default_factory=list)


class AccountPointsResponse(BaseModel):
    data: AccountPointsRead


class AccountWalletTxnRead(BaseModel):
    id: str
    label: str
    amount: Decimal
    type: str  # credit | debit
    at: str
    payment_method: str = ""
    payment_reference: str = ""


class AccountWalletRead(BaseModel):
    balance: Decimal
    transactions: List[AccountWalletTxnRead] = Field(default_factory=list)


class AccountWalletResponse(BaseModel):
    data: AccountWalletRead


class AccountCaseReplyRead(BaseModel):
    id: str
    at: str
    author: str
    role: str = "admin"
    message: str


class AccountCaseRead(BaseModel):
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
    replies: List[AccountCaseReplyRead] = Field(default_factory=list)


class AccountCaseCreate(BaseModel):
    case_type: Literal["support", "complaint", "qc"]
    subject: str = Field(min_length=2, max_length=255)
    message: str = Field(min_length=2, max_length=5000)
    order_id: Optional[str] = None
    product_label: Optional[str] = None


class AccountCaseReplyCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class AccountCaseListResponse(BaseModel):
    data: List[AccountCaseRead]


class AccountCaseResponse(BaseModel):
    data: AccountCaseRead
