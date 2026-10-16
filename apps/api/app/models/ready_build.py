from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReadyBuild(Base):
    """An admin-curated prebuilt PC — the artifact's "Ready Builds" concept.
    Its parts live in ReadyBuildSlot/ReadyBuildSlotItem; this row only carries
    the build's own identity, merchandising fields, and discount/timer."""

    __tablename__ = "configurator_ready_builds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    profile_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft | published
    images_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    fps_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    discount_type: Mapped[str] = mapped_column(String(10), nullable=False, default="none")  # none | pct | fixed
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    starts_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ends_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    show_timer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # If false, swapping any non-locked slot away from its default drops the
    # whole-build discount — matches the artifact's "discOnChange" toggle.
    discount_on_change: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )


class ReadyBuildSlot(Base):
    """One category slot within a Ready Build, with its mode:
    locked = exactly one item, fixed; list = several admin-picked
    alternatives, customer chooses; any = any rule-compatible catalog product
    for that category; hidden = this build doesn't include the slot at all."""

    __tablename__ = "configurator_ready_build_slots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ready_build_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_ready_builds.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_categories.id", ondelete="CASCADE"), nullable=False,
    )
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="hidden")  # locked|list|any|hidden
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ReadyBuildSlotItem(Base):
    """One selectable product within a locked/list-mode ReadyBuildSlot."""

    __tablename__ = "configurator_ready_build_slot_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ready_build_slot_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("configurator_ready_build_slots.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # Null = use the product's own catalog price; set = this build prices the
    # part differently (its own discount, bundled cost, etc).
    build_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
