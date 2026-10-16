from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Vendor-portal catalog visibility — orthogonal to pricing (vendor_pricing.py).
# A row scopes to either a vendor group OR a single vendor, never both — the
# vendor-scoped row wins when both exist for the same item, mirroring the
# override-then-group priority vendor_pricing_service.py already uses.
# No row for an item means visible-by-default: this is an opt-out model, not
# an allow-list, so newly published products show up everywhere until
# someone explicitly hides them.


class VendorCatalogVisibility(Base):
    __tablename__ = "vendor_catalog_visibility"
    __table_args__ = (
        UniqueConstraint("item_id", "vendor_group_id", name="uq_catalog_visibility_group"),
        UniqueConstraint("item_id", "vendor_id", name="uq_catalog_visibility_vendor"),
        CheckConstraint(
            "(vendor_group_id IS NULL) != (vendor_id IS NULL)",
            name="ck_catalog_visibility_single_scope",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_group_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_groups.id", ondelete="CASCADE"), nullable=True, index=True
    )
    vendor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
