from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogAttributeProfileCategory(Base):
    """Which storefront categories an attribute profile's filters apply to.

    No rows for a profile = unscoped: its filterable attributes show on every
    category (the old, implicit behavior). Only once an admin picks specific
    categories here does that profile's attributes get restricted to just
    those — this is what keeps a Processor-only attribute like "Socket Type"
    off a broad parent category (e.g. "Component") that also contains Casing
    products, while still showing it on the "Processor" category itself.
    """

    __tablename__ = "catalog_attribute_profile_categories"
    __table_args__ = (
        UniqueConstraint("profile_id", "category_id", name="uq_attribute_profile_category"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    profile_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_attribute_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
