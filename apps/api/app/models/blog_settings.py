from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_BLOG_SETTINGS_ID = "default"


class BlogSettings(Base):
    """Singleton blog module configuration."""

    __tablename__ = "blog_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=DEFAULT_BLOG_SETTINGS_ID)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    posts_per_page: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    comments_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    moderate_comments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rss_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rss_items_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    default_author: Mapped[str] = mapped_column(String(120), nullable=False, default="Admin")
    show_related_products: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    seo_index_blog: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    blog_base_slug: Mapped[str] = mapped_column(String(80), nullable=False, default="blog")
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
