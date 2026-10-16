"""Pure posting / report helpers — no database, easy to unit-test."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

ZERO = Decimal("0")
CENT = Decimal("0.01")

JournalLineSpec = tuple[str, Decimal, Decimal, Optional[str], Optional[str], Optional[str], Decimal]


def money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT)


def build_ar_invoice_lines(
    *,
    total: Decimal,
    tax: Decimal,
    customer_id: Optional[str],
    revenue_description: str = "Sales revenue",
) -> list[JournalLineSpec]:
    """Dr AR / Cr revenue / Cr output tax. Skips zero-amount tax/revenue legs."""
    total_m = money(total)
    tax_m = money(tax)
    net = money(total_m - tax_m)
    lines: list[JournalLineSpec] = [
        ("1100", total_m, ZERO, "Accounts receivable", "customer", customer_id, ZERO),
    ]
    if net != ZERO:
        lines.append(("4000", ZERO, net, revenue_description, "customer", customer_id, ZERO))
    if tax_m != ZERO:
        lines.append(("2210", ZERO, tax_m, "Output tax", "customer", customer_id, tax_m))
    return lines


def build_payment_transfer_lines(
    *,
    amount: Decimal,
    from_gl_code: str,
    to_gl_code: str,
    description: str = "Payment account transfer",
) -> list[JournalLineSpec]:
    """Dr destination cash/bank, Cr source cash/bank. Nets to zero when both share a GL."""
    amt = money(amount)
    return [
        (to_gl_code, amt, ZERO, description, None, None, ZERO),
        (from_gl_code, ZERO, amt, description, None, None, ZERO),
    ]


def journal_lines_balance(lines: list[JournalLineSpec]) -> bool:
    debit = sum((line[1] for line in lines), ZERO)
    credit = sum((line[2] for line in lines), ZERO)
    return money(debit) == money(credit)


def aging_bucket(due: Optional[date], as_of: date, created: date) -> str:
    """Overdue aging from due date (or created date if no due date). Not overdue → current."""
    base = due or created
    days = (as_of - base).days
    if days <= 0:
        return "current"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "90_plus"


AGED_PERIOD_KEYS = ("at_date", "period_1", "period_2", "period_3", "period_4", "older")


def aged_period_columns(period_length: int = 30) -> list[dict]:
    """Column set for the Odoo-style aged partner balance: At Date, 1-N, N+1-2N, ... , Older."""
    n = max(1, int(period_length))
    return [
        {"key": "at_date", "label": "At Date"},
        {"key": "period_1", "label": f"1-{n}"},
        {"key": "period_2", "label": f"{n + 1}-{2 * n}"},
        {"key": "period_3", "label": f"{2 * n + 1}-{3 * n}"},
        {"key": "period_4", "label": f"{3 * n + 1}-{4 * n}"},
        {"key": "older", "label": "Older"},
    ]


def aged_period_bucket(base: Optional[date], as_of: date, period_length: int = 30) -> str:
    """Odoo-style aged bucket by elapsed days from ``base`` (due date or invoice date) to ``as_of``.

    Not yet due (or no base date) → at_date; then four equal periods of ``period_length`` days; beyond → older.
    """
    if base is None:
        return "at_date"
    n = max(1, int(period_length))
    days = (as_of - base).days
    if days <= 0:
        return "at_date"
    if days <= n:
        return "period_1"
    if days <= 2 * n:
        return "period_2"
    if days <= 3 * n:
        return "period_3"
    if days <= 4 * n:
        return "period_4"
    return "older"


def cash_flow_identity(
    opening: Decimal,
    cash_in: Decimal,
    cash_out: Decimal,
    transfer_in: Decimal,
    transfer_out: Decimal,
    closing: Decimal,
) -> dict:
    net = money(cash_in - cash_out + transfer_in - transfer_out)
    expected = money(opening + net)
    closing_m = money(closing)
    difference = money(closing_m - expected)
    return {
        "net_cash_flow": net,
        "expected_closing": expected,
        "closing": closing_m,
        "difference": difference,
        "ok": difference == ZERO,
    }


def trial_balance_identity(total_debit: Decimal, total_credit: Decimal) -> dict:
    debit = money(total_debit)
    credit = money(total_credit)
    difference = money(debit - credit)
    return {
        "total_debit": debit,
        "total_credit": credit,
        "difference": difference,
        "ok": difference == ZERO,
    }


def balance_sheet_identity(assets: Decimal, liabilities: Decimal, equity: Decimal) -> dict:
    left = money(assets)
    right = money(liabilities + equity)
    difference = money(left - right)
    return {
        "total_assets": left,
        "total_liabilities": money(liabilities),
        "total_equity": money(equity),
        "liabilities_plus_equity": right,
        "difference": difference,
        "ok": difference == ZERO,
    }


def outstanding_identity(amount: Decimal, paid: Decimal, balance: Decimal) -> dict:
    expected = money(amount - paid)
    actual = money(balance)
    difference = money(actual - expected)
    return {
        "expected": expected,
        "actual": actual,
        "difference": difference,
        "ok": difference == ZERO,
    }
