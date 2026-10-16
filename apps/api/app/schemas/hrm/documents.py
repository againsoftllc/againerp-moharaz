from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- document categories ---


class DocumentCategoryCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    color: str = Field(default="#3b82f6", min_length=1, max_length=50)
    icon: str = Field(default="folder", min_length=1, max_length=50)
    sort_order: int = 0
    is_mandatory: bool = False
    status: str = Field(default="active", pattern="^(active|inactive)$")


class DocumentCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, min_length=1, max_length=50)
    icon: Optional[str] = Field(default=None, min_length=1, max_length=50)
    sort_order: Optional[int] = None
    is_mandatory: Optional[bool] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class DocumentCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    color: str
    icon: str
    sort_order: int
    is_mandatory: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentCategoryListResponse(BaseModel):
    data: List[DocumentCategoryRead]
    meta: dict
    errors: List[str] = []


class DocumentCategoryResponse(BaseModel):
    data: DocumentCategoryRead
    errors: List[str] = []


# --- HR documents ---


class HrDocumentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1)
    description: Optional[str] = None
    category_id: Optional[str] = Field(default=None, max_length=36)
    file_name: Optional[str] = Field(default=None, max_length=50)
    file_path: Optional[str] = None
    file_type: Optional[str] = Field(default=None, max_length=50)
    file_size: int = 0
    version: str = Field(default="1.0", min_length=1, max_length=50)
    effective_date: Optional[Date] = None
    expiry_date: Optional[Date] = None
    requires_acknowledgment: bool = False


class HrDocumentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    category_id: Optional[str] = Field(default=None, max_length=36)
    file_name: Optional[str] = Field(default=None, max_length=50)
    file_path: Optional[str] = None
    file_type: Optional[str] = Field(default=None, max_length=50)
    file_size: Optional[int] = None
    version: Optional[str] = Field(default=None, min_length=1, max_length=50)
    status: Optional[str] = Field(
        default=None, pattern="^(draft|published|archived)$"
    )
    effective_date: Optional[Date] = None
    expiry_date: Optional[Date] = None
    requires_acknowledgment: Optional[bool] = None


class HrDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    file_name: Optional[str] = None
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    file_size: int
    version: str
    status: str
    effective_date: Optional[Date] = None
    expiry_date: Optional[Date] = None
    requires_acknowledgment: bool
    download_count: int
    uploaded_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class HrDocumentListResponse(BaseModel):
    data: List[HrDocumentRead]
    meta: dict
    errors: List[str] = []


class HrDocumentResponse(BaseModel):
    data: HrDocumentRead
    errors: List[str] = []


# --- document templates ---


class DocumentTemplateCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    category_id: Optional[str] = Field(default=None, max_length=36)
    template_content: Optional[str] = None
    placeholders: Optional[str] = None
    default_values: Optional[str] = None
    is_default: bool = False
    file_format: str = Field(default="PDF", min_length=1, max_length=50)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    category_id: Optional[str] = Field(default=None, max_length=36)
    template_content: Optional[str] = None
    placeholders: Optional[str] = None
    default_values: Optional[str] = None
    is_default: Optional[bool] = None
    file_format: Optional[str] = Field(default=None, min_length=1, max_length=50)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class DocumentTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    template_content: Optional[str] = None
    placeholders: Optional[str] = None
    default_values: Optional[str] = None
    is_default: bool
    file_format: str
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentTemplateListResponse(BaseModel):
    data: List[DocumentTemplateRead]
    meta: dict
    errors: List[str] = []


class DocumentTemplateResponse(BaseModel):
    data: DocumentTemplateRead
    errors: List[str] = []


# --- acknowledgments ---


class DocumentAcknowledgmentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    document_id: str = Field(min_length=1, max_length=36)
    user_id: str = Field(min_length=1, max_length=36)
    due_date: Optional[Date] = None
    acknowledgment_note: Optional[str] = None


class DocumentAcknowledgmentUpdate(BaseModel):
    due_date: Optional[Date] = None
    acknowledgment_note: Optional[str] = None
    status: Optional[str] = Field(
        default=None, pattern="^(pending|acknowledged|overdue)$"
    )


class DocumentAcknowledgmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    document_id: Optional[str] = None
    user_id: Optional[str] = None
    status: str
    acknowledged_at: Optional[datetime] = None
    due_date: Optional[Date] = None
    acknowledgment_note: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    assigned_by: Optional[str] = None
    assigned_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentAcknowledgmentListResponse(BaseModel):
    data: List[DocumentAcknowledgmentRead]
    meta: dict
    errors: List[str] = []


class DocumentAcknowledgmentResponse(BaseModel):
    data: DocumentAcknowledgmentRead
    errors: List[str] = []
