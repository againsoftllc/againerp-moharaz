from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SeoUrlUpdate(BaseModel):
    """Fields a human may override on a synced URL record.

    `title` and `entity_type` are owned by the source entity and refreshed by the
    sync, so they are not editable here.
    """

    slug: Optional[str] = Field(default=None, min_length=1, max_length=500)
    canonical_url: Optional[str] = Field(default=None, max_length=500)
    status: Optional[str] = Field(default=None, max_length=20)
    indexable: Optional[bool] = None
    redirect_to: Optional[str] = Field(default=None, max_length=500)
    # Setting status or indexable locks them automatically; pass False here to
    # hand them back to the entity sync.
    status_locked: Optional[bool] = None


class SeoUrlRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: str
    entity_id: Optional[str] = None
    title: str
    slug: str
    canonical_url: str
    status: str
    indexable: bool
    redirect_to: str
    views_30d: int
    status_locked: bool
    created_at: datetime
    updated_at: datetime


class SeoUrlListMeta(BaseModel):
    count: int
    active_count: int
    redirect_count: int
    noindex_count: int
    draft_count: int
    views_30d_total: int


class SeoUrlListResponse(BaseModel):
    data: List[SeoUrlRead]
    meta: SeoUrlListMeta


class SeoUrlResponse(BaseModel):
    data: SeoUrlRead


class SeoUrlSyncResponse(BaseModel):
    """Result of a manual resync from the catalogue and website content."""

    synced: int
    count: int
