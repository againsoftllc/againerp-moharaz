"""Product master rules: not for selling, negative sales, stock keeping, serial lock, unit types, relations — in-memory SQLite."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.catalog_attribute_profile  # noqa: F401
import app.models.catalog_brand  # noqa: F401
import app.models.catalog_category  # noqa: F401
import app.models.hrm.org  # noqa: F401
import app.models.inventory_location  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.inventory_item import InventoryItem
from app.models.inventory_serial import InventorySerial
from app.models.inventory_setting import InventorySetting
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.item import Item
from app.models.product_master import CatalogProductRelation, InventoryUnitType, InventoryWarehouseType
from app.services.inventory import product_master as pm
from app.services.rma.warranty import product_warranty_text

CO = "default"


class ProductMasterTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            engine,
            tables=[
                Item.__table__, CatalogProduct.__table__, InventoryWarehouse.__table__, InventoryItem.__table__,
                InventorySetting.__table__, InventorySerial.__table__, InventoryStockMovement.__table__,
                InventoryUnitType.__table__, InventoryWarehouseType.__table__, CatalogProductRelation.__table__,
            ],
        )
        self.db: Session = sessionmaker(bind=engine)()
        self.item = Item(id="i1", company_id=CO, sku="LAP-1", name="Laptop", item_type="physical")
        self.product = CatalogProduct(id="p1", item_id="i1", company_id=CO, name="Laptop", slug="laptop", sku="LAP-1")
        self.db.add_all([self.item, self.product])
        self.db.flush()

    def tearDown(self):
        self.db.close()

    def test_not_for_selling_is_refused(self):
        pm.require_sellable(self.db, self.item)
        self.product.not_for_selling = True
        with self.assertRaises(HTTPException) as caught:
            pm.require_sellable(self.db, self.item)
        self.assertIn("not for selling", caught.exception.detail)

    def test_negative_sales_per_product_and_stock_keeping(self):
        self.assertFalse(pm.allows_negative(self.db, "i1", CO))  # company default: no negative stock
        self.product.allow_negative_sales = True
        self.assertTrue(pm.allows_negative(self.db, "i1", CO))
        self.assertTrue(pm.moves_stock(self.db, self.item))
        self.db.add(InventoryItem(company_id=CO, item_id="i1", track_stock=False))
        self.db.flush()
        self.assertFalse(pm.moves_stock(self.db, self.item))
        self.assertFalse(pm.moves_stock(self.db, Item(id="s1", sku="SVC", name="Install", item_type="service")))

    def test_serial_tracking_locks_once_stock_moved(self):
        pm.guard_serial_change(self.db, "i1", False, True, "LAP-1")  # no history yet: allowed
        self.db.add(InventorySerial(company_id=CO, item_id="i1", sku="LAP-1", serial_number="SN-1"))
        self.db.flush()
        with self.assertRaises(HTTPException) as caught:
            pm.guard_serial_change(self.db, "i1", True, False, "LAP-1")
        self.assertEqual(caught.exception.status_code, 409)
        pm.guard_serial_change(self.db, "i1", True, True, "LAP-1")  # unchanged is fine

    def test_unit_types_seed_replace_and_in_use(self):
        units = pm.list_unit_types(self.db, CO)
        self.assertEqual([u.code for u in units][:3], ["ea", "pcs", "box"])
        self.db.add(InventoryItem(company_id=CO, item_id="i1", base_uom="box"))
        self.db.flush()
        with self.assertRaises(HTTPException) as caught:
            pm.replace_unit_types(self.db, CO, [{"code": "ea", "name": "Each"}])
        self.assertIn("box", caught.exception.detail)
        rows = pm.replace_unit_types(
            self.db, CO, [{"code": "box", "name": "Box"}, {"name": "Carton", "fraction_length": 0, "is_default": True}]
        )
        self.assertEqual([(u.code, u.is_default) for u in rows], [("box", False), ("carton", True)])

    def test_warehouse_types_and_relations(self):
        names = [t.name for t in pm.list_warehouse_types(self.db, CO)]
        self.assertIn("Main warehouse", names)
        self.assertEqual([t.name for t in pm.replace_warehouse_types(self.db, CO, ["Showroom", "showroom", " Hub "])], ["Showroom", "Hub"])
        other = CatalogProduct(id="p2", company_id=CO, name="Battery", slug="battery", sku="BAT-1")
        self.db.add(other)
        self.db.flush()
        rows = pm.replace_relations(self.db, self.product, [{"related_product_id": "p2", "kind": "spare"}])
        self.assertEqual([(r.related_product_id, r.kind) for r in rows], [("p2", "spare")])
        with self.assertRaises(HTTPException):
            pm.replace_relations(self.db, self.product, [{"related_product_id": "p1"}])  # itself

    def test_structured_warranty_wins_over_text(self):
        p = SimpleNamespace(warranty="1 year", warranty_days=None, lifetime_warranty=False)
        self.assertEqual(product_warranty_text(p), "1 year")
        p.warranty_days = 90
        self.assertEqual(product_warranty_text(p), "90 days")
        p.lifetime_warranty = True
        self.assertEqual(product_warranty_text(p), "lifetime")
        self.assertIsNotNone(date.today())
