from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SeoAuditIssueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    issue_type: str
    category: str
    severity: str
    url: str
    entity: str
    suggestion: str
    status: str
    affected_count: int
    source: str
    created_at: datetime
    updated_at: datetime


class SeoAuditIssueUpdate(BaseModel):
    """Only the triage decision is editable; the analyzer owns the rest."""

    status: str = Field(pattern="^(open|fixed|ignored)$")


class SeoAuditRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pages_crawled: int
    issues_found: int
    health_score: int
    live_pages_crawled: int
    storefront_reachable: bool
    duration_ms: int
    # Per-category score, omitting categories the run could not inspect.
    category_scores: Dict[str, int] = {}
    started_at: datetime
    completed_at: Optional[datetime] = None


class SeoAuditIssueListMeta(BaseModel):
    count: int
    open_count: int
    fixed_count: int
    ignored_count: int
    high_count: int
    medium_count: int
    low_count: int


class SeoAuditIssueListResponse(BaseModel):
    data: List[SeoAuditIssueRead]
    meta: SeoAuditIssueListMeta


class SeoAuditIssueResponse(BaseModel):
    data: SeoAuditIssueRead


class SeoAuditRunResponse(BaseModel):
    data: Optional[SeoAuditRunRead] = None


class SeoAuditRunListResponse(BaseModel):
    data: List[SeoAuditRunRead]


class SeoAuditRunRequest(BaseModel):
    # Off by default: a crawl reaches out over the network, so it is opt-in.
    probe_live: bool = False
    live_sample: int = Field(default=8, ge=1, le=50)


class SeoDashboard(BaseModel):
    health_score: int
    last_run: Optional[SeoAuditRunRead] = None
    open_issues: int
    high_issues: int
    issues_by_category: Dict[str, int]
    url_count: int
    indexable_count: int
    redirect_count: int
    meta_count: int
    avg_meta_score: int
