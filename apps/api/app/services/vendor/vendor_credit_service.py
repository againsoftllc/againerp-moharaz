"""Vendor credit management — SPEC.md §30.

Outstanding/overdue are computed from the existing FinanceReceivable ledger
(source_type="vendor_invoice") — no separate vendor ledger table, same
reuse pattern as app.services.supplier.supplier_ledger_service.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.finance import FinanceReceivable
from app.models.vendor.vendor import Vendor


@dataclass(frozen=True)
class VendorCreditSummary:
    credit_limit: Decimal
    outstanding: Decimal
    overdue: Decimal
    available_credit: Decimal
    utilization_percent: Decimal
    exceeded: bool


def compute_credit_summary(db: Session, vendor: Vendor) -> VendorCreditSummary:
    outstanding = (
        db.query(func.coalesce(func.sum(FinanceReceivable.balance), 0))
        .filter(
            FinanceReceivable.customer_id == vendor.id,
            FinanceReceivable.source_type == "vendor_invoice",
            FinanceReceivable.status == "open",
        )
        .scalar()
    ) or Decimal("0")

    overdue = (
        db.query(func.coalesce(func.sum(FinanceReceivable.balance), 0))
        .filter(
            FinanceReceivable.customer_id == vendor.id,
            FinanceReceivable.source_type == "vendor_invoice",
            FinanceReceivable.status == "open",
            FinanceReceivable.due_date < date.today(),
        )
        .scalar()
    ) or Decimal("0")

    outstanding = Decimal(outstanding)
    overdue = Decimal(overdue)
    credit_limit = vendor.credit_limit
    cent = Decimal("0.01")
    available_credit = (credit_limit - outstanding).quantize(cent)
    utilization_percent = ((outstanding / credit_limit * 100) if credit_limit > 0 else Decimal("0")).quantize(cent)

    return VendorCreditSummary(
        credit_limit=credit_limit,
        outstanding=outstanding,
        overdue=overdue,
        available_credit=available_credit,
        utilization_percent=utilization_percent,
        exceeded=credit_limit > 0 and outstanding > credit_limit,
    )


def would_exceed_credit(db: Session, vendor: Vendor, additional_amount: Decimal) -> bool:
    if vendor.credit_limit <= 0:
        return False
    summary = compute_credit_summary(db, vendor)
    return (summary.outstanding + additional_amount) > vendor.credit_limit
