"""RMA Phase 5 - work queues, withdrawal guards, Service / Job Card link and the permission audit (in-memory SQLite).

What it proves: overdue / supplier-pending / repeat are read straight from the real records and never miscount (a dispatched
claim whose unit came back is not "pending"); an RMA cannot be rejected or cancelled while the unit is with the supplier or
already delivered, nor while a claim, receipt, delivery or settlement is still open; a service job can only be opened while the
unit is in the shop; and every mutating RMA endpoint is accounted for in the permission table below, so a new one cannot slip
in without a conscious decision.
"""

from __future__ import annotations

import inspect
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
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
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import FinanceAccount, FinancePaymentAccount, FinanceReceivable
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
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
from app.models.service_job import ServiceJob
from app.services.rma import complaint_service, queue_service, rma_service

CO = "default"
D = Decimal
TODAY = date(2026, 10, 20)
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaSupplierReceipt.__table__,
    RmaDelivery.__table__,
    RmaSettlement.__table__,
    RmaStatusHistory.__table__,
    RmaStockEvent.__table__,
    CollabActivity.__table__,
    InventoryWarehouse.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
    FinanceAccount.__table__,
    FinancePaymentAccount.__table__,
    FinanceReceivable.__table__,
    ServiceJob.__table__,
    CommerceSupplier.__table__,
]


class QueueTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()

    def tearDown(self) -> None:
        self.db.close()

    def ticket(self, **over) -> RmaTicket:
        data = dict(
            company_id=CO,
            rma_number=f"RMA-2026-{self.db.query(RmaTicket).count() + 1:04d}",
            customer_name="Rakibul Hasan",
            sku="SKU-1",
            product_name="Mouse",
            fault_reported="No power",
            status="in_repair",
            custody_state="in_rma_store",
            created_at=datetime(2026, 10, 1, 9, 0),
        )
        data.update(over)
        row = RmaTicket(**data)
        self.db.add(row)
        self.db.flush()
        return row

    def claim(self, ticket, status, **over) -> RmaSupplierClaim:
        n = self.db.query(RmaSupplierClaim).count() + 1
        row = RmaSupplierClaim(
            company_id=CO, rma_id=ticket.id, claim_number=f"CLM-{n:04d}", status=status, supplier_id="sup-1",
            supplier_name="Deepcool Supplier", created_at=datetime(2026, 10, 10, 9, 0),
        )
        for k, v in over.items():
            setattr(row, k, v)
        self.db.add(row)
        self.db.flush()
        return row

    # ------------------------------------------------------------ overdue

    def test_overdue_means_open_started_and_past_the_promised_date(self):
        late = self.ticket(promised_delivery_date=TODAY - timedelta(days=4))
        self.ticket(promised_delivery_date=TODAY + timedelta(days=2))  # not yet due
        self.ticket(promised_delivery_date=TODAY)  # due today is not late
        self.ticket(promised_delivery_date=TODAY - timedelta(days=9), status="closed")
        self.ticket(promised_delivery_date=TODAY - timedelta(days=9), status="delivered")
        self.ticket(promised_delivery_date=TODAY - timedelta(days=9), status="cancelled")
        self.ticket(promised_delivery_date=TODAY - timedelta(days=9), status="pending_approval")  # not started yet
        self.ticket(promised_delivery_date=None)
        rows = queue_service.overdue_rows(self.db, CO, TODAY)
        self.assertEqual([(r["rma_number"], r["days_overdue"]) for r in rows], [(late.rma_number, 4)])
        self.assertEqual(queue_service.days_overdue(late, TODAY), 4)

    def test_the_most_overdue_comes_first(self):
        a = self.ticket(promised_delivery_date=TODAY - timedelta(days=2))
        b = self.ticket(promised_delivery_date=TODAY - timedelta(days=11))
        rows = queue_service.overdue_rows(self.db, CO, TODAY)
        self.assertEqual([r["rma_number"] for r in rows], [b.rma_number, a.rma_number])

    # ---------------------------------------------------- supplier pending

    def test_each_step_of_the_supplier_leg_is_listed_with_where_it_is_stuck(self):
        waiting = self.ticket(custody_state="in_rma_store")
        self.claim(waiting, "pending_approval")
        ready = self.ticket(custody_state="in_rma_store")
        self.claim(ready, "approved", decided_at=datetime(2026, 10, 15, 9, 0))
        out = self.ticket(custody_state="with_supplier", status="at_supplier")
        self.claim(out, "dispatched", dispatched_at=datetime(2026, 10, 12, 9, 0), expected_return_date=date(2026, 10, 18))
        returned = self.ticket(custody_state="in_rma_store")
        claim = self.claim(returned, "dispatched", dispatched_at=datetime(2026, 10, 1, 9, 0))
        self.db.add(
            RmaSupplierReceipt(
                company_id=CO, rma_id=returned.id, claim_id=claim.id, receipt_number="RCV-0001", status="pending_approval",
                supplier_id="sup-1", supplier_name="Deepcool Supplier", created_at=datetime(2026, 10, 19, 9, 0),
            )
        )
        self.db.flush()
        rows = {r["rma_number"]: r for r in queue_service.supplier_pending(self.db, CO, TODAY)}
        self.assertEqual(rows[out.rma_number]["state"], "with_supplier")
        self.assertEqual((rows[out.rma_number]["days_waiting"], rows[out.rma_number]["is_late"]), (8, True))
        self.assertEqual(rows[ready.rma_number]["state"], "ready_to_dispatch")
        self.assertEqual(rows[waiting.rma_number]["state"], "claim_waiting_approval")
        self.assertEqual(rows[returned.rma_number]["state"], "receipt_waiting_approval")
        first = queue_service.supplier_pending(self.db, CO, TODAY)[0]
        self.assertEqual(first["rma_number"], out.rma_number)  # a late unit leads the list

    def test_a_dispatched_claim_whose_unit_came_back_is_not_pending(self):
        back = self.ticket(custody_state="replacement_received")
        self.claim(back, "dispatched", dispatched_at=datetime(2026, 10, 1, 9, 0))
        done = self.ticket(custody_state="delivered", status="closed")
        self.claim(done, "dispatched")
        self.assertEqual(queue_service.supplier_pending(self.db, CO, TODAY), [])
        counts = queue_service.queues(self.db, CO, TODAY)["counts"]
        self.assertEqual((counts["supplier_pending"], counts["supplier_late"]), (0, 0))

    def test_an_older_manual_supplier_job_still_counts_as_with_the_supplier(self):
        t = self.ticket(status="at_supplier", custody_state=None)
        self.db.add(RmaSupplierJob(rma_id=t.id, supplier_id="sup-1", dispatched_at=date(2026, 10, 5), expected_return_date=date(2026, 10, 10)))
        self.db.flush()
        self.db.refresh(t)
        rows = queue_service.supplier_pending(self.db, CO, TODAY)
        self.assertEqual([(r["rma_number"], r["is_late"], r["days_waiting"]) for r in rows], [(t.rma_number, True, 15)])

    # ------------------------------------------------------------- repeat

    def test_repeat_rmas_are_the_open_ones_with_earlier_history(self):
        again = self.ticket(prior_rma_count=2)
        self.ticket(prior_rma_count=0)
        self.ticket(prior_rma_count=3, status="closed")
        rows = queue_service.repeat_rows(self.db, CO)
        self.assertEqual([r["rma_number"] for r in rows], [again.rma_number])
        self.assertTrue(again.is_repeat)

    # ------------------------------------------------------- list filters

    def test_the_ticket_list_filters_by_queue(self):
        late = self.ticket(promised_delivery_date=date.today() - timedelta(days=3))
        out = self.ticket(custody_state="with_supplier", status="at_supplier")
        self.claim(out, "dispatched", dispatched_at=datetime(2026, 10, 12, 9, 0))
        rep = self.ticket(prior_rma_count=1)
        self.ticket(prior_rma_count=2, status="closed")  # finished repeats are history, not work
        manual = self.ticket(status="at_supplier", custody_state=None)  # an older manual supplier job (no claim)
        plain = self.ticket()
        for queue, expected in (("overdue", {late}), ("supplier_pending", {out, manual}), ("repeat", {rep})):
            rows, total = rma_service.list_tickets(self.db, company_id=CO, queue=queue)
            self.assertEqual(({r.id for r in rows}, total), ({t.id for t in expected}, len(expected)), queue)
        self.assertNotIn(plain.id, {r.id for r in rma_service.list_tickets(self.db, company_id=CO, queue="overdue")[0]})
        with self.assertRaises(HTTPException):
            rma_service.list_tickets(self.db, company_id=CO, queue="nonsense")

    def test_the_dashboard_counts_the_queues(self):
        self.ticket(promised_delivery_date=date.today() - timedelta(days=1))
        out = self.ticket(custody_state="with_supplier", status="at_supplier")
        self.claim(out, "dispatched", dispatched_at=datetime(2026, 10, 12, 9, 0), expected_return_date=date.today() - timedelta(days=1))
        self.ticket(prior_rma_count=1)
        dash = rma_service.dashboard(self.db, CO)
        self.assertEqual((dash["overdue_count"], dash["supplier_pending_count"], dash["supplier_late_count"], dash["repeat_count"]), (1, 1, 1, 1))

    def test_days_open_runs_to_closing_or_today(self):
        open_t = self.ticket(created_at=datetime(2026, 10, 1, 9, 0))
        closed = self.ticket(created_at=datetime(2026, 10, 1, 9, 0), closed_at=datetime(2026, 10, 4, 9, 0), status="closed")
        self.assertEqual(queue_service.days_open(closed, TODAY), 3)
        self.assertEqual(queue_service.days_open(open_t, TODAY), 19)

    # ------------------------------------------------- withdrawal guards

    def test_an_rma_with_the_supplier_or_already_delivered_cannot_be_cancelled_or_rejected(self):
        out = self.ticket(custody_state="with_supplier", status="at_supplier")
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, out, "cancelled", actor="u")
        self.assertIn("with the supplier", ctx.exception.detail)
        gone = self.ticket(custody_state="delivered", status="delivered")
        with self.assertRaises(HTTPException) as ctx2:
            rma_service.change_status(self.db, gone, "cancelled", actor="u")
        self.assertIn("already delivered", ctx2.exception.detail)
        self.assertEqual((out.status, gone.status), ("at_supplier", "delivered"))

    def test_open_documents_block_withdrawal_until_they_are_finished_or_cancelled(self):
        t = self.ticket()
        claim = self.claim(t, "pending_approval")
        self.db.add(RmaDelivery(company_id=CO, rma_id=t.id, delivery_number="DLV-2026-0001", status="draft"))
        self.db.add(RmaSettlement(company_id=CO, rma_id=t.id, settlement_number="STL-2026-0001", status="pending_approval", party_name="X"))
        self.db.flush()
        found = queue_service.open_documents(self.db, t)
        self.assertEqual(len(found), 3)
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, t, "cancelled", actor="u")
        for number in (claim.claim_number, "DLV-2026-0001", "STL-2026-0001"):
            self.assertIn(number, ctx.exception.detail)
        self.assertEqual(t.status, "in_repair")
        claim.status = "cancelled"
        self.db.query(RmaDelivery).update({"status": "cancelled"})
        self.db.query(RmaSettlement).update({"status": "rejected"})
        self.db.flush()
        rma_service.change_status(self.db, t, "cancelled", actor="u", note="Customer took it back")
        self.assertEqual(t.status, "cancelled")

    def test_finished_documents_do_not_block_and_a_dispatched_claim_is_history(self):
        t = self.ticket(custody_state=None)
        self.claim(t, "dispatched")
        self.db.add(RmaDelivery(company_id=CO, rma_id=t.id, delivery_number="DLV-2026-0002", status="approved"))
        self.db.flush()
        self.assertEqual(queue_service.open_documents(self.db, t), [])

    # ----------------------------------------------------------- job card

    def test_a_service_job_cannot_be_opened_while_the_unit_is_away_or_the_rma_is_finished(self):
        for status, custody in (("at_supplier", "with_supplier"), ("delivered", "delivered"), ("closed", "delivered"), ("cancelled", None)):
            t = self.ticket(status=status, custody_state=custody, customer_name="Rakibul Hasan")
            with self.assertRaises(HTTPException) as ctx:
                rma_service.create_service_from_rma(self.db, t, actor="u")
            self.assertEqual(ctx.exception.status_code, 400, status)
        linked = self.ticket(service_job_id="job-1")
        with self.assertRaises(HTTPException) as ctx2:
            rma_service.create_service_from_rma(self.db, linked, actor="u")
        self.assertEqual(ctx2.exception.status_code, 409)

    def test_the_job_card_summary_shows_where_the_repair_stands(self):
        t = self.ticket()
        self.assertIsNone(queue_service.service_job_summary(self.db, t))
        self.db.add(
            ServiceJob(
                id="job-1", company_id=CO, job_number="JOB-2026-0001", status="in_progress", service_type="warranty_repair", rma_id=t.id,
                customer_name="Rakibul Hasan", sku="SKU-1", product_name="Mouse", issue="No power",
            )
        )
        self.db.flush()
        t.service_job_id = "job-1"
        summary = queue_service.service_job_summary(self.db, t)
        self.assertEqual((summary["job_number"], summary["status"], summary["service_type"]), ("JOB-2026-0001", "in_progress", "warranty_repair"))


class TraceTests(TestCase):
    """Checklist: serial found / not found, and a missing supplier trace (the lookup behind the intake drawer)."""

    setUp = QueueTests.setUp
    tearDown = QueueTests.tearDown
    ticket = QueueTests.ticket

    def test_serial_not_found_or_blank_has_no_trace(self):
        self.assertEqual(complaint_service.trace_purchase(self.db, "NOPE-1", CO)["source"], "none")
        self.assertEqual(complaint_service.trace_purchase(self.db, "  ", CO)["source"], "none")
        self.assertEqual(complaint_service.trace_purchase(self.db, None, CO)["source"], "none")

    def test_a_serial_with_a_known_supplier_is_traced_and_one_without_is_not(self):
        self.db.add(CommerceSupplier(id="sup-1", company_id=CO, party_id="sup-1", vendor_code="V-1", name="Deepcool Supplier"))
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-T1", sku="SKU-1", product_name="Mouse", status="sold", supplier_id="sup-1"))
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-T2", sku="SKU-1", product_name="Mouse", status="sold", source_type="manual"))
        self.db.flush()
        traced = complaint_service.trace_purchase(self.db, "SN-T1", CO)
        self.assertEqual((traced["source"], traced["supplier_id"], traced["supplier_name"]), ("traced", "sup-1", "Deepcool Supplier"))
        untraced = complaint_service.trace_purchase(self.db, "SN-T2", CO)
        self.assertEqual((untraced["source"], untraced["supplier_id"]), ("none", None))
        t = self.ticket()
        complaint_service.apply_trace(t, untraced)
        self.assertIsNone(t.supplier_id)  # nothing is guessed: a missing trace needs an authorized manual choice
        complaint_service.apply_trace(t, traced)
        self.assertEqual((t.supplier_id, t.supplier_source), ("sup-1", "traced"))


# ------------------------------------------------------------ permission audit

# Every mutating RMA endpoint, the base grant it needs, and the privileged RMA grant (if any) the handler also checks.
# `rma` base grants: create / write / delete. Privileged grants are separate RBAC modules, off for everyone but System Manager.
EXPECTED = {
    # tickets
    ("POST", "/rma/tickets"): ("create", ["rma_override"]),  # a lookup exception / hand-picked supplier needs the override grant
    ("POST", "/rma/serials/generate"): ("create", []),  # only hands out unused serial numbers; nothing is saved
    ("PATCH", "/rma/tickets/{ticket_id}"): ("write", ["rma_override"]),  # protected fields (supplier, serial, customer ...) with a reason
    ("POST", "/rma/tickets/{ticket_id}/submit"): ("write", []),
    ("POST", "/rma/tickets/{ticket_id}/decision"): ("write", ["rma_approve"]),
    ("POST", "/rma/tickets/{ticket_id}/receipt-print"): ("read", ["rma_reprint"]),  # first print free; a reprint needs the grant
    ("POST", "/rma/tickets/{ticket_id}/status"): ("write", []),  # guarded by the transition map and the held-unit rules
    ("POST", "/rma/tickets/{ticket_id}/warranty"): ("write", ["rma_override"]),
    ("POST", "/rma/tickets/{ticket_id}/warranty/recheck"): ("write", []),  # re-runs the lookup, changes nothing by hand
    ("POST", "/rma/tickets/{ticket_id}/charges"): ("write", []),
    ("DELETE", "/rma/tickets/{ticket_id}/charges/{charge_id}"): ("write", []),
    ("PUT", "/rma/tickets/{ticket_id}/supplier-job"): ("write", ["rma_override"]),
    ("POST", "/rma/tickets/{ticket_id}/bill"): ("write", ["rma_payment"]),
    ("DELETE", "/rma/tickets/{ticket_id}"): ("delete", []),  # cancel: guarded (no cancel while away / delivered / documents open)
    ("POST", "/rma/tickets/{ticket_id}/resolve"): ("write", []),
    ("POST", "/rma/tickets/{ticket_id}/create-service"): ("write", []),
    ("POST", "/rma/tickets/{ticket_id}/refund"): ("write", ["rma_payment"]),
    ("POST", "/rma/tickets/{ticket_id}/replacement"): ("write", ["rma_stock_adjust"]),
    ("POST", "/rma/tickets/{ticket_id}/release-stock"): ("write", ["rma_stock_adjust"]),
    ("POST", "/rma/tickets/{ticket_id}/scrap"): ("write", ["rma_stock_adjust"]),
    # supplier claims
    ("POST", "/rma/tickets/{ticket_id}/claims"): ("create", ["rma_override"]),  # only for a manually chosen supplier
    ("PATCH", "/rma/claims/{claim_id}"): ("write", []),
    ("POST", "/rma/claims/{claim_id}/submit"): ("write", []),
    ("POST", "/rma/claims/{claim_id}/decision"): ("write", ["rma_claim_approve"]),
    ("POST", "/rma/claims/{claim_id}/dispatch"): ("write", ["rma_dispatch"]),
    ("POST", "/rma/claims/{claim_id}/cancel"): ("write", []),
    ("POST", "/rma/claims/{claim_id}/print"): ("read", ["rma_reprint"]),
    # supplier receipts
    ("POST", "/rma/claims/{claim_id}/receipts"): ("create", []),
    ("PATCH", "/rma/receipts/{receipt_id}"): ("write", ["rma_serial_change"]),  # only when the serial changes
    ("POST", "/rma/receipts/{receipt_id}/submit"): ("write", []),
    ("POST", "/rma/receipts/{receipt_id}/decision"): ("write", ["rma_receive_approve", "rma_serial_change", "rma_settlement_approve"]),  # the last one only for a cash back
    ("POST", "/rma/receipts/{receipt_id}/cancel"): ("write", []),
    ("POST", "/rma/receipts/{receipt_id}/print"): ("read", ["rma_reprint"]),
    # customer deliveries
    ("POST", "/rma/tickets/{ticket_id}/deliveries"): ("create", []),
    ("PATCH", "/rma/deliveries/{delivery_id}"): ("write", []),
    ("POST", "/rma/deliveries/{delivery_id}/submit"): ("write", []),
    ("POST", "/rma/deliveries/{delivery_id}/decision"): ("write", ["rma_delivery_approve", "rma_settlement_approve"]),  # the last one only when the delivery moves money
    ("POST", "/rma/deliveries/{delivery_id}/cancel"): ("write", []),
    ("POST", "/rma/deliveries/{delivery_id}/print"): ("read", ["rma_reprint"]),
    # settlements (money)
    ("POST", "/rma/tickets/{ticket_id}/settlements"): ("create", ["rma_payment"]),
    ("PATCH", "/rma/settlements/{settlement_id}"): ("write", ["rma_payment"]),
    ("POST", "/rma/settlements/{settlement_id}/submit"): ("write", ["rma_payment"]),
    ("POST", "/rma/settlements/{settlement_id}/decision"): ("write", ["rma_settlement_approve"]),
    ("POST", "/rma/settlements/{settlement_id}/cancel"): ("write", ["rma_payment"]),
    ("POST", "/rma/settlements/{settlement_id}/reverse"): ("write", ["rma_payment"]),  # opens a draft mirror; approval is separate
}


def _routes():
    from app.routers import rma, rma_claims, rma_deliveries, rma_receipts, rma_settlements

    for module in (rma, rma_claims, rma_receipts, rma_deliveries, rma_settlements):
        for route in module.router.routes:
            yield module, route


class PermissionAuditTests(TestCase):
    def facts(self, route):
        """(base grants, privileged grants) read from the handler's own dependencies and body."""
        source = inspect.getsource(route.endpoint)
        base = re.findall(r'require_permission\("rma",\s*"(\w+)"\)', source)
        privileged = re.findall(r'_need\(\s*db,\s*user,\s*"(\w+)"', source) + re.findall(r'rbac\.has_permission\(db,\s*user,\s*"(\w+)"', source)
        privileged += re.findall(r'_can\(db,\s*user,\s*"(\w+)"', source)
        # a decision is also open to the plain Approve permission on RMA (docs/approval.md), checked in decision_rights
        privileged += re.findall(r'decision_rights\.need_to_decide\(\s*db,\s*user,\s*"(\w+)"', source)
        return base, sorted(set(privileged))

    def test_every_mutating_rma_endpoint_is_in_the_audit_table_and_matches_it(self):
        seen = set()
        for _, route in _routes():
            for method in route.methods - {"HEAD", "OPTIONS"}:
                if method == "GET":
                    continue
                key = (method, route.path)
                self.assertIn(key, EXPECTED, f"{key} is a new mutating RMA endpoint: add it to the permission audit table")
                seen.add(key)
                base, privileged = self.facts(route)
                want_base, want_priv = EXPECTED[key]
                self.assertEqual(base, [want_base], f"{key} base grant")
                self.assertEqual(sorted(set(privileged)), sorted(want_priv), f"{key} privileged grants")
        self.assertEqual(seen, set(EXPECTED), "the table lists an endpoint that no longer exists")

    def test_every_rma_read_endpoint_needs_at_least_the_rma_read_grant(self):
        for _, route in _routes():
            if "GET" not in route.methods:
                continue
            base, _priv = self.facts(route)
            self.assertEqual(base, ["read"], route.path)

    def test_money_endpoints_also_need_finance_read(self):
        from app.routers import rma_settlements

        for route in rma_settlements.router.routes:
            if "GET" in route.methods:
                self.assertIn('require_permission("finance", "read")', inspect.getsource(route.endpoint), route.path)

    def test_the_privileged_grants_are_off_by_default_for_everyone_but_system_manager(self):
        from app.services import rbac

        wanted = {m for _, (_, priv) in EXPECTED.items() for m in priv}
        self.assertTrue(wanted <= set(rbac.PRIVILEGED_MODULES), wanted - set(rbac.PRIVILEGED_MODULES))
        for module in wanted:
            self.assertIn(module, rbac.RBAC_MODULES)

    def test_the_new_gates_refuse_without_the_grant_before_touching_anything(self):
        from app.routers import rma as router

        user = SimpleNamespace(id="u1", name="Staff", username="staff")
        payload = SimpleNamespace(amount=D("10"), method="original", due_date=None, item_id=None, warehouse_id="w", quantity=1)
        calls = {
            "bill": lambda: router.raise_bill("t1", payload, db=None, user=user, company_id=CO),
            "refund": lambda: router.refund_ticket("t1", payload, db=None, user=user, company_id=CO),
            "replacement": lambda: router.replace_ticket("t1", payload, db=None, user=user, company_id=CO),
            "release": lambda: router.release_stock("t1", payload, db=None, user=user, company_id=CO),
            "scrap": lambda: router.scrap_ticket("t1", db=None, user=user, company_id=CO),
            "warranty": lambda: router.override_warranty("t1", SimpleNamespace(warranty_status="in_warranty", note=None, warranty_expires_on=None), db=None, user=user, company_id=CO),
            "supplier-job": lambda: router.upsert_supplier_job("t1", SimpleNamespace(), db=None, user=user, company_id=CO),
        }
        with patch.object(router.rbac, "has_permission", return_value=False):
            for name, call in calls.items():
                with self.assertRaises(HTTPException) as ctx:
                    call()
                self.assertEqual(ctx.exception.status_code, 403, name)
