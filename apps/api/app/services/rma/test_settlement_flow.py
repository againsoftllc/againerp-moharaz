"""RMA settlement (money in / money out against an RMA) - in-memory SQLite with the REAL finance service.

What it proves: a settlement is a draft until approved and a draft posts nothing; money in for the RMA's own charges settles
its receivable (partial payments add up, over-payment is refused); compensation, refunds and price differences land on the
account their purpose and party call for (not blindly income / expense); every posted journal balances; approving twice or
retrying cannot post twice; a zero-charge RMA creates no zero receipt or journal; permissions and the approval limit are
enforced; a settlement never moves stock or the RMA status; each entry keeps its own history and links.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 - FK targets must exist in metadata (tables are not created)
import app.models.catalog_attribute_profile  # noqa: F401
import app.models.catalog_brand  # noqa: F401
import app.models.catalog_category  # noqa: F401
import app.models.crm  # noqa: F401
import app.models.hrm  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.core_sequence import CoreSequence
from app.models.finance import (
    FinanceAccount,
    FinanceJournalEntry,
    FinanceJournalLine,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.models.finance_period import FinancePeriod
from app.models.finance_settlement import FinanceAllocation
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.rma import (
    RmaCharge,
    RmaDelivery,
    RmaSettlement,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaSupplierReceipt,
    RmaTicket,
)
from app.services.finance.finance_service import FinanceService
from app.services.rma import rma_service, settlement_service
from app.services.rma.settlement_accounts import RECEIVABLE, SettlementRuleError, counter_account

CO = "default"
D = Decimal
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaSettlement.__table__,
    RmaStockEvent.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaSupplierReceipt.__table__,
    RmaDelivery.__table__,
    RmaStatusHistory.__table__,
    InventoryWarehouse.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
    CollabActivity.__table__,
    Party.__table__,
    PartyRole.__table__,
    FinanceAccount.__table__,
    FinancePaymentAccount.__table__,
    FinanceJournalEntry.__table__,
    FinanceJournalLine.__table__,
    FinancePayment.__table__,
    FinanceReceivable.__table__,
    FinancePayable.__table__,
    CoreSequence.__table__,
    FinancePeriod.__table__,
    FinanceAllocation.__table__,
]


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class AccountMapTests(TestCase):
    """The accounting treatment, read straight from the table."""

    def test_money_in(self):
        self.assertEqual(counter_account("in", "parts_service", "customer"), RECEIVABLE)
        self.assertEqual(counter_account("in", "repair_labour", "customer"), RECEIVABLE)
        self.assertEqual(counter_account("in", "damage_compensation", "customer"), "4100")
        self.assertEqual(counter_account("in", "refund_settlement", "customer"), "1100")
        self.assertEqual(counter_account("in", "refund_settlement", "dealer"), "1100")
        self.assertEqual(counter_account("in", "refund_settlement", "supplier"), "2100")
        self.assertEqual(counter_account("in", "replacement_price_difference", "customer"), "4000")
        self.assertEqual(counter_account("in", "replacement_price_difference", "supplier"), "2100")
        self.assertEqual(counter_account("in", "other", "other"), "4100")

    def test_money_out(self):
        self.assertEqual(counter_account("out", "refund_settlement", "customer"), "4200")
        self.assertEqual(counter_account("out", "refund_settlement", "supplier"), "2100")
        self.assertEqual(counter_account("out", "replacement_price_difference", "customer"), "4200")
        self.assertEqual(counter_account("out", "damage_compensation", "customer"), "6000")
        self.assertEqual(counter_account("out", "parts_service", "supplier"), "6000")
        self.assertEqual(counter_account("out", "other", "other"), "6000")

    def test_combinations_without_an_honest_treatment_are_refused(self):
        for args in (
            ("in", "parts_service", "supplier"),  # the RMA's own charges come from the customer
            ("out", "repair_labour", "customer"),  # money out to a customer is a refund
            ("in", "refund_settlement", "other"),  # an "other party" has no ledger to refund against
            ("out", "refund_settlement", "other"),
        ):
            with self.assertRaises(SettlementRuleError):
                counter_account(*args)


class SettlementFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        self.fin = FinanceService(self.db)
        self.fin.ensure_accounts(CO)
        self.cash = next(a for a in self.fin.ensure_payment_accounts(CO) if a.is_default)
        self.db.add_all(
            [
                Party(id="cust-1", company_id=CO, type="person", display_name="Rakibul Hasan"),
                Party(id="cust-2", company_id=CO, type="person", display_name="Another Customer"),
                Party(id="sup-1", company_id=CO, type="organization", display_name="Deepcool Supplier"),
                Party(id="dealer-1", company_id=CO, type="organization", display_name="City Dealer"),
                Party(id="misc-1", company_id=CO, type="person", display_name="Courier Boy"),
            ]
        )
        self.db.flush()
        self.db.add_all(
            [
                PartyRole(party_id="cust-1", role="customer"),
                PartyRole(party_id="cust-2", role="customer"),
                PartyRole(party_id="sup-1", role="supplier"),
                PartyRole(party_id="dealer-1", role="vendor"),
            ]
        )
        self.db.flush()
        self.user = _user()

    def tearDown(self) -> None:
        self.db.close()

    # ---------------------------------------------------------- helpers

    def ticket(self, *, total="500", status="in_repair", customer_id="cust-1") -> RmaTicket:
        row = RmaTicket(
            company_id=CO,
            rma_number=f"RMA-2026-{self.db.query(RmaTicket).count() + 1:04d}",
            customer_id=customer_id,
            customer_name="Rakibul Hasan",
            sku="SKU-1",
            product_name="Mouse",
            fault_reported="No power",
            status=status,
            custody_state="in_rma_store",
            total=D(total),
            tax_total=D("0"),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def entry(self, t, **over) -> RmaSettlement:
        data = dict(
            party_type="customer", party_id="cust-1", direction="in", amount=D("500"), purpose="parts_service",
            purpose_note="Repair charge collected at the counter", payment_account_id=self.cash.id,
        )
        data.update(over)
        return settlement_service.create_settlement(self.db, t, data, user=self.user)

    def approve(self, s, submit=True):
        if submit:
            settlement_service.submit_settlement(self.db, s, actor="u")
        return settlement_service.decide_settlement(self.db, s, decision="approved", reason=None, user=_user("Finance Lead"))

    def counts(self):
        q = self.db.query
        return (q(FinancePayment).count(), q(FinanceJournalEntry).count(), q(FinanceReceivable).count())

    def lines(self, entry_id):
        rows = self.db.query(FinanceJournalLine).filter_by(journal_entry_id=entry_id).all()
        out = {}
        for r in rows:
            code = self.db.get(FinanceAccount, r.account_id).code
            out[code] = (r.debit, r.credit, r.party_type, r.party_id)
        return out

    def assert_balanced(self, entry_id):
        rows = self.db.query(FinanceJournalLine).filter_by(journal_entry_id=entry_id).all()
        self.assertEqual(sum((r.debit for r in rows), D("0")), sum((r.credit for r in rows), D("0")))
        self.assertGreater(len(rows), 1)

    # --------------------------------------------------- draft is inert

    def test_a_draft_and_a_pending_entry_post_nothing(self):
        t = self.ticket()
        s = self.entry(t)
        self.assertEqual((s.status, s.settlement_number.startswith("STL-")), ("draft", True))
        self.assertEqual(self.counts(), (0, 0, 0))
        settlement_service.submit_settlement(self.db, s, actor="u")
        self.assertEqual((s.status, self.counts()), ("pending_approval", (0, 0, 0)))
        self.assertEqual((s.payment_number, s.journal_number, s.receivable_number), (None, None, None))

    def test_rejected_and_sent_back_entries_post_nothing(self):
        t = self.ticket()
        s = self.entry(t)
        settlement_service.submit_settlement(self.db, s, actor="u")
        with self.assertRaises(HTTPException):  # a reason is required
            settlement_service.decide_settlement(self.db, s, decision="rejected", reason=" ", user=self.user)
        settlement_service.decide_settlement(self.db, s, decision="correction_requested", reason="Wrong account", user=self.user)
        self.assertEqual((s.status, self.counts()), ("correction_requested", (0, 0, 0)))
        settlement_service.submit_settlement(self.db, s, actor="u")
        settlement_service.decide_settlement(self.db, s, decision="rejected", reason="Not agreed", user=self.user)
        self.assertEqual((s.status, self.counts()), ("rejected", (0, 0, 0)))

    # ------------------------------------------------------ money in

    def test_money_in_for_the_rmas_charges_settles_its_receivable(self):
        t = self.ticket(total="500")
        s = self.entry(t)
        self.approve(s)
        r = self.db.query(FinanceReceivable).one()
        self.assertEqual((r.amount, r.amount_paid, r.balance, r.status), (D("500"), D("500"), D("0"), "paid"))
        self.assertEqual((t.bill_status, t.receivable_id), ("paid", r.id))
        p = self.db.query(FinancePayment).one()
        self.assertEqual((p.direction, p.amount, p.party_type, p.party_id), ("inbound", D("500"), "customer", "cust-1"))
        self.assertEqual((s.payment_number, s.receivable_number, s.counter_account_code), (p.payment_number, r.invoice_number, "1100"))
        self.assert_balanced(p.journal_entry_id)
        self.assertEqual((s.status, s.decided_by_name, s.created_by_name, s.payment_method), ("approved", "Finance Lead", "Approver", self.cash.kind))

    def test_several_payments_add_up_and_each_keeps_its_own_history(self):
        t = self.ticket(total="500")
        first = self.entry(t, amount=D("200"), reference="bKash 1")
        self.approve(first)
        second = self.entry(t, amount=D("300"), reference="Cash")
        self.approve(second)
        r = self.db.query(FinanceReceivable).one()
        self.assertEqual((r.amount_paid, r.balance, r.status), (D("500"), D("0"), "paid"))
        self.assertEqual(self.db.query(FinancePayment).count(), 2)
        self.assertEqual(self.db.query(FinanceReceivable).count(), 1)  # the RMA is invoiced once
        history = settlement_service.list_settlements(self.db, t.id)
        self.assertEqual({h.settlement_number for h in history}, {first.settlement_number, second.settlement_number})
        self.assertNotEqual(first.payment_number, second.payment_number)
        self.assertEqual((first.reference, second.reference), ("bKash 1", "Cash"))
        summary = settlement_service.summary(self.db, t)
        self.assertEqual((summary["money_in"], summary["money_out"], summary["net"], summary["outstanding"]), (D("500"), D("0"), D("500"), D("0")))

    def test_a_payment_above_what_is_owed_is_refused(self):
        t = self.ticket(total="500")
        self.approve(self.entry(t, amount=D("400")))
        s = self.entry(t, amount=D("200"))
        with self.assertRaises(HTTPException) as ctx:
            settlement_service.submit_settlement(self.db, s, actor="u")
        self.assertIn("100", ctx.exception.detail)

    def test_two_pending_entries_cannot_together_collect_more_than_is_owed(self):
        t = self.ticket(total="500")
        a, b = self.entry(t, amount=D("400")), self.entry(t, amount=D("400"))
        settlement_service.submit_settlement(self.db, a, actor="u")
        settlement_service.submit_settlement(self.db, b, actor="u")
        settlement_service.decide_settlement(self.db, a, decision="approved", reason=None, user=self.user)
        with self.assertRaises(HTTPException):  # re-checked against the receivable at approval
            settlement_service.decide_settlement(self.db, b, decision="approved", reason=None, user=self.user)
        self.assertEqual((self.db.query(FinancePayment).count(), b.status), (1, "pending_approval"))

    def test_the_rmas_charges_can_only_be_collected_from_its_own_customer(self):
        t = self.ticket(total="500")
        s = self.entry(t, party_id="cust-2")
        with self.assertRaises(HTTPException) as ctx:
            settlement_service.submit_settlement(self.db, s, actor="u")
        self.assertIn("customer", ctx.exception.detail)

    # --------------------------------------------------------- refunds

    def test_a_refund_to_the_customer_is_money_out_against_sales_returns_not_an_expense(self):
        t = self.ticket(total="0")
        s = self.entry(t, direction="out", purpose="refund_settlement", amount=D("700"), purpose_note="Unit could not be repaired")
        self.approve(s)
        p = self.db.query(FinancePayment).one()
        self.assertEqual((p.direction, p.amount, s.counter_account_code), ("outbound", D("700"), "4200"))
        lines = self.lines(p.journal_entry_id)
        self.assertEqual((lines["4200"][0], lines["4200"][1]), (D("700"), D("0")))  # Dr Sales Returns
        self.assertNotIn("6000", lines)
        self.assert_balanced(p.journal_entry_id)
        self.assertEqual(self.db.query(FinanceReceivable).count(), 0)  # a refund creates no invoice

    def test_a_refund_back_from_a_supplier_reduces_what_we_owe_them(self):
        t = self.ticket(total="0")
        s = self.entry(t, party_type="supplier", party_id="sup-1", purpose="refund_settlement", amount=D("900"), purpose_note="Supplier credited the faulty unit")
        self.approve(s)
        p = self.db.query(FinancePayment).one()
        lines = self.lines(p.journal_entry_id)
        self.assertEqual((p.direction, s.counter_account_code), ("inbound", "2100"))
        self.assertEqual((lines["2100"][1], lines["2100"][2], lines["2100"][3]), (D("900"), "supplier", "sup-1"))
        self.assert_balanced(p.journal_entry_id)

    def test_a_customer_paying_back_a_refund_settles_receivables_not_income(self):
        t = self.ticket(total="0")
        s = self.entry(t, purpose="refund_settlement", amount=D("150"), purpose_note="Customer returned the over-refund")
        self.approve(s)
        p = self.db.query(FinancePayment).one()
        lines = self.lines(p.journal_entry_id)
        self.assertEqual((s.counter_account_code, lines["1100"][1], lines["1100"][2]), ("1100", D("150"), "customer"))
        self.assertNotIn("4100", lines)

    # ------------------------------------ compensation / price difference

    def test_damage_compensation_in_is_other_income_and_out_is_an_operating_cost(self):
        t = self.ticket(total="0")
        money_in = self.entry(t, purpose="damage_compensation", amount=D("250"), purpose_note="Customer damaged the fan")
        self.approve(money_in)
        money_out = self.entry(t, direction="out", purpose="damage_compensation", amount=D("120"), purpose_note="We damaged the case in repair")
        self.approve(money_out)
        self.assertEqual((money_in.counter_account_code, money_out.counter_account_code), ("4100", "6000"))
        self.assertEqual(self.db.query(FinanceReceivable).count(), 0)
        for s in (money_in, money_out):
            self.assert_balanced(s.journal_entry_id)

    def test_a_replacement_price_difference_follows_the_party(self):
        t = self.ticket(total="0")
        paid_by_customer = self.entry(t, purpose="replacement_price_difference", amount=D("300"), purpose_note="Upgraded replacement model")
        paid_to_dealer = self.entry(t, party_type="dealer", party_id="dealer-1", direction="out", purpose="replacement_price_difference", amount=D("80"), purpose_note="Dealer cheaper model difference")
        for s in (paid_by_customer, paid_to_dealer):
            self.approve(s)
        self.assertEqual((paid_by_customer.counter_account_code, paid_to_dealer.counter_account_code), ("4000", "4200"))
        dealer_payment = self.db.get(FinancePayment, paid_to_dealer.payment_id)
        self.assertEqual((dealer_payment.party_type, dealer_payment.party_id), ("vendor", "dealer-1"))

    def test_the_other_party_can_be_a_named_person_without_a_ledger(self):
        t = self.ticket(total="0")
        s = self.entry(t, party_type="other", party_id=None, party_name="Courier Boy", direction="out", purpose="other", amount=D("60"), purpose_note="Paid the courier to bring the unit back from the customer")
        self.approve(s)
        p = self.db.get(FinancePayment, s.payment_id)
        self.assertEqual((s.party_name, p.party_type, p.party_id, s.counter_account_code), ("Courier Boy", "other", None, "6000"))

    # ------------------------------------------------- zero-charge RMA

    def test_a_zero_charge_rma_creates_no_receipt_or_journal(self):
        t = self.ticket(total="0")
        s = self.entry(t, amount=D("100"))  # parts / service charge on an RMA with no charges
        with self.assertRaises(HTTPException) as ctx:
            settlement_service.submit_settlement(self.db, s, actor="u")
        self.assertIn("no charges", ctx.exception.detail)
        zero = self.entry(t, amount=D("0"), purpose="damage_compensation")
        with self.assertRaises(HTTPException):
            settlement_service.submit_settlement(self.db, zero, actor="u")
        self.assertEqual(self.counts(), (0, 0, 0))

    # ------------------------------------------------------- validation

    def test_the_purpose_note_is_required_and_other_needs_a_detailed_one(self):
        t = self.ticket()
        s = self.entry(t, purpose_note="")
        with self.assertRaises(HTTPException) as ctx:
            settlement_service.submit_settlement(self.db, s, actor="u")
        self.assertIn("Purpose details", ctx.exception.detail)
        other = self.entry(t, direction="out", purpose="other", amount=D("10"), purpose_note="misc", party_type="other", party_id=None, party_name="Shop")
        with self.assertRaises(HTTPException) as ctx2:
            settlement_service.submit_settlement(self.db, other, actor="u")
        self.assertIn("20", ctx2.exception.detail)

    def test_the_party_must_hold_the_chosen_role(self):
        t = self.ticket()
        with self.assertRaises(HTTPException):
            self.entry(t, party_type="supplier", party_id="cust-1", purpose="other")  # a customer is not a supplier
        with self.assertRaises(HTTPException):
            self.entry(t, party_type="dealer", party_id="sup-1", purpose="other")
        with self.assertRaises(HTTPException):
            self.entry(t, party_type="customer", party_id="ghost")
        with self.assertRaises(HTTPException):
            self.entry(t, party_type="other", party_id=None, party_name=" ")

    def test_a_refund_to_an_other_party_is_refused(self):
        t = self.ticket(total="0")
        s = self.entry(t, party_type="other", party_id="misc-1", direction="out", purpose="refund_settlement", amount=D("50"), purpose_note="Refund to someone off the books")
        with self.assertRaises(HTTPException):
            settlement_service.submit_settlement(self.db, s, actor="u")

    def test_a_settlement_is_possible_after_the_rma_is_closed_but_not_before_it_is_approved(self):
        closed = self.ticket(total="500", status="closed")
        self.approve(self.entry(closed))  # payment after delivery
        self.assertEqual(self.db.query(FinancePayment).count(), 1)
        draft = self.ticket(status="draft")
        with self.assertRaises(HTTPException):
            self.entry(draft)

    # ---------------------------------------------------- exactly once

    def test_approving_twice_cannot_post_twice(self):
        t = self.ticket(total="500")
        s = self.entry(t)
        self.approve(s)
        before = self.counts()
        with self.assertRaises(HTTPException):
            settlement_service.decide_settlement(self.db, s, decision="approved", reason=None, user=self.user)
        self.assertEqual(self.counts(), before)
        self.assertEqual(self.db.query(FinanceReceivable).one().amount_paid, D("500"))

    def test_a_retry_of_the_posting_returns_the_payment_already_made(self):
        t = self.ticket(total="0")
        s = self.entry(t, purpose="damage_compensation", amount=D("250"), purpose_note="Customer damaged the fan")
        self.approve(s)
        again, entry = self.fin.post_party_payment(
            company_id=CO, direction="inbound", amount=D("250"), payment_account_id=self.cash.id, payment_date=date.today(),
            source_type="rma_settlement", source_id=s.id, counter_code="4100", description="retry",
        )
        self.assertEqual((again.id, entry.id), (s.payment_id, s.journal_entry_id))
        self.assertEqual(self.counts(), (1, 1, 0))
        with self.assertRaises(HTTPException):  # and the settlement itself refuses a second posting
            settlement_service._post(self.db, s, t, user=self.user)

    def test_an_approved_entry_cannot_be_cancelled_or_edited_a_draft_can(self):
        t = self.ticket(total="500")
        s = self.entry(t)
        self.approve(s)
        with self.assertRaises(HTTPException):
            settlement_service.cancel_settlement(self.db, s, actor="u", reason="x")
        with self.assertRaises(HTTPException):
            settlement_service.update_settlement(self.db, s, {"amount": D("1")})
        draft = self.entry(self.ticket())
        settlement_service.update_settlement(self.db, draft, {"amount": D("120"), "reference": "R-9"})
        self.assertEqual((draft.amount, draft.reference), (D("120.00"), "R-9"))
        settlement_service.cancel_settlement(self.db, draft, actor="u", reason="typo")
        self.assertEqual(draft.status, "cancelled")

    # ------------------------------------------ separate from the product

    def test_a_settlement_never_moves_stock_or_changes_the_rma(self):
        t = self.ticket(total="500")
        self.approve(self.entry(t))
        self.assertEqual((t.status, t.custody_state), ("in_repair", "in_rma_store"))
        self.assertEqual(self.db.query(RmaStockEvent).count(), 0)

    # ------------------------------------------------------ permissions

    def test_the_routes_need_the_settlement_permissions(self):
        from app.routers import rma_settlements as router

        t = self.ticket(total="500")
        s = self.entry(t)
        settlement_service.submit_settlement(self.db, s, actor="u")
        with patch.object(router.rbac, "has_permission", return_value=False):
            for call in (
                lambda: router.decide_settlement(s.id, SimpleNamespace(decision="approved", reason=None), self.db, self.user, CO),
                lambda: router.create_settlement(t.id, SimpleNamespace(model_dump=lambda **k: {}), self.db, self.user, CO),
                lambda: router.submit_settlement(s.id, self.db, self.user, CO),
                lambda: router.cancel_settlement(s.id, SimpleNamespace(reason=None), self.db, self.user, CO),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    call()
                self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual((s.status, self.counts()), ("pending_approval", (0, 0, 0)))

    def test_the_approval_limit_applies_to_settlements(self):
        from app.routers import rma_settlements as router

        t = self.ticket(total="500")
        s = self.entry(t)
        settlement_service.submit_settlement(self.db, s, actor="u")
        with patch.object(router.rbac, "has_permission", return_value=True), patch(
            "app.services.core.approval_service.effective_limit", return_value=D("100")
        ), patch("app.services.core.approval_service._role_slugs", return_value=["finance"]):
            with self.assertRaises(HTTPException) as ctx:
                router.decide_settlement(s.id, SimpleNamespace(decision="approved", reason=None), self.db, self.user, CO)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual((s.status, self.counts()), ("pending_approval", (0, 0, 0)))

    # ---------------------------------------------------------- summary

    def test_the_history_carries_what_the_list_needs(self):
        t = self.ticket(total="500")
        s = self.entry(t, reference="TX-1")
        self.approve(s)
        row = settlement_service.list_settlements(self.db, t.id)[0]
        for attr in ("transaction_date", "party_name", "direction", "amount", "purpose", "purpose_note", "status", "payment_number", "journal_number", "receivable_number"):
            self.assertIsNotNone(getattr(row, attr), attr)
        actions = {a.action for a in self.db.query(CollabActivity).filter_by(entity_id=t.id)}
        self.assertTrue({"settlement_created", "settlement_submitted", "settlement_approved", "settlement_posted"} <= actions)
        total_payments = self.db.query(func.count(FinancePayment.id)).scalar()
        self.assertEqual(total_payments, 1)

    # ---------------------------------------------------------- reversal

    def reverse(self, original, reason="Entered twice by mistake"):
        return settlement_service.reverse_settlement(self.db, original, reason=reason, user=self.user)

    def net_by_account(self):
        out = {}
        for row in self.db.query(FinanceJournalLine).all():
            code = self.db.get(FinanceAccount, row.account_id).code
            out[code] = out.get(code, D("0")) + row.debit - row.credit
        return {k: v for k, v in out.items() if v != 0}

    def test_an_approved_settlement_is_reversed_by_a_linked_mirror_that_nets_to_zero(self):
        t = self.ticket(total="0")
        original = self.entry(t, purpose="damage_compensation", amount=D("250"), purpose_note="Customer damaged the fan")
        self.approve(original)
        self.assertNotEqual(self.net_by_account(), {})
        r = self.reverse(original)
        self.assertEqual((r.status, r.direction, r.amount, r.reverses_id, r.reference), ("draft", "out", D("250.00"), original.id, original.settlement_number))
        self.assertIn(original.settlement_number, r.purpose_note)
        self.assertEqual(self.db.query(FinancePayment).count(), 1)  # a draft reversal posts nothing
        self.approve(r)
        self.assertEqual(self.net_by_account(), {})  # every account is back to where it was
        self.assertEqual(self.db.query(FinancePayment).count(), 2)
        payments = {p.direction: p for p in self.db.query(FinancePayment).all()}
        self.assertEqual((payments["inbound"].amount, payments["outbound"].amount, payments["outbound"].payment_account_id), (D("250"), D("250"), self.cash.id))
        self.assert_balanced(r.journal_entry_id)
        self.assertEqual((original.reversed_by_id, original.status), (r.id, "approved"))  # the original is never edited
        self.assertEqual((r.journal_number is not None, r.payment_number is not None), (True, True))
        summary = settlement_service.summary(self.db, t)
        self.assertEqual((summary["money_in"], summary["money_out"], summary["net"]), (D("250"), D("250"), D("0")))

    def test_reversing_a_payment_on_the_rma_invoice_puts_the_amount_back_on_the_invoice(self):
        t = self.ticket(total="500")
        first, second = self.entry(t, amount=D("200")), self.entry(t, amount=D("300"))
        self.approve(first)
        self.approve(second)
        receivable = self.db.query(FinanceReceivable).one()
        self.assertEqual((receivable.status, t.bill_status), ("paid", "paid"))
        r = self.reverse(second)
        self.approve(r)
        self.assertEqual((receivable.status, receivable.amount_paid, receivable.balance, t.bill_status), ("partial", D("200"), D("300"), "billed"))
        self.assertEqual(r.receivable_number, receivable.invoice_number)
        self.approve(self.reverse(first))
        self.assertEqual((receivable.status, receivable.amount_paid, receivable.balance), ("open", D("0"), D("500")))
        self.assertEqual(self.net_by_account().get("1000", D("0")), D("0"))  # no cash left from either payment

    def test_a_reversal_needs_a_reason_an_approved_original_and_is_one_per_settlement(self):
        t = self.ticket(total="0")
        draft = self.entry(t, purpose="damage_compensation", amount=D("50"), purpose_note="Customer damaged the fan")
        with self.assertRaises(HTTPException):
            self.reverse(draft)  # not approved yet
        self.approve(draft)
        with self.assertRaises(HTTPException) as no_reason:
            self.reverse(draft, reason=" ")
        self.assertIn("why", no_reason.exception.detail)
        r = self.reverse(draft)
        with self.assertRaises(HTTPException) as again:
            self.reverse(draft)
        self.assertEqual(again.exception.status_code, 409)
        self.approve(r)
        with self.assertRaises(HTTPException):
            self.reverse(r)  # a reversal is not reversed; record a new settlement instead
        # a rejected reversal frees the original for another try
        other = self.entry(t, purpose="damage_compensation", amount=D("60"), purpose_note="Customer damaged the fan")
        self.approve(other)
        r2 = self.reverse(other)
        settlement_service.submit_settlement(self.db, r2, actor="u")
        settlement_service.decide_settlement(self.db, r2, decision="rejected", reason="Not agreed", user=self.user)
        self.assertEqual((other.reversed_by_id, self.reverse(other).status), (None, "draft"))

    def test_a_reversal_mirrors_the_original_so_only_the_explanation_date_and_reference_change(self):
        t = self.ticket(total="0")
        original = self.entry(t, purpose="damage_compensation", amount=D("80"), purpose_note="Customer damaged the fan")
        self.approve(original)
        r = self.reverse(original)
        for field, value in (("amount", D("10")), ("direction", "in"), ("purpose", "other"), ("party_id", "cust-2"), ("payment_account_id", "x")):
            with self.assertRaises(HTTPException):
                settlement_service.update_settlement(self.db, r, {field: value})
        settlement_service.update_settlement(self.db, r, {"purpose_note": "Reversal of the wrong entry", "reference": "R-1"})
        self.assertEqual((r.reference, r.amount, r.direction), ("R-1", D("80.00"), "out"))

    def test_approving_a_reversal_twice_cannot_post_twice(self):
        t = self.ticket(total="0")
        original = self.entry(t, purpose="damage_compensation", amount=D("80"), purpose_note="Customer damaged the fan")
        self.approve(original)
        r = self.reverse(original)
        self.approve(r)
        before = self.counts()
        with self.assertRaises(HTTPException):
            settlement_service.decide_settlement(self.db, r, decision="approved", reason=None, user=self.user)
        self.assertEqual(self.counts(), before)

    def test_the_reverse_route_needs_the_payment_grant(self):
        from app.routers import rma_settlements as router

        with patch.object(router.rbac, "has_permission", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                router.reverse_settlement("x", SimpleNamespace(reason="r"), self.db, self.user, CO)
        self.assertEqual(ctx.exception.status_code, 403)

    # ----------------------------------------------- cancelling the RMA

    def test_cancelling_an_rma_voids_its_unpaid_invoice_with_a_mirror_journal(self):
        t = self.ticket(total="500")
        rma_service.raise_bill(self.db, t)
        receivable = self.db.query(FinanceReceivable).one()
        self.assertEqual((receivable.status, receivable.balance), ("open", D("500")))
        self.assertEqual(self.net_by_account().get("1100"), D("500"))
        rma_service.change_status(self.db, t, "cancelled", actor="u", note="Customer took it back")
        self.assertEqual((t.status, receivable.status, receivable.balance, receivable.amount), ("cancelled", "void", D("0"), D("0")))
        self.assertEqual((t.bill_status, t.is_billable), ("not_billed", False))
        self.assertEqual(self.net_by_account(), {})  # the invoice and its voiding cancel out
        self.assertEqual(self.db.query(FinanceJournalEntry).filter_by(source_type="receivable_void").count(), 1)

    def test_an_rma_with_payments_on_its_invoice_cannot_be_cancelled_until_they_are_reversed(self):
        t = self.ticket(total="500")
        s = self.entry(t, amount=D("500"))
        self.approve(s)
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, t, "cancelled", actor="u")
        self.assertIn("Reverse those settlements", ctx.exception.detail)
        self.assertEqual(t.status, "in_repair")
        self.approve(self.reverse(s))
        rma_service.change_status(self.db, t, "cancelled", actor="u")
        receivable = self.db.query(FinanceReceivable).one()
        self.assertEqual((t.status, receivable.status), ("cancelled", "void"))
        self.assertEqual(self.net_by_account(), {})  # invoice, payment, reversal and void: nothing left on the books

    def test_cancelling_an_rma_without_an_invoice_touches_no_finance_record(self):
        t = self.ticket(total="0")
        rma_service.change_status(self.db, t, "cancelled", actor="u")
        self.assertEqual((t.status, self.counts()), ("cancelled", (0, 0, 0)))

