from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_PIXEL_EVENTS = [
    "PageView",
    "ViewContent",
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
    "Search",
    "CompleteRegistration",
    "Contact",
]


class MarketingTrackingPlugin(Base):
    """Marketing Tracking plugin switch (single row, id=marketing-tracking-default); settings live per site."""

    __tablename__ = "plugin_marketing_tracking"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="marketing-tracking-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class MarketingTrackingSite(Base):
    """Google Tag Manager / GA4 / Meta Pixel + Conversions API settings of one storefront site (workspace_sites.id)."""

    __tablename__ = "plugin_marketing_tracking_sites"

    site_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    gtm_id: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    ga4_id: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    fb_pixel_id: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    # JSON list of Meta standard events the storefront sends (PageView, ViewContent, AddToCart …)
    pixel_events_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # Conversions API: the same events sent server-side (deduplicated with the browser's by event_id)
    capi_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    capi_access_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    capi_test_event_code: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    capi_last_status: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    capi_last_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
