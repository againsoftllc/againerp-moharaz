"""Credit control at sale: sales lock, cash-only customers, credit limit and conditional limit — in-memory SQLite."""

from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.crm  # noqa: F401
import app.models.inventory_warehouse  # noqa: F401
from app.database import Base
from app.models.commerce_customer import CommerceCustomer
from app.models.finance import FinancePayment, FinanceReceivable
from app.models.sales import SalesOrder
from app.services.customer.credit_control import check_order_confirm, check_sale, credit_position, effective_limit

D = Decimal
CO = "default"


class CreditControlTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            engine, tables=[CommerceCustomer.__table__, FinanceReceivable.__table__, FinancePayment.__table__, SalesOrder.__table__]
        )
        self.db: Session = sessionmaker(bind=engine)()
        self.customer = CommerceCustomer(
            id="c1", company_id=CO, party_id="p1", customer_code="C-1", name="Rahim", customer_since=date.today(),
            credit_limit=D("1000"),
        )
        self.db.add(self.customer)
        self.db.add(
            FinanceReceivable(
                company_id=CO, customer_id="c1", source_type="manual", source_id="i1", invoice_number="INV-1",
                amount=D("700"), balance=D("700"),
            )
        )
        self.db.flush()

    def tearDown(self):
        self.db.close()

    def _order(self, total, paid=0, status="draft", oid="o1"):
        notes = f"<!--againerp:payment-->{json.dumps({'paid': paid})}<!--/againerp:payment-->" if paid else None
        order = SalesOrder(
            id=oid, company_id=CO, order_number=f"SO-{oid}", customer_id="c1", warehouse_id="w1", status=status,
            total=D(str(total)), notes=notes,
            order_date=date.today(),
        )
        self.db.add(order)
        self.db.flush()
        return order

    def test_within_and_over_the_limit(self):
        check_order_confirm(self.db, self._order(300))  # 700 + 300 = 1000, exactly the limit
        with self.assertRaises(HTTPException) as caught:
            check_order_confirm(self.db, self._order(301, oid="o2"))
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("Over the credit limit", caught.exception.detail)

    def test_paid_part_does_not_count_and_open_orders_do(self):
        check_order_confirm(self.db, self._order(800, paid=500))  # only 300 is due
        self._order(200, status="confirmed", oid="open")  # confirmed, not invoiced yet
        self.assertEqual(credit_position(self.db, self.customer).unsettled_orders, D("200.00"))
        with self.assertRaises(HTTPException):
            check_order_confirm(self.db, self._order(150, oid="o3"))  # 700 + 200 + 150 > 1000

    def test_conditional_limit_until_valid_till(self):
        self.customer.conditional_limit = D("2000")
        self.customer.conditional_valid_till = date.today() + timedelta(days=3)
        self.assertEqual(effective_limit(self.customer), D("2000.00"))
        check_order_confirm(self.db, self._order(1200))
        self.customer.conditional_valid_till = date.today() - timedelta(days=1)
        self.assertEqual(effective_limit(self.customer), D("1000.00"))

    def test_no_limit_means_no_check(self):
        self.customer.credit_limit = D("0")
        check_order_confirm(self.db, self._order(99999))

    def test_locked_customer_cannot_buy_even_at_the_counter(self):
        self.customer.sales_locked = True
        self.customer.sales_lock_reason = "Cheque bounced twice"
        with self.assertRaises(HTTPException) as caught:
            check_order_confirm(self.db, self._order(10), paid_at_counter=True)
        self.assertIn("Cheque bounced twice", caught.exception.detail)

    def test_cash_only_customer_must_pay_first(self):
        self.customer.trade_mode = "cash"
        with self.assertRaises(HTTPException) as caught:
            check_order_confirm(self.db, self._order(100, paid=40))
        self.assertIn("cash only", caught.exception.detail)
        check_order_confirm(self.db, self._order(100, paid=100, oid="o2"))
        check_order_confirm(self.db, self._order(100, oid="o3"), paid_at_counter=True)  # POS: paid at the counter
        check_sale(self.db, None, D("5"))  # no customer, nothing to check
