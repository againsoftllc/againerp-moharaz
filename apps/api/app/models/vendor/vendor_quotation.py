from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# SPEC.md §25-26 — a "quotation" is a revision chain, not a single row.
# Revising never overwrites: it creates a new VendorQuotation row linked via
# previous_quotation_id, and stamps the old row's superseded_by_id — the old
# row stays exactly as it was for audit (§26 "Never overwrite historical
# quotation versions").

QUOTATION_STATUSES = (
    "draft",
    "sent",
    "viewed",
    "negotiation",
    "accepted",
    "rejected",
    "expired",
    "cancelled",
    "superseded",
)


class VendorQuotation(Base):
    __tablename__ = "vendor_quotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    quotation_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    order_request_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_order_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent", index=True)

    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    previous_quotation_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_quotations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    superseded_by_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_quotations.id", ondelete="SET NULL"), nullable=True
    )

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    payment_terms: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    delivery_terms: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["VendorQuotationItem"]] = relationship(
        "VendorQuotationItem", back_populates="quotation", cascade="all, delete-orphan"
    )


class VendorQuotationItem(Base):
    __tablename__ = "vendor_quotation_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    quotation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sku_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)
    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    quotation: Mapped["VendorQuotation"] = relationship("VendorQuotation", back_populates="items")
