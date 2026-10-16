from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

EDIT_REQUEST_ACTIVE_STATUSES = frozenset({"pending", "approved"})


class SalesOrderEditRequest(Base):
    """Staff request to change a sales order that has left "draft".

    An approved request is consumed by the requester's next save, so each
    approval covers exactly one edit.
    """

    __tablename__ = "sales_order_edit_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    sales_order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sales_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # pending -> approved -> consumed, or pending -> rejected
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_by: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    requested_by_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reviewed_by_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
