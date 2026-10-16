from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CoreSequence(Base):
    """Document number range — one counter per company + document type.

    Replaces `COUNT(*) + 1` numbering, which hands the same number to two
    concurrent requests and re-uses numbers after a delete. Allocation takes a
    row lock (SELECT … FOR UPDATE), so numbers are unique and monotonic per
    company. Equivalent to SAP number range objects / Odoo `ir.sequence`.
    """

    __tablename__ = "core_sequences"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_core_sequence_company_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    # Document type key, e.g. "sales.order", "purchase.order".
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    # Prefix/suffix accept {YYYY}, {YY} and {MM} tokens, resolved at allocation.
    prefix: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    suffix: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    padding: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    next_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # never | yearly | monthly — when the counter restarts at 1.
    reset_policy: Mapped[str] = mapped_column(String(16), nullable=False, default="never")
    # Period the counter currently belongs to ("2026", "2026-09"); "" when never.
    period_key: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
