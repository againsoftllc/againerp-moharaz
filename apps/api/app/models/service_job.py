"""Service job card — operational work order. Billing is FinanceReceivable.

Independent walk-in jobs have no rma_id. Warranty/paid repair jobs created from
an RMA keep a bidirectional link. Labour lines do not move stock; part lines do
via StockMovementService.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
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


class ServiceJob(Base):
    __tablename__ = "service_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    job_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="received", index=True)
    service_type: Mapped[str] = mapped_column(String(20), nullable=False, default="direct", index=True)

    rma_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    customer_phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    imei: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    issue: Mapped[str] = mapped_column(Text, nullable=False, default="")
    condition_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warranty_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="normal")

    technician_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    technician_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    expected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivered_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    received_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    diagnosis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    diagnosis_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    found_problems: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estimated_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    estimated_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0)

    approval_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_required")
    approval_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    qc_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_required")
    qc_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qc_checked_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    qc_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    labour_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    parts_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    bill_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_billed")
    receivable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list["ServiceJobLine"]] = relationship(
        "ServiceJobLine", back_populates="job", cascade="all, delete-orphan", order_by="ServiceJobLine.sort_order"
    )


class ServiceJobLine(Base):
    """A labour/service charge, an inventory part, or a one-off custom service."""

    __tablename__ = "service_job_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("service_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="service")
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="job")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    stock_moved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    job: Mapped[ServiceJob] = relationship("ServiceJob", back_populates="lines")


class ServiceJobHistory(Base):
    __tablename__ = "service_job_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("service_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
