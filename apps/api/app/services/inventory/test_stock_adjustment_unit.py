"""Unit checks for stock-adjustment validation helpers (no database)."""

from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.services.inventory.stock_adjustment_service import StockAdjustmentService


class CleanIdsTests(unittest.TestCase):
    def test_duplicate_serial_ids_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            StockAdjustmentService._clean_ids(("a", "a"))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_duplicate_serial_numbers_rejected(self):
        with self.assertRaises(HTTPException):
            StockAdjustmentService._clean_serial_numbers(("SN001", "sn001"))

    def test_physical_formula(self):
        self.assertEqual(97 - 100, -3)
        self.assertEqual(105 - 100, 5)
        self.assertEqual(0 - 10, -10)


if __name__ == "__main__":
    unittest.main()
