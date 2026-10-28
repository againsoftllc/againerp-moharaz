"""Price / discount masters: resolver order, slabs, rules, limits and discount caps — in-memory SQLite."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.auth_user  # noqa: F401 — FK targets must exist in metadata (tables are not created)
import app.models.catalog_attribute_profile  # noqa: F401
import app.models.catalog_brand  # noqa: F401
import app.models.catalog_category  # noqa: F401
import app.models.crm  # noqa: F401
import app.models.inventory_warehouse  # noqa: F401
import app.models.item  # noqa: F401
from app.database import Base
from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.sales import CustomerItemPrice
from app.models.sales_pricing import (
    CustomerGroup,
    DiscountType,
    DiscountTypeItem,
    PriceType,
    PriceTypeItem,
    PricingRule,
)
from app.services.sales import pricing_service as pricing

D = Decimal
CO = "default"


class PricingTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            engine,
            tables=[
                CommerceCustomer.__table__, CatalogProduct.__table__, CustomerItemPrice.__table__, CustomerGroup.__table__,
                PriceType.__table__, PriceTypeItem.__table__, DiscountType.__table__, DiscountTypeItem.__table__,
                PricingRule.__table__,
            ],
        )
        self.db: Session = sessionmaker(bind=engine)()
        self.db.add(
            CommerceCustomer(
                id="c1", company_id=CO, party_id="p1", customer_code="C-1", name="Dealer Ltd", customer_since=date.today(),
                group="dealer",
            )
        )
        self.db.add(CatalogProduct(id="i1", company_id=CO, name="Mouse", slug="mouse", sku="MS-1", price=D("1000"), brand_id="b1"))
        self.db.flush()
        pricing.ensure_customer_groups(self.db, CO)
        self.dealer = pricing.save_price_type(
            self.db, CO, None, name="Dealer", allow_change=True, lower_limit_pct=5, upper_limit_pct=10,
            items=[{"item_id": "i1", "min_qty": 1, "price": 900}, {"item_id": "i1", "min_qty": 10, "price": 850}],
        )
        group = self.db.query(CustomerGroup).filter_by(code="dealer").one()
        pricing.save_group(self.db, CO, group, price_type_id=self.dealer.id)

    def tearDown(self):
        self.db.close()

    def _quote(self, qty=1, **kw):
        return pricing.quote(self.db, company_id=CO, item_id="i1", quantity=qty, customer_id="c1", **kw)

    def test_groups_seeded_and_group_price_type_with_slabs(self):
        self.assertEqual(self.db.query(CustomerGroup).filter_by(company_id=CO).count(), 7)
        q = self._quote()
        self.assertEqual((q.source, q.price, q.min_price, q.max_price), ("price_type", D("900.00"), D("855.00"), D("990.00")))
        self.assertEqual(self._quote(12).price, D("850.00"))  # the 10+ slab
        walk_in = pricing.quote(self.db, company_id=CO, item_id="i1", quantity=1)
        self.assertEqual((walk_in.source, walk_in.price), ("catalog", D("1000.00")))

    def test_customer_price_beats_price_type(self):
        self.db.add(CustomerItemPrice(company_id=CO, customer_id="c1", item_id="i1", unit_price=D("800"), discount_pct=D("2")))
        self.db.flush()
        q = self._quote()
        self.assertEqual((q.source, q.price, q.discount_pct, q.min_price), ("customer_price", D("800.00"), D("2"), None))

    def test_specific_rule_wins_over_group_default(self):
        corp = pricing.save_price_type(
            self.db, CO, None, name="Showroom", allow_change=False, items=[{"item_id": "i1", "price": 950}]
        )
        pricing.save_rule(self.db, CO, None, name="Showroom W2", price_type_id=corp.id, warehouse_id="w2")
        self.assertEqual(self._quote(warehouse_id="w1").price, D("900.00"))  # rule does not match: group default
        q = self._quote(warehouse_id="w2")
        self.assertEqual((q.price, q.allow_change, q.min_price, q.max_price), (D("950.00"), False, D("950.00"), D("950.00")))
        expired = pricing.save_rule(
            self.db, CO, None, name="Old", price_type_id=corp.id, customer_group="dealer", warehouse_id="w1",
            valid_to=date.today() - timedelta(days=1),
        )
        self.assertEqual(self._quote(warehouse_id="w1").price, D("900.00"))
        self.assertFalse(expired.valid_to >= date.today())

    def test_limits_and_discount_cap_on_a_line(self):
        disc = pricing.save_discount_type(
            self.db, CO, None, name="Dealer promo", max_pct=8,
            items=[{"brand_id": "b1", "discount_pct": 3}, {"item_id": "i1", "min_qty": 5, "discount_pct": 6}],
        )
        pricing.save_rule(self.db, CO, None, name="Dealer promo", discount_type_id=disc.id, customer_group="dealer")
        q = self._quote()
        self.assertEqual((q.discount_pct, q.max_discount_pct), (D("3"), D("8")))  # brand line
        self.assertEqual(self._quote(5).discount_pct, D("6"))  # the product line beats the brand line
        pricing.check_line(q, label="MS-1", unit_price=D("860"), quantity=1, discount_amount=D("0"))
        with self.assertRaises(HTTPException) as low:
            pricing.check_line(q, label="MS-1", unit_price=D("850"), quantity=1, discount_amount=D("0"))
        self.assertIn("below the lowest Dealer price", low.exception.detail)
        with self.assertRaises(HTTPException):
            pricing.check_line(q, label="MS-1", unit_price=D("991"), quantity=1, discount_amount=D("0"))
        pricing.check_line(q, label="MS-1", unit_price=D("900"), quantity=2, discount_amount=D("144"))  # 8% of 1800
        with self.assertRaises(HTTPException) as cap:
            pricing.check_line(q, label="MS-1", unit_price=D("900"), quantity=2, discount_amount=D("145"))
        self.assertIn("maximum of 8", cap.exception.detail)

    def test_master_validation(self):
        with self.assertRaises(HTTPException):
            pricing.save_price_type(self.db, CO, None, name="dealer")  # same code as Dealer
        with self.assertRaises(HTTPException):
            pricing.save_discount_type(self.db, CO, None, name="Cap", max_pct=5, items=[{"item_id": "i1", "discount_pct": 6}])
        with self.assertRaises(HTTPException):
            pricing.save_discount_type(self.db, CO, None, name="Two", items=[{"item_id": "i1", "brand_id": "b1", "discount_pct": 1}])
        with self.assertRaises(HTTPException):
            pricing.save_rule(self.db, CO, None, name="Empty")  # neither a price type nor a discount type
        with self.assertRaises(HTTPException):
            pricing.save_price_type(self.db, CO, None, name="Bad", lower_limit_pct=120)
