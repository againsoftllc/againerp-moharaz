from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PriceUpdatePlugin(Base):
    """Price Update plugin settings — one row per company (single row, default id)."""

    __tablename__ = "plugin_price_update"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="price-update-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Google Custom Search JSON API — used to locate a matching product page on a
    # competitor site when we don't already have one cached. Optional: matches can
    # also be entered/pasted manually without this key.
    google_api_key: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    google_api_key_hint: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    google_search_engine_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    # How "Check competitor prices" may look for a product page / read a price. Free methods
    # default on, paid ones off — nothing costs money until an admin turns it on. Reading a
    # saved link (site price pattern + structured data) is always free and always on; a
    # cell's sync button never uses any paid method regardless of these.
    use_site_search: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # free
    use_sitemap_match: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # free
    use_google_search: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Google API quota
    use_google_price: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Google API quota
    use_ai_pick: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # AI tokens
    use_ai_price_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # AI tokens
    use_ai_web_search: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # AI web search + tokens
    # Server-side scheduled re-read of saved links, every N hours (0 = off). Free: no search/AI.
    auto_sync_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    last_auto_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Superseded by the PriceUpdateCompetitorSite table (one row per company, arbitrary
    # competitor sites can be added there) — kept only so existing rows don't need a
    # destructive column-drop migration; no longer read or written.
    startech_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ryans_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    techland_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )


class PriceUpdateCompetitorSite(Base):
    """A competitor website to check prices against — user-managed list, per company.
    Seeded with Startech/Ryans/Techland on first use; more can be added/removed freely.
    A site with no hand-verified regex pattern in price_update_service is still read for
    free: the price its page declares in schema.org / app data / meta tags, else the first
    price right after the product name (fetch_competitor_price) — AI only if switched on."""

    __tablename__ = "plugin_price_update_competitors"

    company_id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default")
    # Short slug, e.g. "startech", "pickaboo" — used as PriceUpdateMatch.competitor.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PriceUpdateMatch(Base):
    """One competitor's matched product page + last-seen price, per catalog product."""

    __tablename__ = "plugin_price_update_matches"
    __table_args__ = (
        UniqueConstraint("company_id", "product_id", "competitor", name="uq_price_update_match"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("catalog_products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    # "startech" | "ryans" | "techland" — extensible to more competitors later.
    competitor: Mapped[str] = mapped_column(String(32), nullable=False)
    matched_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    matched_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Manually pasted/corrected match takes precedence over search-discovered ones —
    # refresh still re-scrapes the price from this URL, it just skips re-searching.
    manual_url: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    regular_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    in_stock: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # The shop's own wording ("In Stock", "Up Coming", "Call For Price", …) for the hover text and
    # the stock dot colour; in_stock alone can't tell "out of stock" from "coming soon".
    stock_label: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # "matched" | "not_found" | "error"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_found")
    status_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # An admin opened this link and confirmed it's the right product. A verified link is never
    # replaced or cleared by search/AI/sync — only by an admin changing it by hand.
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verified_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
