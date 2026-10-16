from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogCategory(Base):
    """Category tree — Phase 2 foundation (AgainERP catalog_categories subset)."""

    __tablename__ = "catalog_categories"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    path: Mapped[str] = mapped_column(String(500), nullable=False, default="/", index=True)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_in_top_menu: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta_keywords: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # When true, storefront category page shows live price comparison / price list SEO.
    show_price_comparison: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    icon_media_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    banner_media_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # SkyBuy-style: category click → live China search with this keyword (null = local PLP only).
    china_search_keyword: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Split admin Catalog vs Dropshipping (frontstore) category trees — mirrors product channel.
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="catalog", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
