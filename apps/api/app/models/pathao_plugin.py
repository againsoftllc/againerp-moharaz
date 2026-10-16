from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PathaoPlugin(Base):
    """Pathao Courier Merchant API credentials (single row, id=pathao-default)."""

    __tablename__ = "plugin_pathao"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="pathao-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    client_id: Mapped[str] = mapped_column(Text, nullable=False, default="")
    client_secret: Mapped[str] = mapped_column(Text, nullable=False, default="")
    username: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    password: Mapped[str] = mapped_column(Text, nullable=False, default="")
    store_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pickup_phone: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    default_service: Mapped[str] = mapped_column(String(20), nullable=False, default="regular")
    item_type: Mapped[str] = mapped_column(String(20), nullable=False, default="parcel")
    auto_create_shipment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sync_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cod_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    webhook_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
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
