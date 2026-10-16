"""SMS gateway soft plugins — one row per provider (BulkSMS BD, SSL Wireless, Zaman IT, Alpha SMS)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# plugin id → provider slug used by clients / registry
SMS_PROVIDER_IDS: dict[str, str] = {
    "bulksms-bd": "bulksms_bd",
    "ssl-wireless": "ssl_wireless",
    "zaman-it": "zaman_it",
    "alpha-sms": "alpha_sms",
}

SMS_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "bulksms_bd": {
        "label": "BulkSMS BD",
        "base_url": "https://bulksmsbd.net/api/smsapi",
    },
    "ssl_wireless": {
        "label": "SSL Wireless",
        "base_url": "https://smsplus.sslwireless.com/api/v3/send-sms",
    },
    "zaman_it": {
        "label": "Zaman IT",
        "base_url": "https://api.zaman-it.com/sms/send",
    },
    "alpha_sms": {
        "label": "Alpha SMS",
        "base_url": "https://api.sms.net.bd/sendsms",
    },
}


class SmsGatewayPlugin(Base):
    """Installed SMS provider credentials (id = bulksms-bd | ssl-wireless | zaman-it | alpha-sms)."""

    __tablename__ = "plugin_sms_gateway"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    api_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_secret: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sender_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    base_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    connection_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    connection_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
