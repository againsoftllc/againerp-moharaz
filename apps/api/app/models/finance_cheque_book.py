from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

BOOK_STATES = ("draft", "active", "closed")
LEAF_STATUSES = ("unused", "issued", "void")


class FinanceChequeBook(Base):
    """A cheque book the company holds for one bank account: the printed leaf numbers run from ``number_from`` to ``number_to``
    after the bank's ``cheque_prefix`` (prefix 4545, 40..50 -> 454540 ... 454550). Issued cheques draw their number from a leaf."""

    __tablename__ = "finance_cheque_books"
    __table_args__ = (UniqueConstraint("company_id", "book_number", name="uq_finance_cheque_book_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    book_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # CBR/2026/00003
    payment_account_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    routing_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    cheque_prefix: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    number_from: Mapped[int] = mapped_column(Integer, nullable=False)
    number_to: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(12), nullable=False, default="draft", index=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FinanceChequeLeaf(Base):
    """One leaf of a cheque book. ``unused`` until an issued cheque takes it, ``void`` when spoiled / lost.
    Whether an issued leaf is still waiting at the bank or has cleared is read from its cheque, not stored here."""

    __tablename__ = "finance_cheque_leaves"
    __table_args__ = (UniqueConstraint("book_id", "cheque_number", name="uq_finance_cheque_leaf_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("finance_cheque_books.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    cheque_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="unused", index=True)
    cheque_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("finance_cheques.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
