from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ImportImageRead(BaseModel):
    id: str
    item_id: str
    url: str
    thumbnail_url: Optional[str] = None
    position: int
    width: Optional[int] = None
    height: Optional[int] = None
    is_primary: bool
    status: str
    local_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ImportVariantRead(BaseModel):
    id: str
    item_id: str
    sku: str
    barcode: Optional[str] = None
    price: Optional[str] = None
    sale_price: Optional[str] = None
    stock: Optional[int] = None
    weight: Optional[str] = None
    image_url: Optional[str] = None
    attributes_json: Optional[Dict[str, Any]] = None
    status: str
    created_at: datetime
    updated_at: datetime


class ImportErrorRead(BaseModel):
    id: str
    job_id: str
    item_id: Optional[str] = None
    kind: str
    field: Optional[str] = None
    message: str
    severity: str
    details_json: Optional[Dict[str, Any]] = None
    created_at: datetime


class ImportLogRead(BaseModel):
    id: str
    job_id: str
    item_id: Optional[str] = None
    level: str
    message: str
    context_json: Optional[Dict[str, Any]] = None
    created_at: datetime


class ImportHistoryRead(BaseModel):
    id: str
    job_id: str
    item_id: Optional[str] = None
    action: str
    actor_email: str
    actor_role: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    snapshot_json: Optional[Dict[str, Any]] = None
    created_at: datetime


class ImportItemRead(BaseModel):
    id: str
    job_id: str
    provider: str
    provider_product_id: str
    status: str
    title: str
    currency: str
    base_price: Optional[str] = None
    sale_price: Optional[str] = None
    brand_name: Optional[str] = None
    category_name: Optional[str] = None
    supplier_name: Optional[str] = None
    universal_json: Optional[Dict[str, Any]] = None
    raw_json: Optional[Dict[str, Any]] = None
    validation_json: Optional[Dict[str, Any]] = None
    draft_json: Optional[Dict[str, Any]] = None
    warning_count: int
    error_count: int
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    images: List[ImportImageRead] = Field(default_factory=list)
    variants: List[ImportVariantRead] = Field(default_factory=list)
    errors: List[ImportErrorRead] = Field(default_factory=list)


class ImportJobRead(BaseModel):
    id: str
    company_id: str
    provider: str
    status: str
    user_id: Optional[str] = None
    user_email: str
    item_count: int
    success_count: int
    error_count: int
    warning_count: int
    source_label: Optional[str] = None
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class ImportJobDetailRead(ImportJobRead):
    items: List[ImportItemRead] = Field(default_factory=list)
    logs: List[ImportLogRead] = Field(default_factory=list)
    history: List[ImportHistoryRead] = Field(default_factory=list)


class ImportQueueMeta(BaseModel):
    count: int
    pending_jobs: int
    completed_jobs: int
    failed_jobs: int
    warning_items: int
    pending_items: int


class ImportJobListResponse(BaseModel):
    data: List[ImportJobRead]
    meta: ImportQueueMeta


class ImportJobResponse(BaseModel):
    data: ImportJobDetailRead


class ImportItemListResponse(BaseModel):
    data: List[ImportItemRead]
    meta: ImportQueueMeta


class ImportItemResponse(BaseModel):
    data: ImportItemRead


class StagingProductInput(BaseModel):
    provider_product_id: str
    universal: Dict[str, Any]
    raw: Optional[Dict[str, Any]] = None


class CreateImportJobInput(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50)
    source_label: Optional[str] = None
    notes: Optional[str] = None
    products: List[StagingProductInput] = Field(..., min_length=1)


class ImportItemReviewInput(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
    review_notes: Optional[str] = None


class ImportItemDraftInput(BaseModel):
    draft_json: Dict[str, Any]


class BulkItemActionInput(BaseModel):
    item_ids: List[str] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(approve|reject|delete|export)$")


class ImportImagePatchInput(BaseModel):
    is_primary: Optional[bool] = None
    status: Optional[str] = None
    url: Optional[str] = None
