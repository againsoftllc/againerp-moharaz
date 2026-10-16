from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgainDropApiPlugin(Base):
    """AgainDropAPI (Dropshipping) plugin — persisted Elim connection config."""

    __tablename__ = "plugin_again_drop_api"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="ada-default")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    installed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    base_url: Mapped[str] = mapped_column(
        String(500), nullable=False, default="https://openapi.elim.asia"
    )
    api_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_key_hint: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    use_server_key: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    timeout_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=30000)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    default_platform: Mapped[str] = mapped_column(String(20), nullable=False, default="taobao")
    default_lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en")

    connection_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="disconnected"
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
