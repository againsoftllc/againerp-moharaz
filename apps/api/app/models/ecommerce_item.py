from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EcommerceItem(Base):
    """Ecommerce module extension — website product, content, SEO, pricing (identity on items)."""

    __tablename__ = "ecommerce_items"
    __table_args__ = (
        UniqueConstraint("item_id", name="uq_ecommerce_items_item_id"),
        UniqueConstraint("company_id", "slug", name="uq_ecommerce_items_company_slug"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    catalog_product_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    publish_status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specifications_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_category_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    brand_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_brands.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    seo_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seo_keywords_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    schema_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    selling_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    compare_at_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    special_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    featured_media_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("media.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
