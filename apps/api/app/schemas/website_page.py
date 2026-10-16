from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

WebsitePageType = Literal[
    "website",
    "landing",
    "category",
    "brand",
    "product_listing",
    "blog",
    "system",
    "custom",
]
WebsitePageStatus = Literal["draft", "published", "scheduled", "review", "archived"]
WebsitePageLayout = Literal["default", "landing", "blank", "sidebar", "fullscreen", "custom"]
WebsitePageVisibility = Literal["public", "private", "password", "logged_in", "customer_group"]
WebsitePageLanguage = Literal["en", "bn", "ar"]
WebsiteSeoStatus = Literal["complete", "partial", "missing"]
WebsiteSchemaType = Literal[
    "WebPage",
    "AboutPage",
    "ContactPage",
    "CollectionPage",
    "Product",
    "Article",
    "FAQPage",
    "None",
]
WebsitePageVersionSource = Literal["manual", "ai", "publish", "restore"]


class WebsitePageSeo(BaseModel):
    meta_title: str = ""
    meta_description: str = ""
    keywords: str = ""
    og_title: str = ""
    og_description: str = ""
    og_image: Optional[str] = None
    canonical_url: Optional[str] = None
    indexable: bool = True
    schema_type: WebsiteSchemaType = "WebPage"


class WebsitePageAdvanced(BaseModel):
    css_class: str = ""
    body_class: str = ""
    cache_enabled: bool = True
    lazy_load: bool = True
    search_index: bool = True


class WebsitePageAccess(BaseModel):
    owner: str = "Admin"
    editors: List[str] = Field(default_factory=lambda: ["Admin"])
    view_access: str = "Public"
    publish_permission: str = "Editors"


class WebsitePageStats(BaseModel):
    views: int = 0
    clicks: int = 0
    conversion: float = 0
    seo_score: int = 0
    performance_score: int = 0


class WebsitePageFlags(BaseModel):
    is_home: bool = False
    is_system: bool = False
    is_locked: bool = False
    slug_locked: bool = False
    delete_disabled: bool = False


class WebsitePageVersion(BaseModel):
    id: str
    version: int
    label: str
    status: WebsitePageStatus
    created_at: str
    author: str
    source: WebsitePageVersionSource


class WebsitePageRead(BaseModel):
    id: str
    company_id: str
    name: str
    slug: str
    url: str
    page_type: WebsitePageType
    layout: WebsitePageLayout
    template: str
    language: WebsitePageLanguage
    description: str
    visibility: WebsitePageVisibility
    status: WebsitePageStatus
    seo_status: WebsiteSeoStatus
    creator: str
    updated_by: str
    published_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    current_version: int
    seo: WebsitePageSeo
    advanced: WebsitePageAdvanced
    access: WebsitePageAccess
    stats: WebsitePageStats
    flags: WebsitePageFlags
    versions: List[WebsitePageVersion] = Field(default_factory=list)
    permissions: List[str] = Field(default_factory=list)
    body_html: str = ""
    created_at: datetime
    updated_at: datetime


class WebsitePageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(max_length=255)
    page_type: WebsitePageType = "website"
    layout: WebsitePageLayout = "default"
    template: str = Field(default="Default", max_length=120)
    language: WebsitePageLanguage = "en"
    description: str = ""
    visibility: WebsitePageVisibility = "public"
    status: WebsitePageStatus = "draft"
    scheduled_at: Optional[datetime] = None
    seo: Optional[WebsitePageSeo] = None
    creator: str = Field(default="Admin", max_length=120)
    updated_by: str = Field(default="Admin", max_length=120)


class WebsitePageUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, max_length=255)
    url: Optional[str] = Field(default=None, max_length=500)
    page_type: Optional[WebsitePageType] = None
    layout: Optional[WebsitePageLayout] = None
    template: Optional[str] = Field(default=None, max_length=120)
    language: Optional[WebsitePageLanguage] = None
    description: Optional[str] = None
    visibility: Optional[WebsitePageVisibility] = None
    status: Optional[WebsitePageStatus] = None
    seo_status: Optional[WebsiteSeoStatus] = None
    updated_by: Optional[str] = Field(default=None, max_length=120)
    published_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    current_version: Optional[int] = Field(default=None, ge=1)
    seo: Optional[WebsitePageSeo] = None
    advanced: Optional[WebsitePageAdvanced] = None
    access: Optional[WebsitePageAccess] = None
    stats: Optional[WebsitePageStats] = None
    flags: Optional[WebsitePageFlags] = None
    versions: Optional[List[WebsitePageVersion]] = None
    permissions: Optional[List[str]] = None
    body_html: Optional[str] = None


class WebsitePageListMeta(BaseModel):
    count: int


class WebsitePageListResponse(BaseModel):
    data: List[WebsitePageRead]
    meta: WebsitePageListMeta
    errors: List[str] = []


class WebsitePageResponse(BaseModel):
    data: WebsitePageRead
    errors: List[str] = []
