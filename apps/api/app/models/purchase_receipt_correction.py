"""Audit trail for admin corrections to an already-posted Goods Receipt line.

A posted receipt is otherwise immutable (see PurchaseOrderService.cancel_receipt);
this is the one sanctioned, audited exception — an admin fixing a data-entry
mistake in the received quantity, with a permanent record of what changed."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PurchaseReceiptLineCorrection(Base):
    __tablename__ = "purchase_receipt_line_corrections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    purchase_receipt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("purchase_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purchase_receipt_line_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("purchase_receipt_lines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    old_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    new_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    corrected_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), index=True)
