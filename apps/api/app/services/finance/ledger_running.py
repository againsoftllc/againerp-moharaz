"""Running due on party ledgers (supplier AP / customer AR).

Closing balance is billed − paid and may be negative (advance / prepaid).
Each row's `balance` is that signed due *after* the line, newest first, so
the top row always matches the account closing balance.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Sequence, TypeVar

ZERO = Decimal("0")

T = TypeVar("T")


def document_date(created_at: Optional[datetime], *candidates: Optional[date]) -> date:
    """Business date: historical imports store the real day on due/payment_date
    while created_at is the import timestamp."""
    dates: list[date] = [d for d in candidates if d is not None]
    if created_at is not None:
        dates.append(created_at.date())
    return min(dates) if dates else date.today()


def document_due(row: object) -> Decimal:
    balance = getattr(row, "balance", None)
    if balance is not None:
        return balance
    return (getattr(row, "amount", None) or ZERO) - (getattr(row, "amount_paid", None) or ZERO)


def net_payments(payments: Sequence[object], *, paid_direction: str) -> Decimal:
    """Net cash on the account. `paid_direction` is `outbound` (supplier) or `inbound` (customer)."""
    total = ZERO
    for payment in payments:
        amount = getattr(payment, "amount", None) or ZERO
        outbound = getattr(payment, "direction", None) != "inbound"
        is_paid = outbound if paid_direction == "outbound" else (not outbound)
        total += amount if is_paid else -amount
    return total


def apply_unapplied_fifo(
    docs: Sequence[T],
    payments: Sequence[object],
    *,
    paid_direction: str,
    reference_attr: str,
) -> list[str]:
    """Put leftover payments onto open bills/invoices, oldest first."""
    applied_paid = sum((getattr(doc, "amount_paid", None) or ZERO for doc in docs), ZERO)
    unapplied = net_payments(payments, paid_direction=paid_direction) - applied_paid
    if unapplied <= 0:
        return []
    refs: list[str] = []
    for doc in docs:
        if unapplied <= 0:
            break
        due = document_due(doc)
        if due <= 0:
            continue
        take = min(due, unapplied)
        doc.amount_paid = (getattr(doc, "amount_paid", None) or ZERO) + take
        doc.balance = due - take
        doc.status = "paid" if doc.balance <= 0 else "partial"
        unapplied -= take
        refs.append(str(getattr(doc, reference_attr, None) or getattr(doc, "id", "") or ""))
    return refs


def _document_rank(entry: object) -> int:
    """Postgres `now()` is the transaction start, so an invoice and the payment
    posted in the same request share a created_at. The document comes first,
    then the money against it."""
    return 0 if getattr(entry, "kind", "") in ("receivable", "payable") else 1


def attach_running_due(entries: Sequence[T], outstanding: Decimal) -> list[T]:
    """Newest-first. `entry.balance` = signed closing after that line (negative = advance)."""
    ordered = sorted(
        entries,
        key=lambda e: (
            getattr(e, "entry_date", None) or date.min,
            getattr(e, "created_at", None) or datetime.min,
            _document_rank(e),
            getattr(e, "id", "") or "",
        ),
        reverse=True,
    )
    running = outstanding
    for entry in ordered:
        entry.balance = running
        running = running - (getattr(entry, "debit", None) or ZERO) + (getattr(entry, "credit", None) or ZERO)
    return list(ordered)
