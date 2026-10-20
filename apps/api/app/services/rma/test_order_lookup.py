"""RMA order lookup (the intake drawer's "find the sale"): an order with several lines, by order number, invoice, phone and serial.

Checklist items: "Non-serial product selected by phone/order/invoice" and "Multiple matching sales lines". What it proves: one
order with three lines comes back as one hit with all three lines in order, each line carrying only its own serial numbers; a
serial search names the matched serial so the picker can preselect the right line; a phone shared by two orders returns both;
nothing matches a made-up number.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from unittest import TestCase

from sqlalchemy import create_engine, event
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
from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_order import CommerceOrder
from app.models.commerce_order_item import CommerceOrderItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.pos import PosReceipt
from app.models.sales import SalesOrder, SalesOrderLine
from app.services.rma import rma_service

CO = "default"
D = Decimal
TABLES = [
    Party.__table__,
    PartyRole.__table__,
    SalesOrder.__table__,
    SalesOrderLine.__table__,
    CommerceCustomer.__table__,
    CommerceOrder.__table__,
    CommerceOrderItem.__table__,
    PosReceipt.__table__,
    InventorySerial.__table__,
    InventoryWarehouse.__table__,
    CatalogProduct.__table__,
    Item.__table__,
]


class OrderLookupTests(TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

        @event.listens_for(engine, "connect")
        def _regexp_replace(dbapi_conn, _record):  # the phone match uses Postgres' regexp_replace(col, pattern, repl, 'g')
            dbapi_conn.create_function("regexp_replace", 4, lambda value, pattern, repl, flags: re.sub(pattern, repl, value or ""))

        Base.metadata.create_all(engine, tables=TABLES)
        self.db: Session = sessionmaker(bind=engine, expire_on_commit=False)()
        self.db.add(Party(id="cust-1", company_id=CO, type="person", display_name="Rakibul Hasan"))
        self.db.flush()
        self.db.add(CommerceCustomer(id="cust-1", company_id=CO, party_id="cust-1", customer_code="C-1", customer_since=date(2026, 1, 1), name="Rakibul Hasan", phone="+8801711000123", email="r@example.com"))
        self.db.add(InventoryWarehouse(id="wh-1", company_id=CO, code="MAIN", name="Main", type="Warehouse"))
        self.db.flush()
        self.order = self.sales_order("SO-00042", invoice="INV-0042", lines=[("SKU-GPU", "Graphics Card"), ("SKU-PSU", "Power Supply"), ("SKU-FAN", "Case Fan")])
        self.db.add_all(
            [
                InventorySerial(company_id=CO, serial_number="GPU-001", sku="SKU-GPU", product_name="Graphics Card", status="sold", order_id=self.order.id, order_number="SO-00042"),
                InventorySerial(company_id=CO, serial_number="PSU-001", sku="SKU-PSU", product_name="Power Supply", status="sold", order_id=self.order.id, order_number="SO-00042"),
            ]
        )
        self.db.flush()

    def tearDown(self) -> None:
        self.db.close()

    def sales_order(self, number, *, invoice=None, lines=()) -> SalesOrder:
        order = SalesOrder(company_id=CO, order_number=number, invoice_number=invoice, customer_id="cust-1", warehouse_id="wh-1", order_date=date(2026, 9, 1))
        self.db.add(order)
        self.db.flush()
        for i, (sku, name) in enumerate(lines):
            if self.db.get(Item, f"item-{sku}") is None:
                self.db.add(Item(id=f"item-{sku}", company_id=CO, sku=sku, name=name, item_type="physical", status="active"))
                self.db.flush()
            self.db.add(SalesOrderLine(sales_order_id=order.id, item_id=f"item-{sku}", sku=sku, name=name, quantity_ordered=1, sort_order=i))
        self.db.flush()
        return order

    def test_an_order_with_several_lines_is_one_hit_with_every_line_in_order(self):
        hits = rma_service.search_orders(self.db, "SO-00042")
        self.assertEqual(len(hits), 1)
        hit = hits[0]
        self.assertEqual((hit["order_number"], hit["matched_by"], hit["customer_name"]), ("SO-00042", "order_number", "Rakibul Hasan"))
        self.assertEqual([line["sku"] for line in hit["lines"]], ["SKU-GPU", "SKU-PSU", "SKU-FAN"])

    def test_each_line_carries_only_its_own_serials(self):
        lines = {line["sku"]: line["serial_numbers"] for line in rma_service.search_orders(self.db, "SO-00042")[0]["lines"]}
        self.assertEqual(lines, {"SKU-GPU": ["GPU-001"], "SKU-PSU": ["PSU-001"], "SKU-FAN": []})

    def test_a_serial_search_names_the_matched_serial_so_the_right_line_can_be_preselected(self):
        hits = rma_service.search_orders(self.db, "PSU-001")
        self.assertEqual(len(hits), 1)
        self.assertEqual((hits[0]["matched_by"], hits[0]["matched_serial"]), ("serial", "PSU-001"))
        self.assertEqual(len(hits[0]["lines"]), 3)  # the whole order comes back; the picker narrows to the matched line
        owner = [line["sku"] for line in hits[0]["lines"] if "PSU-001" in line["serial_numbers"]]
        self.assertEqual(owner, ["SKU-PSU"])

    def test_the_invoice_number_finds_the_same_order(self):
        hits = rma_service.search_orders(self.db, "INV-0042")
        self.assertEqual([(h["order_number"], h["matched_by"]) for h in hits], [("SO-00042", "invoice")])

    def test_a_phone_shared_by_two_orders_returns_both_with_their_own_lines(self):
        self.sales_order("SO-00043", lines=[("SKU-MOUSE", "Mouse")])
        hits = rma_service.search_orders(self.db, "01711000123")
        by_number = {h["order_number"]: [line["sku"] for line in h["lines"]] for h in hits}
        self.assertEqual(by_number["SO-00042"], ["SKU-GPU", "SKU-PSU", "SKU-FAN"])
        self.assertEqual(by_number["SO-00043"], ["SKU-MOUSE"])
        self.assertTrue(all(h["matched_by"] == "phone" for h in hits))

    def test_a_made_up_number_or_a_one_letter_query_finds_nothing(self):
        self.assertEqual(rma_service.search_orders(self.db, "ZZZ-NOT-REAL"), [])
        self.assertEqual(rma_service.search_orders(self.db, "S"), [])
