from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_WEBSITE_SETTINGS_ID = "default"


class WebsiteSettings(Base):
    """Singleton website configuration — branding + company contact info."""

    __tablename__ = "website_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=DEFAULT_WEBSITE_SETTINGS_ID)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")

    site_name: Mapped[str] = mapped_column(String(160), nullable=False, default="AgainERP")
    tagline: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    logo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    logo_mobile_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    favicon_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    address: Mapped[str] = mapped_column(Text, nullable=False, default="")
    contact_phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    whatsapp_number: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    copyright_text: Mapped[str] = mapped_column(String(255), nullable=False, default="")

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
