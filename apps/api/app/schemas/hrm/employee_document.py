from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeDocumentCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    document_type_id: str = Field(min_length=1, max_length=36)
    file_path: str = Field(min_length=1)
    file_name: Optional[str] = Field(default=None, max_length=255)
    expiry_date: Optional[date] = None
    verification_status: str = Field(
        default="pending", pattern="^(pending|verified|rejected)$"
    )
    notes: Optional[str] = None


class EmployeeDocumentUpdate(BaseModel):
    document_type_id: Optional[str] = Field(default=None, max_length=36)
    file_path: Optional[str] = Field(default=None, min_length=1)
    file_name: Optional[str] = Field(default=None, max_length=255)
    expiry_date: Optional[date] = None
    verification_status: Optional[str] = Field(
        default=None, pattern="^(pending|verified|rejected)$"
    )
    notes: Optional[str] = None


class EmployeeDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    document_type_id: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    expiry_date: Optional[date] = None
    verification_status: str
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeDocumentListMeta(BaseModel):
    count: int


class EmployeeDocumentListResponse(BaseModel):
    data: List[EmployeeDocumentRead]
    meta: EmployeeDocumentListMeta
    errors: List[str] = []


class EmployeeDocumentResponse(BaseModel):
    data: EmployeeDocumentRead
    errors: List[str] = []
