from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BuilderPlugin(Base):
    """Again Builder plugin settings (single row, id=again-builder-default)."""

    __tablename__ = "plugin_builder"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="again-builder-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # JSON list of enabled profile slugs, e.g. ["pc-builder"] (CCTV/etc. later)
    enabled_builders_json: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default='["pc-builder"]',
    )
    default_profile_slug: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="pc-builder",
    )
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
