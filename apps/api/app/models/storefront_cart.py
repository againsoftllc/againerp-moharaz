from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StorefrontCart(Base):
    __tablename__ = "storefront_carts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cart_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("auth_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    coupon_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    coupon_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    # Smart PC Builder Ready Build lump-sum discount, kept apart from the coupon
    # so a real coupon can still be applied on top.
    ready_build_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    ready_build_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    shipping_estimate: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    items: Mapped[list["StorefrontCartItem"]] = relationship(
        "StorefrontCartItem",
        back_populates="cart",
        cascade="all, delete-orphan",
    )


class StorefrontCartItem(Base):
    __tablename__ = "storefront_cart_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cart_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("storefront_carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    variant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    attributes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    sku_snapshot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    compare_at_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    cart: Mapped["StorefrontCart"] = relationship("StorefrontCart", back_populates="items")
