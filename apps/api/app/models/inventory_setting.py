from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventorySetting(Base):
    """One inventory-policy row per company (negative stock etc.)."""

    __tablename__ = "inventory_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Sales policy: warranty counts from the day the unit is sold ("sale") or from
    # the day it came into stock ("stock_in", supplier-style warranties).
    warranty_start_basis: Mapped[str] = mapped_column(String(20), nullable=False, default="sale")
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
