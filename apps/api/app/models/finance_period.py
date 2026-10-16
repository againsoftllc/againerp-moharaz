from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinancePeriod(Base):
    """Accounting period — the window a journal entry may be posted into.

    A closed period rejects new postings on its dates, which is what stops
    someone from back-dating an entry into a month that has already been
    reported. Equivalent to SAP posting period control (OB52) / Odoo lock dates.

    Dates with no period row are treated as open, so nothing changes until an
    admin actually closes a period.
    """

    __tablename__ = "finance_periods"
    __table_args__ = (
        UniqueConstraint("company_id", "fiscal_year", "period_no", name="uq_finance_period"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    # Fiscal year label — the calendar year the fiscal year starts in.
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # 1..12, counted from the company's fiscal year start month.
    period_no: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # open | closed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
