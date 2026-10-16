"""Unit checks for stock-transfer validation helpers (no database)."""

from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.services.inventory.stock_transfer_service import StockTransferService


class CleanIdsTests(unittest.TestCase):
    def test_duplicate_serial_ids_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            StockTransferService._clean_ids(("SN001", "SN001"))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_strips_and_preserves_order(self):
        self.assertEqual(StockTransferService._clean_ids((" SN001 ", "SN002")), ["SN001", "SN002"])

    def test_blank_values_skipped(self):
        self.assertEqual(StockTransferService._clean_ids(("", "  ", "SN001")), ["SN001"])


if __name__ == "__main__":
    unittest.main()
