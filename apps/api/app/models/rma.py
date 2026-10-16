from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RmaTicket(Base):
    """One returned unit being handled under (or outside) warranty.

    Customer, order and product details are denormalised the way commerce_orders
    does it, so a ticket still reads correctly after the source record changes.
    """

    __tablename__ = "rma_tickets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    rma_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)

    # Who brought it in. customer_id is optional — walk-ins are allowed.
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    customer_phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # Where it was sold. Absent for walk-ins with no traceable order.
    order_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    order_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    order_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    purchased_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # What came back.
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="", index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    received_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    accessories: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    condition_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    fault_reported: Mapped[str] = mapped_column(Text, nullable=False, default="")
    fault_diagnosed: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Warranty verdict. `source` records how it was decided so a manual call is
    # never mistaken for a computed one.
    warranty_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown", index=True
    )
    warranty_source: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    warranty_expires_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    warranty_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    resolution_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="received", index=True)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="normal")
    assigned_to: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    parts_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    labour_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    is_billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    bill_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_billed")
    receivable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Authorization / resolution fields — additive, existing tickets stay valid.
    rma_type: Mapped[str] = mapped_column(String(20), nullable=False, default="customer", index=True)
    reason_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    claim_group_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    order_source: Mapped[str] = mapped_column(String(20), nullable=False, default="commerce")
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    location_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    expected_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    courier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tracking_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    physical_condition: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    functional_result: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    qc_result: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    inspected_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    inspected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    inspection_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    service_job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    refund_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    replacement_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    replacement_sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    replacement_warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    charges: Mapped[List["RmaCharge"]] = relationship(
        "RmaCharge", back_populates="ticket", cascade="all, delete-orphan"
    )
    supplier_job: Mapped[Optional["RmaSupplierJob"]] = relationship(
        "RmaSupplierJob", back_populates="ticket", uselist=False, cascade="all, delete-orphan"
    )


class RmaCharge(Base):
    """A part, labour entry, or other cost on a ticket."""

    __tablename__ = "rma_charges"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="part")
    # Optional link to a stocked part so cost can be traced to inventory later.
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    ticket: Mapped["RmaTicket"] = relationship("RmaTicket", back_populates="charges")


class RmaSupplierJob(Base):
    """The leg where the unit goes out to a supplier for repair or replacement.

    Deliberately not a purchase order — nothing is being bought.
    """

    __tablename__ = "rma_supplier_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    supplier_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    dispatched_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    supplier_reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    expected_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    returned_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    ticket: Mapped["RmaTicket"] = relationship("RmaTicket", back_populates="supplier_job")


class RmaReason(Base):
    """Configurable return / warranty reason."""

    __tablename__ = "rma_reasons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="customer", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class RmaStatusHistory(Base):
    """Every stage the ticket passed through, so the trail survives edits."""

    __tablename__ = "rma_status_history"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )
