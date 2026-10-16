from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PaypalPlugin(Base):
    """PayPal REST app credentials (single row, id=paypal-default)."""

    __tablename__ = "plugin_paypal"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="paypal-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    client_id: Mapped[str] = mapped_column(Text, nullable=False, default="")
    client_secret: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # PayPal charge currency (BDT is not supported on standard Checkout — convert via bdt_per_usd)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    bdt_per_usd: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("110"))
    checkout_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    connection_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    connection_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # Cached OAuth access token
    access_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
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


class PaypalPayment(Base):
    """One PayPal Checkout order attempt for a commerce order."""

    __tablename__ = "paypal_payments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    paypal_order_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    amount_bdt: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_charged: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    # created → success | failed | cancelled | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created", index=True)
    capture_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    payer_email: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    approve_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
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
