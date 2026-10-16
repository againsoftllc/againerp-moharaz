"""POS identities and validation that do not need a database."""

from __future__ import annotations

from decimal import Decimal
from unittest import TestCase

from app.services.finance.constants import SOURCE_TYPE_LABELS, SOURCE_TYPES
from app.services.inventory.constants import SERIAL_STATUS_TRANSITIONS
from app.services.pos.constants import (
    CASH_DIRECTIONS,
    DEFAULT_WALK_IN_CUSTOMER_CODE,
    PAYMENT_METHODS,
    TERMINAL_STATUSES,
    expected_drawer_cash,
)


class ExpectedCashTests(TestCase):
    def test_session_close_identity(self):
        expected = expected_drawer_cash(
            opening=Decimal("5000"),
            cash_sales=Decimal("1200"),
            cash_in=Decimal("300"),
            cash_refunds=Decimal("100"),
            cash_out=Decimal("50"),
        )
        self.assertEqual(expected, Decimal("6350"))

    def test_zero_movement_is_opening(self):
        expected = expected_drawer_cash(
            opening=Decimal("100"),
            cash_sales=Decimal("0"),
            cash_in=Decimal("0"),
            cash_refunds=Decimal("0"),
            cash_out=Decimal("0"),
        )
        self.assertEqual(expected, Decimal("100"))


class PaymentMethodTests(TestCase):
    def test_retail_methods_exist(self):
        for method in ("cash", "card", "bank", "mobile_banking", "other"):
            self.assertIn(method, PAYMENT_METHODS)

    def test_split_is_not_a_stored_method(self):
        self.assertNotIn("split", PAYMENT_METHODS)


class TerminalAndCashTests(TestCase):
    def test_terminal_statuses(self):
        self.assertEqual(TERMINAL_STATUSES, frozenset({"active", "inactive", "maintenance"}))

    def test_cash_directions(self):
        self.assertEqual(CASH_DIRECTIONS, frozenset({"in", "out"}))

    def test_walk_in_code(self):
        self.assertEqual(DEFAULT_WALK_IN_CUSTOMER_CODE, "WALK-IN")


class SerialReturnTests(TestCase):
    def test_sold_unit_can_return_to_stock(self):
        self.assertIn("in_stock", SERIAL_STATUS_TRANSITIONS["sold"])


class FinanceSourceTests(TestCase):
    def test_pos_return_and_cash_are_journal_sources(self):
        self.assertIn("pos_return", SOURCE_TYPES)
        self.assertIn("pos_cash_movement", SOURCE_TYPES)
        self.assertIn("pos_return", SOURCE_TYPE_LABELS)
        self.assertIn("pos_cash_movement", SOURCE_TYPE_LABELS)
