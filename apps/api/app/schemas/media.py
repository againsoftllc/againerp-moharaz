from __future__ import annotations

import re
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def derive_labels_from_file_name(file_name: str) -> tuple[str, str]:
    base = re.sub(r"[-_]+", " ", re.sub(r"\.[^.]+$", "", file_name)).strip()
    return base, base


class MediaBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    title: str = Field(default="", max_length=255)
    folder: str = Field(default="Uploads", max_length=100)
    url: str = Field(min_length=1, max_length=1000)
    media_type: str = Field(default="image", pattern="^(image|video|document)$")
    mime_type: str = Field(default="image/jpeg", max_length=100)
    size_kb: int = Field(default=0, ge=0)
    alt: Optional[str] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    imported_by: Optional[str] = None
    provider: str = Field(default="direct", max_length=20)
    uploaded_by: Optional[str] = None
    title_linked_to_name: bool = True
    alt_linked_to_name: bool = True


class MediaCreate(MediaBase):
    pass


class MediaUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    title: Optional[str] = Field(default=None, max_length=255)
    alt: Optional[str] = None
    folder: Optional[str] = Field(default=None, max_length=100)
    title_linked_to_name: Optional[bool] = None
    alt_linked_to_name: Optional[bool] = None


class MediaRead(MediaBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    created_at: datetime
    updated_at: datetime


class MediaListMeta(BaseModel):
    count: int


class MediaListResponse(BaseModel):
    data: List[MediaRead]
    meta: MediaListMeta
    errors: List[str] = []


class MediaResponse(BaseModel):
    data: MediaRead
    errors: List[str] = []


class MediaBatchCreateRequest(BaseModel):
    items: List[MediaCreate] = Field(min_length=1)


class MediaMigrateRequest(BaseModel):
    ids: List[str] = Field(min_length=1)
    target: Literal["local", "r2"]


class MediaMigrateItemResult(BaseModel):
    id: str
    ok: bool
    skipped: bool = False
    message: str = ""
    provider: Optional[str] = None


class MediaMigrateMeta(BaseModel):
    moved: int
    skipped: int
    failed: int


class MediaMigrateResponse(BaseModel):
    data: List[MediaMigrateItemResult]
    meta: MediaMigrateMeta
    errors: List[str] = []

