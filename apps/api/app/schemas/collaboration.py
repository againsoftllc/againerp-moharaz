from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class CollabOwnershipRead(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    company_id: str
    created_by: Optional[str] = None
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    branch_id: Optional[str] = None
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CollabOwnershipUpdate(BaseModel):
    assigned_to: Optional[str] = None
    source: Optional[str] = None
    department: Optional[str] = None


class CollabActivityRead(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    performed_by: Optional[str] = None
    performed_by_name: Optional[str] = None
    performed_by_type: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class CollabActivityListResponse(BaseModel):
    data: list[CollabActivityRead]
    meta: dict[str, int]


class CollabCommentRead(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    user_id: Optional[str] = None
    author_type: str
    comment: str
    parent_comment_id: Optional[str] = None
    visibility: str
    mentions: list[str] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CollabCommentCreate(BaseModel):
    comment: str = Field(min_length=1)
    visibility: str = "internal"
    parent_comment_id: Optional[str] = None
    mentions: list[str] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)


class CollabLabelRead(BaseModel):
    id: str
    label: str
    label_display: str
    color: Optional[str] = None
    applied_by: Optional[str] = None
    applied_by_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CollabLabelCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)


class CollabFileRead(BaseModel):
    id: str
    file_type: str
    storage_ref: str
    filename: str
    mime_type: str
    size_bytes: int
    uploaded_by: Optional[str] = None
    uploaded_by_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CollabFileCreate(BaseModel):
    filename: str
    storage_ref: str
    file_type: str = "other"
    mime_type: str = "application/octet-stream"
    size_bytes: int = 0


class CollabAiNoteRead(BaseModel):
    id: str
    note_type: str
    title: Optional[str] = None
    content: dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[float] = None
    status: str
    agent_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CollabApprovalRead(BaseModel):
    id: str
    status: str
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class CollabApprovalUpdate(BaseModel):
    status: str
    rejection_reason: Optional[str] = None


class CollabWorkspaceSummary(BaseModel):
    ownership: Optional[CollabOwnershipRead] = None
    approval: Optional[CollabApprovalRead] = None
    labels: list[CollabLabelRead] = Field(default_factory=list)
    recent_activity: list[CollabActivityRead] = Field(default_factory=list)
    comment_count: int = 0
    file_count: int = 0
    pending_ai_notes: int = 0


class CollabWorkspaceResponse(BaseModel):
    data: CollabWorkspaceSummary


def activity_to_read(row, performed_by_name: Optional[str] = None) -> CollabActivityRead:
    details: dict[str, Any] = {}
    if row.details_json:
        try:
            details = json.loads(row.details_json)
        except json.JSONDecodeError:
            details = {}
    return CollabActivityRead(
        id=row.id,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        action=row.action,
        performed_by=row.performed_by,
        performed_by_name=performed_by_name,
        performed_by_type=row.performed_by_type,
        old_value=row.old_value,
        new_value=row.new_value,
        details=details,
        created_at=row.created_at,
    )


def comment_to_read(row) -> CollabCommentRead:
    mentions: list[str] = []
    attachments: list[str] = []
    try:
        mentions = json.loads(row.mentions_json or "[]")
    except json.JSONDecodeError:
        pass
    try:
        attachments = json.loads(row.attachments_json or "[]")
    except json.JSONDecodeError:
        pass
    return CollabCommentRead(
        id=row.id,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        user_id=row.user_id,
        author_type=row.author_type,
        comment=row.comment,
        parent_comment_id=row.parent_comment_id,
        visibility=row.visibility,
        mentions=mentions,
        attachments=attachments,
        is_deleted=row.is_deleted,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def ai_note_to_read(row) -> CollabAiNoteRead:
    content: dict[str, Any] = {}
    try:
        content = json.loads(row.content_json or "{}")
    except json.JSONDecodeError:
        pass
    return CollabAiNoteRead(
        id=row.id,
        note_type=row.note_type,
        title=row.title,
        content=content,
        confidence=float(row.confidence) if row.confidence is not None else None,
        status=row.status,
        agent_id=row.agent_id,
        created_at=row.created_at,
    )
