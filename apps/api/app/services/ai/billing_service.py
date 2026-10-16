"""AI usage packages, subscriptions, and on-demand overage billing — local to
this deployment (see ai_package.py's module docstring for why this exists
alongside the deliberately billing-free usage_service.py).

Design, in one paragraph: a company has one AiSubscription (a package + a
rolling billing period). Each period tracks token usage by summing
ai_audit_logs (same source usage_service.py already reads — no duplicate
instrumentation). When a period rolls over, if usage exceeded the package's
included_tokens and on-demand was enabled, an AiOverageInvoice is raised for
that closed period at OVERAGE_RATE_BDT_PER_1K. Any unpaid invoice blocks
further AI usage — mirroring Cursor's "pay to continue" gate — checked from
the same call site as the existing Center entitlement gate.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.ai_audit_log import AiAuditLog
from app.models.ai_package import AiOverageInvoice, AiPackage, AiSubscription

# ৳ per 1,000 tokens once a company is over its included allowance and has
# on-demand enabled — deliberately above every package's own effective rate,
# so staying on overage long-term costs more than upgrading (see the 3
# packages below: Starter ≈ ৳1.17/1K, Growth ≈ ৳0.91/1K, Scale ≈ ৳0.83/1K).
OVERAGE_RATE_BDT_PER_1K = Decimal("1.5")

PACKAGE_SEED = (
    {
        "slug": "starter",
        "name": "Starter",
        "price_bdt": Decimal("3500"),
        "included_tokens": 3_000_000,
        "description": "Entry-level plan — good for light day-to-day AI assistant use.",
        "sort_order": 1,
    },
    {
        "slug": "growth",
        "name": "Growth",
        "price_bdt": Decimal("9999"),
        "included_tokens": 11_000_000,
        "description": "For teams using the AI assistant across most modules daily.",
        "sort_order": 2,
    },
    {
        "slug": "scale",
        "name": "Scale",
        "price_bdt": Decimal("19999"),
        "included_tokens": 24_000_000,
        "description": "Heavy, multi-user AI usage with the best per-token rate.",
        "sort_order": 3,
    },
)


def ensure_packages(db: Session) -> None:
    """Idempotent seed — inserts missing packages, updates price/tokens on existing
    ones so redeploys can adjust the catalog without a data migration."""
    existing = {p.slug: p for p in db.query(AiPackage).all()}
    for spec in PACKAGE_SEED:
        row = existing.get(spec["slug"])
        if row is None:
            db.add(AiPackage(**spec))
        else:
            row.name = spec["name"]
            row.price_bdt = spec["price_bdt"]
            row.included_tokens = spec["included_tokens"]
            row.description = spec["description"]
            row.sort_order = spec["sort_order"]
    db.flush()


def list_packages(db: Session) -> list[AiPackage]:
    return (
        db.query(AiPackage)
        .filter(AiPackage.is_active.is_(True))
        .order_by(AiPackage.sort_order)
        .all()
    )


def _cheapest_package(db: Session) -> AiPackage:
    pkg = db.query(AiPackage).filter(AiPackage.is_active.is_(True)).order_by(AiPackage.sort_order).first()
    if not pkg:
        raise HTTPException(status_code=500, detail="No AI packages configured")
    return pkg


def _add_one_month(d: date) -> date:
    year = d.year + (1 if d.month == 12 else 0)
    month = 1 if d.month == 12 else d.month + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _new_period(start: date) -> tuple[date, date]:
    return start, _add_one_month(start) - timedelta(days=1)


def _close_period_and_maybe_invoice(db: Session, sub: AiSubscription) -> None:
    package = db.get(AiPackage, sub.package_id)
    used = period_usage_tokens(db, sub.company_id, sub.current_period_start, sub.current_period_end)
    if package and sub.on_demand_enabled and used > package.included_tokens:
        overage_tokens = used - package.included_tokens
        amount = (Decimal(overage_tokens) / Decimal(1000)) * OVERAGE_RATE_BDT_PER_1K
        db.add(
            AiOverageInvoice(
                company_id=sub.company_id,
                subscription_id=sub.id,
                period_start=sub.current_period_start,
                period_end=sub.current_period_end,
                overage_tokens=overage_tokens,
                amount_bdt=amount.quantize(Decimal("0.01")),
                status="unpaid",
            )
        )


def get_or_create_subscription(db: Session, company_id: str = "default") -> AiSubscription:
    ensure_packages(db)
    sub = db.query(AiSubscription).filter(AiSubscription.company_id == company_id).first()
    if sub is None:
        start, end = _new_period(date.today())
        sub = AiSubscription(
            company_id=company_id,
            package_id=_cheapest_package(db).id,
            on_demand_enabled=False,
            current_period_start=start,
            current_period_end=end,
        )
        db.add(sub)
        db.flush()
        return sub

    today = date.today()
    while today > sub.current_period_end:
        _close_period_and_maybe_invoice(db, sub)
        start = sub.current_period_end + timedelta(days=1)
        sub.current_period_start, sub.current_period_end = _new_period(start)
    db.flush()
    return sub


def period_usage_tokens(db: Session, company_id: str, start: date, end: date) -> int:
    rows = (
        db.query(AiAuditLog)
        .filter(
            AiAuditLog.company_id == company_id,
            AiAuditLog.logged_at >= datetime.combine(start, datetime.min.time()),
            AiAuditLog.logged_at < datetime.combine(end + timedelta(days=1), datetime.min.time()),
        )
        .all()
    )
    total = 0
    for row in rows:
        total += (row.input_tokens or 0) + (row.output_tokens or 0)
        total += (row.cache_creation_input_tokens or 0) + (row.cache_read_input_tokens or 0)
    return total


def unpaid_invoice(db: Session, company_id: str) -> Optional[AiOverageInvoice]:
    return (
        db.query(AiOverageInvoice)
        .filter(AiOverageInvoice.company_id == company_id, AiOverageInvoice.status == "unpaid")
        .order_by(AiOverageInvoice.created_at.asc())
        .first()
    )


def check_package_usage_allowed(db: Session, company_id: str = "default") -> tuple[bool, str]:
    """(allowed, reason) — called from the same gate as the Center entitlement
    check. 'unpaid_invoice' / 'over_limit' are the two block reasons; the
    frontend already renders both distinctly (Payment Required vs Upgrade)."""
    sub = get_or_create_subscription(db, company_id)
    if unpaid_invoice(db, company_id) is not None:
        return False, "unpaid_invoice"
    package = db.get(AiPackage, sub.package_id)
    if not package:
        return True, "ok"
    used = period_usage_tokens(db, company_id, sub.current_period_start, sub.current_period_end)
    if used < package.included_tokens:
        return True, "ok"
    if sub.on_demand_enabled:
        return True, "on_demand"
    return False, "over_limit"


def plan_overview(db: Session, company_id: str = "default") -> dict:
    sub = get_or_create_subscription(db, company_id)
    package = db.get(AiPackage, sub.package_id)
    used = period_usage_tokens(db, company_id, sub.current_period_start, sub.current_period_end)
    invoice = unpaid_invoice(db, company_id)
    percent_used = min(100.0, round((used / package.included_tokens) * 100, 1)) if package and package.included_tokens else 0.0
    return {
        "subscription": sub,
        "package": package,
        "tokens_used": used,
        "percent_used": percent_used,
        "unpaid_invoice": invoice,
    }


def select_package(db: Session, company_id: str, package_id: str) -> AiSubscription:
    package = db.get(AiPackage, package_id)
    if not package or not package.is_active:
        raise HTTPException(status_code=404, detail="Package not found")
    sub = get_or_create_subscription(db, company_id)
    sub.package_id = package.id
    db.flush()
    return sub


def set_on_demand(db: Session, company_id: str, enabled: bool) -> AiSubscription:
    sub = get_or_create_subscription(db, company_id)
    sub.on_demand_enabled = enabled
    db.flush()
    return sub


def pay_invoice(db: Session, company_id: str, invoice_id: str) -> AiOverageInvoice:
    """No real payment gateway is wired up yet — this just marks the invoice
    settled, matching a manual/offline payment being recorded. Wire a real
    processor here before relying on this for actual money collection."""
    invoice = db.get(AiOverageInvoice, invoice_id)
    if not invoice or invoice.company_id != company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status != "paid":
        invoice.status = "paid"
        invoice.paid_at = datetime.utcnow()
        db.flush()
    return invoice
