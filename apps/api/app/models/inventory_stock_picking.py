from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.inventory_stock_move import InventoryStockMove
    from app.models.inventory_stock_picking_type import InventoryStockPickingType


class InventoryStockPicking(Base):
    """stock.picking — incoming/outgoing transfer document."""

    __tablename__ = "inventory_stock_pickings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    partner_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    partner_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    picking_type_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_stock_picking_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    location_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    location_dest_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    scheduled_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    date_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    carrier_tracking_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    priority: Mapped[str] = mapped_column(String(1), nullable=False, default="0")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    picking_type: Mapped["InventoryStockPickingType"] = relationship("InventoryStockPickingType")
    move_ids: Mapped[list["InventoryStockMove"]] = relationship(
        "InventoryStockMove",
        back_populates="picking",
        cascade="all, delete-orphan",
        order_by="InventoryStockMove.sequence",
    )


from app.models.inventory_stock_picking_type import InventoryStockPickingType  # noqa: E402,F401
