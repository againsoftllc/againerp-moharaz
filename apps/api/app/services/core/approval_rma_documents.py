"""RMA documents waiting for a decision, on Inventory > Approve (docs/approval.md).

Every RMA document (the complaint, a customer delivery, a supplier claim, a supplier receipt, a settlement) has its own
*Send for approval* step, and sits as "Pending approval" until someone decides it in the RMA. The Approve screen shows the
same decisions as the held calls of Purchase, Sales and Finance: one list, **Approve / Reject** in the row, a click opens the
RMA itself.

Nothing is copied: these rows are read from the RMA tables, so the RMA drawer and this screen can never disagree. Their ids on
the Approve screen are `rma:<kind>:<document id>`. Deciding goes through the real decision endpoint (`POST
/rma/<documents>/{id}/decision`), so every rule of the RMA still runs. A held call (a user who pressed Approve without the
right) already has its own row; the RMA document it waits on is then not listed a second time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.approval_request import ApprovalRequest
from app.models.auth_user import AuthUser
from app.models.rma import (
    RmaDelivery,
    RmaSettlement,
    RmaStatusHistory,
    RmaSupplierClaim,
    RmaSupplierReceipt,
    RmaTicket,
)
from app.services.core.approval_actions import ACTION_BY_KEY
from app.services.core.approval_gate import GROUPS, Rights

RMA_PREFIX = "rma:"
_PENDING = "pending_approval"


@dataclass(frozen=True)
class _Kind:
    code: str
    model: Any
    action_key: str
    # the decision endpoint, after /api/v1/
    endpoint: str
    # the document's own columns for the decision it carries
    decision: str
    decided_by_name: str
    decided_at: str
    reason: str


KINDS: dict[str, _Kind] = {
    k.code: k
    for k in (
        _Kind("ticket", RmaTicket, "rma.complain_receive", "rma/tickets/{id}/decision",
              "complaint_decision", "complaint_decided_by_name", "complaint_decided_at", "complaint_decision_reason"),
        _Kind("delivery", RmaDelivery, "rma.customer_delivery", "rma/deliveries/{id}/decision",
              "decision", "decided_by_name", "decided_at", "decision_reason"),
        _Kind("claim", RmaSupplierClaim, "rma.replacement_claim", "rma/claims/{id}/decision",
              "decision", "decided_by_name", "decided_at", "decision_reason"),
        _Kind("receipt", RmaSupplierReceipt, "rma.replacement_receive", "rma/receipts/{id}/decision",
              "decision", "decided_by_name", "decided_at", "decision_reason"),
        _Kind("settlement", RmaSettlement, "rma.settlement", "rma/settlements/{id}/decision",
              "decision", "decided_by_name", "decided_at", "decision_reason"),
    )
}


def is_rma_id(request_id: str) -> bool:
    return request_id.startswith(RMA_PREFIX)


def parse_id(request_id: str) -> tuple[_Kind, str]:
    parts = request_id.split(":", 2)
    if len(parts) != 3 or parts[1] not in KINDS or not parts[2]:
        raise ValueError("Not an RMA approval id")
    return KINDS[parts[1]], parts[2]


def decision_call(request_id: str, *, approve: bool, note: Optional[str]) -> tuple[str, str]:
    """(path, JSON body) of the decision endpoint that decides this row."""
    import json

    kind, doc_id = parse_id(request_id)
    text = (note or "").strip()
    body: dict[str, Any] = {"decision": "approved" if approve else "rejected"}
    if approve:
        if text:
            body["reason"] = text
    else:
        # the RMA asks for a reason whenever something is rejected
        body["reason"] = text or "Rejected from the Approve screen"
    return "/api/v1/" + kind.endpoint.format(id=doc_id), json.dumps(body)


def _label(kind: _Kind) -> str:
    return ACTION_BY_KEY[kind.action_key].label


def _money(value: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(value)) if value is not None and str(value).strip() != "" else None
    except Exception:
        return None


def _doc_fields(kind: _Kind, doc: Any, ticket: Optional[RmaTicket]) -> dict[str, Any]:
    """Reference, party, amount, summary and the RMA to open, for one document."""
    rma_no = ticket.rma_number if ticket is not None else ""
    if kind.code == "ticket":
        what = (doc.product_name or "product") + (f" ({doc.serial_number})" if doc.serial_number else "")
        return {
            "reference": doc.rma_number,
            "party": doc.customer_name,
            "amount": None,
            "summary": f"Approve the complaint and receive the unit: {what}.",
            "rma_id": doc.id,
        }
    if kind.code == "delivery":
        return {
            "reference": doc.delivery_number,
            "party": ticket.customer_name if ticket is not None else None,
            "amount": _money(doc.refund_amount) if doc.outcome == "cash_back" else _money(doc.amount_total),
            "summary": f"{rma_no} · "
            + {
                "cash_back": "Approve the customer delivery: no unit goes back, the cash back is paid to the customer.",
                "different_product": "Approve the customer delivery: a different product goes back to the customer; any charges are billed.",
                "same_product": "Approve the customer delivery: a replacement of the same product (new serial) goes back; any charges are billed.",
            }.get(doc.outcome, "Approve the customer delivery: the unit leaves the RMA store and any charges are billed."),
            "rma_id": doc.rma_id,
        }
    if kind.code == "claim":
        what = (doc.product_name or "the product") + (f" ({doc.serial_number})" if doc.serial_number else "")
        return {
            "reference": doc.claim_number,
            "party": doc.supplier_name,
            "amount": None,
            "summary": f"{rma_no} · Approve the replacement claim for {what}.",
            "rma_id": doc.rma_id,
        }
    if kind.code == "receipt":
        return {
            "reference": doc.receipt_number,
            "party": doc.supplier_name,
            "amount": _money(doc.refund_amount) if doc.outcome == "cash_back" else None,
            "summary": f"{rma_no} · "
            + {
                "cash_back": "Approve the cash back: no unit returns, and the money the supplier paid is posted to Finance.",
                "different_product": f"Approve the replacement receipt: a different product ({doc.received_sku or 'see the receipt'}) comes back into the RMA store.",
                "same_product": "Approve the replacement receipt: the same product comes back with a new serial.",
            }.get(doc.outcome, "Approve the replacement receipt: the unit comes back from the supplier into the RMA store."),
            "rma_id": doc.rma_id,
        }
    way = "received from" if doc.direction == "in" else "paid to"
    return {
        "reference": doc.settlement_number,
        "party": doc.party_name,
        "amount": _money(doc.amount),
        "summary": f"{rma_no} · Approve the settlement: money {way} {doc.party_name or 'the party'} is posted to Finance.",
        "rma_id": doc.rma_id,
    }


def _sender(kind: _Kind, doc: Any, history: dict[str, RmaStatusHistory], names: dict[str, str]) -> tuple[str, str, datetime]:
    """Who sent the document for approval and when: the ticket's own status trail, else its maker and last change."""
    if kind.code == "ticket":
        row = history.get(doc.id)
        who = row.changed_by if row is not None else doc.created_by
        at = row.created_at if row is not None else doc.updated_at
    else:
        who = doc.created_by
        at = doc.updated_at if getattr(doc, "status", None) == _PENDING else doc.created_at
    if kind.code == "settlement" and getattr(doc, "created_by_name", None):
        name = doc.created_by_name
    else:
        name = names.get(who or "", "") or ""
    return who or "", name, at or datetime.utcnow()


def _held_keys(db: Session, company_id: str, statuses: tuple[str, ...]) -> set[tuple[str, str]]:
    rows = (
        db.query(ApprovalRequest.action_key, ApprovalRequest.entity_id)
        .filter(
            ApprovalRequest.company_id == company_id,
            ApprovalRequest.action_key.like("rma.%"),
            ApprovalRequest.status.in_(statuses),
        )
        .all()
    )
    return {(k, e) for k, e in rows if e}


def _decided_status(decision: Optional[str]) -> Optional[str]:
    if decision == "approved":
        return "approved"
    if decision in ("rejected", "correction_requested"):
        return "rejected"
    return None


def rma_rows(
    db: Session,
    company_id: str,
    user: AuthUser,
    *,
    rights: Rights,
    include_decided: bool,
) -> list[dict[str, Any]]:
    """Pending RMA documents (and, when asked, the decided ones) as Approve-list rows shaped like `ApprovalRead`."""
    held_pending = _held_keys(db, company_id, ("pending", "approving"))
    pairs: list[tuple[_Kind, Any]] = []
    for kind in KINDS.values():
        model = kind.model
        status_col = model.status
        pending = (
            db.query(model).filter(model.company_id == company_id, status_col == _PENDING).order_by(model.updated_at.desc()).limit(300).all()
        )
        pairs += [(kind, d) for d in pending]
        if include_decided:
            decided_col = getattr(model, kind.decided_at)
            decided = (
                db.query(model)
                .filter(model.company_id == company_id, decided_col.isnot(None), getattr(model, kind.decision).isnot(None))
                .order_by(decided_col.desc())
                .limit(150)
                .all()
            )
            pairs += [(kind, d) for d in decided if getattr(d, "status", None) != _PENDING]
    if not pairs:
        return []

    tickets = {
        t.id: t
        for t in db.query(RmaTicket).filter(RmaTicket.id.in_({d.id if k.code == "ticket" else d.rma_id for k, d in pairs})).all()
    }
    user_ids = {d.created_by for _, d in pairs if getattr(d, "created_by", None)}
    ticket_ids = [d.id for k, d in pairs if k.code == "ticket"]
    history: dict[str, RmaStatusHistory] = {}
    if ticket_ids:
        for h in (
            db.query(RmaStatusHistory)
            .filter(RmaStatusHistory.rma_id.in_(ticket_ids), RmaStatusHistory.to_status == _PENDING)
            .order_by(RmaStatusHistory.created_at.asc())
            .all()
        ):
            history[h.rma_id] = h  # the latest submission wins
            if h.changed_by:
                user_ids.add(h.changed_by)
    names = (
        {u.id: (u.name or u.username or "") for u in db.query(AuthUser).filter(AuthUser.id.in_(user_ids)).all()} if user_ids else {}
    )

    rows: list[dict[str, Any]] = []
    for kind, doc in pairs:
        pending = getattr(doc, "status", None) == _PENDING
        decision = getattr(doc, kind.decision, None)
        status = "pending" if pending else _decided_status(decision)
        if status is None:
            continue
        action = ACTION_BY_KEY[kind.action_key]
        can_approve = rights.can_approve(action)
        ticket = tickets.get(doc.id if kind.code == "ticket" else doc.rma_id)
        who, who_name, sent_at = _sender(kind, doc, history, names)
        is_mine = bool(who) and who == user.id
        if not can_approve and not is_mine:
            continue
        # a call held for this very document already has its own row
        if status == "pending" and (kind.action_key, doc.id) in held_pending:
            continue
        fields = _doc_fields(kind, doc, ticket)
        note = getattr(doc, kind.reason, None)
        if decision == "correction_requested":
            note = f"Sent back for correction: {note}" if note else "Sent back for correction"
        rows.append(
            {
                "id": f"{RMA_PREFIX}{kind.code}:{doc.id}",
                "action_key": kind.action_key,
                "group_key": "rma",
                "group_label": GROUPS["rma"],
                "label": _label(kind),
                "reference": fields["reference"],
                "party": fields["party"],
                "amount": fields["amount"],
                "summary": fields["summary"],
                "entity_id": doc.id,
                "doc_kind": "rma_ticket",
                "doc_id": fields["rma_id"],
                "status": status,
                "requested_by": who,
                "requested_by_name": who_name,
                "requested_at": sent_at,
                "decided_by_name": None if pending else getattr(doc, kind.decided_by_name, None),
                "decided_at": None if pending else getattr(doc, kind.decided_at, None),
                "decision_note": None if pending else note,
                "last_error": None,
                "can_decide": pending and can_approve,
                "is_mine": is_mine,
            }
        )
    return _without_held_duplicates(db, company_id, rows)


def _without_held_duplicates(db: Session, company_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A decided document whose decision was made through a held call is already listed as that call; drop the second row."""
    decided = [r for r in rows if r["status"] != "pending"]
    if not decided:
        return rows
    held = (
        db.query(ApprovalRequest.action_key, ApprovalRequest.entity_id, ApprovalRequest.decided_at)
        .filter(
            ApprovalRequest.company_id == company_id,
            ApprovalRequest.action_key.like("rma.%"),
            ApprovalRequest.status == "approved",
        )
        .all()
    )
    approved_at: dict[tuple[str, str], list[datetime]] = {}
    for key, entity, at in held:
        if entity and at:
            approved_at.setdefault((key, entity), []).append(at)

    def duplicate(row: dict[str, Any]) -> bool:
        if row["status"] != "approved" or not row["decided_at"]:
            return False
        return any(abs((row["decided_at"] - at).total_seconds()) < 300 for at in approved_at.get((row["action_key"], row["entity_id"]), []))

    return [r for r in rows if r["status"] == "pending" or not duplicate(r)]


def pending_counts(db: Session, company_id: str, user: AuthUser, *, rights: Rights) -> tuple[int, int, int]:
    """(pending documents the viewer can decide, pending ones the viewer sent, all pending: the RMA group's count)."""
    rows = rma_rows(db, company_id, user, rights=rights, include_decided=False)
    waiting = sum(1 for r in rows if r["can_decide"])
    mine = sum(1 for r in rows if r["is_mine"])
    total = 0
    held = _held_keys(db, company_id, ("pending", "approving"))
    for kind in KINDS.values():
        ids = [i for (i,) in db.query(kind.model.id).filter(kind.model.company_id == company_id, kind.model.status == _PENDING).all()]
        total += sum(1 for i in ids if (kind.action_key, i) not in held)
    return waiting, mine, total


def can_decide(db: Session, user: AuthUser, request_id: str) -> bool:
    kind, _ = parse_id(request_id)
    return Rights(db, user).can_approve(ACTION_BY_KEY[kind.action_key])


def document_for(db: Session, company_id: str, request_id: str) -> Any:
    kind, doc_id = parse_id(request_id)
    doc = db.get(kind.model, doc_id)
    return doc if doc is not None and doc.company_id == company_id else None

