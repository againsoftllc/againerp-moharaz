"""Expense cost-center allocation engine — no database."""

from __future__ import annotations

from decimal import Decimal
from unittest import TestCase

from app.services.finance.allocation import (
    AllocationError,
    AllocationInputLine,
    OverrideLine,
    allocate,
    apply_override,
    build_expense_payment_lines,
    require_balanced_journal,
)
from app.services.finance.posting import journal_lines_balance, money

ZERO = Decimal("0")


def _line(cc_id: str, *, qty=0, pct=0, fixed=0, code=None, name=None, active=True) -> AllocationInputLine:
    return AllocationInputLine(
        cost_center_id=cc_id,
        cost_center_code=code or cc_id,
        cost_center_name=name or cc_id,
        is_active=active,
        basis_value=Decimal(str(qty)),
        percentage=Decimal(str(pct)),
        fixed_amount=Decimal(str(fixed)),
    )


class QuantityAllocationTests(TestCase):
    def test_light_point_30000_splits_3_2_5(self):
        result = allocate(
            Decimal("30000"),
            "quantity",
            [
                _line("as", qty=3, code="AS", name="AgainSoft"),
                _line("mhz", qty=2, code="MHZ", name="Moharaz"),
                _line("egp", qty=5, code="EGP", name="EGP"),
            ],
        )
        amounts = [row.amount for row in result]
        self.assertEqual(amounts, [Decimal("9000.00"), Decimal("6000.00"), Decimal("15000.00")])
        self.assertEqual(sum(amounts, ZERO), Decimal("30000.00"))

    def test_zero_quantity_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "quantity", [_line("a", qty=0), _line("b", qty=0)])

    def test_negative_quantity_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "quantity", [_line("a", qty=3), _line("b", qty=-1)])


class PercentageAllocationTests(TestCase):
    def test_over_100_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "percentage", [_line("a", pct=60), _line("b", pct=50)])

    def test_under_100_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "percentage", [_line("a", pct=40), _line("b", pct=50)])

    def test_exact_100_ok(self):
        result = allocate(Decimal("200"), "percentage", [_line("a", pct=50), _line("b", pct=50)])
        self.assertEqual([row.amount for row in result], [Decimal("100.00"), Decimal("100.00")])


class FixedAllocationTests(TestCase):
    def test_mismatch_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "fixed", [_line("a", fixed=40), _line("b", fixed=50)])

    def test_match_ok(self):
        result = allocate(Decimal("100"), "fixed", [_line("a", fixed=40), _line("b", fixed=60)])
        self.assertEqual([row.amount for row in result], [Decimal("40.00"), Decimal("60.00")])


class RoundingTests(TestCase):
    def test_remainder_cents_go_to_last_line(self):
        result = allocate(
            Decimal("100"),
            "equal",
            [_line("a"), _line("b"), _line("c")],
        )
        amounts = [row.amount for row in result]
        self.assertEqual(amounts, [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")])
        self.assertEqual(sum(amounts, ZERO), Decimal("100.00"))


class InactiveAndDuplicateTests(TestCase):
    def test_inactive_center_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "equal", [_line("a"), _line("b", active=False)])

    def test_inactive_rule_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "equal", [_line("a"), _line("b")], rule_active=False)

    def test_duplicate_cost_center_rejected(self):
        with self.assertRaises(AllocationError):
            allocate(Decimal("100"), "equal", [_line("a"), _line("a")])


class OverrideTests(TestCase):
    def test_manual_override_must_total_amount(self):
        computed = allocate(Decimal("100"), "equal", [_line("a", name="A"), _line("b", name="B")])
        with self.assertRaises(AllocationError):
            apply_override(
                computed,
                [OverrideLine("a", Decimal("10")), OverrideLine("b", Decimal("20"))],
                Decimal("100"),
            )

    def test_manual_override_ok(self):
        computed = allocate(Decimal("100"), "equal", [_line("a", name="A"), _line("b", name="B")])
        result = apply_override(
            computed,
            [OverrideLine("a", Decimal("25")), OverrideLine("b", Decimal("75"))],
            Decimal("100"),
        )
        self.assertEqual([row.amount for row in result], [Decimal("25.00"), Decimal("75.00")])


class JournalLineTests(TestCase):
    def test_no_allocation_is_single_6000_debit(self):
        lines = build_expense_payment_lines(
            amount=Decimal("500"),
            tax_amount=ZERO,
            expense_account_code="6000",
            payment_gl_code="1000",
            description="Rent",
            payee="Landlord",
        )
        expense_debits = [line for line in lines if line[0] == "6000"]
        self.assertEqual(len(expense_debits), 1)
        self.assertEqual(expense_debits[0][1], Decimal("500.00"))
        self.assertIsNone(expense_debits[0][7])
        self.assertTrue(journal_lines_balance(lines))

    def test_allocated_posts_one_debit_per_cost_center(self):
        allocated = allocate(
            Decimal("30000"),
            "quantity",
            [
                _line("as", qty=3, code="AS", name="AgainSoft"),
                _line("mhz", qty=2, code="MHZ", name="Moharaz"),
                _line("egp", qty=5, code="EGP", name="EGP"),
            ],
        )
        lines = build_expense_payment_lines(
            amount=Decimal("30000"),
            tax_amount=ZERO,
            expense_account_code="6110",
            payment_gl_code="1000",
            description="Electricity",
            payee="DESCO",
            allocated=allocated,
        )
        expense_debits = [line for line in lines if line[0] == "6110"]
        self.assertEqual(len(expense_debits), 3)
        self.assertEqual([line[7] for line in expense_debits], ["as", "mhz", "egp"])
        self.assertEqual(sum((line[1] for line in expense_debits), ZERO), Decimal("30000.00"))
        self.assertTrue(journal_lines_balance(lines))

    def test_unbalanced_journal_rejected(self):
        unbalanced = [
            ("6000", Decimal("10.00"), ZERO, "x", None, None, ZERO, None),
            ("1000", ZERO, Decimal("9.00"), "y", None, None, ZERO, None),
        ]
        self.assertFalse(journal_lines_balance(unbalanced))
        with self.assertRaises(AllocationError):
            require_balanced_journal(unbalanced)

    def test_allocated_mismatch_rejected(self):
        allocated = allocate(Decimal("100"), "equal", [_line("a"), _line("b")])
        with self.assertRaises(AllocationError):
            build_expense_payment_lines(
                amount=Decimal("90"),
                tax_amount=ZERO,
                expense_account_code="6000",
                payment_gl_code="1000",
                description="x",
                payee="y",
                allocated=allocated,
            )
