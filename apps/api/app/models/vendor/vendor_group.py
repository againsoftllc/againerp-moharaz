from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §12 — configurable per group/vendor/product/category later; the
# group-level default lives here.
STOCK_VISIBILITY_MODES = ("exact", "availability", "threshold", "hidden")


class VendorGroup(Base):
    """Vendor segment (Gold Dealer, Distributor, VIP, ...) — SPEC.md §6.

    Controls defaults a vendor inherits: discount, credit policy, stock
    visibility, order limits. A dedicated vendor_price_lists table (Step 07)
    will attach here once pricing is built; kept out for now so this table
    isn't FK'd to something that doesn't exist yet.
    """

    __tablename__ = "vendor_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_list_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_price_lists.id", ondelete="SET NULL"), nullable=True, index=True
    )

    default_discount_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=0)
    default_credit_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    default_payment_terms: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    min_order_quantity: Mapped[Optional[int]] = mapped_column(nullable=True)
    order_limit: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    requires_order_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    stock_visibility_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="availability")
    negotiation_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
