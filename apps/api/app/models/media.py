from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Media(Base):
    """Core media library record — Phase 2 foundation."""

    __tablename__ = "media"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    folder: Mapped[str] = mapped_column(String(100), nullable=False, default="Uploads")
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False, default="image")
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False, default="image/jpeg")
    size_kb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    alt: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    local_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    imported_by: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="direct")
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    title_linked_to_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    alt_linked_to_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
