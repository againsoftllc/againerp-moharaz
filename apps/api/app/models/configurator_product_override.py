from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorProductOverride(Base):
    """A manually-set attribute value for one product, for the PC Builder rule
    engine only — the catalog spec itself is untouched. Wins over both the
    stored catalog attribute and any alias/inference, for the one product it
    names, so a bad or missing spec can be corrected without editing the
    product page."""

    __tablename__ = "configurator_product_overrides"
    __table_args__ = (
        UniqueConstraint("product_id", "field_code", name="uq_product_override_product_field"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    product_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("catalog_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_code: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
