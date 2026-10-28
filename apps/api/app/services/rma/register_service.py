"""RMA registers and their analysis (OnerERP Reports › RMA: Complain, Replacement Claim, Replacement Receive, Customer Delivery,
each with an Analysis). Read-only over the RMA documents: no new tables, the same rows the RMA screens show.

`register` lists one document type in a date range; `analysis` groups that same list by one field, so the two always agree.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.rma import RmaDelivery, RmaReason, RmaSupplierClaim, RmaSupplierReceipt, RmaTicket
from app.services.rma.constants import (
    CLAIM_STATUS_LABELS,
    DELIVERY_OUTCOMES,
    DELIVERY_STATUS_LABELS,
    RECEIPT_OUTCOMES,
    RECEIPT_STATUS_LABELS,
    RMA_STATUS_LABELS,
    SALE_SOURCE_LABELS,
)

ZERO = Decimal("0")

REGISTER_KINDS = ("complain", "claim", "receive", "delivery")

# group-by choices per register: field on the row -> label shown in the picker
ANALYSIS_GROUPS: dict[str, dict[str, str]] = {
    "complain": {
        "product": "Product",
        "customer": "Customer",
        "problem": "Problem",
        "warranty": "Warranty",
        "sale_source": "Sale type",
        "engineer": "Engineer",
        "status": "Status",
    },
    "claim": {"supplier": "Supplier", "product": "Product", "status": "Status"},
    "receive": {"supplier": "Supplier", "outcome": "Receive type", "product": "Product", "status": "Status"},
    "delivery": {"outcome": "Delivery type", "customer": "Customer", "product": "Product", "status": "Status"},
}

WARRANTY_LABELS = {"in_warranty": "In warranty", "out_of_warranty": "Out of warranty", "unknown": "Unverified"}
# a document that has done its job (counted as "done" in the analysis)
_DONE = {"approved", "dispatched", "closed", "delivered", "completed", "returned_from_supplier", "ready_for_delivery"}


def _kind(kind: str) -> str:
    if kind not in REGISTER_KINDS:
        raise HTTPException(status_code=400, detail=f"Unknown RMA register: {kind}")
    return kind


def _in_range(column, date_from: Optional[date], date_to: Optional[date]):
    """Filters on the date part of a date or datetime column."""
    clauses = []
    if date_from:
        clauses.append(func.date(column) >= date_from)
    if date_to:
        clauses.append(func.date(column) <= date_to)
    return clauses


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _first_line(text: Optional[str]) -> str:
    lines = (text or "").strip().splitlines()
    return lines[0][:80] if lines else ""


def _tickets(db: Session, ids: set[str]) -> dict[str, RmaTicket]:
    if not ids:
        return {}
    return {row.id: row for row in db.query(RmaTicket).filter(RmaTicket.id.in_(ids)).all()}


def _matches(row: dict[str, Any], search: str) -> bool:
    needle = search.lower()
    fields = ("doc_number", "rma_number", "customer_name", "customer_phone", "supplier_name", "product_name", "sku", "serial_number", "new_serial", "invoice_no")
    return any(needle in str(row.get(f) or "").lower() for f in fields)


def _base(ticket: Optional[RmaTicket]) -> dict[str, Any]:
    if ticket is None:
        return {"rma_id": None, "rma_number": "", "customer_name": "", "customer_phone": "", "product_name": "", "sku": "", "serial_number": ""}
    return {
        "rma_id": ticket.id,
        "rma_number": ticket.rma_number,
        "customer_name": ticket.customer_name or "",
        "customer_phone": ticket.customer_phone or "",
        "product_name": ticket.product_name or "",
        "sku": ticket.sku or "",
        "serial_number": ticket.serial_number or "",
    }


def _complain_rows(db: Session, company_id: str, date_from, date_to, status) -> list[dict[str, Any]]:
    query = db.query(RmaTicket).filter(RmaTicket.company_id == company_id, *_in_range(RmaTicket.received_at, date_from, date_to))
    if status:
        query = query.filter(RmaTicket.status == status)
    reasons = {r.id: r.name for r in db.query(RmaReason).filter(RmaReason.company_id == company_id).all()}
    rows = []
    for t in query.order_by(RmaTicket.received_at.desc()).all():
        problem = reasons.get(t.reason_id or "") or _first_line(t.fault_reported)
        rows.append(
            {
                **_base(t),
                "id": t.id,
                "doc_number": t.rma_number,
                "doc_date": t.received_at.date() if t.received_at else None,
                "status": t.status,
                "status_label": RMA_STATUS_LABELS.get(t.status, t.status),
                "supplier_name": t.supplier_name or "",
                "sale_source": t.sale_source or "system",
                "sale_source_label": SALE_SOURCE_LABELS.get(t.sale_source or "system", t.sale_source or ""),
                "invoice_no": t.order_number or t.previous_invoice_no or "",
                "warranty_status": t.warranty_status,
                "warranty_label": WARRANTY_LABELS.get(t.warranty_status, t.warranty_status),
                "warranty_days_left": t.warranty_days_left,
                "problem": problem,
                "engineer": t.assigned_to or "",
                "promised_date": t.promised_delivery_date,
                "amount": _money(t.total),
                "refund": _money(t.refund_amount),
            }
        )
    return rows


def _claim_rows(db: Session, company_id: str, date_from, date_to, status) -> list[dict[str, Any]]:
    when = func.coalesce(RmaSupplierClaim.dispatch_date, func.date(RmaSupplierClaim.created_at))
    query = db.query(RmaSupplierClaim).filter(RmaSupplierClaim.company_id == company_id, *_in_range(when, date_from, date_to))
    if status:
        query = query.filter(RmaSupplierClaim.status == status)
    claims = query.order_by(RmaSupplierClaim.created_at.desc()).all()
    tickets = _tickets(db, {c.rma_id for c in claims})
    rows = []
    for c in claims:
        rows.append(
            {
                **_base(tickets.get(c.rma_id)),
                "id": c.id,
                "doc_number": c.claim_number,
                "doc_date": c.dispatch_date or (c.created_at.date() if c.created_at else None),
                "status": c.status,
                "status_label": CLAIM_STATUS_LABELS.get(c.status, c.status),
                "supplier_name": c.supplier_name or "",
                "product_name": c.product_name or "",
                "sku": c.sku or "",
                "serial_number": c.serial_number or "",
                "invoice_no": c.vendor_invoice_no or c.purchase_bill_no or "",
                "problem": _first_line(c.problem),
                "expected_return_date": c.expected_return_date,
                "amount": ZERO,
                "refund": ZERO,
            }
        )
    return rows


def _receive_rows(db: Session, company_id: str, date_from, date_to, status) -> list[dict[str, Any]]:
    when = func.coalesce(RmaSupplierReceipt.received_date, func.date(RmaSupplierReceipt.created_at))
    query = db.query(RmaSupplierReceipt).filter(RmaSupplierReceipt.company_id == company_id, *_in_range(when, date_from, date_to))
    if status:
        query = query.filter(RmaSupplierReceipt.status == status)
    receipts = query.order_by(RmaSupplierReceipt.created_at.desc()).all()
    tickets = _tickets(db, {r.rma_id for r in receipts})
    claims = {
        c.id: c.claim_number
        for c in db.query(RmaSupplierClaim.id, RmaSupplierClaim.claim_number).filter(RmaSupplierClaim.id.in_({r.claim_id for r in receipts} or {""})).all()
    }
    rows = []
    for r in receipts:
        base = _base(tickets.get(r.rma_id))
        rows.append(
            {
                **base,
                "id": r.id,
                "doc_number": r.receipt_number,
                "doc_date": r.received_date or (r.created_at.date() if r.created_at else None),
                "status": r.status,
                "status_label": RECEIPT_STATUS_LABELS.get(r.status, r.status),
                "supplier_name": r.supplier_name or "",
                "claim_number": claims.get(r.claim_id, ""),
                "serial_number": r.sent_serial or base["serial_number"],
                "new_serial": r.received_serial or "",
                "new_product": r.received_product_name or "",
                "outcome": r.outcome,
                "outcome_label": RECEIPT_OUTCOMES.get(r.outcome, r.outcome),
                "amount": ZERO,
                "refund": _money(r.refund_amount),
            }
        )
    return rows


def _delivery_rows(db: Session, company_id: str, date_from, date_to, status) -> list[dict[str, Any]]:
    when = func.coalesce(RmaDelivery.delivery_date, func.date(RmaDelivery.created_at))
    query = db.query(RmaDelivery).filter(RmaDelivery.company_id == company_id, *_in_range(when, date_from, date_to))
    if status:
        query = query.filter(RmaDelivery.status == status)
    deliveries = query.order_by(RmaDelivery.created_at.desc()).all()
    tickets = _tickets(db, {d.rma_id for d in deliveries})
    rows = []
    for d in deliveries:
        ticket = tickets.get(d.rma_id)
        base = _base(ticket)
        rows.append(
            {
                **base,
                "id": d.id,
                "doc_number": d.delivery_number,
                "doc_date": d.delivery_date or (d.created_at.date() if d.created_at else None),
                "status": d.status,
                "status_label": DELIVERY_STATUS_LABELS.get(d.status, d.status),
                "customer_name": d.delivered_to or base["customer_name"],
                "new_serial": d.serial_delivered or "",
                "new_product": (ticket.held_product_name or "") if ticket is not None and ticket.held_item_id else "",
                "outcome": d.outcome,
                "outcome_label": DELIVERY_OUTCOMES.get(d.outcome, d.outcome),
                "amount": _money(d.amount_total),
                "collected": _money(d.amount_received),
                "refund": _money(d.refund_amount),
            }
        )
    return rows


_BUILDERS = {"complain": _complain_rows, "claim": _claim_rows, "receive": _receive_rows, "delivery": _delivery_rows}


def register(
    db: Session,
    company_id: str,
    kind: str,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict[str, Any]]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="The start date is after the end date.")
    rows = _BUILDERS[_kind(kind)](db, company_id, date_from, date_to, status or None)
    term = (search or "").strip()
    return [row for row in rows if _matches(row, term)] if term else rows


def _group_value(row: dict[str, Any], group_by: str) -> tuple[str, str]:
    """(key, label) of a row for one group-by field."""
    if group_by == "product":
        return row.get("sku") or row.get("product_name") or "", row.get("product_name") or row.get("sku") or ""
    if group_by == "customer":
        return (row.get("customer_phone") or row.get("customer_name") or "").lower(), row.get("customer_name") or ""
    if group_by == "supplier":
        return (row.get("supplier_name") or "").lower(), row.get("supplier_name") or ""
    if group_by == "status":
        return row.get("status") or "", row.get("status_label") or ""
    if group_by == "outcome":
        return row.get("outcome") or "", row.get("outcome_label") or ""
    if group_by == "warranty":
        return row.get("warranty_status") or "", row.get("warranty_label") or ""
    if group_by == "sale_source":
        return row.get("sale_source") or "", row.get("sale_source_label") or ""
    if group_by == "engineer":
        return (row.get("engineer") or "").lower(), row.get("engineer") or ""
    if group_by == "problem":
        return (row.get("problem") or "").lower(), row.get("problem") or ""
    return "", ""


def analysis(
    db: Session,
    company_id: str,
    kind: str,
    *,
    group_by: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict[str, Any]]:
    groups = ANALYSIS_GROUPS[_kind(kind)]
    if group_by not in groups:
        raise HTTPException(status_code=400, detail=f"{kind} analysis cannot be grouped by {group_by}; use one of {', '.join(groups)}.")
    out: dict[str, dict[str, Any]] = {}
    for row in register(db, company_id, kind, date_from=date_from, date_to=date_to, status=status, search=search):
        key, label = _group_value(row, group_by)
        bucket = out.setdefault(
            key, {"key": key, "label": label or "Not set", "count": 0, "done": 0, "open": 0, "amount": ZERO, "collected": ZERO, "refund": ZERO}
        )
        bucket["count"] += 1
        if row.get("status") in _DONE:
            bucket["done"] += 1
        elif row.get("status") not in {"rejected", "cancelled"}:
            bucket["open"] += 1
        bucket["amount"] += row.get("amount") or ZERO
        bucket["collected"] += row.get("collected") or ZERO
        bucket["refund"] += row.get("refund") or ZERO
    return sorted(out.values(), key=lambda b: (-b["count"], b["label"].lower()))
