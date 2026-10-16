from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorCategoryProductOverride(Base):
    """Forces one product into a slot it wouldn't otherwise match, or drops
    one out that would — the artifact's per-slot "Include"/"Exclude" list.
    Layered on top of the existing category+keyword matching in
    list_slot_products(); a category with no rows here behaves exactly as
    before."""

    __tablename__ = "configurator_category_product_overrides"
    __table_args__ = (
        UniqueConstraint("category_id", "product_id", name="uq_category_product_override"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_categories.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # include | exclude
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
