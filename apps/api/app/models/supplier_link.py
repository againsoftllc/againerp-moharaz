from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from decimal import Decimal
from typing import Optional

from app.database import Base


class SupplierLink(Base):
    """Supplier module extension — item-level supplier preferences (1:N per item)."""

    __tablename__ = "supplier_links"
    __table_args__ = (
        UniqueConstraint("item_id", "supplier_id", name="uq_supplier_links_item_supplier"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("commerce_suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_product_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("supplier_products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conversion_factor: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
