from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def dump_json(value: Any) -> str:
    return json.dumps(value if value is not None else {})


def load_json(value: Optional[str], default: Any = None) -> Any:
    if not value:
        return default if default is not None else {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default if default is not None else {}


class WebsitePage(Base):
    """CMS page container — SEO, publishing, permissions (builder layout later)."""

    __tablename__ = "website_pages"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False, default="/")
    page_type: Mapped[str] = mapped_column(String(32), nullable=False, default="website", index=True)
    layout: Mapped[str] = mapped_column(String(32), nullable=False, default="default")
    template: Mapped[str] = mapped_column(String(120), nullable=False, default="Default")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="public")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    seo_status: Mapped[str] = mapped_column(String(32), nullable=False, default="missing")
    creator: Mapped[str] = mapped_column(String(120), nullable=False, default="Admin")
    updated_by: Mapped[str] = mapped_column(String(120), nullable=False, default="Admin")
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    seo_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    advanced_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    access_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    stats_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    flags_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    versions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    permissions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    body_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
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
