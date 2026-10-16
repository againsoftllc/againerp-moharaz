"""Finance posting helpers and report identities (no database)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase
from unittest.mock import MagicMock

from app.services.finance.constants import (
    balance_sheet_bucket,
    cash_flow_line,
    profit_loss_bucket,
    DEFAULT_ACCOUNTS,
    RETAINED_EARNINGS_CODE,
    SOURCE_TYPE_LABELS,
    SOURCE_TYPES,
    account_normal_balance,
)
from app.services.finance.posting import (
    aged_period_bucket,
    aged_period_columns,
    aging_bucket,
    balance_sheet_identity,
    build_ar_invoice_lines,
    build_payment_transfer_lines,
    cash_flow_identity,
    journal_lines_balance,
    money,
    outstanding_identity,
    trial_balance_identity,
)

ZERO = Decimal("0")


class SourceTypeTests(TestCase):
    def test_required_sources_are_registered(self):
        required = {
            "sales_order",
            "purchase_receipt",
            "purchase_document",
            "purchase_return",
            "pos_payment",
            "expense",
            "receivable_settlement",
            "payable_settlement",
            "service_job",
            "rma",
            "commerce_order",
            "manual",
            "payment_transfer",
        }
        self.assertTrue(required.issubset(set(SOURCE_TYPES)))

    def test_every_source_has_a_label(self):
        for value in SOURCE_TYPES:
            self.assertIn(value, SOURCE_TYPE_LABELS)
            self.assertTrue(SOURCE_TYPE_LABELS[value])


class ChartOfAccountsTests(TestCase):
    POSTING_CODES = {
        "1000",
        "1010",
        "1020",
        "1100",
        "1200",
        "1310",
        "2100",
        "2210",
        "3000",
        "4000",
        "5000",
        "6000",
        "6100",
        "6110",
    }
    TYPE_BAND = {
        "1": "asset",
        "2": "liability",
        "3": "equity",
        "4": "revenue",
        "5": "expense",
        "6": "expense",
    }

    def test_retained_earnings_is_seeded_equity(self):
        equity = [row for row in DEFAULT_ACCOUNTS if row["code"] == RETAINED_EARNINGS_CODE]
        self.assertEqual(len(equity), 1)
        self.assertEqual(equity[0]["account_type"], "equity")
        self.assertEqual(equity[0]["name"], "Retained Earnings")

    def test_codes_are_unique(self):
        codes = [row["code"] for row in DEFAULT_ACCOUNTS]
        self.assertEqual(len(codes), len(set(codes)))

    def test_posting_codes_are_unchanged(self):
        by_code = {row["code"]: row for row in DEFAULT_ACCOUNTS}
        self.assertTrue(self.POSTING_CODES.issubset(by_code))
        self.assertEqual(by_code["1100"]["account_type"], "asset")
        self.assertEqual(by_code["2100"]["account_type"], "liability")
        self.assertEqual(by_code["4000"]["account_type"], "revenue")
        self.assertEqual(by_code["5000"]["account_type"], "expense")
        self.assertEqual(by_code["6000"]["account_type"], "expense")

    def test_parent_codes_exist(self):
        codes = {row["code"] for row in DEFAULT_ACCOUNTS}
        for row in DEFAULT_ACCOUNTS:
            parent = row.get("parent_code")
            if parent:
                self.assertIn(parent, codes)
                self.assertNotEqual(parent, row["code"])

    def test_type_bands_match_code_prefix(self):
        for row in DEFAULT_ACCOUNTS:
            expected = self.TYPE_BAND[row["code"][0]]
            self.assertEqual(row["account_type"], expected, row["code"])

    def test_standard_gaps_are_filled(self):
        codes = {row["code"] for row in DEFAULT_ACCOUNTS}
        for code in ("1300", "1400", "1500", "1510", "2200", "2300", "3010", "3020", "4100", "6120", "6130"):
            self.assertIn(code, codes)

    def test_contra_accounts_flip_nature(self):
        self.assertEqual(account_normal_balance("asset", "1510"), "credit")
        self.assertEqual(account_normal_balance("equity", "3020"), "debit")
        self.assertEqual(account_normal_balance("revenue", "4200"), "debit")
        self.assertEqual(account_normal_balance("asset", "1000"), "debit")
        self.assertEqual(account_normal_balance("liability", "2100"), "credit")


class ArInvoiceLineTests(TestCase):
    def test_sales_invoice_with_tax_balances(self):
        lines = build_ar_invoice_lines(total=Decimal("110"), tax=Decimal("10"), customer_id="c1")
        self.assertTrue(journal_lines_balance(lines))
        codes = [line[0] for line in lines]
        self.assertEqual(codes, ["1100", "4000", "2210"])

    def test_zero_tax_skips_output_tax_line(self):
        lines = build_ar_invoice_lines(total=Decimal("100"), tax=Decimal("0"), customer_id="c1")
        self.assertTrue(journal_lines_balance(lines))
        self.assertEqual([line[0] for line in lines], ["1100", "4000"])

    def test_same_source_lines_are_deterministic(self):
        a = build_ar_invoice_lines(total=Decimal("50"), tax=Decimal("5"), customer_id="c1")
        b = build_ar_invoice_lines(total=Decimal("50"), tax=Decimal("5"), customer_id="c1")
        self.assertEqual(a, b)


class PaymentTransferLineTests(TestCase):
    def test_transfer_between_gls_balances(self):
        lines = build_payment_transfer_lines(
            amount=Decimal("250.50"),
            from_gl_code="1000",
            to_gl_code="1010",
        )
        self.assertTrue(journal_lines_balance(lines))
        self.assertEqual(lines[0][0], "1010")
        self.assertEqual(lines[1][0], "1000")
        self.assertEqual(lines[0][1], Decimal("250.50"))
        self.assertEqual(lines[1][2], Decimal("250.50"))

    def test_same_gl_transfer_still_balances(self):
        lines = build_payment_transfer_lines(
            amount=Decimal("10"),
            from_gl_code="1000",
            to_gl_code="1000",
        )
        self.assertTrue(journal_lines_balance(lines))


class AgingTests(TestCase):
    def test_current_when_not_due(self):
        self.assertEqual(aging_bucket(date(2026, 8, 31), date(2026, 8, 20), date(2026, 8, 1)), "current")

    def test_buckets(self):
        as_of = date(2026, 8, 20)
        created = date(2026, 1, 1)
        self.assertEqual(aging_bucket(date(2026, 8, 20), as_of, created), "current")
        self.assertEqual(aging_bucket(date(2026, 8, 10), as_of, created), "1_30")
        self.assertEqual(aging_bucket(date(2026, 7, 1), as_of, created), "31_60")
        self.assertEqual(aging_bucket(date(2026, 6, 1), as_of, created), "61_90")
        self.assertEqual(aging_bucket(date(2026, 4, 1), as_of, created), "90_plus")

    def test_falls_back_to_created_date(self):
        self.assertEqual(aging_bucket(None, date(2026, 8, 20), date(2026, 8, 20)), "current")
        self.assertEqual(aging_bucket(None, date(2026, 8, 20), date(2026, 5, 1)), "90_plus")


class AgedPeriodTests(TestCase):
    def test_columns_follow_period_length(self):
        labels = [c["label"] for c in aged_period_columns(30)]
        self.assertEqual(labels, ["At Date", "1-30", "31-60", "61-90", "91-120", "Older"])
        labels = [c["label"] for c in aged_period_columns(15)]
        self.assertEqual(labels, ["At Date", "1-15", "16-30", "31-45", "46-60", "Older"])

    def test_buckets_30_days(self):
        as_of = date(2026, 9, 14)
        self.assertEqual(aged_period_bucket(date(2026, 9, 14), as_of, 30), "at_date")
        self.assertEqual(aged_period_bucket(date(2026, 10, 1), as_of, 30), "at_date")
        self.assertEqual(aged_period_bucket(date(2026, 9, 13), as_of, 30), "period_1")
        self.assertEqual(aged_period_bucket(date(2026, 8, 15), as_of, 30), "period_1")
        self.assertEqual(aged_period_bucket(date(2026, 8, 14), as_of, 30), "period_2")
        self.assertEqual(aged_period_bucket(date(2026, 7, 16), as_of, 30), "period_2")
        self.assertEqual(aged_period_bucket(date(2026, 7, 15), as_of, 30), "period_3")
        self.assertEqual(aged_period_bucket(date(2026, 6, 15), as_of, 30), "period_4")
        self.assertEqual(aged_period_bucket(date(2026, 5, 17), as_of, 30), "period_4")
        self.assertEqual(aged_period_bucket(date(2026, 5, 16), as_of, 30), "older")

    def test_no_base_date_is_at_date(self):
        self.assertEqual(aged_period_bucket(None, date(2026, 9, 14), 30), "at_date")


class BalanceSheetBucketTests(TestCase):
    def test_asset_bands(self):
        self.assertEqual(balance_sheet_bucket("asset", "1000"), "bank_cash")
        self.assertEqual(balance_sheet_bucket("asset", "1020"), "bank_cash")
        self.assertEqual(balance_sheet_bucket("asset", "1100"), "receivables")
        self.assertEqual(balance_sheet_bucket("asset", "1200"), "current_assets")
        self.assertEqual(balance_sheet_bucket("asset", "1300"), "prepayments")
        self.assertEqual(balance_sheet_bucket("asset", "1310"), "current_assets")
        self.assertEqual(balance_sheet_bucket("asset", "1400"), "current_assets")
        self.assertEqual(balance_sheet_bucket("asset", "1500"), "fixed_assets")
        self.assertEqual(balance_sheet_bucket("asset", "1510"), "fixed_assets")
        self.assertEqual(balance_sheet_bucket("asset", "1800"), "non_current_assets")

    def test_liability_and_equity_bands(self):
        self.assertEqual(balance_sheet_bucket("liability", "2050"), "credit_card")
        self.assertEqual(balance_sheet_bucket("liability", "2100"), "payables")
        self.assertEqual(balance_sheet_bucket("liability", "2200"), "current_liabilities")
        self.assertEqual(balance_sheet_bucket("liability", "2300"), "current_liabilities")
        self.assertEqual(balance_sheet_bucket("liability", "2600"), "non_current_liabilities")
        self.assertEqual(balance_sheet_bucket("equity", "3000"), "previous_years_earnings")
        self.assertEqual(balance_sheet_bucket("equity", "3010"), "equity")
        self.assertEqual(balance_sheet_bucket("equity", "3020"), "equity")

    def test_pnl_accounts_are_excluded(self):
        self.assertIsNone(balance_sheet_bucket("revenue", "4000"))
        self.assertIsNone(balance_sheet_bucket("expense", "6000"))

    def test_non_numeric_code_falls_back(self):
        self.assertEqual(balance_sheet_bucket("asset", "CASH"), "current_assets")
        self.assertEqual(balance_sheet_bucket("liability", None), "current_liabilities")


class ProfitLossBucketTests(TestCase):
    def test_income_bands(self):
        self.assertEqual(profit_loss_bucket("revenue", "4000"), "revenue")
        self.assertEqual(profit_loss_bucket("revenue", "4200"), "revenue")  # sales returns net against revenue
        self.assertEqual(profit_loss_bucket("revenue", "4100"), "other_income")

    def test_expense_bands(self):
        self.assertEqual(profit_loss_bucket("expense", "5000"), "costs_of_revenue")
        self.assertEqual(profit_loss_bucket("expense", "6000"), "operating_expenses")
        self.assertEqual(profit_loss_bucket("expense", "6200"), "operating_expenses")
        self.assertEqual(profit_loss_bucket("expense", "7100"), "other_expenses")
        self.assertEqual(profit_loss_bucket("expense", None), "operating_expenses")

    def test_allocations_and_balance_sheet_accounts(self):
        self.assertEqual(profit_loss_bucket("equity", "3020"), "allocations")  # drawings
        self.assertIsNone(profit_loss_bucket("equity", "3010"))
        self.assertIsNone(profit_loss_bucket("asset", "1000"))
        self.assertIsNone(profit_loss_bucket("liability", "2100"))


class CashFlowLineTests(TestCase):
    def test_posted_payments_follow_counter_account(self):
        self.assertEqual(cash_flow_line("inbound", "manual", None, "1100", "asset"), "operating_in")
        self.assertEqual(cash_flow_line("outbound", "manual", None, "2100", "liability"), "operating_out")
        self.assertEqual(cash_flow_line("outbound", "expense", None, "6110", "expense"), "operating_out")
        self.assertEqual(cash_flow_line("inbound", "manual", None, "2200", "liability"), "operating_advance_in")
        self.assertEqual(cash_flow_line("outbound", "manual", None, "1400", "asset"), "operating_advance_out")
        self.assertEqual(cash_flow_line("outbound", "manual", None, "1500", "asset"), "investing_out")
        self.assertEqual(cash_flow_line("inbound", "manual", None, "1500", "asset"), "investing_in")
        self.assertEqual(cash_flow_line("inbound", "manual", None, "3010", "equity"), "financing_in")
        self.assertEqual(cash_flow_line("outbound", "manual", None, "2600", "liability"), "financing_out")

    def test_unposted_payments_follow_source_or_party(self):
        self.assertEqual(cash_flow_line("inbound", "customer_payment"), "operating_in")
        self.assertEqual(cash_flow_line("inbound", "commerce_order"), "operating_in")
        self.assertEqual(cash_flow_line("outbound", "supplier_payment"), "operating_out")
        self.assertEqual(cash_flow_line("inbound", "manual", "customer"), "operating_in")
        self.assertEqual(cash_flow_line("outbound", "manual", "supplier"), "operating_out")
        self.assertEqual(cash_flow_line("inbound", "manual", None), "unclassified_in")
        self.assertEqual(cash_flow_line("outbound", "manual", None), "unclassified_out")


class IntegrityTests(TestCase):
    def test_trial_balance_identity(self):
        ok = trial_balance_identity(Decimal("100"), Decimal("100"))
        self.assertTrue(ok["ok"])
        bad = trial_balance_identity(Decimal("100"), Decimal("90"))
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["difference"], money(10))

    def test_balance_sheet_identity(self):
        ok = balance_sheet_identity(Decimal("200"), Decimal("80"), Decimal("120"))
        self.assertTrue(ok["ok"])
        bad = balance_sheet_identity(Decimal("200"), Decimal("80"), Decimal("100"))
        self.assertFalse(bad["ok"])

    def test_cash_flow_identity(self):
        ok = cash_flow_identity(
            opening=Decimal("100"),
            cash_in=Decimal("40"),
            cash_out=Decimal("25"),
            transfer_in=Decimal("5"),
            transfer_out=Decimal("5"),
            closing=Decimal("115"),
        )
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["net_cash_flow"], money(15))
        bad = cash_flow_identity(Decimal("100"), Decimal("10"), ZERO, ZERO, ZERO, Decimal("50"))
        self.assertFalse(bad["ok"])

    def test_ar_ap_outstanding_identity(self):
        self.assertTrue(outstanding_identity(Decimal("100"), Decimal("40"), Decimal("60"))["ok"])
        self.assertFalse(outstanding_identity(Decimal("100"), Decimal("40"), Decimal("50"))["ok"])


class JournalIdempotencyTests(TestCase):
    def test_second_post_returns_existing_entry(self):
        from app.services.finance.finance_service import FinanceService

        existing = MagicMock()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing
        service = FinanceService(db)
        result = service._post_journal(
            company_id="default",
            entry_date=date.today(),
            description="Invoice INV-1",
            source_type="sales_order",
            source_id="order-1",
            lines=[("1100", Decimal("100"), ZERO, "AR", "customer", "c1", ZERO)],
        )
        self.assertIs(result, existing)
        db.add.assert_not_called()
