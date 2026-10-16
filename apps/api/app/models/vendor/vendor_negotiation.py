from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §27 — negotiation is optional and configurable: gated by the
# vendor's group.negotiation_enabled flag (checked at the API layer, not
# here), same enforcement point as every other group policy.

NEGOTIATION_REQUEST_TYPES = ("price", "quantity", "delivery_date", "payment_terms", "other")
NEGOTIATION_STATUSES = ("pending", "resolved", "declined")


class VendorNegotiation(Base):
    __tablename__ = "vendor_negotiations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    quotation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendor_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_type: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    requested_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    requested_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    requested_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    requested_payment_terms: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    admin_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resulting_quotation_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_quotations.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
