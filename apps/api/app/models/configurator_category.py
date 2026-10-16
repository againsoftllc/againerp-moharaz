from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, engine


class ConfiguratorCategory(Base):
    """Component slot within a configurator profile — CPU, motherboard, etc."""

    __tablename__ = "configurator_categories"
    __table_args__ = (UniqueConstraint("profile_id", "slug", name="uq_configurator_category_profile_slug"),)

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    profile_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("configurator_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Catalog category whose published products fill this builder slot.
    catalog_category_slug: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    selection_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="single")
    product_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    # Phase 4 Stage B: customer-facing tab grouping (see ConfiguratorSlotTab),
    # product/service/toggle display kind, an icon token, and the ordered
    # condition list that replaces the old hardcoded keyword matching —
    # evaluated with the same condition logic as compatibility rules.
    tab_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="product")
    icon: Mapped[str] = mapped_column(String(512), nullable=False, default="settings_input_component")
    conditions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    specs_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # Customer-side pick limits and default list sort (Smart PC Builder slot editor).
    # is_required and selection_mode are kept in step with these on save.
    min_select: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_select: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    default_sort: Mapped[str] = mapped_column(String(16), nullable=False, default="popular")
    # Attribute profile whose products fill this slot (takes precedence over catalog_category_slug).
    attribute_profile_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
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


_column_ready = False


def ensure_configurator_category_catalog_column() -> None:
    """Add catalog_category_slug (and Phase-4 Stage-B slot columns) on
    existing DBs (no Alembic in this repo)."""
    global _column_ready
    if _column_ready:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE configurator_categories "
                "ADD COLUMN IF NOT EXISTS catalog_category_slug VARCHAR(255) NOT NULL DEFAULT ''"
            )
        )
        conn.execute(text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS tab_id VARCHAR(36)"))
        conn.execute(
            text(
                "ALTER TABLE configurator_categories "
                "ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'product'"
            )
        )
        conn.execute(
            text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS icon VARCHAR(16) NOT NULL DEFAULT '🧩'")
        )
        # an uploaded SVG/PNG icon is stored as its URL, so the column must hold more than an emoji
        conn.execute(text("ALTER TABLE configurator_categories ALTER COLUMN icon TYPE VARCHAR(512)"))
        conn.execute(
            text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS conditions_json TEXT NOT NULL DEFAULT '[]'")
        )
        conn.execute(
            text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS specs_json TEXT NOT NULL DEFAULT '[]'")
        )
        conn.execute(text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS min_select INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS max_select INTEGER NOT NULL DEFAULT 1"))
        conn.execute(
            text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS default_sort VARCHAR(16) NOT NULL DEFAULT 'popular'")
        )
        # One-time-ish backfill from the older required/selection_mode fields; saving a slot
        # keeps them consistent, so re-running this never overwrites an admin's choice.
        conn.execute(text("UPDATE configurator_categories SET min_select = 1 WHERE is_required AND min_select = 0"))
        conn.execute(
            text("UPDATE configurator_categories SET max_select = 4 WHERE selection_mode = 'multiple' AND max_select = 1")
        )
        # Slots source their products from an attribute profile (instead of a catalog category),
        # so the same profile can serve several categories. Existing PC Builder slots are pointed
        # at their component profile once, when the column is created, and only if that profile
        # already has products (so no slot ever goes empty because of this switch).
        had_profile_col = (
            conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'configurator_categories' AND column_name = 'attribute_profile_id'"
                )
            ).first()
            is not None
        )
        conn.execute(text("ALTER TABLE configurator_categories ADD COLUMN IF NOT EXISTS attribute_profile_id VARCHAR(36)"))
        if not had_profile_col:
            for slot, profile_code in (
                ("cpu", "processor"),
                ("motherboard", "motherboard"),
                ("memory", "memory"),
                ("storage", "storage"),
                ("graphics-card", "graphics_card"),
                ("power-supply", "power_supply"),
                ("casing", "casing"),
                ("cpu-cooler", "cpu_cooler"),
                ("monitor", "monitor"),
            ):
                conn.execute(
                    text(
                        "UPDATE configurator_categories c SET attribute_profile_id = p.id "
                        "FROM catalog_attribute_profiles p "
                        "WHERE c.slug = :slot AND p.code = :code AND c.attribute_profile_id IS NULL "
                        "AND c.profile_id IN (SELECT id FROM configurator_profiles WHERE slug = 'pc-builder' OR profile_type = 'pc_builder') "
                        "AND EXISTS (SELECT 1 FROM catalog_products cp WHERE cp.attribute_profile_id = p.id)"
                    ),
                    {"slot": slot, "code": profile_code},
                )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_configurator_categories_tab_id ON configurator_categories (tab_id)"))
        for slot, slugs in (
            ("cpu", "component-processor"),
            ("motherboard", "component-motherboard"),
            ("cpu-cooler", "component-cpu-cooler"),
            ("memory", "component-ram"),
            ("storage", "component-ssd-hdd"),
            ("graphics-card", "component-graphics-card"),
            ("power-supply", "component-power-supply"),
            ("casing", "component-casing"),
            ("casing-cooler", "component-cpu-cooler"),
            ("monitor", "monitor"),
            ("keyboard", "accessories-all-accessories"),
            ("mouse", "accessories-all-accessories"),
            ("headphone", "accessories-all-accessories"),
            ("ups", "ups-ips"),
        ):
            conn.execute(
                text(
                    "UPDATE configurator_categories SET catalog_category_slug = :bind "
                    "WHERE slug = :slot AND COALESCE(catalog_category_slug, '') = ''"
                ),
                {"bind": slugs, "slot": slot},
            )
    _column_ready = True
