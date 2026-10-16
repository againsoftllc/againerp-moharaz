from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorFieldSource(Base):
    """Which catalog attribute feeds one of the builder's built-in fields.

    The builder's engine has a few fields with built-in meaning (the chipset a motherboard is
    looked up by, a CPU's socket and generation, RAM type, wattage …). By default each reads the
    attribute with the same code. A row here points a field at any attribute of any attribute
    profile instead, so a shop that named its attributes differently never has to rename them.
    No row = the default code."""

    __tablename__ = "configurator_field_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    field_key: Mapped[str] = mapped_column(String(60), nullable=False, unique=True, index=True)
    attribute_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("catalog_attributes.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
