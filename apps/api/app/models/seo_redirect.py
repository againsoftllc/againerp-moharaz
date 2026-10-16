from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SeoRedirect(Base):
    __tablename__ = "seo_redirects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    from_path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    to_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    redirect_type: Mapped[str] = mapped_column(String(10), nullable=False, default="301", index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    hits_30d: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
