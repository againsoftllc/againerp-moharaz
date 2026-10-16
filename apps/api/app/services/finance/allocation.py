"""Pure expense allocation engine — no database, no UI."""

from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import ROUND_DOWN, Decimal
from typing import Optional

from app.services.finance.constants import ALLOCATION_METHODS, EXPENSE_ACCOUNT_CODE
from app.services.finance.posting import journal_lines_balance, money

ZERO = Decimal("0")
CENT = Decimal("0.01")
HUNDRED = Decimal("100")


class AllocationError(ValueError):
    """Invalid allocation input — caller maps this to HTTP 400."""


@dataclass(frozen=True)
class AllocationInputLine:
    cost_center_id: str
    cost_center_code: str
    cost_center_name: str
    is_active: bool = True
    basis_value: Decimal = ZERO
    percentage: Decimal = ZERO
    fixed_amount: Decimal = ZERO


@dataclass(frozen=True)
class AllocationResultLine:
    cost_center_id: str
    cost_center_code: str
    cost_center_name: str
    basis_value: Decimal
    percentage: Decimal
    amount: Decimal


@dataclass(frozen=True)
class OverrideLine:
    cost_center_id: str
    amount: Decimal
    basis_value: Optional[Decimal] = None


def _d(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _floor_cents(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_DOWN)


def _split_by_weights(amount: Decimal, weights: list[Decimal]) -> list[Decimal]:
    total_w = sum(weights, ZERO)
    if total_w <= ZERO:
        raise AllocationError("Allocation weights must total more than zero")
    raw = [amount * (weight / total_w) for weight in weights]
    floored = [_floor_cents(item) for item in raw]
    remainder = money(amount) - sum(floored, ZERO)
    floored[-1] = money(floored[-1] + remainder)
    return floored


def _assert_no_duplicates(lines: list[AllocationInputLine]) -> None:
    seen: set[str] = set()
    for line in lines:
        if not line.cost_center_id:
            raise AllocationError("Cost center is required on every allocation line")
        if line.cost_center_id in seen:
            raise AllocationError("Duplicate cost center on allocation lines")
        seen.add(line.cost_center_id)


def allocate(
    amount: Decimal,
    method: str,
    lines: list[AllocationInputLine],
    *,
    rule_active: bool = True,
) -> list[AllocationResultLine]:
    """Split `amount` across cost centers. Sum of result amounts always equals `amount`."""
    amount_m = money(amount)
    if amount_m <= ZERO:
        raise AllocationError("Amount must be greater than zero")
    if method not in ALLOCATION_METHODS:
        raise AllocationError(f"Unknown allocation method: {method}")
    if not rule_active:
        raise AllocationError("Allocation rule is inactive")
    if not lines:
        raise AllocationError("Allocation rule has no lines")
    _assert_no_duplicates(lines)
    for line in lines:
        if not line.is_active:
            raise AllocationError(f"Cost center {line.cost_center_code or line.cost_center_id} is inactive")

    if method == "quantity":
        weights = [_d(line.basis_value) for line in lines]
        if any(w < ZERO for w in weights):
            raise AllocationError("Quantity cannot be negative")
        if sum(weights, ZERO) <= ZERO:
            raise AllocationError("Total quantity must be greater than zero")
        amounts = _split_by_weights(amount_m, weights)
        total_w = sum(weights, ZERO)
        return [
            AllocationResultLine(
                cost_center_id=line.cost_center_id,
                cost_center_code=line.cost_center_code,
                cost_center_name=line.cost_center_name,
                basis_value=money(weights[i]),
                percentage=money(weights[i] * HUNDRED / total_w),
                amount=amounts[i],
            )
            for i, line in enumerate(lines)
        ]

    if method == "percentage":
        percents = [_d(line.percentage) for line in lines]
        if any(p < ZERO for p in percents):
            raise AllocationError("Percentage cannot be negative")
        if money(sum(percents, ZERO)) != money(HUNDRED):
            raise AllocationError("Percentages must total 100%")
        amounts = _split_by_weights(amount_m, percents)
        return [
            AllocationResultLine(
                cost_center_id=line.cost_center_id,
                cost_center_code=line.cost_center_code,
                cost_center_name=line.cost_center_name,
                basis_value=_d(line.basis_value),
                percentage=money(percents[i]),
                amount=amounts[i],
            )
            for i, line in enumerate(lines)
        ]

    if method == "fixed":
        amounts = [money(line.fixed_amount) for line in lines]
        if any(a < ZERO for a in amounts):
            raise AllocationError("Fixed amount cannot be negative")
        if money(sum(amounts, ZERO)) != amount_m:
            raise AllocationError("Fixed amounts must equal the expense amount")
        return [
            AllocationResultLine(
                cost_center_id=line.cost_center_id,
                cost_center_code=line.cost_center_code,
                cost_center_name=line.cost_center_name,
                basis_value=_d(line.basis_value),
                percentage=ZERO,
                amount=amounts[i],
            )
            for i, line in enumerate(lines)
        ]

    # equal
    weights = [Decimal("1") for _ in lines]
    amounts = _split_by_weights(amount_m, weights)
    share_pct = money(HUNDRED / Decimal(len(lines)))
    return [
        AllocationResultLine(
            cost_center_id=line.cost_center_id,
            cost_center_code=line.cost_center_code,
            cost_center_name=line.cost_center_name,
            basis_value=Decimal("1"),
            percentage=share_pct if i < len(lines) - 1 else money(HUNDRED - share_pct * (len(lines) - 1)),
            amount=amounts[i],
        )
        for i, line in enumerate(lines)
    ]


def apply_override(
    computed: list[AllocationResultLine],
    overrides: list[OverrideLine],
    amount: Decimal,
) -> list[AllocationResultLine]:
    amount_m = money(amount)
    if not computed:
        raise AllocationError("Nothing to override")
    by_id: dict[str, OverrideLine] = {}
    for row in overrides:
        if row.cost_center_id in by_id:
            raise AllocationError("Duplicate cost center in override")
        if money(row.amount) < ZERO:
            raise AllocationError("Override amount cannot be negative")
        by_id[row.cost_center_id] = row
    computed_ids = {line.cost_center_id for line in computed}
    if set(by_id) != computed_ids:
        raise AllocationError("Override lines must match the allocation cost centers")
    result = []
    for line in computed:
        ov = by_id[line.cost_center_id]
        result.append(
            replace(
                line,
                amount=money(ov.amount),
                basis_value=money(ov.basis_value) if ov.basis_value is not None else line.basis_value,
            )
        )
    if money(sum((line.amount for line in result), ZERO)) != amount_m:
        raise AllocationError("Override totals must equal the expense amount")
    return result


def require_balanced_journal(lines: list) -> None:
    if not journal_lines_balance(lines):
        raise AllocationError("Journal is unbalanced")


def build_expense_payment_lines(
    *,
    amount: Decimal,
    tax_amount: Decimal,
    expense_account_code: str,
    payment_gl_code: str,
    description: str,
    payee: str,
    allocated: Optional[list[AllocationResultLine]] = None,
) -> list[tuple]:
    """Dr expense (one line, or one per cost center) / Dr input tax / Cr payment account."""
    amount_m = money(amount)
    tax_m = money(tax_amount)
    total = money(amount_m + tax_m)
    account_code = expense_account_code or EXPENSE_ACCOUNT_CODE
    desc = description or payee
    lines: list[tuple] = []
    if allocated:
        allocated_sum = money(sum((line.amount for line in allocated), ZERO))
        if allocated_sum != amount_m:
            raise AllocationError("Allocated amount does not equal expense amount")
        for row in allocated:
            lines.append(
                (
                    account_code,
                    row.amount,
                    ZERO,
                    f"{desc} — {row.cost_center_name}",
                    None,
                    None,
                    ZERO,
                    row.cost_center_id,
                )
            )
    else:
        lines.append((account_code, amount_m, ZERO, desc, None, None, ZERO, None))
    if tax_m != ZERO:
        lines.append(("1310", tax_m, ZERO, "Input tax", None, None, tax_m, None))
    lines.append((payment_gl_code, ZERO, total, f"Payment to {payee}", None, None, ZERO, None))
    require_balanced_journal(lines)
    return lines


def snapshot_dict(
    *,
    rule_id: Optional[str],
    rule_name: Optional[str],
    method: str,
    unit_label: str,
    amount: Decimal,
    overridden: bool,
    lines: list[AllocationResultLine],
) -> dict:
    return {
        "rule_id": rule_id,
        "rule_name": rule_name,
        "method": method,
        "unit_label": unit_label,
        "amount": str(money(amount)),
        "overridden": overridden,
        "lines": [
            {
                "cost_center_id": line.cost_center_id,
                "code": line.cost_center_code,
                "name": line.cost_center_name,
                "basis_value": str(line.basis_value),
                "percentage": str(line.percentage),
                "amount": str(line.amount),
            }
            for line in lines
        ],
    }


def result_lines_from_snapshot(snapshot: dict) -> list[AllocationResultLine]:
    rows = snapshot.get("lines") or []
    return [
        AllocationResultLine(
            cost_center_id=str(row["cost_center_id"]),
            cost_center_code=str(row.get("code") or ""),
            cost_center_name=str(row.get("name") or ""),
            basis_value=_d(row.get("basis_value")),
            percentage=_d(row.get("percentage")),
            amount=money(row.get("amount")),
        )
        for row in rows
    ]
