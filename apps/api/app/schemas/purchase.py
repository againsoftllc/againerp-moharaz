from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class PurchaseOrderLineRead(BaseModel):
    id: str
    item_id: str
    supplier_id: str
    line_number: int
    sku: str
    name: str
    quantity_ordered: int
    quantity_received: int
    unit_cost: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class PurchaseOrderLineCreate(BaseModel):
    item_id: Optional[str] = None
    sku: Optional[str] = None
    quantity_ordered: int = Field(ge=1)
    unit_cost: Decimal = Field(ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None


class PurchaseOrderRead(BaseModel):
    id: str
    company_id: str
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    order_date: date
    expected_date: Optional[date] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    discount_total: Decimal
    total: Decimal
    allow_over_receive: bool
    created_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseOrderLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    warehouse_id: str
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
    allow_over_receive: bool = False
    lines: List[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderUpdate(BaseModel):
    expected_date: Optional[date] = None
    buyer_name: Optional[str] = None
    notes: Optional[str] = None
    allow_over_receive: Optional[bool] = None
    status: Optional[str] = None


class PurchaseOrderListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseOrderListResponse(BaseModel):
    data: List[PurchaseOrderRead]
    meta: PurchaseOrderListMeta


class PurchaseOrderResponse(BaseModel):
    data: PurchaseOrderRead


class PurchaseStatusHistoryRead(BaseModel):
    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseHistoryResponse(BaseModel):
    data: List[PurchaseStatusHistoryRead]


class PurchaseReceiptLineRead(BaseModel):
    id: str
    purchase_order_line_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity_received: int
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class PurchaseReceiptRead(BaseModel):
    id: str
    company_id: str
    receipt_number: str
    purchase_order_id: str
    po_number: Optional[str] = None
    supplier_id: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    receive_type: Optional[str] = None
    receipt_date: date
    received_by: Optional[str] = None
    notes: Optional[str] = None
    posted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseReceiptLineRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PurchaseReceiptLineCreate(BaseModel):
    purchase_order_line_id: str
    quantity_received: int = Field(ge=1)
    notes: Optional[str] = None


class PurchaseReceiptCreate(BaseModel):
    purchase_order_id: str
    receipt_date: Optional[date] = None
    received_by: Optional[str] = None
    notes: Optional[str] = None
    lines: List[PurchaseReceiptLineCreate] = Field(min_length=1)


class PurchaseReceiptListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseReceiptListResponse(BaseModel):
    data: List[PurchaseReceiptRead]
    meta: PurchaseReceiptListMeta


class PurchaseReceiptResponse(BaseModel):
    data: PurchaseReceiptRead


class PurchaseDashboardRead(BaseModel):
    open_po_count: int
    pending_receive_count: int
    completed_count: int
    spend_total: Decimal
    status_breakdown: dict[str, int]
    recent_orders: List[PurchaseOrderRead] = Field(default_factory=list)


class PurchaseDashboardResponse(BaseModel):
    data: PurchaseDashboardRead
