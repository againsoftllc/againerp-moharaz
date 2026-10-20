"""RMA work queues (docs/RMA.md Phase 5): what is overdue, what is waiting on a supplier, what keeps coming back.

Everything here is a *read* over the existing records (tickets, supplier claims, supplier receipts): no new tables and no
state of its own. "Open" means the unit is still the shop's problem (not delivered, closed, rejected or cancelled).

  overdue            an open, approved RMA whose promised delivery date has passed
  supplier pending   the supplier leg is not finished: a claim waiting for approval or dispatch, a unit out with the supplier
                     (flagged late when the expected return date has passed), or a receipt waiting for approval
  repeat             an RMA on a unit / customer that has been through the RMA process before

Also here: the document guard used before an RMA is rejected or cancelled (no open claim, receipt, delivery or settlement is
left dangling) and the Service / Job Card summary shown on the RMA.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.rma import (
    RmaDelivery,
    RmaSettlement,
    RmaSupplierClaim,
    RmaSupplierReceipt,
    RmaTicket,
)

DONE_STATUSES = frozenset({"closed", "rejected", "cancelled", "delivered"})
# An RMA is only "overdue" once the complaint is approved and the unit is in the shop's hands.
NOT_STARTED = frozenset({"draft", "pending_approval", "correction_requested"})

# A claim stays "dispatched" for good once sent, so only the steps before dispatch count as open documents.
CLAIM_OPEN = ("draft", "pending_approval", "correction_requested", "approved")
RECEIPT_OPEN = ("draft", "pending_approval", "correction_requested")
DELIVERY_OPEN = ("draft", "pending_approval", "correction_requested")
SETTLEMENT_OPEN = ("draft", "pending_approval", "correction_requested")

QUEUES = ("overdue", "supplier_pending", "repeat")


def is_open(ticket: RmaTicket) -> bool:
    return ticket.status not in DONE_STATUSES


def days_overdue(ticket: RmaTicket, today: Optional[date] = None) -> int:
    """Whole days past the promised delivery date (0 when not overdue)."""
    today = today or date.today()
    if not ticket.promised_delivery_date or not is_open(ticket) or ticket.status in NOT_STARTED:
        return 0
    return max((today - ticket.promised_delivery_date).days, 0)


def days_open(ticket: RmaTicket, today: Optional[date] = None) -> int:
    start = ticket.created_at.date() if ticket.created_at else (today or date.today())
    end = ticket.closed_at.date() if ticket.closed_at else (today or date.today())
    return max((end - start).days, 0)


# ------------------------------------------------------------- the ticket list


def apply_queue(query, db: Session, queue: str, today: Optional[date] = None):
    """Narrow a `RmaTicket` query to one work queue."""
    today = today or date.today()
    if queue == "overdue":
        return query.filter(
            RmaTicket.status.notin_(DONE_STATUSES | NOT_STARTED),
            RmaTicket.promised_delivery_date.isnot(None),
            RmaTicket.promised_delivery_date < today,
        )
    if queue == "supplier_pending":
        open_claim = db.query(RmaSupplierClaim.rma_id).filter(RmaSupplierClaim.status.in_(CLAIM_OPEN))
        # (a dispatched claim counts only while the unit is still out: custody_state == with_supplier)
        open_receipt = db.query(RmaSupplierReceipt.rma_id).filter(RmaSupplierReceipt.status.in_(RECEIPT_OPEN))
        return query.filter(
            RmaTicket.status.notin_(DONE_STATUSES),
            or_(
                RmaTicket.custody_state == "with_supplier",
                RmaTicket.status.in_(("sent_to_supplier", "at_supplier")),  # an older manual supplier job has no claim
                RmaTicket.id.in_(open_claim),
                RmaTicket.id.in_(open_receipt),
            ),
        )
    if queue == "repeat":
        return query.filter(RmaTicket.status.notin_(DONE_STATUSES), RmaTicket.prior_rma_count > 0)
    raise ValueError(f"Unknown queue: {queue}")


# ----------------------------------------------------------- supplier pending


def supplier_pending(db: Session, company_id: str, today: Optional[date] = None) -> list[dict[str, Any]]:
    """One row per RMA whose supplier leg is unfinished, with where it is stuck and how long."""
    today = today or date.today()
    rows: list[dict[str, Any]] = []
    claims = (
        db.query(RmaSupplierClaim, RmaTicket)
        .join(RmaTicket, RmaTicket.id == RmaSupplierClaim.rma_id)
        .filter(
            RmaTicket.company_id == company_id,
            or_(
                RmaSupplierClaim.status.in_(CLAIM_OPEN),
                (RmaSupplierClaim.status == "dispatched") & (RmaTicket.custody_state == "with_supplier"),
            ),
            RmaTicket.status.notin_(DONE_STATUSES),
        )
        .order_by(RmaSupplierClaim.created_at)
        .all()
    )
    seen: set[str] = set()
    for claim, ticket in claims:
        seen.add(ticket.id)
        if claim.status == "dispatched":
            state, since = "with_supplier", claim.dispatched_at.date() if claim.dispatched_at else claim.dispatch_date
        elif claim.status == "approved":
            state, since = "ready_to_dispatch", claim.decided_at.date() if claim.decided_at else None
        else:
            state, since = "claim_waiting_approval", claim.created_at.date() if claim.created_at else None
        expected = claim.expected_return_date
        rows.append(
            {
                "rma_id": ticket.id,
                "rma_number": ticket.rma_number,
                "customer_name": ticket.customer_name,
                "product_name": ticket.product_name or ticket.sku,
                "serial_number": ticket.received_serial_number or ticket.serial_number,
                "claim_id": claim.id,
                "claim_number": claim.claim_number,
                "supplier_name": claim.supplier_name,
                "state": state,
                "since": since,
                "days_waiting": max((today - since).days, 0) if since else 0,
                "expected_return_date": expected,
                "is_late": bool(state == "with_supplier" and expected and expected < today),
            }
        )
    receipts = (
        db.query(RmaSupplierReceipt, RmaSupplierClaim, RmaTicket)
        .join(RmaSupplierClaim, RmaSupplierClaim.id == RmaSupplierReceipt.claim_id)
        .join(RmaTicket, RmaTicket.id == RmaSupplierReceipt.rma_id)
        .filter(
            RmaTicket.company_id == company_id,
            RmaSupplierReceipt.status.in_(RECEIPT_OPEN),
            RmaTicket.status.notin_(DONE_STATUSES),
        )
        .all()
    )
    for receipt, claim, ticket in receipts:
        since = receipt.created_at.date() if receipt.created_at else None
        rows.append(
            {
                "rma_id": ticket.id,
                "rma_number": ticket.rma_number,
                "customer_name": ticket.customer_name,
                "product_name": ticket.product_name or ticket.sku,
                "serial_number": ticket.received_serial_number or ticket.serial_number,
                "claim_id": claim.id,
                "claim_number": claim.claim_number,
                "supplier_name": claim.supplier_name,
                "state": "receipt_waiting_approval",
                "since": since,
                "days_waiting": max((today - since).days, 0) if since else 0,
                "expected_return_date": claim.expected_return_date,
                "is_late": False,
            }
        )
    # a unit marked with the supplier that has no open claim (older, manual supplier job) still belongs on the list
    manual = (
        db.query(RmaTicket)
        .filter(
            RmaTicket.company_id == company_id,
            RmaTicket.status.in_(("sent_to_supplier", "at_supplier")),
            RmaTicket.id.notin_(seen),
        )
        .all()
    )
    for ticket in manual:
        job = ticket.supplier_job
        since = job.dispatched_at if job and job.dispatched_at else None
        expected = job.expected_return_date if job else None
        rows.append(
            {
                "rma_id": ticket.id,
                "rma_number": ticket.rma_number,
                "customer_name": ticket.customer_name,
                "product_name": ticket.product_name or ticket.sku,
                "serial_number": ticket.serial_number,
                "claim_id": None,
                "claim_number": None,
                "supplier_name": "",
                "state": "with_supplier",
                "since": since,
                "days_waiting": max((today - since).days, 0) if since else 0,
                "expected_return_date": expected,
                "is_late": bool(expected and expected < today),
            }
        )
    order = {"with_supplier": 0, "receipt_waiting_approval": 1, "ready_to_dispatch": 2, "claim_waiting_approval": 3}
    rows.sort(key=lambda r: (not r["is_late"], order.get(r["state"], 9), -r["days_waiting"]))
    return rows


# ------------------------------------------------------------------ the queues


def overdue_rows(db: Session, company_id: str, today: Optional[date] = None) -> list[dict[str, Any]]:
    today = today or date.today()
    tickets = apply_queue(db.query(RmaTicket).filter(RmaTicket.company_id == company_id), db, "overdue", today).all()
    rows = [
        {
            "rma_id": t.id,
            "rma_number": t.rma_number,
            "customer_name": t.customer_name,
            "product_name": t.product_name or t.sku,
            "status": t.status,
            "custody_state": t.custody_state,
            "promised_delivery_date": t.promised_delivery_date,
            "days_overdue": days_overdue(t, today),
        }
        for t in tickets
    ]
    rows.sort(key=lambda r: -r["days_overdue"])
    return rows


def repeat_rows(db: Session, company_id: str) -> list[dict[str, Any]]:
    tickets = (
        apply_queue(db.query(RmaTicket).filter(RmaTicket.company_id == company_id, RmaTicket.status.notin_(DONE_STATUSES)), db, "repeat")
        .order_by(RmaTicket.prior_rma_count.desc(), RmaTicket.created_at.desc())
        .all()
    )
    return [
        {
            "rma_id": t.id,
            "rma_number": t.rma_number,
            "customer_name": t.customer_name,
            "product_name": t.product_name or t.sku,
            "serial_number": t.serial_number,
            "status": t.status,
            "prior_rma_count": t.prior_rma_count,
        }
        for t in tickets
    ]


def queues(db: Session, company_id: str, today: Optional[date] = None) -> dict[str, Any]:
    today = today or date.today()
    overdue = overdue_rows(db, company_id, today)
    pending = supplier_pending(db, company_id, today)
    repeat = repeat_rows(db, company_id)
    return {
        "overdue": overdue,
        "supplier_pending": pending,
        "repeat": repeat,
        "counts": {
            "overdue": len(overdue),
            "supplier_pending": len(pending),
            "supplier_late": sum(1 for r in pending if r["is_late"]),
            "repeat": len(repeat),
        },
    }


# --------------------------------------------------------- the document guard


def open_documents(db: Session, ticket: RmaTicket) -> list[str]:
    """Open documents (not yet decided / cancelled) that would be left dangling if the RMA were rejected or cancelled."""
    found: list[str] = []
    for model, number_attr, statuses, label in (
        (RmaSupplierClaim, "claim_number", CLAIM_OPEN, "supplier claim"),
        (RmaSupplierReceipt, "receipt_number", RECEIPT_OPEN, "supplier receipt"),
        (RmaDelivery, "delivery_number", DELIVERY_OPEN, "customer delivery"),
        (RmaSettlement, "settlement_number", SETTLEMENT_OPEN, "settlement"),
    ):
        number_col = getattr(model, number_attr, None)
        if number_col is None:
            continue
        for number in db.query(number_col).filter(model.rma_id == ticket.id, model.status.in_(statuses)).all():
            found.append(f"{label} {number[0]}")
    return found


# ------------------------------------------------------------------ job card


def service_job_summary(db: Session, ticket: RmaTicket) -> Optional[dict[str, Any]]:
    """The linked Service / Job Card (if any): enough to show where the repair stands and to open it."""
    if not ticket.service_job_id:
        return None
    from app.models.service_job import ServiceJob

    job = db.get(ServiceJob, ticket.service_job_id)
    if job is None:
        return None
    return {
        "id": job.id,
        "job_number": job.job_number,
        "status": job.status,
        "service_type": job.service_type,
        "technician_name": getattr(job, "technician_name", "") or "",
        "expected_at": getattr(job, "expected_at", None),
        "labour_total": getattr(job, "labour_total", None),
        "parts_total": getattr(job, "parts_total", None),
    }
