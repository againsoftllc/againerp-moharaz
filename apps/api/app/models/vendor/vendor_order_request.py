from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# SPEC.md §21-24 — a vendor-submitted cart becomes an Order Request, not a
# final ERP order. Line prices are snapshotted at submission time (§17) and
# never recalculated, even if catalog prices change later.

ORDER_REQUEST_STATUSES = (
    "draft",
    "submitted",
    "under_review",
    "revision_required",
    "quotation_created",
    "negotiation",
    "approved",
    "rejected",
    "converted_to_order",
    "cancelled",
)


class VendorOrderRequest(Base):
    __tablename__ = "vendor_order_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    order_request_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="submitted", index=True)
    # SPEC.md §30 — set at submission time when outstanding + this order
    # would exceed the vendor's credit limit. Never blocks submission, only
    # flags it for admin approval (see vendor_credit_service.py).
    requires_credit_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    payment_terms: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    requested_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Vendor-visible note (§24) — set by either side, shown in the portal.
    vendor_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Internal note (§24) — ERP staff only, must never reach the portal API.
    internal_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["VendorOrderRequestItem"]] = relationship(
        "VendorOrderRequestItem", back_populates="order_request", cascade="all, delete-orphan"
    )


class VendorOrderRequestItem(Base):
    __tablename__ = "vendor_order_request_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_request_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_order_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Snapshots — identity/price as they were at submission time (§17).
    sku_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)
    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    order_request: Mapped["VendorOrderRequest"] = relationship("VendorOrderRequest", back_populates="items")
