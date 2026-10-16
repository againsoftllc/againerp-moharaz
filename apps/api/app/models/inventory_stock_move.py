from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.inventory_stock_picking import InventoryStockPicking


class InventoryStockMove(Base):
    """stock.move — product line on a stock.picking."""

    __tablename__ = "inventory_stock_moves"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    picking_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_pickings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    product_uom_qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    show_details: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    picking: Mapped["InventoryStockPicking"] = relationship("InventoryStockPicking", back_populates="move_ids")


# Register relationship targets so configure_mappers never sees a half-loaded graph.
from app.models.inventory_stock_picking_type import InventoryStockPickingType  # noqa: E402,F401
from app.models.inventory_stock_picking import InventoryStockPicking  # noqa: E402,F401
