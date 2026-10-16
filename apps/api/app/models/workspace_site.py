from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_SITE_ID = "co1"


class WorkspaceSite(Base):
    """Workspace storefront site — brand + domain + deploy URLs."""

    __tablename__ = "workspace_sites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    plan: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    owner: Mapped[str] = mapped_column(String(160), nullable=False, default="")

    primary_domain: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    domain_aliases: Mapped[str] = mapped_column(Text, nullable=False, default="")  # comma-separated

    storefront_url_local: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    storefront_url_preview: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    storefront_url_production: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    git_repo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    git_default_branch: Mapped[str] = mapped_column(String(120), nullable=False, default="main")
    vercel_project_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    vercel_project_name: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    vercel_team_slug: Mapped[str] = mapped_column(String(120), nullable=False, default="")

    tagline: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    logo_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    logo_mobile_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    favicon_url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    address: Mapped[str] = mapped_column(Text, nullable=False, default="")
    contact_phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    whatsapp_number: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    copyright_text: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    business_hours: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    meta_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    meta_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    meta_keywords: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # OpenCart-style store options (local, catalog, mail, ftp, server, …)
    options_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # Againcart live-edit HomepageContent JSON (opaque; storefront CMS source of truth)
    storefront_cms_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    currency: Mapped[str] = mapped_column(String(12), nullable=False, default="BDT")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Dhaka")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
