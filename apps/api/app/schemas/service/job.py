from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceJobLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    item_id: Optional[str] = None
    sku: str
    name: str
    quantity: int
    unit: str
    unit_price: Decimal
    discount: Decimal
    tax_rate: Decimal
    line_total: Decimal
    warehouse_id: Optional[str] = None
    stock_moved: bool
    notes: Optional[str] = None


class ServiceJobHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class ServiceJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    job_number: str
    status: str
    service_type: str
    rma_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str = ""
    customer_email: str = ""
    sku: str
    product_name: str
    serial_number: Optional[str] = None
    brand: str = ""
    model: str = ""
    imei: Optional[str] = None
    warehouse_id: Optional[str] = None
    issue: str
    condition_notes: Optional[str] = None
    warranty_status: str
    notes: Optional[str] = None
    priority: str = "normal"
    technician_id: Optional[str] = None
    technician_name: str = ""
    expected_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None
    received_by_name: Optional[str] = None
    diagnosis: Optional[str] = None
    diagnosis_status: str = "pending"
    found_problems: Optional[str] = None
    recommended_action: Optional[str] = None
    estimated_cost: Decimal = Decimal("0")
    estimated_hours: Decimal = Decimal("0")
    approval_status: str = "not_required"
    approval_note: Optional[str] = None
    approved_at: Optional[datetime] = None
    qc_status: str = "not_required"
    qc_notes: Optional[str] = None
    qc_checked_by: Optional[str] = None
    qc_checked_at: Optional[datetime] = None
    labour_total: Decimal
    parts_total: Decimal
    total: Decimal
    is_billable: bool
    bill_status: str
    receivable_id: Optional[str] = None
    invoice_number: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    lines: List[ServiceJobLineRead] = []


class ServiceJobCreate(BaseModel):
    issue: str = Field(min_length=1)
    company_id: str = Field(default="default", max_length=36)
    service_type: str = Field(default="direct", pattern="^(warranty_repair|paid_repair|direct)$")
    customer_id: Optional[str] = Field(default=None, max_length=36)
    customer_name: str = Field(default="", max_length=255)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    customer_email: Optional[str] = Field(default=None, max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    product_name: Optional[str] = Field(default=None, max_length=255)
    serial_number: Optional[str] = Field(default=None, max_length=128)
    brand: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    imei: Optional[str] = Field(default=None, max_length=32)
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    labour_total: Decimal = Field(default=Decimal("0"), ge=0)
    parts_total: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    condition_notes: Optional[str] = None
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    technician_id: Optional[str] = Field(default=None, max_length=36)
    technician_name: Optional[str] = Field(default=None, max_length=100)
    invoice_only: bool = False


class ServiceJobUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=255)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    customer_email: Optional[str] = Field(default=None, max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    product_name: Optional[str] = Field(default=None, max_length=255)
    serial_number: Optional[str] = Field(default=None, max_length=128)
    brand: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    imei: Optional[str] = Field(default=None, max_length=32)
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    issue: Optional[str] = None
    condition_notes: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|normal|high|urgent)$")
    technician_id: Optional[str] = Field(default=None, max_length=36)
    technician_name: Optional[str] = Field(default=None, max_length=100)
    expected_at: Optional[datetime] = None
    warranty_status: Optional[str] = None


class ServiceJobLineCreate(BaseModel):
    kind: str = Field(pattern="^(service|part|custom)$")
    name: str = Field(min_length=1, max_length=255)
    quantity: int = Field(default=1, ge=1)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    item_id: Optional[str] = Field(default=None, max_length=36)
    sku: Optional[str] = Field(default=None, max_length=100)
    unit: Optional[str] = Field(default="job", max_length=30)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    warehouse_id: Optional[str] = Field(default=None, max_length=36)
    notes: Optional[str] = None


class ServiceJobDiagnosisRequest(BaseModel):
    diagnosis: str = Field(min_length=1)
    found_problems: Optional[str] = None
    recommended_action: Optional[str] = None
    estimated_cost: Decimal = Field(default=Decimal("0"), ge=0)
    estimated_hours: Decimal = Field(default=Decimal("0"), ge=0)


class ServiceJobNoteRequest(BaseModel):
    note: Optional[str] = None


class ServiceJobQcRequest(BaseModel):
    result: str = Field(pattern="^(passed|failed)$")
    notes: Optional[str] = None
    checked_by: Optional[str] = Field(default=None, max_length=100)


class ServiceJobDeliverRequest(BaseModel):
    delivered_by: Optional[str] = Field(default=None, max_length=100)
    received_by_name: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None


class ServiceJobListMeta(BaseModel):
    count: int
    total: int


class ServiceJobListResponse(BaseModel):
    data: List[ServiceJobRead]
    meta: ServiceJobListMeta
    errors: List[str] = []


class ServiceJobResponse(BaseModel):
    data: ServiceJobRead
    errors: List[str] = []


class ServiceJobHistoryListResponse(BaseModel):
    data: List[ServiceJobHistoryRead]


class ServiceJobBillRequest(BaseModel):
    due_date: Optional[datetime] = None


class ServiceCatalogItemRead(BaseModel):
    id: str
    sku: str
    name: str
    item_type: str
    kind: str
    rate: Decimal
    unit: str


class ServiceCatalogResponse(BaseModel):
    data: List[ServiceCatalogItemRead]


class ServiceDashboardRead(BaseModel):
    total: int
    today: int
    overdue: int
    open: int
    completed: int
    billed_amount: Decimal
    status_breakdown: Dict[str, int]


class ServiceDashboardResponse(BaseModel):
    data: ServiceDashboardRead


class ServiceReportsRead(BaseModel):
    total: int
    completed: int
    pending: int
    revenue: Decimal
    avg_repair_days: float
    by_type: Dict[str, int]
    by_warranty: Dict[str, int]
    by_technician: Dict[str, Dict[str, int]]
    top_parts: List[Dict[str, object]]
    top_services: List[Dict[str, object]]
    rma_linked: int
    external: int
    warranty_jobs: int
    paid_jobs: int


class ServiceReportsResponse(BaseModel):
    data: ServiceReportsRead
