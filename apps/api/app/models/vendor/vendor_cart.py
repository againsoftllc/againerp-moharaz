from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# SPEC.md §18 — one running cart per vendor. Price/discount/tax are never
# stored on the cart line: they're resolved live via
# vendor_pricing_service.resolve_vendor_price every time the cart is read,
# so the cart always reflects current pricing. A price is only frozen once
# the cart becomes an order request (§17 price protection).


class VendorCart(Base):
    __tablename__ = "vendor_carts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["VendorCartItem"]] = relationship(
        "VendorCartItem", back_populates="cart", cascade="all, delete-orphan"
    )


class VendorCartItem(Base):
    __tablename__ = "vendor_cart_items"
    __table_args__ = (UniqueConstraint("cart_id", "item_id", name="uq_vendor_cart_item"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cart_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_carts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    cart: Mapped["VendorCart"] = relationship("VendorCart", back_populates="items")
