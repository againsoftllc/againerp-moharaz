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
    UniqueConstraint,
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

    # ── Complaint intake & approval (docs/RMA.md Stage A–B) ──
    # Plain-language stock state: in_rma_store | with_supplier | replacement_received | delivered | null (not stocked yet)
    custody_state: Mapped[Optional[str]] = mapped_column(String(24), nullable=True, index=True)
    # Whether the unit is physically here (false while a remote request is `awaiting_return`).
    unit_received: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    complaint_decision: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    complaint_decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    complaint_decided_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    complaint_decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    complaint_decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    promised_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    charge_estimate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    diagnosis_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diagnosis_report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Supplier / purchase traceability, resolved from the serial; `manual` needs an override reason.
    supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    purchase_receipt_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    purchase_receipt_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    purchase_bill_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    purchase_bill_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vendor_invoice_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    supplier_source: Mapped[str] = mapped_column(String(10), nullable=False, default="none")  # traced | manual | none
    supplier_override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prior_rma_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # The serial actually held now, when a supplier sent back a different unit. `serial_number` is never overwritten.
    received_serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    receipt_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    receipt_print_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    receipt_last_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    charges: Mapped[List["RmaCharge"]] = relationship(
        "RmaCharge", back_populates="ticket", cascade="all, delete-orphan"
    )
    supplier_job: Mapped[Optional["RmaSupplierJob"]] = relationship(
        "RmaSupplierJob", back_populates="ticket", uselist=False, cascade="all, delete-orphan"
    )

    # Work-queue read-outs (docs/RMA.md Phase 5); derived, never stored.
    @property
    def days_open(self) -> int:
        from app.services.rma import queue_service

        return queue_service.days_open(self)

    @property
    def overdue_days(self) -> int:
        from app.services.rma import queue_service

        return queue_service.days_overdue(self)

    @property
    def is_repeat(self) -> bool:
        return (self.prior_rma_count or 0) > 0


class RmaStockEvent(Base):
    """One finalized stock posting of an RMA (intake, dispatch, receipt, delivery …).

    The unique (rma_id, event_key) is the idempotency guard: an event can be posted once, so approving the same
    document twice can never stock twice. `movement_id` points at the inventory ledger row it created.
    """

    __tablename__ = "rma_stock_events"
    __table_args__ = (UniqueConstraint("rma_id", "event_key", name="uq_rma_stock_events_rma_event"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_key: Mapped[str] = mapped_column(String(40), nullable=False)
    movement_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    movement_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # For a move between two places (dispatch, receipt ...): where the unit went; `warehouse_id` is where it left from.
    dest_warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    custody_state: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    reversed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class RmaSupplierClaim(Base):
    """A replacement / repair claim lodged with a supplier for one RMA unit (docs/RMA.md Stage C).

    Supplier, serial and purchase-invoice details are copied from the ticket when the claim is created and shown
    read-only; the claim text, accessories and dispatch details are the editable part. Approving the claim and
    dispatching the unit are separate steps: dispatch is what moves the unit out of the RMA store.
    """

    __tablename__ = "rma_supplier_claims"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    claim_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)

    supplier_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    supplier_reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    purchase_receipt_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    purchase_bill_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vendor_invoice_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    sku: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    serial_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    problem: Mapped[str] = mapped_column(Text, nullable=False, default="")
    diagnosis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    accessories_sent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    dispatch_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    courier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tracking_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expected_return_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    decision: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    dispatched_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    dispatched_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    transit_warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    print_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RmaSupplierReceipt(Base):
    """What came back from the supplier for a dispatched claim (docs/RMA.md Stage D).

    Approving it is the only thing that stocks the unit back into the RMA store; a draft, a pending or a rejected
    receipt posts nothing. The actual received serial defaults to the serial that was sent; a different one needs the
    serial-change permission, must not exist yet, and is linked to the original rather than replacing it.
    """

    __tablename__ = "rma_supplier_receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    claim_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_supplier_claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receipt_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)

    supplier_id: Mapped[str] = mapped_column(String(36), nullable=False)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sent_serial: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    received_serial: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String(24), nullable=False, default="replacement")
    outcome_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supplier_delivery_ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    received_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    condition_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    accessories_received: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    decision: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    print_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RmaDelivery(Base):
    """A hand-over to the customer and/or a payment for an RMA (docs/RMA.md Stage E).

    Two separate concepts, so a payment can never hand the product over by accident:
    - physical action: `deliver_product` (the unit leaves the RMA store and the RMA is completed) or not;
    - payment state: `none` (no charge), `received` (money taken now) or `due` (the amount stays owed).
    The five familiar cases are presets of these two. Approving is the only step that posts: stock out, the payment and the
    receivable, each exactly once; a draft, pending or rejected delivery posts nothing.
    """

    __tablename__ = "rma_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delivery_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)
    preset: Mapped[str] = mapped_column(String(32), nullable=False, default="custom")

    deliver_product: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payment_state: Mapped[str] = mapped_column(String(10), nullable=False, default="none")  # none | received | due
    amount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_received: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    payment_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivered_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    serial_delivered: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    decision: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # what approval posted (the links to the existing finance records and the stock ledger)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stock_posted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    payment_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    receivable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    receivable_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    print_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RmaSettlement(Base):
    """One money-in / money-out entry against an RMA (the "RMA Settlement" section).

    Separate from the product delivery on purpose: a settlement never moves stock or the RMA status, and a delivery never
    posts money. Several settlements can sit against one RMA and each keeps its own history. Nothing reaches the books until
    it is approved; approval posts through the existing finance services (the RMA receivable for the RMA's own charges,
    one guarded party payment for everything else) and records the links here (payment, journal entry, invoice).
    """

    __tablename__ = "rma_settlements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    rma_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rma_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    settlement_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)

    party_type: Mapped[str] = mapped_column(String(12), nullable=False, default="customer")  # customer|dealer|supplier|other
    party_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)  # parties.id
    party_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    direction: Mapped[str] = mapped_column(String(4), nullable=False, default="in")  # in | out
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False, default="parts_service")
    purpose_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    payment_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # the account's kind, kept as a snapshot
    transaction_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    decided_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # what approval posted: the links to the existing finance records
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    counter_account_code: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    payment_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    journal_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    receivable_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    receivable_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # A reversal is a new settlement that mirrors an approved one (opposite direction, same party / amount / account).
    # `reverses_id` is set on the reversal, `reversed_by_id` on the original once the reversal is approved.
    reverses_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    reversed_by_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
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
