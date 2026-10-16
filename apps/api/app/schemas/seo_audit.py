from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class SeoAuditIssueRead(BaseModel):
    id: str
    issue_type: str
    category: str
    severity: str
    url: str
    entity: str
    suggestion: str
    status: str
    affected_count: int = 1
    created_at: datetime
    updated_at: datetime


class SeoAuditCrawlInfo(BaseModel):
    last_crawl: Optional[str] = None
    pages_crawled: int = 0
    live_pages_crawled: int = 0
    storefront_reachable: bool = True
    duration: Optional[str] = None
    next_crawl: Optional[str] = None
    health_score: int = 0


class SeoAuditListMeta(BaseModel):
    count: int
    open_count: int
    high_count: int
    fixed_count: int
    health_score: int
    category_scores: Dict[str, int] = Field(default_factory=dict)
    crawl: SeoAuditCrawlInfo


class SeoAuditListResponse(BaseModel):
    data: List[SeoAuditIssueRead]
    meta: SeoAuditListMeta


class SeoAuditIssueResponse(BaseModel):
    data: SeoAuditIssueRead


class SeoAuditIssueUpdate(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(open|fixed|ignored)$")


class SeoAuditRunResponse(BaseModel):
    data: SeoAuditCrawlInfo
    meta: SeoAuditListMeta
