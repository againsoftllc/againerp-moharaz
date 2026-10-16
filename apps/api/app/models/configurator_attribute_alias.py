from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorAttributeAlias(Base):
    """Admin-editable raw-value → normalized-value map for the PC Builder rule
    engine — e.g. a motherboard whose Socket spec reads "Socket AM4" or "AM 4"
    normalizes to "AM4" so it matches a CPU's socket value without an admin
    having to fix the catalog spec text itself."""

    __tablename__ = "configurator_attribute_aliases"
    __table_args__ = (
        UniqueConstraint("field_code", "raw_pattern", name="uq_attribute_alias_field_raw"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    field_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    raw_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_value: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
