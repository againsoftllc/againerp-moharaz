"""RMA supplier claim + dispatch (docs/RMA.md Stage C) — in-memory SQLite, stock and the supplier lookup replaced by recorders.

What it proves: a claim is raised only for a unit in the RMA store (one open claim per RMA), the supplier comes from the
purchase trace (a manual one needs the override permission and a reason), only approved claims dispatch, dispatch moves
the unit out of the RMA store exactly once, the old plain "sent to supplier" move is blocked while the unit is in the
store, and the supplier's copy never carries customer details, internal notes or costs.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.catalog_attribute_profile  # noqa: F401
import app.models.catalog_brand  # noqa: F401
import app.models.catalog_category  # noqa: F401
import app.models.hrm  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.rma import (
    RmaCharge,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaTicket,
)
from app.services.rma import claim_service, complaint_service, rma_service

CO = "default"
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaStatusHistory.__table__,
    RmaStockEvent.__table__,
    CollabActivity.__table__,
    InventoryWarehouse.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
]


class FakeStock:
    posted: list = []
    reversed: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity, data.source_line_id))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        FakeStock.reversed.append(movement_id)
        return SimpleNamespace(id=f"rev-{movement_id}")


def fake_upsert_supplier_job(db, ticket, *, supplier_id, status="draft", **kwargs):
    job = db.query(RmaSupplierJob).filter(RmaSupplierJob.rma_id == ticket.id).first()
    if job is None:
        job = RmaSupplierJob(rma_id=ticket.id, supplier_id=supplier_id)
        db.add(job)
    job.supplier_id, job.supplier_name, job.status = supplier_id, "Supplier Co", status
    job.dispatched_at = kwargs.get("dispatched_at")
    db.flush()
    FakeStock.job_calls.append((status, kwargs.get("supplier_reference")))
    return job


FakeStock.job_calls = []


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class ClaimFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted, FakeStock.reversed, FakeStock.job_calls = [], [], []
        for target, replacement in (
            ("app.services.inventory.stock_movement_service.StockMovementService", FakeStock),
            ("app.services.rma.rma_service.upsert_supplier_job", fake_upsert_supplier_job),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.db.add(self.store)
        self.db.add(Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"))
        self.db.flush()
        self.db.add(CatalogProduct(id="prod-1", company_id=CO, item_id="item-1", name="Mouse", slug="mouse", sku="SKU-1", status="published"))
        self.db.flush()

    def ticket(self, *, received=True, traced=True, **over) -> RmaTicket:
        """An approved RMA whose unit is in the RMA store (or a pending one when `received` is False)."""
        data = dict(
            company_id=CO,
            rma_number=f"RMA-2026-{self.db.query(RmaTicket).count() + 1:04d}",
            customer_name="Rakibul Hasan",
            customer_phone="01711000000",
            customer_email="r@example.com",
            sku="SKU-1",
            item_id="item-1",
            product_name="Mouse",
            fault_reported="No power",
            diagnosis_report="Board burnt",
            accessories="Box",
            internal_notes="SECRET-NOTE",
            status="pending_approval",
            warehouse_id=self.store.id,
            order_id="order-1",
            purchased_at=date(2026, 5, 1),
        )
        if traced:
            data.update(
                supplier_id="sup-1",
                supplier_name="Supplier Co",
                purchase_receipt_no="GRN-1",
                purchase_bill_no="BILL-1",
                vendor_invoice_no="INV-9",
                supplier_source="traced",
            )
        data.update(over)
        row = RmaTicket(**data)
        self.db.add(row)
        self.db.flush()
        if received:
            complaint_service.decide(self.db, row, decision="approved", reason=None, user=_user())
            FakeStock.posted.clear()  # only count what the claim posts
        return row

    def approved_claim(self, ticket=None) -> RmaSupplierClaim:
        ticket = ticket or self.ticket()
        claim = claim_service.create_claim(self.db, ticket, actor="u")
        claim_service.submit_claim(self.db, claim, actor="u")
        claim_service.decide_claim(self.db, claim, decision="approved", reason=None, user=_user("Claim Approver"))
        return claim

    # ------------------------------------------------------------ create

    def test_claim_copies_the_trace_from_the_ticket(self):
        t = self.ticket(serial_number="SN-7")
        c = claim_service.create_claim(self.db, t, actor="u")
        self.assertEqual(c.status, "draft")
        self.assertRegex(c.claim_number, r"^SCL-\d{4}-0001$")
        self.assertEqual((c.supplier_id, c.supplier_name, c.vendor_invoice_no, c.serial_number), ("sup-1", "Supplier Co", "INV-9", "SN-7"))
        self.assertEqual((c.problem, c.diagnosis, c.accessories_sent), ("No power", "Board burnt", "Box"))

    def test_claim_needs_a_unit_in_the_rma_store(self):
        pending = self.ticket(received=False)
        with self.assertRaises(HTTPException) as ctx:
            claim_service.create_claim(self.db, pending, actor="u")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_one_open_claim_per_rma(self):
        t = self.ticket()
        claim_service.create_claim(self.db, t, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            claim_service.create_claim(self.db, t, actor="u")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_a_cancelled_claim_frees_the_rma_for_a_new_one(self):
        t = self.ticket()
        first = claim_service.create_claim(self.db, t, actor="u")
        claim_service.cancel_claim(self.db, first, actor="u", reason="wrong supplier")
        second = claim_service.create_claim(self.db, t, actor="u")
        self.assertNotEqual(first.id, second.id)
        self.assertRegex(second.claim_number, r"-0002$")

    def test_no_supplier_trace_needs_an_authorized_manual_choice(self):
        t = self.ticket(traced=False)
        with self.assertRaises(HTTPException) as none:
            claim_service.create_claim(self.db, t, actor="u")
        self.assertEqual(none.exception.status_code, 400)
        with self.assertRaises(HTTPException) as denied:
            claim_service.create_claim(self.db, t, actor="u", supplier_id="sup-9", can_override=False)
        self.assertEqual(denied.exception.status_code, 403)

        def fake_manual(db, ticket, *, supplier_id, reason, actor):
            ticket.supplier_id, ticket.supplier_name, ticket.supplier_source = supplier_id, "Chosen Co", "manual"

        with patch.object(complaint_service, "set_supplier_manually", fake_manual):
            c = claim_service.create_claim(self.db, t, actor="u", supplier_id="sup-9", override_reason="no GRN", can_override=True)
        self.assertEqual((c.supplier_id, c.supplier_name), ("sup-9", "Chosen Co"))

    # --------------------------------------------------------------- edit

    def test_only_the_claim_text_and_dispatch_details_are_editable(self):
        c = claim_service.create_claim(self.db, self.ticket(), actor="u")
        claim_service.update_claim(
            self.db, c, {"supplier_reference": "SUP-55", "courier": "Pathao", "supplier_name": "Hacked", "serial_number": "X"}, actor="u"
        )
        self.assertEqual((c.supplier_reference, c.courier), ("SUP-55", "Pathao"))
        self.assertEqual(c.supplier_name, "Supplier Co")
        self.assertIsNone(c.serial_number)
        claim_service.submit_claim(self.db, c, actor="u")
        with self.assertRaises(HTTPException):
            claim_service.update_claim(self.db, c, {"notes": "late"}, actor="u")

    # ----------------------------------------------------------- approval

    def test_approval_rules(self):
        c = claim_service.create_claim(self.db, self.ticket(), actor="u")
        with self.assertRaises(HTTPException):  # not submitted yet
            claim_service.decide_claim(self.db, c, decision="approved", reason=None, user=_user())
        claim_service.submit_claim(self.db, c, actor="u")
        with self.assertRaises(HTTPException):  # a reason is required to reject
            claim_service.decide_claim(self.db, c, decision="rejected", reason=" ", user=_user())
        claim_service.decide_claim(self.db, c, decision="correction_requested", reason="Add the invoice", user=_user())
        self.assertEqual(c.status, "correction_requested")
        claim_service.submit_claim(self.db, c, actor="u")
        claim_service.decide_claim(self.db, c, decision="approved", reason=None, user=_user("Boss"))
        self.assertEqual((c.status, c.decided_by_name), ("approved", "Boss"))
        self.assertEqual(FakeStock.posted, [])  # approving moves nothing

    # ----------------------------------------------------------- dispatch

    def test_only_an_approved_claim_dispatches(self):
        c = claim_service.create_claim(self.db, self.ticket(), actor="u")
        with self.assertRaises(HTTPException):
            claim_service.dispatch_claim(self.db, c, user=_user())
        claim_service.submit_claim(self.db, c, actor="u")
        with self.assertRaises(HTTPException):
            claim_service.dispatch_claim(self.db, c, user=_user())
        self.assertEqual(FakeStock.posted, [])

    def test_dispatch_moves_the_unit_out_of_the_rma_store_exactly_once(self):
        t = self.ticket()
        c = self.approved_claim(t)
        claim_service.dispatch_claim(
            self.db, c, user=_user("Dispatcher"), courier="Pathao", tracking_number="T-1", expected_return_date=date(2026, 11, 20)
        )
        transit = claim_service.supplier_transit_store(self.db, CO, ensure=False)
        self.assertIsNotNone(transit)
        self.assertEqual(
            FakeStock.posted,
            [("transfer_out", self.store.id, 1, "dispatch"), ("transfer_in", transit.id, 1, "dispatch")],
        )
        self.assertEqual((c.status, c.dispatched_by_name, c.courier, c.tracking_number), ("dispatched", "Dispatcher", "Pathao", "T-1"))
        self.assertEqual((t.status, t.custody_state), ("sent_to_supplier", "with_supplier"))
        self.assertEqual(FakeStock.job_calls[-1][0], "dispatched")
        # the same document cannot dispatch twice, and neither can the event
        with self.assertRaises(HTTPException):
            claim_service.dispatch_claim(self.db, c, user=_user())
        self.assertEqual(len(FakeStock.posted), 2)
        self.assertEqual(self.db.query(RmaStockEvent).filter_by(rma_id=t.id, event_key="dispatch").count(), 1)

    def test_dispatch_needs_the_unit_to_still_be_in_the_store(self):
        t = self.ticket()
        c = self.approved_claim(t)
        t.custody_state = None
        with self.assertRaises(HTTPException):
            claim_service.dispatch_claim(self.db, c, user=_user())
        self.assertEqual(FakeStock.posted, [])

    def test_plain_move_to_supplier_is_blocked_while_the_unit_is_in_the_store(self):
        t = self.ticket()
        self.db.add(RmaSupplierJob(rma_id=t.id, supplier_id="sup-1", supplier_name="Supplier Co"))
        self.db.flush()
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, t, "sent_to_supplier", actor="u")
        self.assertIn("supplier claim", ctx.exception.detail)
        # an old ticket that never had stock posted keeps the old behaviour
        legacy = self.ticket(received=False, status="diagnosing")
        self.db.add(RmaSupplierJob(rma_id=legacy.id, supplier_id="sup-1", supplier_name="Supplier Co"))
        self.db.flush()
        rma_service.change_status(self.db, legacy, "sent_to_supplier", actor="u")
        self.assertEqual(legacy.status, "sent_to_supplier")

    def test_cancelling_the_rma_after_dispatch_does_not_silently_reverse_stock(self):
        t = self.ticket()
        c = self.approved_claim(t)
        claim_service.dispatch_claim(self.db, c, user=_user())
        with self.assertRaises(HTTPException):
            rma_service.change_status(self.db, t, "cancelled", actor="u", note="changed mind")
        self.assertEqual(FakeStock.reversed, [])

    def test_a_dispatched_claim_cannot_be_cancelled_or_edited(self):
        c = self.approved_claim()
        claim_service.dispatch_claim(self.db, c, user=_user())
        with self.assertRaises(HTTPException):
            claim_service.cancel_claim(self.db, c, actor="u", reason="x")
        with self.assertRaises(HTTPException):
            claim_service.update_claim(self.db, c, {"notes": "x"}, actor="u")

    # -------------------------------------------------------------- print

    def test_supplier_copy_has_no_customer_details_internal_notes_or_costs(self):
        t = self.ticket(serial_number="SN-7", total=999, labour_total=500, parts_total=499)
        c = self.approved_claim(t)
        payload = claim_service.claim_payload(self.db, c, printed_by="Staff", reprint=False)
        text = " ".join(str(v) for v in payload.values())
        for secret in ("SECRET-NOTE", "Rakibul", "01711000000", "r@example.com"):
            self.assertNotIn(secret, text)
        for key in ("internal_notes", "customer_name", "customer_phone", "total", "labour_total", "cost"):
            self.assertNotIn(key, payload)
        self.assertEqual((payload["serial_number"], payload["vendor_invoice_no"], payload["supplier_name"]), ("SN-7", "INV-9", "Supplier Co"))
        self.assertEqual(payload["approved_by"], "Claim Approver")

    def test_print_is_counted(self):
        c = self.approved_claim()
        claim_service.count_claim_print(self.db, c, actor="u")
        claim_service.count_claim_print(self.db, c, actor="u")
        self.assertEqual(c.print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=c.rma_id)]
        self.assertIn("claim_copy_printed", actions)
        self.assertIn("claim_copy_reprinted", actions)
