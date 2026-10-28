from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinanceSettlement(Base):
    """OnerERP Party Transaction Settlement / Payment Settlement: moves money that already settled one of a party's invoices
    (or bills) onto another of the same party's. Sub-ledger only: the AR / AP control total does not change, so no journal."""

    __tablename__ = "finance_settlements"
    __table_args__ = (UniqueConstraint("company_id", "settlement_number", name="uq_finance_settlement_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    settlement_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    party_type: Mapped[str] = mapped_column(String(12), nullable=False)  # customer | supplier
    party_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class FinanceAllocation(Base):
    """Which money settled which invoice / bill (bill-wise settlement). Positive = settled, negative = released.

    Written when a payment, a per-invoice settle or a settlement puts money on a document. It is the record behind
    "Settled by"; documents settled before it existed are explained from their cheques and order payments instead.
    """

    __tablename__ = "finance_allocations"
    __table_args__ = (Index("ix_finance_allocations_doc", "doc_type", "doc_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    party_type: Mapped[str] = mapped_column(String(12), nullable=False)
    party_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(12), nullable=False)  # receivable | payable
    doc_id: Mapped[str] = mapped_column(String(36), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    source: Mapped[str] = mapped_column(String(12), nullable=False)  # payment | settlement
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    settlement_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
