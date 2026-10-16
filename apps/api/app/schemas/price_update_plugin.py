from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional, Union

from pydantic import BaseModel, field_serializer

# All datetimes in this plugin are written with datetime.utcnow() — naive, but always UTC.
# Serialized as-is (no offset suffix), a JS `new Date(iso)` on the frontend parses them as
# LOCAL time instead of UTC, silently shifting every "time ago" display by the viewer's UTC
# offset (e.g. a ~12h-old check showing as "6 hours ago" for a UTC+6 viewer). Stamping the
# offset here — not changing the DB column to timezone-aware — is the minimal correct fix.
def _utc_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class PriceUpdatePluginRead(BaseModel):
    id: str
    company_id: str
    installed: bool
    enabled: bool
    google_api_key_hint: str
    google_api_key_configured: bool
    google_search_engine_id: str
    use_site_search: bool = True
    use_sitemap_match: bool = True
    use_google_search: bool = False
    use_google_price: bool = False
    use_ai_pick: bool = False
    use_ai_price_read: bool = False
    use_ai_web_search: bool = False
    auto_sync_hours: int = 6
    last_auto_sync_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", "last_auto_sync_at")
    def _serialize_dates(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)


class PriceUpdatePluginResponse(BaseModel):
    data: PriceUpdatePluginRead


class PriceUpdatePluginUpdate(BaseModel):
    enabled: Optional[bool] = None
    google_api_key: Optional[str] = None
    google_search_engine_id: Optional[str] = None
    use_site_search: Optional[bool] = None
    use_sitemap_match: Optional[bool] = None
    use_google_search: Optional[bool] = None
    use_google_price: Optional[bool] = None
    use_ai_pick: Optional[bool] = None
    use_ai_price_read: Optional[bool] = None
    use_ai_web_search: Optional[bool] = None
    auto_sync_hours: Optional[int] = None


class PriceUpdateCompetitorRead(BaseModel):
    id: str
    label: str
    domain: str
    enabled: bool
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)


class PriceUpdateCompetitorListResponse(BaseModel):
    data: List[PriceUpdateCompetitorRead]


class PriceUpdateCompetitorCreate(BaseModel):
    domain: str
    label: str


class PriceUpdateCompetitorUpdate(BaseModel):
    enabled: bool


class PriceUpdateMatchRead(BaseModel):
    id: str
    product_id: str
    competitor: str
    matched_url: Optional[str] = None
    matched_title: Optional[str] = None
    manual_url: bool
    price: Optional[Decimal] = None
    regular_price: Optional[Decimal] = None
    currency: str
    in_stock: Optional[bool] = None
    stock_label: Optional[str] = None
    status: str
    status_message: Optional[str] = None
    last_checked_at: Optional[datetime] = None
    verified: bool = False
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None

    @field_serializer("last_checked_at", "verified_at")
    def _serialize_last_checked_at(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_iso(value)


class PriceUpdateMatchListResponse(BaseModel):
    data: List[PriceUpdateMatchRead]


class PriceUpdateSetUrlRequest(BaseModel):
    product_id: str
    competitor: str
    url: str
    # The admin opened the link and confirmed it's this product.
    verified: bool = False


class PriceUpdateVerifyRequest(BaseModel):
    verified: bool


class PriceUpdateRefreshRequest(BaseModel):
    product_ids: List[str]
    # Refresh a single competitor only, or all enabled ones when omitted.
    competitor: Optional[str] = None
    # False = free sync: re-read saved links only (price pattern + structured data), never
    # Google Search or AI. The per-cell sync button sends False.
    allow_ai: bool = True


# ── "Send to AgainERP" browser extension ─────────────────────────────────────


class PriceCaptureLookupRequest(BaseModel):
    url: str
    title: str = ""
    price: Optional[float] = None


class PriceCaptureProduct(BaseModel):
    id: str
    name: str
    sku: Optional[str] = None
    price: Optional[Decimal] = None
    thumbnail: Optional[str] = None
    likely: bool = False  # passes the automatic-matching check


class PriceCaptureLookupResponse(BaseModel):
    domain: str
    competitor: Optional[PriceUpdateCompetitorRead] = None
    linked: List[PriceCaptureProduct] = []  # products whose saved link is this exact page
    suggestions: List[PriceCaptureProduct] = []


class PriceCaptureRequest(BaseModel):
    product_id: str
    url: str
    title: Optional[str] = None
    price: Decimal
    regular_price: Optional[Decimal] = None
    in_stock: Optional[bool] = None
    stock_label: Optional[str] = None
    competitor: Optional[str] = None
    # Set (label, may be "") to add the page's site as a new competitor when it isn't one yet.
    add_competitor_label: Optional[str] = None


class PriceSyncQueueItem(BaseModel):
    match_id: str
    product_id: str
    product_name: str
    competitor: str
    competitor_label: str
    competitor_domain: str
    url: str
    status: str


class PriceSyncQueueResponse(BaseModel):
    data: List[PriceSyncQueueItem]


class PriceSyncResultRequest(BaseModel):
    match_id: str
    page_url: Optional[str] = None
    title: Optional[str] = None
    price: Optional[Decimal] = None
    regular_price: Optional[Decimal] = None
    in_stock: Optional[bool] = None
    stock_label: Optional[str] = None
    error: Optional[str] = None  # the browser couldn't read the page (bot check, redirect, timeout…)


class PriceDiscoverDocument(BaseModel):
    url: str
    kind: str = "sitemap"  # "robots" | "sitemap"
    sitemaps: List[str] = []
    locs: List[str] = []
    failed: bool = False


class PriceDiscoverStepRequest(BaseModel):
    product_id: str
    competitor: str
    documents: List[PriceDiscoverDocument] = []


class PriceDiscoverStepResponse(BaseModel):
    need: List[str] = []
    candidates: List[str] = []
    message: str = ""


class PriceDiscoverConfirmRequest(BaseModel):
    product_id: str
    competitor: str
    url: Optional[str] = None  # None = no candidate passed
    title: Optional[str] = None
    price: Optional[Decimal] = None
    regular_price: Optional[Decimal] = None
    in_stock: Optional[bool] = None
    stock_label: Optional[str] = None
    closest: Optional[str] = None


class PriceDiscoverConfirmResponse(BaseModel):
    ok: bool
    reason: str = ""
    match: PriceUpdateMatchRead


# ── Copy competitor price / stock into our catalog ───────────────────────────


class PriceApplyItem(BaseModel):
    product_id: str
    competitor: str


class PriceApplyRequest(BaseModel):
    field: str  # "price" | "stock"
    items: List[PriceApplyItem]
    dry_run: bool = True


class PriceApplyRow(BaseModel):
    product_id: str
    name: str
    competitor: Optional[str] = None
    site: Optional[str] = None
    current: Optional[Union[float, str]] = None
    new: Optional[Union[float, str]] = None
    skip: Optional[str] = None
    applied: Optional[bool] = None


class PriceApplyResponse(BaseModel):
    data: List[PriceApplyRow]
