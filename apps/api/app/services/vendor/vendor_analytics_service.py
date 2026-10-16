"""Vendor analytics — SPEC.md §37-39.

Pure aggregation over existing tables (vendors, vendor_order_requests,
commerce_orders, finance_receivables) — no new storage, per SPEC §61.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce_order import CommerceOrder
from app.models.finance import FinanceReceivable
from app.models.vendor.vendor import Vendor
from app.models.vendor.vendor_order_request import VendorOrderRequest

DORMANT_DAYS = 60
CANCELLED_ORDER_REQUEST_STATUSES = ("rejected", "cancelled")


@dataclass(frozen=True)
class VendorAnalyticsOverview:
    total_vendors: int
    active_vendors: int
    new_vendors_30d: int
    active_order_requests: int
    total_revenue: Decimal
    average_order_value: Decimal
    order_count: int
    cancellation_rate: Decimal
    total_outstanding: Decimal
    dormant_vendors: int


@dataclass(frozen=True)
class VendorRankRow:
    vendor_id: str
    vendor_name: str
    revenue: Decimal
    order_count: int


def get_overview(db: Session, *, since: Optional[datetime] = None) -> VendorAnalyticsOverview:
    order_q = db.query(CommerceOrder).filter(CommerceOrder.vendor_id.isnot(None))
    if since:
        order_q = order_q.filter(CommerceOrder.created_at >= since)
    orders = order_q.all()

    order_count = len(orders)
    total_revenue = sum((o.grand_total for o in orders), Decimal("0"))
    average_order_value = (total_revenue / order_count) if order_count else Decimal("0")

    total_order_requests = db.query(VendorOrderRequest).count()
    cancelled_requests = (
        db.query(VendorOrderRequest)
        .filter(VendorOrderRequest.status.in_(CANCELLED_ORDER_REQUEST_STATUSES))
        .count()
    )
    cancellation_rate = (
        Decimal(cancelled_requests) / Decimal(total_order_requests) * 100 if total_order_requests else Decimal("0")
    )

    active_order_requests = (
        db.query(VendorOrderRequest)
        .filter(
            VendorOrderRequest.status.notin_(
                ("converted_to_order", "rejected", "cancelled")
            )
        )
        .count()
    )

    total_outstanding = (
        db.query(func.coalesce(func.sum(FinanceReceivable.balance), 0))
        .filter(FinanceReceivable.source_type == "vendor_invoice", FinanceReceivable.status == "open")
        .scalar()
    ) or Decimal("0")

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    new_vendors_30d = db.query(Vendor).filter(Vendor.created_at >= thirty_days_ago).count()

    dormant_cutoff = datetime.utcnow() - timedelta(days=DORMANT_DAYS)
    active_vendor_ids = {v.id for v in db.query(Vendor.id).filter(Vendor.status == "active")}
    vendors_with_recent_orders = {
        r.vendor_id
        for r in db.query(VendorOrderRequest.vendor_id)
        .filter(VendorOrderRequest.created_at >= dormant_cutoff)
        .distinct()
    }
    total_active_vendors = len(active_vendor_ids)
    dormant_vendors = len(active_vendor_ids - vendors_with_recent_orders)

    return VendorAnalyticsOverview(
        total_vendors=db.query(Vendor).count(),
        active_vendors=total_active_vendors,
        new_vendors_30d=new_vendors_30d,
        active_order_requests=active_order_requests,
        total_revenue=Decimal(total_revenue),
        average_order_value=average_order_value,
        order_count=order_count,
        cancellation_rate=cancellation_rate,
        total_outstanding=Decimal(total_outstanding),
        dormant_vendors=dormant_vendors,
    )


def rank_vendors(db: Session, *, since: Optional[datetime] = None, limit: int = 20) -> list[VendorRankRow]:
    q = (
        db.query(
            CommerceOrder.vendor_id,
            func.sum(CommerceOrder.grand_total).label("revenue"),
            func.count(CommerceOrder.id).label("order_count"),
        )
        .filter(CommerceOrder.vendor_id.isnot(None))
    )
    if since:
        q = q.filter(CommerceOrder.created_at >= since)
    rows = q.group_by(CommerceOrder.vendor_id).order_by(func.sum(CommerceOrder.grand_total).desc()).limit(limit).all()

    vendor_ids = [r.vendor_id for r in rows]
    vendors = {v.id: v for v in db.query(Vendor).filter(Vendor.id.in_(vendor_ids))} if vendor_ids else {}

    return [
        VendorRankRow(
            vendor_id=r.vendor_id,
            vendor_name=vendors[r.vendor_id].company_name if r.vendor_id in vendors else "Unknown vendor",
            revenue=Decimal(r.revenue or 0),
            order_count=r.order_count,
        )
        for r in rows
    ]


@dataclass(frozen=True)
class VendorScore:
    score: int
    tier: str
    payment_reliability: int
    order_frequency: int
    cancellation_penalty: int


def compute_vendor_score(db: Session, vendor: Vendor) -> VendorScore:
    """SPEC §38 — simple, explainable weighted score (not a black box).

    payment_reliability (0-40): share of this vendor's invoices with no
      overdue balance.
    order_frequency (0-30): order requests in the last 90 days, capped.
    cancellation_penalty (0-30, higher is better i.e. fewer cancellations):
      100% minus this vendor's own cancellation rate, scaled to 30.
    """
    invoices_open = (
        db.query(FinanceReceivable)
        .filter(FinanceReceivable.customer_id == vendor.id, FinanceReceivable.source_type == "vendor_invoice")
        .all()
    )
    if invoices_open:
        overdue = sum(1 for r in invoices_open if r.due_date and r.due_date < datetime.utcnow().date() and r.balance > 0)
        payment_reliability = round(40 * (1 - overdue / len(invoices_open)))
    else:
        payment_reliability = 40  # no history yet — no penalty

    ninety_days_ago = datetime.utcnow() - timedelta(days=90)
    recent_orders = (
        db.query(VendorOrderRequest)
        .filter(VendorOrderRequest.vendor_id == vendor.id, VendorOrderRequest.created_at >= ninety_days_ago)
        .count()
    )
    order_frequency = min(recent_orders * 3, 30)

    all_requests = db.query(VendorOrderRequest).filter(VendorOrderRequest.vendor_id == vendor.id).count()
    cancelled = (
        db.query(VendorOrderRequest)
        .filter(
            VendorOrderRequest.vendor_id == vendor.id,
            VendorOrderRequest.status.in_(CANCELLED_ORDER_REQUEST_STATUSES),
        )
        .count()
    )
    cancellation_rate = (cancelled / all_requests) if all_requests else 0
    cancellation_penalty = round(30 * (1 - cancellation_rate))

    score = payment_reliability + order_frequency + cancellation_penalty
    tier = "Gold" if score >= 80 else "Silver" if score >= 60 else "Bronze"

    return VendorScore(
        score=score,
        tier=tier,
        payment_reliability=payment_reliability,
        order_frequency=order_frequency,
        cancellation_penalty=cancellation_penalty,
    )
