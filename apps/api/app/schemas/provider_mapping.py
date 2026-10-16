from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MappingCandidateRead(BaseModel):
    id: str
    name: str
    score: float = 0.0
    entity_type: Optional[str] = None
    slug: Optional[str] = None
    path: Optional[str] = None
    code: Optional[str] = None
    vendor_code: Optional[str] = None
    source: Optional[str] = None
    reason: Optional[str] = None


class EntityMappingRead(BaseModel):
    id: str
    provider: str
    entity_type: str
    provider_entity_id: str
    provider_name: str
    provider_path: Optional[List[str]] = None
    erp_entity_id: Optional[str] = None
    erp_entity_name: Optional[str] = None
    status: str
    match_method: str
    confidence: float
    suggestions: List[MappingCandidateRead] = Field(default_factory=list)
    conflicts: List[MappingCandidateRead] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    source_item_id: Optional[str] = None
    merged_into_id: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EntityMappingListResponse(BaseModel):
    data: List[EntityMappingRead]
    meta: Dict[str, Any]


class EntityMappingResponse(BaseModel):
    data: EntityMappingRead


class MappingDashboardMeta(BaseModel):
    total: int
    by_entity_type: Dict[str, int]
    by_status: Dict[str, int]
    pending_review: int
    approved: int
    conflicts: int
    rules: int


class MappingDashboardResponse(BaseModel):
    meta: MappingDashboardMeta


class ScanUniversalInput(BaseModel):
    universal: Dict[str, Any]
    source_item_id: Optional[str] = None


class ScanItemInput(BaseModel):
    item_id: str


class MappingApproveInput(BaseModel):
    erp_entity_id: Optional[str] = None
    erp_entity_name: Optional[str] = None
    review_notes: Optional[str] = None


class MappingRejectInput(BaseModel):
    review_notes: Optional[str] = None


class MappingManualInput(BaseModel):
    erp_entity_id: str
    erp_entity_name: str
    review_notes: Optional[str] = None


class MappingConflictResolveInput(BaseModel):
    erp_entity_id: str
    erp_entity_name: str
    review_notes: Optional[str] = None


class MappingMergeInput(BaseModel):
    target_id: str
    source_ids: List[str] = Field(..., min_length=1)


class MappingRuleRead(BaseModel):
    id: str
    entity_type: str
    provider: Optional[str] = None
    pattern_type: str
    pattern_value: str
    erp_entity_id: str
    erp_entity_name: str
    priority: int
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MappingRuleCreateInput(BaseModel):
    entity_type: str
    provider: Optional[str] = None
    pattern_type: str = "exact"
    pattern_value: str
    erp_entity_id: str
    erp_entity_name: str
    priority: int = 100
    is_active: bool = True
    notes: Optional[str] = None


class MappingRulePatchInput(BaseModel):
    pattern_type: Optional[str] = None
    pattern_value: Optional[str] = None
    erp_entity_id: Optional[str] = None
    erp_entity_name: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class MappingHistoryRead(BaseModel):
    id: str
    mapping_id: str
    action: str
    actor_email: str
    actor_role: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    detail: Optional[Dict[str, Any]] = None
    created_at: datetime
