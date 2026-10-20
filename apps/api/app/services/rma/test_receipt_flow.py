"""RMA supplier receipt (docs/RMA.md Stage D) — in-memory SQLite, stock and the supplier-job upsert replaced by recorders.

What it proves: a receipt is opened only for a dispatched claim and starts with the serial that was sent; a different
serial needs the serial-change permission and must be new; approving posts ONE stock event (Supplier / In Transit back
into the RMA store), registers a different serial as a linked unit without overwriting the original, and moves the RMA to
"back from supplier"; a rejected or sent-back receipt creates no stock; the supplier's reply copy has no customer details.
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
    RmaDelivery,
    RmaSettlement,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaSupplierReceipt,
    RmaTicket,
)
from app.services.inventory import serial_service
from app.services.rma import claim_service, complaint_service, receipt_service, rma_service

CO = "default"
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
]


class FakeStock:
    posted: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity, data.source_line_id))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        return SimpleNamespace(id=f"rev-{movement_id}")


def fake_upsert_supplier_job(db, ticket, *, supplier_id, status="draft", **kwargs):
    job = db.query(RmaSupplierJob).filter(RmaSupplierJob.rma_id == ticket.id).first()
    if job is None:
        job = RmaSupplierJob(rma_id=ticket.id, supplier_id=supplier_id)
        db.add(job)
    job.supplier_id, job.supplier_name, job.status = supplier_id, "Supplier Co", status
    job.dispatched_at = kwargs.get("dispatched_at")
    job.returned_at = kwargs.get("returned_at")
    job.outcome = kwargs.get("outcome")
    db.flush()
    return job


def _user(name="Approver"):
    return SimpleNamespace(id="user-1", name=name, username=name.lower())


class ReceiptFlowTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted = []
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
        self.db.add(
            InventorySerial(company_id=CO, serial_number="SN-OLD", item_id="item-1", sku="SKU-1", product_name="Mouse", status="sold")
        )
        self.db.flush()

    def dispatched(self):
        """An approved RMA with serial SN-OLD, its claim dispatched: the unit is with the supplier."""
        ticket = RmaTicket(
            company_id=CO,
            rma_number="RMA-2026-0001",
            customer_name="Rakibul Hasan",
            customer_phone="01711000000",
            sku="SKU-1",
            item_id="item-1",
            product_name="Mouse",
            serial_number="SN-OLD",
            fault_reported="No power",
            internal_notes="SECRET-NOTE",
            status="pending_approval",
            warehouse_id=self.store.id,
            order_id="order-1",
            purchased_at=date(2026, 5, 1),
            supplier_id="sup-1",
            supplier_name="Supplier Co",
            supplier_source="traced",
        )
        self.db.add(ticket)
        self.db.flush()
        complaint_service.decide(self.db, ticket, decision="approved", reason=None, user=_user())
        claim = claim_service.create_claim(self.db, ticket, actor="u")
        claim_service.submit_claim(self.db, claim, actor="u")
        claim_service.decide_claim(self.db, claim, decision="approved", reason=None, user=_user())
        claim_service.dispatch_claim(self.db, claim, user=_user("Dispatcher"))
        FakeStock.posted.clear()  # only count what the receipt posts
        return ticket, claim

    def submitted(self, ticket, claim, **changes):
        receipt = receipt_service.create_receipt(self.db, claim, actor="u")
        if changes:
            receipt_service.update_receipt(self.db, receipt, changes, actor="u", can_change_serial=True)
        receipt_service.submit_receipt(self.db, receipt, actor="u")
        return receipt

    def approve(self, receipt, can_change_serial=True):
        return receipt_service.decide_receipt(
            self.db, receipt, decision="approved", reason=None, user=_user("Receiver"), can_change_serial=can_change_serial
        )

    # ------------------------------------------------------------ create

    def test_receipt_needs_a_dispatched_claim_and_starts_with_the_sent_serial(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertEqual((r.status, r.sent_serial, r.received_serial, r.supplier_name), ("draft", "SN-OLD", "SN-OLD", "Supplier Co"))
        self.assertEqual(r.warehouse_id, self.store.id)
        self.assertRegex(r.receipt_number, r"^RRC-\d{4}-0001$")

    def test_an_undispatched_claim_has_nothing_to_receive(self):
        ticket = RmaTicket(
            company_id=CO, rma_number="RMA-2026-0009", customer_name="x", sku="SKU-1", item_id="item-1", fault_reported="x",
            status="received", warehouse_id=self.store.id, supplier_id="s", supplier_name="S", supplier_source="traced", custody_state="in_rma_store",
        )
        self.db.add(ticket)
        self.db.flush()
        claim = claim_service.create_claim(self.db, ticket, actor="u")
        with self.assertRaises(HTTPException):
            receipt_service.create_receipt(self.db, claim, actor="u")

    def test_one_open_receipt_per_claim(self):
        ticket, claim = self.dispatched()
        receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertEqual(ctx.exception.status_code, 409)

    # ------------------------------------------------------ serial rules

    def test_a_different_serial_needs_the_serial_change_permission(self):
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.update_receipt(self.db, r, {"received_serial": "SN-NEW"}, actor="u", can_change_serial=False)
        self.assertEqual(ctx.exception.status_code, 403)
        receipt_service.update_receipt(self.db, r, {"received_serial": "SN-NEW"}, actor="u", can_change_serial=True)
        self.assertEqual(r.received_serial, "SN-NEW")
        # putting the sent serial back needs no permission
        receipt_service.update_receipt(self.db, r, {"received_serial": " "}, actor="u", can_change_serial=False)
        self.assertEqual(r.received_serial, "SN-OLD")

    def test_a_received_serial_that_already_exists_is_refused(self):
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-TAKEN", item_id="item-1", sku="SKU-1", status="in_stock"))
        self.db.flush()
        ticket, claim = self.dispatched()
        r = receipt_service.create_receipt(self.db, claim, actor="u")
        with self.assertRaises(HTTPException) as ctx:
            receipt_service.update_receipt(self.db, r, {"received_serial": "sn-taken"}, actor="u", can_change_serial=True)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(r.received_serial, "SN-OLD")

    # --------------------------------------------------------- approval

    def test_approving_the_same_unit_stocks_it_back_exactly_once(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="repaired")
        self.assertEqual(FakeStock.posted, [])  # nothing before approval
        self.approve(r)
        transit = claim_service.supplier_transit_store(self.db, CO, ensure=False)
        self.assertEqual(
            FakeStock.posted,
            [("transfer_out", transit.id, 1, "receipt"), ("transfer_in", self.store.id, 1, "receipt")],
        )
        self.assertEqual((r.status, r.decided_by_name), ("approved", "Receiver"))
        self.assertEqual((ticket.status, ticket.custody_state), ("returned_from_supplier", "replacement_received"))
        self.assertEqual(ticket.received_serial_number, "SN-OLD")
        self.assertEqual(self.db.query(RmaSupplierJob).one().status, "returned")
        sn = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        self.assertEqual(sn.warehouse_id, self.store.id)
        self.assertIn("Back from", sn.notes)
        # the same document cannot post twice
        with self.assertRaises(HTTPException):
            self.approve(r)
        self.assertEqual(len(FakeStock.posted), 2)
        self.assertEqual(self.db.query(RmaStockEvent).filter_by(rma_id=ticket.id, event_key="receipt").count(), 1)

    def test_a_different_serial_is_linked_and_the_original_is_kept(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="replacement", received_serial="SN-NEW")
        self.approve(r)
        old = serial_service.find_by_number(self.db, "SN-OLD", company_id=CO)
        new = serial_service.find_by_number(self.db, "SN-NEW", company_id=CO)
        self.assertEqual(ticket.serial_number, "SN-OLD")  # never overwritten
        self.assertEqual(ticket.received_serial_number, "SN-NEW")
        self.assertEqual((old.status, old.replaced_by_serial), ("replaced", "SN-NEW"))
        self.assertIn("Replaced by SN-NEW", old.notes)
        self.assertEqual((new.status, new.replaces_serial, new.rma_id, new.warehouse_id), ("in_service", "SN-OLD", ticket.id, self.store.id))
        self.assertEqual((new.source_type, new.source_id, new.supplier_id), ("rma_replacement", r.id, "sup-1"))
        self.assertEqual(len(FakeStock.posted), 2)

    def test_approving_a_different_serial_needs_the_serial_change_permission(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, received_serial="SN-NEW")
        with self.assertRaises(HTTPException) as ctx:
            self.approve(r, can_change_serial=False)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual((r.status, ticket.status, ticket.custody_state), ("pending_approval", "sent_to_supplier", "with_supplier"))
        self.assertEqual(FakeStock.posted, [])

    def test_a_serial_registered_after_the_draft_is_caught_at_approval(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, received_serial="SN-RACE")
        self.db.add(InventorySerial(company_id=CO, serial_number="SN-RACE", item_id="item-1", sku="SKU-1", status="in_stock"))
        self.db.flush()
        with self.assertRaises(HTTPException) as ctx:
            self.approve(r)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(FakeStock.posted, [])

    def test_rejected_or_sent_back_receipts_create_no_stock(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, outcome="returned_unrepaired")
        with self.assertRaises(HTTPException):  # a reason is required
            receipt_service.decide_receipt(self.db, r, decision="rejected", reason=" ", user=_user(), can_change_serial=True)
        receipt_service.decide_receipt(self.db, r, decision="correction_requested", reason="Wrong serial", user=_user(), can_change_serial=True)
        self.assertEqual((r.status, FakeStock.posted), ("correction_requested", []))
        receipt_service.submit_receipt(self.db, r, actor="u")
        receipt_service.decide_receipt(self.db, r, decision="rejected", reason="Not our unit", user=_user(), can_change_serial=True)
        self.assertEqual((r.status, FakeStock.posted), ("rejected", []))
        self.assertEqual((ticket.status, ticket.custody_state), ("sent_to_supplier", "with_supplier"))
        # a rejected receipt frees the claim for a new one
        again = receipt_service.create_receipt(self.db, claim, actor="u")
        self.assertNotEqual(again.id, r.id)

    def test_plain_move_to_back_from_supplier_is_blocked_while_the_unit_is_with_the_supplier(self):
        ticket, claim = self.dispatched()
        rma_service.change_status(self.db, ticket, "at_supplier", actor="u")
        with self.assertRaises(HTTPException) as ctx:
            rma_service.change_status(self.db, ticket, "returned_from_supplier", actor="u")
        self.assertIn("supplier receipt", ctx.exception.detail)

    def test_an_approved_receipt_cannot_be_cancelled_a_draft_can(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        self.approve(r)
        with self.assertRaises(HTTPException):
            receipt_service.cancel_receipt(self.db, r, actor="u", reason="x")
        d = RmaSupplierReceipt(
            company_id=CO, rma_id=ticket.id, claim_id=claim.id, receipt_number="RRC-X-1", status="draft", supplier_id="s", outcome="other"
        )
        self.db.add(d)
        self.db.flush()
        receipt_service.cancel_receipt(self.db, d, actor="u", reason="typo")
        self.assertEqual(d.status, "cancelled")

    def test_cancelling_the_rma_after_receipt_is_still_refused_for_stock_that_moved_on(self):
        ticket, claim = self.dispatched()
        self.approve(self.submitted(ticket, claim))
        with self.assertRaises(HTTPException):
            rma_service.change_status(self.db, ticket, "cancelled", actor="u", note="changed mind")

    # ------------------------------------------------------------- print

    def test_the_reply_copy_has_no_customer_details_internal_notes_or_costs(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim, received_serial="SN-NEW", supplier_delivery_ref="CH-77", outcome="replacement")
        self.approve(r)
        payload = receipt_service.receipt_payload(self.db, r, printed_by="Staff", reprint=False)
        text = " ".join(str(v) for v in payload.values())
        for secret in ("SECRET-NOTE", "Rakibul", "01711000000"):
            self.assertNotIn(secret, text)
        for key in ("internal_notes", "customer_name", "customer_phone", "total", "cost"):
            self.assertNotIn(key, payload)
        self.assertEqual(
            (payload["serial_sent"], payload["serial_received"], payload["serial_changed"], payload["outcome_label"], payload["received_into"]),
            ("SN-OLD", "SN-NEW", True, "Replacement", "RMA Store"),
        )
        self.assertEqual((payload["supplier_delivery_ref"], payload["approved_by"]), ("CH-77", "Receiver"))

    def test_print_is_counted(self):
        ticket, claim = self.dispatched()
        r = self.submitted(ticket, claim)
        receipt_service.count_receipt_print(self.db, r, actor="u")
        receipt_service.count_receipt_print(self.db, r, actor="u")
        self.assertEqual(r.print_count, 2)
        actions = [a.action for a in self.db.query(CollabActivity).filter_by(entity_id=ticket.id)]
        self.assertIn("receipt_copy_printed", actions)
        self.assertIn("receipt_copy_reprinted", actions)
