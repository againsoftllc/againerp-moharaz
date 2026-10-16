from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

HeaderStyle = Literal["minimal", "standard", "mega", "centered", "sidebar"]
FooterStyle = Literal["minimal", "standard", "extended", "dark"]
SidebarPosition = Literal["none", "left", "right"]
LayoutStatus = Literal["active", "draft"]


class WebsiteLayoutRead(BaseModel):
    id: str
    company_id: str
    name: str
    description: str
    header_style: HeaderStyle
    footer_style: FooterStyle
    sidebar_position: SidebarPosition
    status: LayoutStatus
    is_default: bool
    pages_count: int
    thumbnail: str
    created_at: datetime
    updated_at: datetime


class WebsiteLayoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    header_style: HeaderStyle = "standard"
    footer_style: FooterStyle = "standard"
    sidebar_position: SidebarPosition = "none"
    status: LayoutStatus = "draft"
    thumbnail: str = Field(default="default", max_length=64)


class WebsiteLayoutUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    header_style: Optional[HeaderStyle] = None
    footer_style: Optional[FooterStyle] = None
    sidebar_position: Optional[SidebarPosition] = None
    status: Optional[LayoutStatus] = None
    is_default: Optional[bool] = None
    thumbnail: Optional[str] = Field(default=None, max_length=64)


class WebsiteLayoutListMeta(BaseModel):
    count: int


class WebsiteLayoutListResponse(BaseModel):
    data: List[WebsiteLayoutRead]
    meta: WebsiteLayoutListMeta
    errors: List[str] = []


class WebsiteLayoutResponse(BaseModel):
    data: WebsiteLayoutRead
    errors: List[str] = []
