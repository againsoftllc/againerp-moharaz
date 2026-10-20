"""Finance dashboard for a chosen period (Today, This month …) — the module's landing page.

Right now: what customers owe (receivables) and what we owe (payables), cash and bank balances, the tax position,
what is overdue, and what needs doing (unposted / failed postings, cheques still moving, expenses to approve).
In the period: money in and out (payments, internal transfers left out), invoices raised, supplier bills received,
expenses, the period before it for the change, a trend (by day up to 3 months, by month beyond), payments by method,
expenses by category and the latest payments.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.commerce_customer import CommerceCustomer
from app.models.commerce_supplier import CommerceSupplier
from app.models.finance import (
    FinanceCheque,
    FinanceExpense,
    FinanceExpenseCategory,
    FinancePayable,
    FinancePayment,
    FinancePaymentAccount,
    FinanceReceivable,
)
from app.services.finance.finance_service import FinanceService

OPEN = ("open", "partial")
CHEQUE_MOVING = ("received", "issued", "deposited", "presented")


def _f(value: Any) -> float:
    return float(Decimal(str(value or 0)))


def _between(column, date_from: Optional[date], date_to: Optional[date]):
    conds = []
    if date_from:
        conds.append(column >= date_from)
    if date_to:
        conds.append(column <= date_to)
    return conds


def _totals(db: Session, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    pay = (
        db.query(
            func.coalesce(func.sum(case((FinancePayment.direction == "inbound", FinancePayment.amount), else_=0)), 0),
            func.coalesce(func.sum(case((FinancePayment.direction == "outbound", FinancePayment.amount), else_=0)), 0),
            func.count(FinancePayment.id),
        )
        .filter(
            FinancePayment.company_id == company_id,
            FinancePayment.is_transfer.is_(False),
            *_between(FinancePayment.payment_date, date_from, date_to),
        )
        .one()
    )
    inbound, outbound, payment_count = _f(pay[0]), _f(pay[1]), int(pay[2] or 0)

    invoiced = (
        db.query(func.coalesce(func.sum(FinanceReceivable.amount), 0), func.count(FinanceReceivable.id))
        .filter(
            FinanceReceivable.company_id == company_id,
            FinanceReceivable.status != "void",
            *_between(func.date(FinanceReceivable.created_at), date_from, date_to),
        )
        .one()
    )
    billed = (
        db.query(func.coalesce(func.sum(FinancePayable.amount), 0), func.count(FinancePayable.id))
        .filter(
            FinancePayable.company_id == company_id,
            FinancePayable.status != "void",
            *_between(func.date(FinancePayable.created_at), date_from, date_to),
        )
        .one()
    )
    expenses = (
        db.query(func.coalesce(func.sum(FinanceExpense.total), 0), func.count(FinanceExpense.id))
        .filter(
            FinanceExpense.company_id == company_id,
            FinanceExpense.status != "rejected",
            *_between(FinanceExpense.expense_date, date_from, date_to),
        )
        .one()
    )
    return {
        "money_in": inbound,
        "money_out": outbound,
        "net_cash": inbound - outbound,
        "payment_count": payment_count,
        "invoiced": _f(invoiced[0]),
        "invoice_count": int(invoiced[1] or 0),
        "billed": _f(billed[0]),
        "bill_count": int(billed[1] or 0),
        "expenses": _f(expenses[0]),
        "expense_count": int(expenses[1] or 0),
    }


def _owed_by_party(db: Session, company_id: str, model, party_col, party_model) -> list[dict[str, Any]]:
    rows = (
        db.query(party_col, func.sum(model.balance), func.count(model.id))
        .filter(model.company_id == company_id, model.status.in_(OPEN), model.balance > 0)
        .group_by(party_col)
        .order_by(func.sum(model.balance).desc())
        .limit(5)
        .all()
    )
    out = []
    for party_id, total, count in rows:
        party = db.get(party_model, party_id) if party_id else None
        out.append({"party_id": party_id, "name": (party.name if party else None) or "—", "balance": _f(total), "count": int(count or 0)})
    return out


def dashboard_period(db: Session, company_id: str, date_from: Optional[date], date_to: Optional[date]) -> dict[str, Any]:
    service = FinanceService(db)
    today = date.today()

    # ── right now ──
    accounts = [a for a in service.list_payment_accounts_with_balance(company_id) if a["is_active"]]
    tax = service.get_tax_summary(company_id)
    health = service.get_posting_health(company_id)
    db.commit()  # ensure_* above may create the default accounts

    def _open_sum(model):
        return (
            db.query(func.coalesce(func.sum(model.balance), 0), func.count(model.id))
            .filter(model.company_id == company_id, model.status.in_(OPEN))
            .one()
        )

    def _overdue(model):
        return (
            db.query(func.coalesce(func.sum(model.balance), 0), func.count(model.id))
            .filter(model.company_id == company_id, model.status.in_(OPEN), model.due_date.isnot(None), model.due_date < today)
            .one()
        )

    ar_open, ar_count = _open_sum(FinanceReceivable)
    ap_open, ap_count = _open_sum(FinancePayable)
    ar_late, ar_late_count = _overdue(FinanceReceivable)
    ap_late, ap_late_count = _overdue(FinancePayable)

    snapshot = {
        "receivable_balance": _f(ar_open),
        "receivable_count": int(ar_count or 0),
        "payable_balance": _f(ap_open),
        "payable_count": int(ap_count or 0),
        "cash_total": sum(_f(a["balance"]) for a in accounts),
        "net_tax_payable": _f(tax["net_tax_payable"]),
        "overdue_receivable": _f(ar_late),
        "overdue_receivable_count": int(ar_late_count or 0),
        "overdue_payable": _f(ap_late),
        "overdue_payable_count": int(ap_late_count or 0),
    }
    attention = {
        "unposted_receivables": int(health.get("unposted_receivable_count", 0) or 0),
        "unposted_payables": int(health.get("unposted_payable_count", 0) or 0),
        "failed_postings": int(health.get("failed_posting_count", 0) or 0),
        "cheques_moving": db.query(FinanceCheque)
        .filter(FinanceCheque.company_id == company_id, FinanceCheque.status.in_(CHEQUE_MOVING))
        .count(),
        "expenses_to_approve": db.query(FinanceExpense)
        .filter(FinanceExpense.company_id == company_id, FinanceExpense.status == "draft")
        .count(),
        "overdue_receivables": int(ar_late_count or 0),
    }

    # ── in the period ──
    current = _totals(db, company_id, date_from, date_to)
    previous = None
    if date_from and date_to:
        span = date_to.toordinal() - date_from.toordinal() + 1
        prev_to = date.fromordinal(date_from.toordinal() - 1)
        previous = _totals(db, company_id, date.fromordinal(prev_to.toordinal() - span + 1), prev_to)

    first, last = date_from, date_to or today
    if first is None:
        first = db.query(func.min(FinancePayment.payment_date)).filter(FinancePayment.company_id == company_id).scalar() or last
        if isinstance(first, datetime):
            first = first.date()
    by_month = (last.toordinal() - first.toordinal()) > 92
    bucket = func.date_trunc("month", FinancePayment.payment_date) if by_month else FinancePayment.payment_date
    trend_rows = (
        db.query(
            bucket,
            func.coalesce(func.sum(case((FinancePayment.direction == "inbound", FinancePayment.amount), else_=0)), 0),
            func.coalesce(func.sum(case((FinancePayment.direction == "outbound", FinancePayment.amount), else_=0)), 0),
        )
        .filter(
            FinancePayment.company_id == company_id,
            FinancePayment.is_transfer.is_(False),
            *_between(FinancePayment.payment_date, first, last),
        )
        .group_by(bucket)
        .all()
    )
    points: dict[date, tuple[float, float]] = {}
    for key, money_in, money_out in trend_rows:
        d = key.date() if isinstance(key, datetime) else key
        points[d.replace(day=1) if by_month else d] = (_f(money_in), _f(money_out))
    series = []
    cursor = first.replace(day=1) if by_month else first
    while cursor <= last:
        money_in, money_out = points.get(cursor, (0.0, 0.0))
        series.append({
            "date": cursor.isoformat(),
            "label": cursor.strftime("%b %Y") if by_month else cursor.strftime("%b %d"),
            "money_in": money_in,
            "money_out": money_out,
        })
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1) if by_month else cursor + timedelta(days=1)

    by_method_rows = (
        db.query(FinancePayment.payment_method, func.sum(FinancePayment.amount), func.count(FinancePayment.id))
        .filter(
            FinancePayment.company_id == company_id,
            FinancePayment.is_transfer.is_(False),
            *_between(FinancePayment.payment_date, date_from, date_to),
        )
        .group_by(FinancePayment.payment_method)
        .order_by(func.sum(FinancePayment.amount).desc())
        .all()
    )
    expense_rows = (
        db.query(FinanceExpenseCategory.name, func.sum(FinanceExpense.total), func.count(FinanceExpense.id))
        .join(FinanceExpense, FinanceExpense.category_id == FinanceExpenseCategory.id)
        .filter(
            FinanceExpense.company_id == company_id,
            FinanceExpense.status != "rejected",
            *_between(FinanceExpense.expense_date, date_from, date_to),
        )
        .group_by(FinanceExpenseCategory.name)
        .order_by(func.sum(FinanceExpense.total).desc())
        .limit(6)
        .all()
    )
    recent = (
        db.query(FinancePayment)
        .filter(
            FinancePayment.company_id == company_id,
            FinancePayment.is_transfer.is_(False),
            *_between(FinancePayment.payment_date, date_from, date_to),
        )
        .order_by(FinancePayment.payment_date.desc(), FinancePayment.created_at.desc())
        .limit(10)
        .all()
    )
    account_names = {a["id"]: a["name"] for a in accounts}
    for p in recent:
        if p.payment_account_id and p.payment_account_id not in account_names:
            acc = db.get(FinancePaymentAccount, p.payment_account_id)
            account_names[p.payment_account_id] = acc.name if acc else "—"

    def _party(p: FinancePayment) -> Optional[str]:
        if not p.party_id:
            return None
        model = CommerceSupplier if p.party_type == "supplier" else CommerceCustomer
        party = db.get(model, p.party_id)
        return party.name if party else None

    return {
        "date_from": date_from,
        "date_to": date_to,
        "snapshot": snapshot,
        "attention": attention,
        "cash_accounts": [
            {"id": a["id"], "name": a["name"], "kind": a["kind"], "balance": _f(a["balance"])}
            for a in sorted(accounts, key=lambda a: -_f(a["balance"]))
        ],
        "top_receivables": _owed_by_party(db, company_id, FinanceReceivable, FinanceReceivable.customer_id, CommerceCustomer),
        "top_payables": _owed_by_party(db, company_id, FinancePayable, FinancePayable.supplier_id, CommerceSupplier),
        "current": current,
        "previous": previous,
        "series": series,
        "by_month": by_month,
        "by_method": [{"method": m or "other", "amount": _f(total), "count": int(c or 0)} for m, total, c in by_method_rows],
        "expenses_by_category": [{"name": n, "total": _f(total), "count": int(c or 0)} for n, total, c in expense_rows],
        "recent_payments": [
            {
                "id": p.id,
                "date": p.payment_date,
                "payment_number": p.payment_number,
                "direction": p.direction,
                "amount": _f(p.amount),
                "method": p.payment_method,
                "account": account_names.get(p.payment_account_id or "", None),
                "party": _party(p),
                "reference": p.reference,
            }
            for p in recent
        ],
    }
