"""OnerERP parity for the RMA (docs/OnerERP-RnD-Spec.md §7.4, §8, §12, §18.8) — in-memory SQLite, stock service replaced.

What it proves: a customer with the RMA lock cannot open or get a complaint approved; a previous sale (sold before the ERP)
measures the warranty from its own sale date, an unknown sale stays unverified; generated serials are unique, 8 characters and
refused for serial-tracked products or a serial already in use; a charge discount comes off the line and the RMA total; the
warranty days left are derived from the end date; the four registers and their analysis read the real documents.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.hrm  # noqa: F401
import app.models.catalog_brand  # noqa: F401 — catalog_products foreign keys
import app.models.catalog_category  # noqa: F401
import app.models.catalog_attribute_profile  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.collab_activity import CollabActivity
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.rma import (
    RmaCharge,
    RmaDelivery,
    RmaReason,
    RmaSettlement,
    RmaStatusHistory,
    RmaStockEvent,
    RmaSupplierClaim,
    RmaSupplierJob,
    RmaSupplierReceipt,
    RmaTicket,
)
from app.services.rma import complaint_service, register_service, rma_service
from app.services.rma.rma_service import TicketIntake

CO = "default"
TABLES = [
    RmaTicket.__table__,
    RmaCharge.__table__,
    RmaReason.__table__,
    RmaSupplierJob.__table__,
    RmaSupplierClaim.__table__,
    RmaSupplierReceipt.__table__,
    RmaDelivery.__table__,
    RmaSettlement.__table__,
    RmaStatusHistory.__table__,
    RmaStockEvent.__table__,
    CollabActivity.__table__,
    InventoryWarehouse.__table__,
    InventoryItem.__table__,
    InventorySerial.__table__,
    Item.__table__,
    CatalogProduct.__table__,
    CommerceCustomer.__table__,
    CommerceOrder.__table__,
    CommerceOrderItem.__table__,
]


class FakeStock:
    posted: list = []

    def __init__(self, db) -> None:
        self.db = db

    def apply_movement(self, data):
        FakeStock.posted.append((data.movement_type, data.warehouse_id, data.quantity))
        return SimpleNamespace(id=f"mv-{len(FakeStock.posted)}")

    def reverse_movement(self, movement_id, *, actor_id=None, notes=None):
        return SimpleNamespace(id=f"rev-{movement_id}")


def _user():
    return SimpleNamespace(id="user-1", name="Approver", username="approver")


class OnerParityTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        FakeStock.posted = []
        patcher = patch("app.services.inventory.stock_movement_service.StockMovementService", FakeStock)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.store = InventoryWarehouse(company_id=CO, code="RMA", name="RMA Store", type="Returns / Damaged", is_rma_store=True)
        self.db.add(self.store)
        self.db.add_all(
            [
                Item(id="item-1", company_id=CO, sku="SKU-1", name="Mouse", item_type="physical", status="active"),
                Item(id="item-2", company_id=CO, sku="SKU-PH", name="Phone", item_type="physical", status="active"),
            ]
        )
        self.db.flush()
        self.db.add_all(
            [
                CatalogProduct(
                    id="prod-1", company_id=CO, item_id="item-1", name="Mouse", slug="mouse", sku="SKU-1", status="published", warranty="1 year"
                ),
                CatalogProduct(
                    id="prod-2", company_id=CO, item_id="item-2", name="Phone", slug="phone", sku="SKU-PH", status="published", warranty="1 year"
                ),
                InventoryItem(item_id="item-2", company_id=CO, track_serial=True),
                CommerceCustomer(
                    id="cust-ok", company_id=CO, party_id="party-1", customer_code="C-1", name="Rakibul", phone="017", customer_since=date(2025, 1, 1)
                ),
                CommerceCustomer(
                    id="cust-locked",
                    company_id=CO,
                    party_id="party-2",
                    customer_code="C-2",
                    name="Blocked Ltd",
                    phone="018",
                    customer_since=date(2025, 1, 1),
                    rma_locked=True,
                    rma_lock_reason="Repeated physical damage claims",
                ),
            ]
        )
        self.db.flush()

    def intake(self, **over) -> TicketIntake:
        data = dict(
            fault_reported="No power",
            company_id=CO,
            customer_id="cust-ok",
            customer_name="Rakibul",
            sku="SKU-1",
            product_name="Mouse",
            start_status="draft",
            warehouse_id=self.store.id,
            created_by="user-1",
            sale_source="unknown",
        )
        data.update(over)
        return TicketIntake(**data)

    # ------------------------------------------------------------------ RMA lock

    def test_a_locked_customer_cannot_open_a_complaint(self):
        with self.assertRaises(HTTPException) as ctx:
            rma_service.create_ticket(self.db, self.intake(customer_id="cust-locked", customer_name="Blocked Ltd"))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("RMA is locked for Blocked Ltd", ctx.exception.detail)
        self.assertIn("Repeated physical damage claims", ctx.exception.detail)
        self.assertEqual(self.db.query(RmaTicket).count(), 0)

    def test_locking_after_the_complaint_blocks_sending_and_approving(self):
        t = rma_service.create_ticket(self.db, self.intake())
        self.db.get(CommerceCustomer, "cust-ok").rma_locked = True
        self.db.flush()
        with self.assertRaises(HTTPException):
            complaint_service.submit_for_approval(self.db, t, actor="u")
        with self.assertRaises(HTTPException):
            complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual((t.status, FakeStock.posted), ("draft", []))
        # rejecting is still allowed: the lock only stops new work
        t.status = "pending_approval"
        complaint_service.decide(self.db, t, decision="rejected", reason="Customer is RMA locked", user=_user())
        self.assertEqual(t.status, "rejected")

    def test_lock_lookup_reports_the_reason(self):
        lock = complaint_service.customer_rma_lock(self.db, "cust-locked", CO)
        self.assertEqual(lock, {"customer_id": "cust-locked", "name": "Blocked Ltd", "reason": "Repeated physical damage claims"})
        self.assertIsNone(complaint_service.customer_rma_lock(self.db, "cust-ok", CO))
        self.assertIsNone(complaint_service.customer_rma_lock(self.db, "cust-locked", "other-company"))
        self.assertIsNone(complaint_service.customer_rma_lock(self.db, None, CO))

    # ------------------------------------------------------- sale source

    def test_a_previous_sale_measures_the_warranty_from_its_own_date(self):
        sold = date.today() - timedelta(days=100)
        t = rma_service.create_ticket(
            self.db, self.intake(sale_source="previous", previous_invoice_no=" OLD-INV-77 ", previous_sale_date=sold)
        )
        self.assertEqual((t.sale_source, t.previous_invoice_no, t.purchased_at), ("previous", "OLD-INV-77", sold))
        self.assertEqual((t.warranty_status, t.warranty_source), ("in_warranty", "previous_sale"))
        self.assertEqual(t.warranty_days_left, 265)

    def test_an_expired_previous_sale_is_out_of_warranty_with_negative_days(self):
        sold = date.today() - timedelta(days=400)
        t = rma_service.create_ticket(self.db, self.intake(sale_source="previous", previous_sale_date=sold))
        self.assertEqual(t.warranty_status, "out_of_warranty")
        self.assertEqual(t.warranty_days_left, -35)
        self.assertTrue(t.is_billable)

    def test_a_previous_sale_needs_a_past_sale_date(self):
        with self.assertRaises(HTTPException):
            rma_service.create_ticket(self.db, self.intake(sale_source="previous"))
        with self.assertRaises(HTTPException):
            rma_service.create_ticket(self.db, self.intake(sale_source="previous", previous_sale_date=date.today() + timedelta(days=1)))

    def test_an_unknown_sale_stays_unverified(self):
        t = rma_service.create_ticket(self.db, self.intake(previous_invoice_no="ignored"))
        self.assertEqual((t.sale_source, t.warranty_status, t.previous_invoice_no), ("unknown", "unknown", None))
        self.assertIsNone(t.warranty_days_left)

    def test_a_system_sale_wins_over_what_the_counter_said(self):
        order = CommerceOrder(
            id="order-1", company_id=CO, order_number="ORD-1", customer_id="cust-ok", customer_name="Rakibul",
            customer_email="r@example.com", customer_phone="017", status="delivered",
        )
        self.db.add(order)
        self.db.flush()
        self.db.add(CommerceOrderItem(order_id=order.id, product_id="prod-1", sku="SKU-1", name="Mouse", quantity=1, unit_price=10, line_total=10))
        self.db.flush()
        t = rma_service.create_ticket(self.db, self.intake(order_number="ORD-1", sale_source="previous", previous_sale_date=date(2020, 1, 1)))
        self.assertEqual((t.sale_source, t.order_number), ("system", "ORD-1"))
        self.assertIsNone(t.previous_invoice_no)

    # -------------------------------------------------- generated serials

    def test_generated_serials_are_unique_and_readable(self):
        serials = complaint_service.generate_serials(self.db, CO, 25)
        self.assertEqual(len(set(serials)), 25)
        for s in serials:
            self.assertEqual(len(s), 8)
            self.assertFalse(set(s) & set("01IOL"), s)
        with self.assertRaises(HTTPException):
            complaint_service.generate_serials(self.db, CO, 0)
        with self.assertRaises(HTTPException):
            complaint_service.generate_serials(self.db, CO, 101)

    def test_a_generated_serial_opens_a_claim_for_a_non_serial_product(self):
        (serial,) = complaint_service.generate_serials(self.db, CO, 1)
        t = rma_service.create_ticket(self.db, self.intake(serial_number=serial, serial_generated=True))
        self.assertEqual((t.serial_number, t.serial_generated), (serial, True))
        # it is never put in the inventory serial registry
        self.assertEqual(self.db.query(InventorySerial).count(), 0)
        # and the next generation never hands it out again
        self.assertTrue(complaint_service._serial_taken(self.db, serial.lower(), CO))
        # the same generated serial cannot be used twice
        with self.assertRaises(HTTPException) as ctx:
            rma_service.create_ticket(self.db, self.intake(serial_number=serial, serial_generated=True))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_a_generated_serial_is_refused_for_a_serial_tracked_product(self):
        with self.assertRaises(HTTPException) as ctx:
            rma_service.create_ticket(
                self.db, self.intake(sku="SKU-PH", product_name="Phone", serial_number="ABCDEFGH", serial_generated=True)
            )
        self.assertIn("serial-tracked", ctx.exception.detail)

    def test_a_generated_serial_must_be_given(self):
        with self.assertRaises(HTTPException):
            rma_service.create_ticket(self.db, self.intake(serial_generated=True))

    def test_the_approved_generated_serial_unit_is_stocked_as_a_quantity(self):
        (serial,) = complaint_service.generate_serials(self.db, CO, 1)
        t = rma_service.create_ticket(self.db, self.intake(serial_number=serial, serial_generated=True))
        complaint_service.decide(self.db, t, decision="approved", reason=None, user=_user())
        self.assertEqual(FakeStock.posted, [("customer_return", self.store.id, 1)])

    # ----------------------------------------------------------- discount

    def test_a_charge_discount_comes_off_the_line_and_the_total(self):
        t = rma_service.create_ticket(self.db, self.intake())
        charge = rma_service.add_charge(
            self.db, t, kind="part", description="Spare switch", quantity=Decimal("2"), unit_price=Decimal("150"), discount=Decimal("50")
        )
        self.assertEqual((charge.discount, charge.line_total), (Decimal("50.00"), Decimal("250.00")))
        rma_service.add_charge(self.db, t, kind="service", description="Service", quantity=Decimal("1"), unit_price=Decimal("100"))
        self.assertEqual(t.total, Decimal("350.00"))
        with self.assertRaises(HTTPException):
            rma_service.add_charge(self.db, t, kind="part", description="Too much", quantity=Decimal("1"), unit_price=Decimal("10"), discount=Decimal("11"))

    # ---------------------------------------------------------- registers

    def _documents(self):
        t = rma_service.create_ticket(self.db, self.intake(sale_source="previous", previous_invoice_no="OLD-1", previous_sale_date=date.today()))
        t.supplier_name = "Acme Supply"
        t.total = Decimal("500")
        claim = RmaSupplierClaim(
            company_id=CO, rma_id=t.id, claim_number="SCL-1", status="dispatched", supplier_id="sup-1", supplier_name="Acme Supply",
            sku="SKU-1", product_name="Mouse", problem="Dead\nsecond line", dispatch_date=date.today(),
        )
        self.db.add(claim)
        self.db.flush()
        self.db.add(
            RmaSupplierReceipt(
                company_id=CO, rma_id=t.id, claim_id=claim.id, receipt_number="RRC-1", status="approved", supplier_id="sup-1",
                supplier_name="Acme Supply", sent_serial="S1", received_serial="S2", outcome="same_product", received_date=date.today(),
            )
        )
        self.db.add(
            RmaDelivery(
                company_id=CO, rma_id=t.id, delivery_number="DLV-1", status="approved", outcome="cash_back", amount_total=Decimal("120"),
                amount_received=Decimal("20"), refund_amount=Decimal("900"), delivery_date=date.today(),
            )
        )
        self.db.flush()
        return t

    def test_the_four_registers_read_the_documents(self):
        t = self._documents()
        complain = register_service.register(self.db, CO, "complain")
        self.assertEqual(len(complain), 1)
        self.assertEqual(
            (complain[0]["doc_number"], complain[0]["sale_source_label"], complain[0]["invoice_no"], complain[0]["amount"]),
            (t.rma_number, "Previous sale", "OLD-1", Decimal("500.00")),
        )
        claim = register_service.register(self.db, CO, "claim")[0]
        self.assertEqual((claim["doc_number"], claim["rma_number"], claim["problem"]), ("SCL-1", t.rma_number, "Dead"))
        receive = register_service.register(self.db, CO, "receive")[0]
        self.assertEqual((receive["claim_number"], receive["new_serial"], receive["outcome_label"]), ("SCL-1", "S2", "Same product, different serial"))
        delivery = register_service.register(self.db, CO, "delivery")[0]
        self.assertEqual((delivery["outcome_label"], delivery["collected"], delivery["refund"]), ("Cash back", Decimal("20.00"), Decimal("900.00")))

    def test_registers_filter_by_date_status_and_search(self):
        self._documents()
        tomorrow = date.today() + timedelta(days=1)
        self.assertEqual(register_service.register(self.db, CO, "claim", date_from=tomorrow), [])
        self.assertEqual(len(register_service.register(self.db, CO, "claim", date_to=tomorrow)), 1)
        self.assertEqual(register_service.register(self.db, CO, "receive", status="draft"), [])
        self.assertEqual(len(register_service.register(self.db, CO, "receive", search="acme")), 1)
        self.assertEqual(register_service.register(self.db, CO, "receive", search="nobody"), [])
        with self.assertRaises(HTTPException):
            register_service.register(self.db, CO, "claim", date_from=tomorrow, date_to=date.today())
        with self.assertRaises(HTTPException):
            register_service.register(self.db, CO, "bogus")

    def test_analysis_groups_the_same_rows(self):
        self._documents()
        rma_service.create_ticket(self.db, self.intake(customer_id=None, customer_name="Walk-in"))
        by_source = register_service.analysis(self.db, CO, "complain", group_by="sale_source")
        self.assertEqual({(r["label"], r["count"]) for r in by_source}, {("Previous sale", 1), ("Unknown sale", 1)})
        by_supplier = register_service.analysis(self.db, CO, "claim", group_by="supplier")
        self.assertEqual((by_supplier[0]["label"], by_supplier[0]["count"], by_supplier[0]["done"]), ("Acme Supply", 1, 1))
        with self.assertRaises(HTTPException):
            register_service.analysis(self.db, CO, "claim", group_by="engineer")
