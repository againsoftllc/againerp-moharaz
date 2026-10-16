from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogFilter(Base):
    """Storefront facet filter configuration."""

    __tablename__ = "catalog_filters"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    param_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    display_type: Mapped[str] = mapped_column(String(32), nullable=False, default="multi_select")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="attribute")
    attribute_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    attribute_name: Mapped[str] = mapped_column(String(255), nullable=False, default="—")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    storefront_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    category_scope: Mapped[str] = mapped_column(String(255), nullable=False, default="All categories")
    value_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    url_example: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
