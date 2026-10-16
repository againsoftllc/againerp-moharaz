from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StripePlugin(Base):
    """Stripe API keys (single row, id=stripe-default)."""

    __tablename__ = "plugin_stripe"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="stripe-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    publishable_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    secret_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    bdt_per_usd: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("110"))
    checkout_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    connection_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    connection_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class StripePayment(Base):
    """One Stripe Checkout Session attempt for a commerce order."""

    __tablename__ = "stripe_payments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    session_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    payment_intent_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    amount_bdt: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_charged: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    # created → success | failed | cancelled | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created", index=True)
    checkout_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    customer_email: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    raw_result_json: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
