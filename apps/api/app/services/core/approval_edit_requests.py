"""Sales order edit requests on Inventory > Approve (docs/approval.md).

A confirmed sales order is locked. Staff without admin rights press "Request edit" in the order's drawer and a
`SalesOrderEditRequest` is saved against that order (reason, who, when). Until now only that one order's drawer showed it, so an
admin had to open every order to find them. This module lists them on the Approve screen next to the held calls, as
"Order Edit" rows, and reviews them with the same Approve / Reject buttons.

The requests stay in their own table (the order drawer keeps working as it did): nothing here copies them. Their ids on the
Approve screen are `edit:<request id>` so they can sit in one list with the held calls.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.sales import SalesOrder
from app.models.sales_edit_request import SalesOrderEditRequest
from app.services.sales.sales_service import SalesService

EDIT_KEY = "sales.order_edit"
EDIT_LABEL = "Order Edit"
EDIT_PREFIX = "edit:"

# the request's own states, as the Approve screen's: an approved request waits for the sender's next save ("approved"),
# then is used up ("consumed"); both read as approved here
_STATUS = {"pending": "pending", "approved": "approved", "consumed": "approved", "rejected": "rejected"}


def is_edit_id(request_id: str) -> bool:
    return request_id.startswith(EDIT_PREFIX)


def _summary(row: SalesOrderEditRequest) -> str:
    who = row.requested_by_name or "the sender"
    reason = f" Reason: {row.reason}" if row.reason else ""
    if row.status == "pending":
        return f"Unlock this confirmed order for ONE edit by {who}.{reason}"
    if row.status == "approved":
        return f"Approved: {who} can edit the order once.{reason}"
    if row.status == "consumed":
        return f"Approved and used: {who} made the edit.{reason}"
    return f"Edit by {who} was not allowed.{reason}"


def edit_rows(db: Session, company_id: str, user: AuthUser, *, can_review: bool) -> list[dict[str, Any]]:
    """Edit requests as Approve-list rows (dicts shaped like `ApprovalRead`). Reviewers see all, others their own."""
    q = (
        db.query(SalesOrderEditRequest, SalesOrder)
        .join(SalesOrder, SalesOrder.id == SalesOrderEditRequest.sales_order_id)
        .filter(SalesOrderEditRequest.company_id == company_id, SalesOrder.deleted_at.is_(None))
    )
    if not can_review:
        q = q.filter(SalesOrderEditRequest.requested_by == user.id)
    pairs = q.order_by(SalesOrderEditRequest.requested_at.desc()).limit(300).all()
    customer_ids = {order.customer_id for _, order in pairs if order.customer_id}
    names = (
        {c.id: c.name for c in db.query(CommerceCustomer).filter(CommerceCustomer.id.in_(customer_ids)).all()}
        if customer_ids
        else {}
    )
    rows: list[dict[str, Any]] = []
    for req, order in pairs:
        status = _STATUS.get(req.status, "pending")
        rows.append(
            {
                "id": f"{EDIT_PREFIX}{req.id}",
                "action_key": EDIT_KEY,
                "group_key": "sales",
                "group_label": "Sales",
                "label": EDIT_LABEL,
                "reference": order.order_number,
                "party": names.get(order.customer_id),
                "amount": order.total,
                "summary": _summary(req),
                "entity_id": order.id,
                "doc_kind": "sales_order",
                "doc_id": order.id,
                "status": status,
                "requested_by": req.requested_by,
                "requested_by_name": req.requested_by_name or "",
                "requested_at": req.requested_at,
                "decided_by_name": req.reviewed_by_name,
                "decided_at": req.reviewed_at,
                "decision_note": req.review_note,
                "last_error": None,
                "can_decide": status == "pending" and can_review,
                "is_mine": req.requested_by == user.id,
            }
        )
    return rows


def pending_counts(db: Session, company_id: str, user: AuthUser, *, can_review: bool) -> tuple[int, int]:
    """(pending edit requests a reviewer can decide, pending ones the viewer sent)."""
    base = db.query(SalesOrderEditRequest).filter(
        SalesOrderEditRequest.company_id == company_id, SalesOrderEditRequest.status == "pending"
    )
    waiting = base.count() if can_review else 0
    mine = base.filter(SalesOrderEditRequest.requested_by == user.id).count()
    return waiting, mine


def review(
    db: Session,
    company_id: str,
    user: AuthUser,
    request_id: str,
    *,
    approve: bool,
    note: Optional[str],
    can_review: bool,
) -> None:
    """Approve or reject one edit request: the order's own review, called from the Approve screen."""
    if not can_review:
        raise HTTPException(status_code=403, detail="You do not have permission to review order edit requests")
    req = db.get(SalesOrderEditRequest, request_id.removeprefix(EDIT_PREFIX))
    if req is None or req.company_id != company_id:
        raise HTTPException(status_code=404, detail="Edit request not found")
    SalesService(db, company_id=company_id).review_edit_request(
        req.sales_order_id,
        req.id,
        approve=approve,
        actor_id=user.id,
        actor_name=user.name or user.username,
        note=note,
    )
    db.commit()
