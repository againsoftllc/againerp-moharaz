from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

PO_STATUS_PATTERN = "^(draft|confirmed|partial_received|completed|cancelled)$"


class PurchaseOrderLineRead(BaseModel):
    id: str
    item_id: str
    supplier_id: str
    line_number: int
    sku: str
    name: str
    quantity_ordered: int
    quantity_received: int
    quantity_remaining: int = 0
    quantity_returned: int = 0
    tracking_type: str = "none"
    unit_cost: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
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
    # Derived from this PO's bill(s) -> linked FinancePayable, if any exist yet.
    payment_status: Optional[str] = None
    payment_due: Decimal = Decimal("0")
    created_by: Optional[str] = None
    created_by_name: str = "Default"
    confirmed_by: Optional[str] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseOrderLineRead] = []


class PurchaseOrderListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseOrderListResponse(BaseModel):
    data: List[PurchaseOrderRead]
    meta: PurchaseOrderListMeta


class PurchaseOrderResponse(BaseModel):
    data: PurchaseOrderRead


class PurchaseOrderLineCreate(BaseModel):
    """Either item_id or sku identifies the item."""

    item_id: Optional[str] = Field(default=None, max_length=36)
    sku: Optional[str] = Field(default=None, max_length=100)
    quantity_ordered: int = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    company_id: str = Field(default="default", max_length=36)
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    allow_over_receive: bool = False
    lines: List[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderUpdate(BaseModel):
    supplier_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    buyer_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None
    allow_over_receive: Optional[bool] = None
    lines: List[PurchaseOrderLineCreate] = Field(min_length=1)


class PurchaseOrderStatusUpdate(BaseModel):
    status: str = Field(pattern=PO_STATUS_PATTERN)
    notes: Optional[str] = None


class PurchaseStatusHistoryRead(BaseModel):
    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class PurchaseStatusHistoryListResponse(BaseModel):
    data: List[PurchaseStatusHistoryRead]


class PurchaseDashboardRead(BaseModel):
    open_po_count: int
    pending_receive_count: int
    completed_count: int
    spend_total: Decimal
    status_breakdown: Dict[str, int]
    recent_orders: List[PurchaseOrderRead] = []


class PurchaseDashboardResponse(BaseModel):
    data: PurchaseDashboardRead


class PurchaseBulkDeleteRequest(BaseModel):
    ids: List[str] = Field(min_length=1)


class PurchaseBulkDeleteResult(BaseModel):
    deleted: int
    skipped: List[str] = []


class PurchaseBulkDeleteResponse(BaseModel):
    data: PurchaseBulkDeleteResult


# ------------------------------------------------------------------ receipts


class PurchaseReceiptLineRead(BaseModel):
    id: str
    purchase_order_line_id: str
    item_id: str
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity_received: int
    serial_numbers: List[str] = []
    notes: Optional[str] = None


class PurchaseReceiptRead(BaseModel):
    id: str
    company_id: str
    receipt_number: str
    purchase_order_id: str
    po_number: Optional[str] = None
    supplier_id: str
    supplier_name: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    status: str
    receive_type: Optional[str] = None
    receipt_date: date
    received_by: Optional[str] = None
    posted_by: Optional[str] = None
    posted_by_name: str = "Default"
    notes: Optional[str] = None
    posted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseReceiptLineRead] = []


class PurchaseReceiptListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PurchaseReceiptListResponse(BaseModel):
    data: List[PurchaseReceiptRead]
    meta: PurchaseReceiptListMeta


class PurchaseReceiptResponse(BaseModel):
    data: PurchaseReceiptRead


class PurchaseReceiptLineCreate(BaseModel):
    purchase_order_line_id: str = Field(min_length=1, max_length=36)
    quantity_received: int = Field(gt=0)
    # Optional — posting registers these into the serial registry. Leave empty
    # for items you do not track individually.
    serial_numbers: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PurchaseReceiptCreate(BaseModel):
    purchase_order_id: str = Field(min_length=1, max_length=36)
    receipt_date: Optional[date] = None
    received_by: Optional[str] = Field(default=None, max_length=100)
    delivery_note: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None
    lines: List[PurchaseReceiptLineCreate] = Field(min_length=1)


class PurchaseReceiptLineCorrectionCreate(BaseModel):
    new_quantity: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=500)


class PurchaseReceiptLineCorrectionRead(BaseModel):
    id: str
    purchase_receipt_id: str
    purchase_receipt_line_id: str
    old_quantity: int
    new_quantity: int
    reason: str
    corrected_by: str
    corrected_by_name: str = "Default"
    created_at: datetime


class PurchaseReceiptLineCorrectionListResponse(BaseModel):
    data: List[PurchaseReceiptLineCorrectionRead]


class SupplierStockReportRow(BaseModel):
    """AgainPOS-style "Stock Report" row for a supplier's Partner drawer tab —
    what's been purchased from them vs. what's currently on hand.

    Sold/Transferred are computed at the item level (all warehouses, all
    time) rather than traced to this supplier's specific purchase lines —
    AgainERP's stock ledger doesn't link movements back to a source PO line
    the way AgainPOS does, so these reflect the item's overall activity,
    not activity provably tied to stock from this supplier."""

    item_id: str
    sku: str
    name: str
    purchased_qty: int
    total_sold: int
    total_transferred: int
    returned_qty: int
    current_stock: int
    stock_value: Decimal


class SupplierStockReportResponse(BaseModel):
    data: List[SupplierStockReportRow]


AnyDict = Dict[str, Any]
