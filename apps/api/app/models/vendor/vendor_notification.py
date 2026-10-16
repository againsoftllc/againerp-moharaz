from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §35 — in-app channel only for Phase 1 ("Basic Notifications" in
# the MVP scope, §56). Email/SMS/WhatsApp/push are Phase 3 (§58) additions
# on top of the same event list, not a different table.

VENDOR_NOTIFICATION_EVENTS = (
    "order_submitted",
    "order_approved",
    "order_rejected",
    "revision_requested",
    "quotation_created",
    "quotation_accepted",
    "quotation_rejected",
    "invoice_created",
    "credit_warning",
)


class VendorNotification(Base):
    __tablename__ = "vendor_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    vendor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Null = visible to every portal user of this vendor; set = targeted.
    vendor_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
