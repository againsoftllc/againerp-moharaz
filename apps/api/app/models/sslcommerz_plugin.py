from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SslcommerzPlugin(Base):
    """SSLCommerz store credentials (single row, id=sslcommerz-default)."""

    __tablename__ = "plugin_sslcommerz"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="sslcommerz-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    store_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    store_password: Mapped[str] = mapped_column(Text, nullable=False, default="")
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


class SslcommerzPayment(Base):
    """One SSLCommerz hosted-checkout attempt for a commerce order."""

    __tablename__ = "sslcommerz_payments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    tran_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    session_key: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    # created → success | failed | cancelled | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created", index=True)
    bank_tran_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    val_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    gateway_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
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
