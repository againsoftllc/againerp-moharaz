from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventorySerial(Base):
    """One physical unit, followed from goods receipt through sale and service.

    Before this table a serial only ever existed as free text on an RMA ticket,
    so nothing could say which unit had been sold to whom — which is exactly what
    a warranty claim needs to know.
    """

    __tablename__ = "inventory_serials"
    __table_args__ = (
        # Serials are only unique within a company; two tenants may legitimately
        # hold the same manufacturer serial.
        UniqueConstraint("company_id", "serial_number", name="uq_inventory_serial_company"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    serial_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="", index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # in_stock | sold | in_service | replaced | scrapped
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_stock", index=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    # Where the unit came from.
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Where the unit went.
    sold_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    order_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Stamped at sale from the product's warranty text; null means it could not
    # be read, never "no warranty".
    warranty_expires_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # The claim currently holding the unit, if any.
    rma_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    # A supplier replacement keeps both serials and the link between them (docs/RMA.md Stage D):
    # the unit that went out says which serial replaced it, and the one that came back says which it replaces.
    replaces_serial: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    replaced_by_serial: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
