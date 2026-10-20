from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SalesLineCreate(BaseModel):
    item_id: Optional[str] = None
    sku: Optional[str] = None
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    # Serial-tracked items: the units going out on this line.
    serial_numbers: Optional[List[str]] = None

    @field_validator("unit_price", "tax_rate", "discount_amount", mode="before")
    @classmethod
    def _blank_money_is_zero(cls, value):
        # A half-edited line in the drawer can serialise as null; treat it as 0
        # rather than failing the whole order with a 422.
        return Decimal("0") if value is None or value == "" else value


class SalesQuotationLineRead(BaseModel):
    id: str
    item_id: str
    line_number: int
    sku: str
    name: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class SalesQuotationRead(BaseModel):
    id: str
    company_id: str
    quotation_number: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_group: Optional[str] = None
    customer_city: Optional[str] = None
    customer_region: Optional[str] = None
    customer_country: Optional[str] = None
    customer_tags: List[str] = Field(default_factory=list)
    customer_assigned_staff: Optional[str] = None
    customer_order_count: int = 0
    customer_lifetime_value: Decimal = Decimal("0")
    customer_risk_score: int = 0
    warehouse_id: Optional[str] = None
    status: str
    quote_date: date
    valid_until: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    discount_total: Decimal
    total: Decimal
    sales_order_id: Optional[str] = None
    sent_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[SalesQuotationLineRead] = Field(default_factory=list)


class SalesQuotationCreate(BaseModel):
    customer_id: str
    warehouse_id: Optional[str] = None
    quote_date: Optional[date] = None
    valid_until: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    lines: List[SalesLineCreate] = Field(min_length=1)


class SalesQuotationStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class SalesQuotationListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class SalesQuotationListResponse(BaseModel):
    data: List[SalesQuotationRead]
    meta: SalesQuotationListMeta


class SalesQuotationResponse(BaseModel):
    data: SalesQuotationRead


class SalesOrderLineRead(BaseModel):
    id: str
    item_id: str
    line_number: int
    sku: str
    name: str
    quantity_ordered: int
    quantity_delivered: int
    quantity_returned: int = 0
    quantity_reserved: int
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
    notes: Optional[str] = None
    image_url: Optional[str] = None
    serial_numbers: List[str] = []

    model_config = {"from_attributes": True}


class SalesOrderActivityRead(BaseModel):
    id: str
    activity_type: str
    title: str
    description: Optional[str] = None
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    created_at: datetime


class SalesOrderEditRequestRead(BaseModel):
    id: str
    status: str
    reason: Optional[str] = None
    requested_by: str
    requested_by_name: Optional[str] = None
    requested_at: datetime
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

    model_config = {"from_attributes": True}


class SalesOrderEditRequestCreate(BaseModel):
    reason: Optional[str] = None


class SalesOrderEditRequestReview(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = None


class SalesOrderRead(BaseModel):
    id: str
    company_id: str
    order_number: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_group: Optional[str] = None
    customer_city: Optional[str] = None
    customer_region: Optional[str] = None
    customer_country: Optional[str] = None
    customer_tags: List[str] = Field(default_factory=list)
    customer_assigned_staff: Optional[str] = None
    customer_order_count: int = 0
    customer_lifetime_value: Decimal = Decimal("0")
    customer_risk_score: int = 0
    warehouse_id: str
    warehouse_name: Optional[str] = None
    sales_quotation_id: Optional[str] = None
    status: str
    delivery_status: str
    order_date: date
    expected_date: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    sale_stage: str = "final"
    invoice_scheme: str = "standard"
    shipping_status: Optional[str] = None
    delivered_to: Optional[str] = None
    delivery_person_id: Optional[str] = None
    delivery_person_name: Optional[str] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    discount_total: Decimal
    total: Decimal
    order_discount: Decimal = Decimal("0")
    order_discount_type: str = "fixed"
    shipping_charge: Decimal = Decimal("0")
    additional_expenses: List[SalesOrderExpenseItem] = Field(default_factory=list)
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    invoiced_at: Optional[datetime] = None
    public_key: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[SalesOrderLineRead] = Field(default_factory=list)
    activities: List[SalesOrderActivityRead] = Field(default_factory=list)
    # Latest pending / approved-but-unused edit request, if any.
    edit_request: Optional[SalesOrderEditRequestRead] = None
    # Credit total of non-cancelled returns against this order.
    returned_total: Decimal = Decimal("0")
    # Website (storefront) orders only: the customer-facing order this one mirrors, its status, and the statuses the
    # admin may move it to. Empty for orders entered by hand.
    website_order_id: Optional[str] = None
    website_status: Optional[str] = None
    # The addresses the shopper entered for this order (the Sales order has none of its own).
    website_billing_address: Optional["SalesOrderAddressRead"] = None
    website_shipping_address: Optional["SalesOrderAddressRead"] = None
    website_next_statuses: List[str] = Field(default_factory=list)


class SalesOrderExpenseItem(BaseModel):
    title: str = ""
    amount: Decimal = Field(default=Decimal("0"), ge=0)


class SalesOrderCreate(BaseModel):
    customer_id: str
    warehouse_id: Optional[str] = None
    sales_quotation_id: Optional[str] = None
    order_discount: Decimal = Field(default=Decimal("0"), ge=0)
    order_discount_type: Literal["fixed", "percent"] = "fixed"
    shipping_charge: Decimal = Field(default=Decimal("0"), ge=0)
    additional_expenses: List[SalesOrderExpenseItem] = Field(default_factory=list)
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    sale_stage: Optional[str] = None
    invoice_scheme: Optional[str] = None
    shipping_status: Optional[str] = None
    delivered_to: Optional[str] = None
    delivery_person_id: Optional[str] = None
    lines: List[SalesLineCreate] = Field(min_length=1)


class SalesOrderUpdate(BaseModel):
    expected_date: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    sale_stage: Optional[str] = None
    invoice_scheme: Optional[str] = None
    shipping_status: Optional[str] = None
    delivered_to: Optional[str] = None
    delivery_person_id: Optional[str] = None


class SalesOrderPut(BaseModel):
    customer_id: str
    warehouse_id: Optional[str] = None
    order_discount: Optional[Decimal] = Field(default=None, ge=0)
    order_discount_type: Optional[Literal["fixed", "percent"]] = None
    shipping_charge: Optional[Decimal] = Field(default=None, ge=0)
    additional_expenses: Optional[List[SalesOrderExpenseItem]] = None
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    sale_stage: Optional[str] = None
    invoice_scheme: Optional[str] = None
    shipping_status: Optional[str] = None
    delivered_to: Optional[str] = None
    delivery_person_id: Optional[str] = None
    lines: List[SalesLineCreate] = Field(min_length=1)


class SalesQuotationPut(BaseModel):
    customer_id: str
    warehouse_id: Optional[str] = None
    quote_date: Optional[date] = None
    valid_until: Optional[date] = None
    sales_rep: Optional[str] = None
    notes: Optional[str] = None
    lines: List[SalesLineCreate] = Field(min_length=1)


class SalesOrderCancelRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class SalesBulkDeleteRequest(BaseModel):
    ids: List[str] = Field(min_length=1)


class SalesOrderAddressRead(BaseModel):
    """An address as the shopper gave it at checkout (website orders)."""

    name: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    city: str = ""
    region: str = ""
    postal_code: str = ""
    country: str = ""


class SalesWebsiteStatusRequest(BaseModel):
    status: str
    message: Optional[str] = Field(default=None, max_length=500)


class SalesBulkStatusRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    status: str


class SalesApiMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class SalesApiEnvelope(BaseModel):
    success: bool = True
    message: str = "OK"
    data: Optional[object] = None
    meta: Optional[SalesApiMeta] = None


class SalesOrderListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class SalesOrderListResponse(BaseModel):
    data: List[SalesOrderRead]
    meta: SalesOrderListMeta


class SalesOrderResponse(BaseModel):
    data: SalesOrderRead


class SalesStatusHistoryRead(BaseModel):
    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SalesHistoryResponse(BaseModel):
    data: List[SalesStatusHistoryRead]


class SalesDeliveryLineCreate(BaseModel):
    sales_order_line_id: str
    quantity_delivered: int = Field(ge=1)
    notes: Optional[str] = None


class SalesDeliveryLineRead(BaseModel):
    id: str
    sales_order_line_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity_delivered: int
    notes: Optional[str] = None


class SalesDeliveryRead(BaseModel):
    id: str
    delivery_number: str
    sales_order_id: str
    customer_id: str
    warehouse_id: str
    status: str
    delivery_date: date
    delivered_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    lines: List[SalesDeliveryLineRead] = Field(default_factory=list)


class SalesDeliveryCreate(BaseModel):
    delivery_date: Optional[date] = None
    delivered_by: Optional[str] = None
    notes: Optional[str] = None
    lines: List[SalesDeliveryLineCreate] = Field(min_length=1)


class SalesDeliveryListMeta(BaseModel):
    count: int


class SalesDeliveryListResponse(BaseModel):
    data: List[SalesDeliveryRead]
    meta: SalesDeliveryListMeta


class SalesDeliveryResponse(BaseModel):
    data: SalesDeliveryRead


class CustomerItemPriceRead(BaseModel):
    id: str
    customer_id: str
    item_id: str
    unit_price: Decimal
    currency: str
    discount_pct: Decimal
    min_qty: int
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    is_active: bool
    notes: Optional[str] = None
    item_sku: Optional[str] = None
    item_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CustomerItemPriceCreate(BaseModel):
    customer_id: str
    item_id: str
    unit_price: Decimal = Field(ge=0)
    currency: str = "BDT"
    discount_pct: Decimal = Field(default=Decimal("0"), ge=0)
    min_qty: int = Field(default=1, ge=1)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    notes: Optional[str] = None


class CustomerPriceResolveResponse(BaseModel):
    data: Optional[CustomerItemPriceRead] = None


class LinkInvoiceRequest(BaseModel):
    invoice_id: str
    invoice_number: str


class SalesDashboardDayPoint(BaseModel):
    date: str
    label: str
    orders: int = 0
    sales: float = 0


class SalesDashboardRead(BaseModel):
    open_order_count: int
    pending_delivery_count: int
    completed_count: int
    revenue_total: Decimal
    open_quotation_count: int
    status_breakdown: dict[str, int]
    recent_orders: List[SalesOrderRead] = Field(default_factory=list)
    daily_series: List[SalesDashboardDayPoint] = Field(default_factory=list)


class SalesDashboardResponse(BaseModel):
    data: SalesDashboardRead


class SalesPeriodTotals(BaseModel):
    order_count: int
    revenue: Decimal  # net of sales returns credited in the period
    returns_total: Decimal = Decimal("0")
    avg_order_value: Decimal
    completed_count: int
    cancelled_count: int
    status_breakdown: dict[str, int]


class SalesDashboardPeriodRead(BaseModel):
    """One period of the dashboard (Today, This month …): its totals, the period before it, a trend and its
    latest orders. open_* / pending are right now, whatever the period."""
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    current: SalesPeriodTotals
    previous: Optional[SalesPeriodTotals] = None
    series: List[SalesDashboardDayPoint] = Field(default_factory=list)
    by_month: bool = False
    recent_orders: List[SalesOrderRead] = Field(default_factory=list)
    open_order_count: int
    pending_delivery_count: int
    open_quotation_count: int


class SalesDashboardPeriodResponse(BaseModel):
    data: SalesDashboardPeriodRead


class SalesOrderPathaoConsignmentCreate(BaseModel):
    """Recipient details come from the drawer's own (already-selected) shipping address —
    the order has no address columns of its own, so we never guess one server-side."""

    recipient_name: str = Field(min_length=1, max_length=100)
    recipient_phone: str = Field(min_length=1, max_length=20)
    recipient_address: str = Field(min_length=10, max_length=220)
    item_quantity: Optional[int] = Field(default=None, ge=1)
    item_weight_kg: Optional[Decimal] = Field(default=None, gt=0)


class SalesOrderPathaoConsignmentRead(BaseModel):
    created: bool
    skipped: bool = False
    consignment_id: str = ""
    tracking_url: str = ""
    message: str = ""


class SalesOrderPathaoConsignmentResponse(BaseModel):
    data: SalesOrderPathaoConsignmentRead
