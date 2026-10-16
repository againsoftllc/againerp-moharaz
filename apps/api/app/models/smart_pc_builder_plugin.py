from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SmartPcBuilderPlugin(Base):
    """Smart PC Builder plugin install/enable state (single row).

    A separate plugin from Again Builder — Again Builder's enabled_builders
    only ever gated the legacy static /pc-builder page; this one gates the
    real compatibility-engine-backed /smart-pc-builder storefront page and
    is the install/enable switch surfaced under Workspace -> Plugins as its
    own card, with its own dedicated config workspace (Overview, Tabs &
    Slots, Rules, Lookup & Alias, Overrides, Test Build, Ready Builds,
    Storefront, Language)."""

    __tablename__ = "plugin_smart_pc_builder"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="smart-pc-builder-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
