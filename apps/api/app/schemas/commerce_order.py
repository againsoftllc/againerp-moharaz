from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    item_id: Optional[str] = None
    variant_id: Optional[str] = None
    sku: str
    name: str
    image_url: Optional[str] = None
    variant_label: Optional[str] = None
    quantity: int
    quantity_shipped: int = 0
    unit_price: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    line_total: Decimal
    sort_order: int


class OrderEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    event_type: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    from_payment_status: Optional[str] = None
    to_payment_status: Optional[str] = None
    from_shipment_status: Optional[str] = None
    to_shipment_status: Optional[str] = None
    actor: str
    message: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class OrderShipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    shipment_number: str
    status: str
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    items: List[Dict[str, Any]] = Field(default_factory=list)
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime


class OrderRead(BaseModel):
    id: str
    company_id: str
    order_number: str
    order_date: datetime
    status: str
    payment_status: str
    shipment_status: str
    source: str
    branch: str
    assigned_staff: Optional[str] = None
    priority: str
    tags: List[str] = Field(default_factory=list)
    customer_id: Optional[str] = None
    billing_address_id: Optional[str] = None
    shipping_address_id: Optional[str] = None
    payment_id: Optional[str] = None
    invoice_id: Optional[str] = None
    primary_shipment_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    customer_email: str
    customer_group: Optional[str] = None
    customer_lifetime_value: Decimal
    customer_order_count: int
    customer_risk_score: int
    billing_address: Optional[str] = None
    billing_city: Optional[str] = None
    billing_region: Optional[str] = None
    billing_country: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_region: Optional[str] = None
    shipping_country: Optional[str] = None
    payment_method: str
    payment_transaction_id: Optional[str] = None
    paid_amount: Decimal
    due_amount: Decimal
    refund_amount: Decimal
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    shipping_cost: Decimal
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    grand_total: Decimal
    notes: Optional[str] = None
    ai_risk: str
    ai_summary: Optional[str] = None
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    activities: List[Dict[str, Any]] = Field(default_factory=list)
    comments: List[Dict[str, Any]] = Field(default_factory=list)
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    payment_timeline: List[Dict[str, Any]] = Field(default_factory=list)
    ai_insights: Dict[str, Any] = Field(default_factory=dict)
    followers: List[str] = Field(default_factory=list)
    items: List[OrderItemRead] = Field(default_factory=list)
    item_count: int = 0
    available_transitions: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class OrderListMeta(BaseModel):
    count: int
    total_revenue: Decimal


class OrderListResponse(BaseModel):
    data: List[OrderRead]
    meta: OrderListMeta


class OrderResponse(BaseModel):
    data: OrderRead


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    payment_status: Optional[str] = None
    shipment_status: Optional[str] = None
    assigned_staff: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None


class OrderTransitionRequest(BaseModel):
    status: str = Field(min_length=1, max_length=20)
    message: Optional[str] = None


class OrderCancelRequest(BaseModel):
    reason: Optional[str] = None


class OrderShipmentLineCreate(BaseModel):
    order_item_id: str
    quantity: int = Field(ge=1)


class OrderShipmentCreate(BaseModel):
    lines: List[OrderShipmentLineCreate] = Field(min_length=1)
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    notes: Optional[str] = None
    mark_shipped: bool = True
    # When true, force Pathao consignment if plugin is active (optional; soft-fails).
    create_pathao: bool = False


class PathaoConsignmentCreate(BaseModel):
    """Create Pathao consignment for an order (ships remaining lines when needed).

    mark_shipped defaults to False so courier create does not require on-hand stock.
    Pass mark_shipped=true when you also want inventory fulfillment.
    """

    mark_shipped: bool = False
    notes: Optional[str] = None


class PathaoConsignmentRead(BaseModel):
    created: bool
    skipped: bool = False
    consignment_id: str = ""
    tracking_url: str = ""
    message: str = ""
    shipment: Optional[OrderShipmentRead] = None


class PathaoConsignmentResponse(BaseModel):
    data: PathaoConsignmentRead


class OrderReturnCreate(BaseModel):
    order_item_id: str
    quantity: int = Field(ge=1)
    reason: str = Field(min_length=1)


class OrderRefundCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(min_length=1, max_length=50)
    reason: str = Field(min_length=1)


class OrderEventListResponse(BaseModel):
    data: List[OrderEventRead]


class OrderShipmentListResponse(BaseModel):
    data: List[OrderShipmentRead]


class OrderShipmentResponse(BaseModel):
    data: OrderShipmentRead
