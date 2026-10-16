from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CloudflarePlugin(Base):
    __tablename__ = "plugin_cloudflare"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="cf-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    account_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    account_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    api_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_token_hint: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    media_storage: Mapped[str] = mapped_column(String(20), nullable=False, default="local")
    r2_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    r2_bucket: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    r2_access_key_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    r2_secret_access_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    r2_public_base_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    images_status: Mapped[str] = mapped_column(String(20), nullable=False, default="disconnected")
    images_account_hash: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    images_api_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    images_api_token_hint: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    auth_method: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    oauth_refresh_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    account_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
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
