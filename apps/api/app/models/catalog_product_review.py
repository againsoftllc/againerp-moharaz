from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogProductReview(Base):
    __tablename__ = "catalog_product_reviews"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    review_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    product_brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    product_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    product_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    review_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    helpful_votes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moderated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
