from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogAttribute(Base):
    """Attribute field definition within a group."""

    __tablename__ = "catalog_attributes"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    group_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_attribute_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_filterable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_comparable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_searchable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # How this filter renders on the storefront when is_filterable.
    filter_display_type: Mapped[str] = mapped_column(String(30), nullable=False, default="multi_select")
    storefront_filter_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    predefined_values: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
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
