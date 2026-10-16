"""Accounting period control.

`assert_period_open` is called from the single journal posting path, so a closed
month rejects every back-dated entry regardless of which module triggered it —
an invoice, a payment, a stock move or a manual journal.

Periods are generated per fiscal year from the company's fiscal year start
month. A date with no period row counts as open: closing is opt-in, so an ERP
that has never generated periods keeps behaving exactly as before.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.finance_period import FinancePeriod

MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def fiscal_start_month(db: Session, company_id: str) -> int:
    company = db.get(Company, company_id)
    month = getattr(company, "fiscal_year_start_month", None) or 7
    return min(12, max(1, int(month)))


def fiscal_year_of(db: Session, company_id: str, day: date) -> int:
    """Fiscal year label for `day` — the calendar year the FY starts in."""
    start_month = fiscal_start_month(db, company_id)
    return day.year if day.month >= start_month else day.year - 1


def period_bounds(fiscal_year: int, start_month: int, period_no: int) -> tuple[date, date, str]:
    """Start, end and label of `period_no` (1-based) within a fiscal year."""
    index = start_month - 1 + (period_no - 1)
    year = fiscal_year + index // 12
    month = index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day), f"{MONTH_SHORT[month - 1]} {year}"


def generate_year(db: Session, company_id: str, fiscal_year: int) -> List[FinancePeriod]:
    """Create the 12 periods of a fiscal year; existing ones are left untouched."""
    start_month = fiscal_start_month(db, company_id)
    existing = {
        row.period_no: row
        for row in db.query(FinancePeriod).filter(
            FinancePeriod.company_id == company_id,
            FinancePeriod.fiscal_year == fiscal_year,
        )
    }
    out: List[FinancePeriod] = []
    for period_no in range(1, 13):
        row = existing.get(period_no)
        if row is None:
            start, end, name = period_bounds(fiscal_year, start_month, period_no)
            row = FinancePeriod(
                company_id=company_id,
                fiscal_year=fiscal_year,
                period_no=period_no,
                name=name,
                start_date=start,
                end_date=end,
                status="open",
            )
            db.add(row)
        out.append(row)
    db.flush()
    return sorted(out, key=lambda r: r.period_no)


def period_for_date(db: Session, company_id: str, day: date) -> Optional[FinancePeriod]:
    return (
        db.query(FinancePeriod)
        .filter(
            FinancePeriod.company_id == company_id,
            FinancePeriod.start_date <= day,
            FinancePeriod.end_date >= day,
        )
        .first()
    )


def assert_period_open(db: Session, company_id: str, day: date, *, what: str = "entry") -> None:
    """Reject a posting whose date falls in a closed period."""
    if day is None:
        return
    period = period_for_date(db, company_id, day)
    if period is not None and period.status == "closed":
        raise HTTPException(
            status_code=422,
            detail=(
                f"Accounting period {period.name} is closed — "
                f"this {what} cannot be posted on {day.isoformat()}. "
                "Reopen the period in Workspace → Accounting periods, or use a date in an open period."
            ),
        )


def set_status(
    db: Session,
    company_id: str,
    period_id: str,
    status: str,
    *,
    actor_id: Optional[str] = None,
) -> FinancePeriod:
    if status not in ("open", "closed"):
        raise HTTPException(status_code=422, detail="Period status must be 'open' or 'closed'")
    period = db.get(FinancePeriod, period_id)
    if not period or period.company_id != company_id:
        raise HTTPException(status_code=404, detail="Accounting period not found")
    period.status = status
    period.closed_at = datetime.utcnow() if status == "closed" else None
    period.closed_by = actor_id if status == "closed" else None
    db.flush()
    return period
