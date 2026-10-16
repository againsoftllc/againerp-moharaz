"""Signed party-ledger running balance and FIFO advance allocation."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase

from app.services.finance.ledger_running import (
    apply_unapplied_fifo,
    attach_running_due,
    net_payments,
)

ZERO = Decimal("0")


def _entry(id: str, debit: str, credit: str, day: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        debit=Decimal(debit),
        credit=Decimal(credit),
        entry_date=date.fromisoformat(day),
        created_at=datetime.fromisoformat(f"{day}T10:00:00"),
        balance=ZERO,
    )


class NetPaymentsTests(TestCase):
    def test_supplier_outbound_minus_refund(self):
        payments = [
            SimpleNamespace(amount=Decimal("150"), direction="outbound"),
            SimpleNamespace(amount=Decimal("20"), direction="inbound"),
        ]
        self.assertEqual(net_payments(payments, paid_direction="outbound"), Decimal("130"))

    def test_customer_inbound_minus_refund(self):
        payments = [
            SimpleNamespace(amount=Decimal("80"), direction="inbound"),
            SimpleNamespace(amount=Decimal("10"), direction="outbound"),
        ]
        self.assertEqual(net_payments(payments, paid_direction="inbound"), Decimal("70"))


class ApplyUnappliedTests(TestCase):
    def test_advance_settles_later_bill(self):
        bill = SimpleNamespace(
            id="b1",
            reference_number="PO-1",
            amount=Decimal("100"),
            amount_paid=ZERO,
            balance=Decimal("100"),
            status="open",
        )
        payments = [SimpleNamespace(amount=Decimal("150"), direction="outbound")]
        refs = apply_unapplied_fifo(
            [bill],
            payments,
            paid_direction="outbound",
            reference_attr="reference_number",
        )
        self.assertEqual(refs, ["PO-1"])
        self.assertEqual(bill.amount_paid, Decimal("100"))
        self.assertEqual(bill.balance, ZERO)
        self.assertEqual(bill.status, "paid")

    def test_no_open_bill_leaves_credit(self):
        refs = apply_unapplied_fifo(
            [],
            [SimpleNamespace(amount=Decimal("50"), direction="outbound")],
            paid_direction="outbound",
            reference_attr="reference_number",
        )
        self.assertEqual(refs, [])


class RunningBalanceTests(TestCase):
    def test_overpayment_closing_is_negative_advance(self):
        bill = _entry("b", "100", "0", "2026-01-01")
        pay = _entry("p", "0", "150", "2026-01-02")
        rows = attach_running_due([bill, pay], Decimal("-50"))
        self.assertEqual(rows[0].id, "p")
        self.assertEqual(rows[0].balance, Decimal("-50"))
        self.assertEqual(rows[1].id, "b")
        self.assertEqual(rows[1].balance, Decimal("100"))

    def test_advance_then_bill_leaves_remaining_due(self):
        pay = _entry("p", "0", "40", "2026-01-01")
        bill = _entry("b", "100", "0", "2026-01-10")
        rows = attach_running_due([pay, bill], Decimal("60"))
        self.assertEqual(rows[0].id, "b")
        self.assertEqual(rows[0].balance, Decimal("60"))
        self.assertEqual(rows[1].id, "p")
        self.assertEqual(rows[1].balance, Decimal("-40"))
