from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AnnouncementCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    content: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    attachments: Optional[str] = Field(default=None, max_length=50)
    is_featured: bool = False
    is_high_priority: bool = False
    is_company_wide: bool = True

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    content: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    attachments: Optional[str] = Field(default=None, max_length=50)
    is_featured: Optional[bool] = None
    is_high_priority: Optional[bool] = None
    is_company_wide: Optional[bool] = None


class AnnouncementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: str
    category: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    attachments: Optional[str] = None
    is_featured: bool
    is_high_priority: bool
    is_company_wide: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_active: Optional[bool] = None
    view_count: Optional[int] = None


class AnnouncementListResponse(BaseModel):
    data: List[AnnouncementRead]
    meta: dict
    errors: List[str] = []


class AnnouncementResponse(BaseModel):
    data: AnnouncementRead
    errors: List[str] = []


class AnnouncementViewCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    announcement_id: str = Field(min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)


class AnnouncementViewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    announcement_id: Optional[str] = None
    employee_id: Optional[str] = None
    viewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AnnouncementViewListResponse(BaseModel):
    data: List[AnnouncementViewRead]
    meta: dict
    errors: List[str] = []


class AnnouncementViewResponse(BaseModel):
    data: AnnouncementViewRead
    errors: List[str] = []
