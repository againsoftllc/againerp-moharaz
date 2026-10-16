from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


LinkType = Literal["page", "category", "brand", "custom"]
MenuKind = Literal["system", "custom"]
MenuSource = Literal["auto", "custom"]
MenuAutoType = Literal["category", "brand", "page"]
MenuNavStyle = Literal["megamenu", "dropdown"]
SystemKey = Literal["catalog", "header", "footer"]


class MenuItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=200)
    link_type: LinkType = "custom"
    link_ref_id: Optional[str] = Field(default=None, max_length=36)
    href: str = Field(default="", max_length=500)
    hidden: bool = False
    children: list[MenuItem] = Field(default_factory=list)


class WebsiteMenuRead(BaseModel):
    id: str
    company_id: str
    name: str
    handle: str
    kind: MenuKind
    system_key: Optional[SystemKey] = None
    source: MenuSource
    auto_type: MenuAutoType = "category"
    auto_show_new: bool = True
    active: bool
    sort_order: int
    items: list[MenuItem] = Field(default_factory=list)
    """When source=auto, optional live preview for admin."""
    auto_preview: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WebsiteMenuCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    handle: Optional[str] = Field(default=None, max_length=120)
    source: MenuSource = "custom"
    auto_type: MenuAutoType = "category"
    auto_show_new: bool = True
    items: list[MenuItem] = Field(default_factory=list)
    active: bool = True


class WebsiteMenuUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=160)
    handle: Optional[str] = Field(default=None, max_length=120)
    source: Optional[MenuSource] = None
    auto_type: Optional[MenuAutoType] = None
    auto_show_new: Optional[bool] = None
    items: Optional[list[MenuItem]] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class WebsiteMenuListMeta(BaseModel):
    count: int


class WebsiteMenuListResponse(BaseModel):
    data: list[WebsiteMenuRead]
    meta: WebsiteMenuListMeta
    errors: list[str] = Field(default_factory=list)


class WebsiteMenuResponse(BaseModel):
    data: WebsiteMenuRead
    errors: list[str] = Field(default_factory=list)


class WebsiteMenuSlotRead(BaseModel):
    slot_key: str
    menu_id: str
    menu_name: Optional[str] = None
    title: str = ""
    nav_style: MenuNavStyle = "megamenu"
    updated_at: datetime


class WebsiteMenuSlotUpdateItem(BaseModel):
    slot_key: str = Field(min_length=1, max_length=64)
    menu_id: str = Field(min_length=1, max_length=36)
    title: Optional[str] = Field(default=None, max_length=80)
    nav_style: Optional[MenuNavStyle] = None


class WebsiteMenuSlotsUpdate(BaseModel):
    slots: list[WebsiteMenuSlotUpdateItem]


class WebsiteMenuSlotsResponse(BaseModel):
    data: list[WebsiteMenuSlotRead]
    errors: list[str] = Field(default_factory=list)


class StorefrontMenuItem(BaseModel):
    id: str
    label: str
    link_type: LinkType = "custom"
    link_ref_id: Optional[str] = None
    href: str = ""
    children: list[StorefrontMenuItem] = Field(default_factory=list)


class StorefrontMenuRead(BaseModel):
    slot_key: str
    menu_id: str
    name: str
    handle: str
    source: MenuSource
    title: str = ""
    nav_style: MenuNavStyle = "megamenu"
    items: list[StorefrontMenuItem] = Field(default_factory=list)


class StorefrontMenuResponse(BaseModel):
    data: StorefrontMenuRead
    errors: list[str] = Field(default_factory=list)


# Rebuild for nested MenuItem / StorefrontMenuItem
MenuItem.model_rebuild()
StorefrontMenuItem.model_rebuild()
