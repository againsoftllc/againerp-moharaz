from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

STATUS_PATTERN = (
    "^(draft|pending_approval|approved|awaiting_return|received|diagnosing|awaiting_approval|"
    "in_repair|sent_to_supplier|at_supplier|returned_from_supplier|ready_for_delivery|"
    "delivered|closed|rejected|cancelled|on_hold)$"
)
RESOLUTION_PATTERN = (
    "^(repair|warranty_repair|paid_repair|replace|refund|partial_refund|store_credit|"
    "supplier_return|resellable|scrap|reject)$"
)
WARRANTY_PATTERN = "^(in_warranty|out_of_warranty|unknown)$"
CHARGE_KIND_PATTERN = "^(part|labour|misc)$"
JOB_STATUS_PATTERN = "^(draft|dispatched|acknowledged|in_progress|completed|returned|rejected)$"


class RmaChargeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    item_id: Optional[str] = None
    sku: Optional[str] = None
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate: Decimal
    line_total: Decimal
    notes: Optional[str] = None
    created_at: datetime


class RmaSupplierJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    supplier_id: str
    supplier_name: str
    status: str
    dispatched_at: Optional[date] = None
    supplier_reference: Optional[str] = None
    expected_return_date: Optional[date] = None
    returned_at: Optional[date] = None
    outcome: Optional[str] = None
    cost: Decimal
    notes: Optional[str] = None
    updated_at: datetime


class RmaTicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    rma_number: str

    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    customer_email: str

    order_id: Optional[str] = None
    order_number: Optional[str] = None
    order_item_id: Optional[str] = None
    purchased_at: Optional[date] = None

    product_id: Optional[str] = None
    item_id: Optional[str] = None
    sku: str
    product_name: str
    serial_number: Optional[str] = None
    quantity: int

    received_at: datetime
    received_by: Optional[str] = None
    accessories: Optional[str] = None
    condition_notes: Optional[str] = None
    fault_reported: str
    fault_diagnosed: Optional[str] = None

    warranty_status: str
    warranty_source: str
    warranty_expires_on: Optional[date] = None
    warranty_note: Optional[str] = None

    resolution_type: Optional[str] = None
    status: str
    priority: str
    assigned_to: Optional[str] = None

    parts_total: Decimal
    labour_total: Decimal
    tax_total: Decimal
    total: Decimal
    is_billable: bool
    bill_status: str
    receivable_id: Optional[str] = None

    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    rma_type: str = "customer"
    reason_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    expected_return_date: Optional[date] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    internal_notes: Optional[str] = None
    physical_condition: Optional[str] = None
    functional_result: Optional[str] = None
    qc_result: Optional[str] = None
    inspected_by: Optional[str] = None
    inspected_at: Optional[datetime] = None
    inspection_notes: Optional[str] = None
    resolution_status: str = "pending"
    service_job_id: Optional[str] = None
    refund_id: Optional[str] = None
    refund_amount: Decimal = Decimal("0")
    replacement_sku: Optional[str] = None

    charges: List[RmaChargeRead] = []
    supplier_job: Optional[RmaSupplierJobRead] = None


class RmaListMeta(BaseModel):
    count: int
    total: int
    limit: int
    offset: int


class RmaListResponse(BaseModel):
    data: List[RmaTicketRead]
    meta: RmaListMeta
    errors: List[str] = []


class RmaResponse(BaseModel):
    data: RmaTicketRead
    errors: List[str] = []


class RmaCreate(BaseModel):
    fault_reported: str = Field(min_length=1)
    company_id: str = Field(default="default", max_length=36)
    # Supply an order number to pull customer and warranty automatically;
    # leave it out for a walk-in and fill the customer fields by hand.
    order_number: Optional[str] = Field(default=None, max_length=50)
    order_item_id: Optional[str] = Field(default=None, max_length=36)
    customer_id: Optional[str] = Field(default=None, max_length=36)
    customer_name: Optional[str] = Field(default=None, max_length=255)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    customer_email: Optional[str] = Field(default=None, max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    product_name: Optional[str] = Field(default=None, max_length=255)
    serial_number: Optional[str] = Field(default=None, max_length=128)
    quantity: int = Field(default=1, ge=1)
    received_by: Optional[str] = Field(default=None, max_length=100)
    accessories: Optional[str] = None
    condition_notes: Optional[str] = None
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    assigned_to: Optional[str] = Field(default=None, max_length=100)
    rma_type: str = Field(default="customer", pattern="^(customer|warranty|supplier)$")
    reason_id: Optional[str] = Field(default=None, max_length=36)
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    start_status: str = Field(default="received", pattern=STATUS_PATTERN)
    courier: Optional[str] = Field(default=None, max_length=100)
    tracking_number: Optional[str] = Field(default=None, max_length=100)
    internal_notes: Optional[str] = None
    claim_group_id: Optional[str] = Field(default=None, max_length=36)


class RmaUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=255)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    customer_email: Optional[str] = Field(default=None, max_length=255)
    serial_number: Optional[str] = Field(default=None, max_length=128)
    fault_reported: Optional[str] = None
    fault_diagnosed: Optional[str] = None
    accessories: Optional[str] = None
    condition_notes: Optional[str] = None
    resolution_type: Optional[str] = Field(default=None, pattern=RESOLUTION_PATTERN)
    priority: Optional[str] = Field(default=None, pattern="^(low|normal|high|urgent)$")
    assigned_to: Optional[str] = Field(default=None, max_length=100)
    is_billable: Optional[bool] = None
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    courier: Optional[str] = Field(default=None, max_length=100)
    tracking_number: Optional[str] = Field(default=None, max_length=100)
    received_by: Optional[str] = Field(default=None, max_length=100)
    internal_notes: Optional[str] = None


class RmaStatusChange(BaseModel):
    status: str = Field(pattern=STATUS_PATTERN)
    note: Optional[str] = None


class RmaWarrantyOverride(BaseModel):
    warranty_status: str = Field(pattern=WARRANTY_PATTERN)
    warranty_expires_on: Optional[date] = None
    note: Optional[str] = None


class RmaChargeCreate(BaseModel):
    kind: str = Field(default="part", pattern=CHARGE_KIND_PATTERN)
    description: str = Field(min_length=1, max_length=255)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal = Field(ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    item_id: Optional[str] = Field(default=None, max_length=36)
    sku: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None


class RmaSupplierJobUpsert(BaseModel):
    supplier_id: str = Field(min_length=1, max_length=36)
    status: str = Field(default="draft", pattern=JOB_STATUS_PATTERN)
    dispatched_at: Optional[date] = None
    supplier_reference: Optional[str] = Field(default=None, max_length=128)
    expected_return_date: Optional[date] = None
    returned_at: Optional[date] = None
    outcome: Optional[str] = Field(default=None, max_length=30)
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None


class RmaBillRequest(BaseModel):
    due_date: Optional[date] = None


class RmaBillRead(BaseModel):
    receivable_id: str
    invoice_number: str
    amount: Decimal
    due_date: Optional[date] = None


class RmaBillResponse(BaseModel):
    data: RmaBillRead
    errors: List[str] = []


class RmaHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class RmaHistoryListResponse(BaseModel):
    data: List[RmaHistoryRead]


class WarrantyLookupRead(BaseModel):
    order_number: Optional[str] = None
    order_found: bool
    purchased_at: Optional[date] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    warranty_text: Optional[str] = None
    warranty_status: str
    warranty_expires_on: Optional[date] = None
    warranty_note: str


class WarrantyLookupResponse(BaseModel):
    data: WarrantyLookupRead


class OrderSearchLineRead(BaseModel):
    id: str
    sku: str
    name: str
    quantity: int
    serial_numbers: List[str] = []
    warranty_status: str
    warranty_note: str = ""


class OrderSearchHitRead(BaseModel):
    order_id: str
    order_number: str
    source: str
    customer_id: Optional[str] = None
    customer_name: str = ""
    customer_phone: str = ""
    customer_email: str = ""
    purchased_at: Optional[date] = None
    matched_by: str
    matched_serial: Optional[str] = None
    lines: List[OrderSearchLineRead] = []


class OrderSearchResponse(BaseModel):
    data: List[OrderSearchHitRead]


class RmaDashboardRead(BaseModel):
    total: int
    open_count: int
    at_supplier_count: int
    in_warranty_count: int
    unbilled_total: Decimal
    pending_approval_count: int = 0
    awaiting_return_count: int = 0
    status_breakdown: Dict[str, int]


class RmaDashboardResponse(BaseModel):
    data: RmaDashboardRead


class RmaInspectionRequest(BaseModel):
    physical_condition: str = Field(pattern="^(new|like_new|used|damaged|heavily_damaged)$")
    functional_result: str = Field(pattern="^(passed|failed|partial)$")
    qc_result: str = Field(pattern="^(resellable|repairable|scrap|supplier_return)$")
    notes: Optional[str] = None
    accessories: Optional[str] = None


class RmaResolveRequest(BaseModel):
    resolution_type: str = Field(pattern=RESOLUTION_PATTERN)
    note: Optional[str] = None


class RmaServiceJobRequest(BaseModel):
    labour_total: Decimal = Field(default=Decimal("0"), ge=0)
    parts_total: Decimal = Field(default=Decimal("0"), ge=0)


class RmaRefundRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(default="original", max_length=50)


class RmaReplacementRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(default=1, ge=1)


class RmaStockReleaseRequest(BaseModel):
    warehouse_id: str = Field(min_length=1, max_length=36)


class RmaReasonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    category: str
    is_active: bool
    sort_order: int


class RmaReasonListResponse(BaseModel):
    data: List[RmaReasonRead]


class RmaReportsRead(BaseModel):
    total: int
    open: int
    refund_amount: Decimal
    repair_charges: Decimal
    avg_resolution_days: float
    by_reason: Dict[str, int]
    by_warranty: Dict[str, int]
    by_resolution: Dict[str, int]
    by_product: List[Dict[str, object]]


class RmaReportsResponse(BaseModel):
    data: RmaReportsRead

