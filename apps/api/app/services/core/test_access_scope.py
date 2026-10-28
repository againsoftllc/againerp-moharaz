"""Access beyond roles: company modules, user overrides, cash / bank accounts, warehouses — in-memory SQLite."""

from __future__ import annotations

import json
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.commerce_customer  # noqa: F401
import app.models.crm  # noqa: F401 — FK targets must exist in metadata (tables are not created)
from app.database import Base
from app.models.auth_role import AuthRole
from app.models.auth_role_permission import AuthRolePermission
from app.models.auth_user import AuthUser
from app.models.auth_user_access import AuthUserPaymentAccount, AuthUserPermission
from app.models.auth_user_role import AuthUserRole
from app.models.auth_user_warehouse import AuthUserWarehouse
from app.models.company import Company
from app.models.finance import FinanceAccount, FinancePaymentAccount
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.sales import SalesOrder
from app.services import rbac
from app.services.core import access_scope as scope

CO = "default"


class AccessScopeTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            engine,
            tables=[
                Company.__table__, AuthUser.__table__, AuthRole.__table__, AuthRolePermission.__table__, AuthUserRole.__table__,
                AuthUserPermission.__table__, AuthUserPaymentAccount.__table__, AuthUserWarehouse.__table__,
                InventoryWarehouse.__table__, FinanceAccount.__table__, FinancePaymentAccount.__table__,
            ],
        )
        self.engine = engine
        self.db: Session = sessionmaker(bind=engine)()
        self.company = Company(id=CO, slug="co", name="Co")
        self.user = AuthUser(company_id=CO, email="s@x.test", username="s", name="S", password_hash="x", role="staff")
        self.role = AuthRole(company_id=CO, name="Clerk", slug="clerk")
        self.db.add_all([self.company, self.user, self.role])
        self.db.flush()
        self.db.add(AuthUserRole(user_id=self.user.id, role_id=self.role.id))
        self.db.add(AuthRolePermission(role_id=self.role.id, module="sales", can_read=True, can_create=True))
        self.db.add(AuthRolePermission(role_id=self.role.id, module="finance", can_read=True))
        self.db.flush()

    def tearDown(self):
        self.db.close()

    def test_roles_only(self):
        self.assertTrue(rbac.has_permission(self.db, self.user, "sales", "create"))
        self.assertFalse(rbac.has_permission(self.db, self.user, "finance", "write"))

    def test_user_overrides_allow_and_deny(self):
        scope.set_user_overrides(self.db, self.user, [("finance", "write", True), ("sales", "create", False)])
        self.assertTrue(rbac.has_permission(self.db, self.user, "finance", "write"))
        self.assertFalse(rbac.has_permission(self.db, self.user, "sales", "create"))
        self.assertTrue(rbac.has_permission(self.db, self.user, "sales", "read"))  # untouched
        with self.assertRaises(HTTPException):
            scope.set_user_overrides(self.db, self.user, [("nonsense", "read", True)])

    def test_company_without_a_module_gives_nobody_it(self):
        self.company.enabled_modules = json.dumps(["sales"])
        self.db.flush()
        self.assertTrue(rbac.has_permission(self.db, self.user, "sales", "read"))
        self.assertFalse(rbac.has_permission(self.db, self.user, "finance", "read"))
        scope.set_user_overrides(self.db, self.user, [("finance", "read", True)])
        self.assertFalse(rbac.has_permission(self.db, self.user, "finance", "read"))  # an override cannot add a module
        self.assertTrue(scope.module_enabled({"rma"}, "rma_approve"))
        self.assertTrue(scope.module_enabled(set(), "workspace"))

    def test_payment_accounts(self):
        gl = FinanceAccount(company_id=CO, code="1000", name="Cash", account_type="asset")
        self.db.add(gl)
        self.db.flush()
        cash = FinancePaymentAccount(company_id=CO, name="Cash", kind="cash", gl_account_id=gl.id)
        bank = FinancePaymentAccount(company_id=CO, name="Bank", kind="bank", gl_account_id=gl.id)
        self.db.add_all([cash, bank])
        self.db.flush()
        self.assertEqual(scope.pick_payment_account(self.db, self.user, None), None)  # not limited
        scope.set_user_payment_accounts(self.db, self.user, [bank.id])
        self.assertEqual(scope.pick_payment_account(self.db, self.user, None), bank.id)
        self.assertEqual(scope.pick_payment_account(self.db, self.user, bank.id), bank.id)
        with self.assertRaises(HTTPException) as caught:
            scope.pick_payment_account(self.db, self.user, cash.id)
        self.assertEqual(caught.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            scope.set_user_payment_accounts(self.db, self.user, ["no-such-account"])

    def test_held_calls_keep_the_makers_limits(self):
        gl = FinanceAccount(company_id=CO, code="1000", name="Cash", account_type="asset")
        self.db.add(gl)
        self.db.flush()
        cash = FinancePaymentAccount(company_id=CO, name="Cash", kind="cash", gl_account_id=gl.id)
        bank = FinancePaymentAccount(company_id=CO, name="Bank", kind="bank", gl_account_id=gl.id)
        self.db.add_all([cash, bank])
        self.db.flush()
        scope.set_user_payment_accounts(self.db, self.user, [bank.id])
        body = scope.scope_held_call(self.db, self.user, "finance.collection", {"customer_id": "c1"}, {"amount": 10})
        self.assertEqual(body["payment_account_id"], bank.id)  # the approver replays it through the maker's account
        with self.assertRaises(HTTPException):
            scope.scope_held_call(self.db, self.user, "finance.payment", {}, {"amount": 10, "payment_account_id": cash.id})
        with self.assertRaises(HTTPException):
            scope.scope_held_call(self.db, self.user, "finance.voucher", {}, {"from_account_id": cash.id, "to_account_id": bank.id})
        self.assertEqual(scope.scope_held_call(self.db, self.user, "sales.invoice", {}, {"x": 1}), {"x": 1})

    def test_warehouses(self):
        a = InventoryWarehouse(company_id=CO, code="A", name="A")
        b = InventoryWarehouse(company_id=CO, code="B", name="B")
        self.db.add_all([a, b])
        self.db.flush()
        scope.assert_warehouse_access(self.db, self.user, b.id)  # not limited
        self.db.add(AuthUserWarehouse(user_id=self.user.id, warehouse_id=a.id, is_default=True))
        self.db.flush()
        scope.assert_warehouse_access(self.db, self.user, a.id, None)
        with self.assertRaises(HTTPException):
            scope.assert_warehouse_access(self.db, self.user, b.id)

    def test_warehouse_scope_lists_and_held_documents(self):
        from datetime import date

        SalesOrder.__table__.create(bind=self.engine)
        a = InventoryWarehouse(company_id=CO, code="A", name="A")
        b = InventoryWarehouse(company_id=CO, code="B", name="B")
        self.db.add_all([a, b])
        self.db.flush()
        self.assertIsNone(scope.warehouse_scope(self.db, self.user))  # not limited
        self.db.add(AuthUserWarehouse(user_id=self.user.id, warehouse_id=a.id, is_default=True))
        self.db.flush()
        self.assertEqual(scope.warehouse_scope(self.db, self.user), [a.id])
        orders = [
            SalesOrder(id=f"o-{w.code}", company_id=CO, order_number=f"SO-{w.code}", customer_id="c1", warehouse_id=w.id,
                       status="draft", order_date=date.today())
            for w in (a, b)
        ]
        self.db.add_all(orders)
        self.db.flush()
        listed = scope.scope_query(self.db.query(SalesOrder), SalesOrder.warehouse_id, [a.id]).all()
        self.assertEqual([o.id for o in listed], ["o-A"])
        # an approver replays a held call as themselves: the maker's own warehouses are checked when it is held
        scope.scope_held_call(self.db, self.user, "sales.sales_order", {"order_id": "o-A"}, {})
        with self.assertRaises(HTTPException):
            scope.scope_held_call(self.db, self.user, "sales.sales_order", {"order_id": "o-B"}, {})
        with self.assertRaises(HTTPException):
            scope.scope_held_call(self.db, self.user, "sales.sales_order_bulk", {}, {"ids": ["o-A", "o-B"]})
        with self.assertRaises(HTTPException):
            scope.assert_documents_warehouse(self.db, self.user, SalesOrder, ["o-A", "o-B"], "warehouse_id")
