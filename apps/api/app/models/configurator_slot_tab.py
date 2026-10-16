from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfiguratorSlotTab(Base):
    """Groups a builder profile's slots into customer-facing tabs (e.g. PC
    Builder's Components / Extras / Peripherals) — the artifact's own
    grouping above its slot table. A profile with no rows here has all its
    categories under one implicit tab (see ensure_builder_slots_for_profile,
    which creates a default "Components" tab on first sync)."""

    __tablename__ = "configurator_slot_tabs"
    __table_args__ = (UniqueConstraint("profile_id", "slug", name="uq_configurator_slot_tab_profile_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
