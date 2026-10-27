from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CompanyModuleSetting(Base):
    """One settings document per company and module (Finance, RMA, Media…), so a module's
    settings page applies to every user of the company instead of one browser."""

    __tablename__ = "company_module_settings"
    __table_args__ = (UniqueConstraint("company_id", "module_id", name="uq_company_module_setting"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    module_id: Mapped[str] = mapped_column(String(40), nullable=False)
    values_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now(),
    )
