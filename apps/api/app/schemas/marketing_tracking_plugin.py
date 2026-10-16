from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class MarketingTrackingSiteRead(BaseModel):
    site_id: str
    site_name: str
    site_code: str
    site_domain: str
    configured: bool
    enabled: bool
    gtm_id: str
    ga4_id: str
    fb_pixel_id: str
    pixel_events: list[str]
    capi_enabled: bool
    capi_access_token_set: bool
    capi_access_token_hint: str
    capi_test_event_code: str
    capi_last_status: str
    capi_last_sent_at: Optional[datetime]


class MarketingTrackingPluginRead(BaseModel):
    id: str
    installed: bool
    enabled: bool
    available_events: list[str]
    sites: list[MarketingTrackingSiteRead]


class MarketingTrackingPluginResponse(BaseModel):
    data: MarketingTrackingPluginRead


class MarketingTrackingPluginUpdate(BaseModel):
    enabled: Optional[bool] = None


class MarketingTrackingSiteUpdate(BaseModel):
    enabled: Optional[bool] = None
    gtm_id: Optional[str] = None
    ga4_id: Optional[str] = None
    fb_pixel_id: Optional[str] = None
    pixel_events: Optional[list[str]] = None
    capi_enabled: Optional[bool] = None
    # blank keeps the saved token; clear_capi_access_token removes it
    capi_access_token: Optional[str] = None
    clear_capi_access_token: bool = False
    capi_test_event_code: Optional[str] = None


class MarketingTrackingSiteResponse(BaseModel):
    data: MarketingTrackingSiteRead


class CapiTestResult(BaseModel):
    ok: bool
    message: str


class CapiTestResponse(BaseModel):
    data: CapiTestResult


# ---------- public (storefront) ----------

class StorefrontTrackingRead(BaseModel):
    """What the storefront needs to load the tags; never the Conversions API token."""

    enabled: bool = False
    gtm_id: str = ""
    ga4_id: str = ""
    fb_pixel_id: str = ""
    pixel_events: list[str] = Field(default_factory=list)
    capi: bool = False


class StorefrontTrackingResponse(BaseModel):
    data: StorefrontTrackingRead


class StorefrontTrackingUser(BaseModel):
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    external_id: Optional[str] = Field(default=None, max_length=100)
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)


class StorefrontTrackingEvent(BaseModel):
    event_name: str = Field(min_length=2, max_length=50)
    event_id: str = Field(min_length=4, max_length=100)
    event_source_url: Optional[str] = Field(default=None, max_length=1000)
    fbp: Optional[str] = Field(default=None, max_length=200)
    fbc: Optional[str] = Field(default=None, max_length=300)
    user: Optional[StorefrontTrackingUser] = None
    # Meta custom_data: currency, value, content_ids, content_type, contents, num_items, search_string, order_id …
    custom_data: dict[str, Any] = Field(default_factory=dict)
