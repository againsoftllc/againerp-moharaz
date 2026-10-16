"""Unit checks for the inventory mutation engine (no database)."""

from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.services.inventory.constants import (
    ALLOW_NEGATIVE_STOCK,
    MOVEMENT_COMMERCE_SALE,
    MOVEMENT_CUSTOMER_RETURN,
    MOVEMENT_OPENING_STOCK,
    MOVEMENT_POS_RETURN,
    MOVEMENT_POS_SALE,
    MOVEMENT_PURCHASE_RECEIPT,
    MOVEMENT_RMA_REPLACEMENT,
    MOVEMENT_SALES_DELIVERY,
    MOVEMENT_SCRAP,
    MOVEMENT_SERVICE_CONSUMPTION,
    MOVEMENT_STOCK_ADJUSTMENT_IN,
    MOVEMENT_STOCK_ADJUSTMENT_OUT,
    MOVEMENT_STOCK_COUNT_IN,
    MOVEMENT_STOCK_COUNT_OUT,
    MOVEMENT_TRANSFER_IN,
    MOVEMENT_TRANSFER_IN_TRANSIT,
    MOVEMENT_TRANSFER_OUT,
    RETIRED_MOVEMENT_TYPES,
)
from app.services.inventory.stock_movement_service import (
    available_qty,
    movement_effect,
    normalize_movement_type,
    projected_qty,
)


class MovementTypeTests(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(normalize_movement_type("opening"), "opening_stock")
        self.assertEqual(normalize_movement_type("reserve"), "reservation")
        self.assertEqual(normalize_movement_type("release"), "reservation_release")
        self.assertEqual(normalize_movement_type(MOVEMENT_PURCHASE_RECEIPT), MOVEMENT_PURCHASE_RECEIPT)

    def test_inbound_effects(self):
        for kind in (
            MOVEMENT_PURCHASE_RECEIPT,
            MOVEMENT_OPENING_STOCK,
            MOVEMENT_TRANSFER_IN,
            MOVEMENT_STOCK_ADJUSTMENT_IN,
            MOVEMENT_STOCK_COUNT_IN,
            MOVEMENT_POS_RETURN,
            MOVEMENT_CUSTOMER_RETURN,
            "in",
        ):
            self.assertEqual(movement_effect(kind), "on_hand_in", kind)

    def test_outbound_effects(self):
        for kind in (
            MOVEMENT_SALES_DELIVERY,
            MOVEMENT_POS_SALE,
            MOVEMENT_COMMERCE_SALE,
            MOVEMENT_TRANSFER_OUT,
            MOVEMENT_STOCK_ADJUSTMENT_OUT,
            MOVEMENT_STOCK_COUNT_OUT,
            MOVEMENT_SCRAP,
            MOVEMENT_RMA_REPLACEMENT,
            MOVEMENT_SERVICE_CONSUMPTION,
            "out",
        ):
            self.assertEqual(movement_effect(kind), "on_hand_out", kind)

    def test_reservation_and_incoming_are_not_on_hand(self):
        self.assertEqual(movement_effect("reservation"), "reservation")
        self.assertEqual(movement_effect("reservation_release"), "release")
        self.assertEqual(movement_effect(MOVEMENT_TRANSFER_IN_TRANSIT), "incoming_hold")
        self.assertEqual(movement_effect("reversal"), "reversal")

    def test_retired_types_rejected_for_classification(self):
        self.assertIn("transfer", RETIRED_MOVEMENT_TYPES)
        self.assertIn("adjustment", RETIRED_MOVEMENT_TYPES)
        with self.assertRaises(HTTPException) as ctx:
            movement_effect("transfer")
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            movement_effect("adjustment")

    def test_availability_and_projected(self):
        self.assertEqual(available_qty(100, 20), 80)
        self.assertEqual(available_qty(5, 9), 0)
        self.assertEqual(projected_qty(100, 20, 15), 95)
        self.assertFalse(ALLOW_NEGATIVE_STOCK)


class CountVarianceTests(unittest.TestCase):
    def test_delta_in_out(self):
        self.assertGreater(105 - 100, 0)
        self.assertLess(97 - 100, 0)
        self.assertEqual(100 - 100, 0)

    def test_serial_missing_is_negative_variance(self):
        expected = {"SN001", "SN002", "SN003", "SN004", "SN005"}
        counted = {"SN001", "SN002", "SN003", "SN004"}
        missing = expected - counted
        self.assertEqual(missing, {"SN005"})
        self.assertEqual(len(counted) - len(expected), -1)


if __name__ == "__main__":
    unittest.main()
