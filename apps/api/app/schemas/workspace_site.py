from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


SiteStatus = Literal["active", "inactive", "setup"]


class WorkspaceSiteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str = "default"
    code: str
    name: str
    status: str
    plan: str = ""
    owner: str = ""

    primary_domain: str = ""
    domain_aliases: str = ""

    storefront_url_local: str = ""
    storefront_url_preview: str = ""
    storefront_url_production: str = ""

    git_repo_url: str = ""
    git_default_branch: str = "main"
    vercel_project_id: str = ""
    vercel_project_name: str = ""
    vercel_team_slug: str = ""

    tagline: str = ""
    logo_url: str = ""
    logo_mobile_url: str = ""
    favicon_url: str = ""
    address: str = ""
    contact_phone: str = ""
    contact_email: str = ""
    whatsapp_number: str = ""
    copyright_text: str = ""
    business_hours: str = ""
    meta_title: str = ""
    meta_description: str = ""
    meta_keywords: str = ""
    options: dict = Field(default_factory=dict)

    currency: str = "BDT"
    timezone: str = "Asia/Dhaka"
    notes: str = ""
    is_primary: bool = False

    # Live counts for list UI
    branches: int = 0
    products: int = 0
    orders: int = 0

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WorkspaceSiteListResponse(BaseModel):
    data: List[WorkspaceSiteRead]
    total: int


class WorkspaceSiteResponse(BaseModel):
    data: WorkspaceSiteRead


class WorkspaceSiteCreate(BaseModel):
    id: Optional[str] = Field(default=None, max_length=36)
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    status: SiteStatus = "setup"
    plan: str = ""
    owner: str = ""
    primary_domain: str = ""
    domain_aliases: str = ""
    storefront_url_local: str = ""
    storefront_url_preview: str = ""
    storefront_url_production: str = ""
    git_repo_url: str = ""
    git_default_branch: str = "main"
    vercel_project_id: str = ""
    vercel_project_name: str = ""
    vercel_team_slug: str = ""
    tagline: str = ""
    logo_url: str = ""
    logo_mobile_url: str = ""
    favicon_url: str = ""
    address: str = ""
    contact_phone: str = ""
    contact_email: str = ""
    whatsapp_number: str = ""
    copyright_text: str = ""
    business_hours: str = ""
    meta_title: str = ""
    meta_description: str = ""
    meta_keywords: str = ""
    options: dict = Field(default_factory=dict)
    currency: str = "BDT"
    timezone: str = "Asia/Dhaka"
    notes: str = ""
    is_primary: bool = False


class WorkspaceSiteUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=32)
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    status: Optional[SiteStatus] = None
    plan: Optional[str] = None
    owner: Optional[str] = None
    primary_domain: Optional[str] = None
    domain_aliases: Optional[str] = None
    storefront_url_local: Optional[str] = None
    storefront_url_preview: Optional[str] = None
    storefront_url_production: Optional[str] = None
    git_repo_url: Optional[str] = None
    git_default_branch: Optional[str] = None
    vercel_project_id: Optional[str] = None
    vercel_project_name: Optional[str] = None
    vercel_team_slug: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    logo_mobile_url: Optional[str] = None
    favicon_url: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    copyright_text: Optional[str] = None
    business_hours: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    options: Optional[dict] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None
