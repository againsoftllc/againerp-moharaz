"""RMA / service-job unit checks that do not need a database."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest import TestCase

from fastapi import HTTPException

from app.services.inventory.constants import MOVEMENT_RMA_REPLACEMENT, MOVEMENT_SERVICE_CONSUMPTION, ON_HAND_OUT_TYPES
from app.services.rma.constants import (
    RMA_STATUS_TRANSITIONS,
    RESOLUTION_TYPES,
    SERVICE_JOB_TYPES,
)
from app.services.rma.rma_service import process_refund, set_resolution
from app.services.rma.warranty import evaluate
from app.services.service.constants import JOB_STATUS_TRANSITIONS, JOB_STATUSES
from app.services.service.service_job_service import ServiceJobIntake, create_job


class WarrantyEngineTests(TestCase):
    def test_in_warranty(self):
        verdict = evaluate(
            warranty_text="1 year",
            purchased_on=date(2026, 1, 1),
            today=date(2026, 6, 1),
        )
        self.assertEqual(verdict.status, "in_warranty")
        self.assertEqual(verdict.expires_on, date(2027, 1, 1))

    def test_expired(self):
        verdict = evaluate(
            warranty_text="6 months",
            purchased_on=date(2025, 1, 1),
            today=date(2026, 1, 1),
        )
        self.assertEqual(verdict.status, "out_of_warranty")

    def test_not_found(self):
        verdict = evaluate(warranty_text=None, purchased_on=date(2026, 1, 1), today=date(2026, 6, 1))
        self.assertEqual(verdict.status, "unknown")


class StatusLifecycleTests(TestCase):
    def test_authorization_then_receive(self):
        self.assertIn("approved", RMA_STATUS_TRANSITIONS["pending_approval"])
        self.assertIn("received", RMA_STATUS_TRANSITIONS["awaiting_return"])
        self.assertNotIn("diagnosing", RMA_STATUS_TRANSITIONS["awaiting_return"])

    def test_resolution_is_separate_from_status(self):
        self.assertIn("paid_repair", RESOLUTION_TYPES)
        self.assertIn("warranty_repair", RESOLUTION_TYPES)
        ticket = SimpleNamespace(status="closed", resolution_type=None, resolution_status="pending")
        with self.assertRaises(HTTPException) as ctx:
            set_resolution(None, ticket, resolution_type="refund")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_refund_requires_original_order(self):
        ticket = SimpleNamespace(order_id=None, order_number=None, refund_id=None)
        with self.assertRaises(HTTPException) as ctx:
            process_refund(None, ticket, amount=100)
        self.assertEqual(ctx.exception.status_code, 400)


class JobCardLifecycleTests(TestCase):
    def test_qc_fail_returns_to_progress(self):
        self.assertIn("in_progress", JOB_STATUS_TRANSITIONS["ready_for_qc"])
        self.assertIn("ready_for_delivery", JOB_STATUS_TRANSITIONS["ready_for_qc"])

    def test_diagnosis_starts_from_received(self):
        self.assertIn("diagnosis", JOB_STATUS_TRANSITIONS["received"])
        self.assertIn("waiting_approval", JOB_STATUS_TRANSITIONS["diagnosis"])
        self.assertNotIn("completed", JOB_STATUS_TRANSITIONS["ready_for_qc"])

    def test_complete_blocked_while_qc_pending(self):
        from app.services.service.service_job_service import complete_job

        job = SimpleNamespace(status="in_progress", qc_status="pending")
        with self.assertRaises(HTTPException) as ctx:
            complete_job(None, job)
        self.assertEqual(ctx.exception.status_code, 400)


class ServiceJobTests(TestCase):
    def test_direct_jobs_exist_without_rma(self):
        self.assertIn("direct", SERVICE_JOB_TYPES)

    def test_customer_required(self):
        with self.assertRaises(HTTPException) as ctx:
            create_job(
                None,
                ServiceJobIntake(issue="Broken display", customer_name=""),
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_issue_required(self):
        with self.assertRaises(HTTPException) as ctx:
            create_job(
                None,
                ServiceJobIntake(issue="  ", customer_name="Walk-in"),
            )
        self.assertEqual(ctx.exception.status_code, 400)


class PhoneNormaliseTests(TestCase):
    def test_plus_880_matches_local(self):
        from app.services.rma.rma_service import looks_like_phone, normalize_phone_digits

        self.assertEqual(normalize_phone_digits("+8801712345678"), "01712345678")
        self.assertEqual(normalize_phone_digits("01712345678"), "01712345678")
        self.assertTrue(looks_like_phone("01712345678"))
        self.assertTrue(looks_like_phone("+880 1712-345678"))
        self.assertFalse(looks_like_phone("ORD-1001"))


class InventoryIntegrationTests(TestCase):
    def test_replacement_is_an_outbound_movement(self):
        self.assertIn(MOVEMENT_RMA_REPLACEMENT, ON_HAND_OUT_TYPES)
        self.assertIn(MOVEMENT_SERVICE_CONSUMPTION, ON_HAND_OUT_TYPES)
