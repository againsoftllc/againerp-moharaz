from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CommerceOrderEvent(Base):
    __tablename__ = "commerce_order_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("commerce_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    from_payment_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_payment_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    from_shipment_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_shipment_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actor: Mapped[str] = mapped_column(String(100), nullable=False, default="system")
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        index=True,
    )
