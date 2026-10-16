from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §13-16 — vendor pricing engine.
#
# Resolution priority (highest wins), per §13:
#   1. VendorProductPrice   — vendor-specific override for one item
#   2. Vendor's own price list (vendors.price_list_id)
#   3. Vendor group's price list (vendor_groups.price_list_id)
#   4. CatalogProduct.price — the existing product/channel default
#
# All tiers support quantity breaks via (min_qty, max_qty) on the same item.
# See app.services.vendor.vendor_pricing_service for the resolver.


class VendorPriceList(Base):
    """Named price list (Retail / Dealer / Gold Dealer / Distributor, ...)."""

    __tablename__ = "vendor_price_lists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class VendorPriceListItem(Base):
    """One (item, quantity tier) price row inside a price list — SPEC §14-15."""

    __tablename__ = "vendor_price_list_items"
    __table_args__ = (
        UniqueConstraint("price_list_id", "item_id", "min_qty", name="uq_price_list_item_tier"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    price_list_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_price_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class VendorProductPrice(Base):
    """Vendor-specific price override for one item — top of the priority stack.

    Matches the `vendor_product_prices` entity named in SPEC §49.
    """

    __tablename__ = "vendor_product_prices"
    __table_args__ = (
        UniqueConstraint("vendor_id", "item_id", "min_qty", name="uq_vendor_product_price_tier"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_qty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
