"""Inventory > Approve: the finalizing calls held for an approver (docs/approval.md)."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import SessionLocal, get_db
from app.deps.auth import get_current_company_id, get_current_user
from app.models.approval_request import ApprovalRequest
from app.models.auth_user import AuthUser
from app.services.core import approval_gate as gate
from app.services.core.approval_actions import ACTION_BY_KEY, ACTIONS
from app.services.core.approval_details import build_document
from app.services.core import approval_edit_requests as edits

router = APIRouter(prefix="/approvals", tags=["approvals"])

STATUSES = ("pending", "approving", "approved", "rejected", "cancelled")


class ApprovalRead(BaseModel):
    id: str
    action_key: str
    group_key: str
    group_label: str
    label: str
    reference: Optional[str] = None
    party: Optional[str] = None
    amount: Optional[Decimal] = None
    summary: Optional[str] = None
    entity_id: Optional[str] = None
    status: str
    # the original drawer to open for it (see ApprovalRequest.target_kind); none = review dialog
    doc_kind: Optional[str] = None
    doc_id: Optional[str] = None
    requested_by: str
    requested_by_name: str
    requested_at: datetime
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    last_error: Optional[str] = None
    # the viewer may approve / reject it now
    can_decide: bool = False
    # the viewer sent it, so may take it back while it is pending
    is_mine: bool = False


class ApprovalListMeta(BaseModel):
    count: int
    page: int
    per_page: int
    pending: int


class ApprovalListResponse(BaseModel):
    data: list[ApprovalRead]
    meta: ApprovalListMeta


class GroupSummary(BaseModel):
    key: str
    label: str
    pending: int
    can_approve: bool


class ApprovalSummary(BaseModel):
    # held calls the viewer can decide, and the viewer's own held calls
    pending_for_me: int
    my_pending: int
    can_approve_any: bool
    groups: list[GroupSummary]


class TimelineEvent(BaseModel):
    at: Optional[datetime] = None
    by: Optional[str] = None
    text: str
    tone: Optional[str] = None  # good | bad | warn


class ApprovalDetail(ApprovalRead):
    """One request opened in the drawer: the request itself, the document it targets, and what happened to it."""

    document: dict[str, Any]
    timeline: list[TimelineEvent]
    http_method: str
    http_path: str
    request_body: Optional[str] = None


class DecisionIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)


def _approvable_keys(db: Session, user: AuthUser) -> set[str]:
    """Action keys the user may approve (and finalize without asking)."""
    rights = gate.Rights(db, user)
    return {a.key for a in ACTIONS if rights.can_approve(a)}


def _read(row: ApprovalRequest, *, keys: set[str], user: AuthUser) -> ApprovalRead:
    return ApprovalRead(
        id=row.id,
        action_key=row.action_key,
        group_key=row.group_key,
        group_label=gate.GROUPS.get(row.group_key, row.group_key.title()),
        label=row.label,
        reference=row.reference,
        party=row.party,
        amount=row.amount,
        summary=row.summary,
        entity_id=row.entity_id,
        status=row.status,
        doc_kind=row.target_kind,
        doc_id=row.target_id,
        requested_by=row.requested_by,
        requested_by_name=row.requested_by_name,
        requested_at=row.requested_at,
        decided_by_name=row.decided_by_name,
        decided_at=row.decided_at,
        decision_note=row.decision_note,
        last_error=row.last_error,
        can_decide=row.status == "pending" and row.action_key in keys,
        is_mine=row.requested_by == user.id,
    )


def _visible(db: Session, company_id: str, user: AuthUser, keys: set[str]):
    """Approvers see every request of the actions they approve; everyone also sees their own."""
    q = db.query(ApprovalRequest).filter(ApprovalRequest.company_id == company_id)
    if keys:
        q = q.filter(or_(ApprovalRequest.action_key.in_(keys), ApprovalRequest.requested_by == user.id))
    else:
        q = q.filter(ApprovalRequest.requested_by == user.id)
    return q


@router.get("", response_model=ApprovalListResponse)
def list_approvals(
    status: str = Query(default="pending", description="pending | approved | rejected | cancelled | all"),
    group: Optional[str] = Query(default=None),
    mine: bool = Query(default=False, description="only what the viewer sent"),
    q: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> ApprovalListResponse:
    keys = _approvable_keys(db, user)
    query = _visible(db, company_id, user, keys)
    if group:
        query = query.filter(ApprovalRequest.group_key == group)
    if mine:
        query = query.filter(ApprovalRequest.requested_by == user.id)
    if status == "pending":
        # a call being replayed right now is still waiting as far as the list goes
        query = query.filter(ApprovalRequest.status.in_(("pending", "approving")))
    elif status != "all":
        query = query.filter(ApprovalRequest.status == status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ApprovalRequest.reference.ilike(like),
                ApprovalRequest.party.ilike(like),
                ApprovalRequest.label.ilike(like),
                ApprovalRequest.requested_by_name.ilike(like),
                ApprovalRequest.summary.ilike(like),
            )
        )
    pending = (
        _visible(db, company_id, user, keys)
        .filter(ApprovalRequest.status.in_(("pending", "approving")))
        .count()
    )
    # sales order edit requests sit in the same list: they are decisions waiting for the same people (docs/approval.md)
    can_review = gate.Rights(db, user).can_approve_group("sales")
    merged: list[ApprovalRead] = []
    if not group or group == "sales":
        wanted = {"pending": ("pending",), "approved": ("approved",), "rejected": ("rejected",), "cancelled": ()}
        needle = (q or "").strip().lower()
        for row in edits.edit_rows(db, company_id, user, can_review=can_review):
            if status != "all" and row["status"] not in wanted.get(status, ()):
                continue
            if mine and not row["is_mine"]:
                continue
            if needle and needle not in " ".join(str(row.get(k) or "") for k in ("label", "reference", "party", "requested_by_name", "summary")).lower():
                continue
            merged.append(ApprovalRead(**row))
        waiting, mine_edits = edits.pending_counts(db, company_id, user, can_review=can_review)
        pending += waiting if can_review else mine_edits
    if not merged:
        total = query.count()
        rows = (
            query.order_by(ApprovalRequest.requested_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return ApprovalListResponse(
            data=[_read(r, keys=keys, user=user) for r in rows],
            meta=ApprovalListMeta(count=total, page=page, per_page=per_page, pending=pending),
        )
    held = [_read(r, keys=keys, user=user) for r in query.order_by(ApprovalRequest.requested_at.desc()).limit(500).all()]
    combined = sorted(held + merged, key=lambda x: x.requested_at, reverse=True)
    start = (page - 1) * per_page
    return ApprovalListResponse(
        data=combined[start : start + per_page],
        meta=ApprovalListMeta(count=len(combined), page=page, per_page=per_page, pending=pending),
    )


@router.get("/summary", response_model=ApprovalSummary)
def approval_summary(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> ApprovalSummary:
    keys = _approvable_keys(db, user)
    group_can = {a.group for a in ACTIONS if a.key in keys}
    counts = dict(
        db.query(ApprovalRequest.group_key, func.count(ApprovalRequest.id))
        .filter(
            ApprovalRequest.company_id == company_id,
            ApprovalRequest.status.in_(("pending", "approving")),
        )
        .group_by(ApprovalRequest.group_key)
        .all()
    )
    mine = (
        db.query(ApprovalRequest)
        .filter(
            ApprovalRequest.company_id == company_id,
            ApprovalRequest.requested_by == user.id,
            ApprovalRequest.status.in_(("pending", "approving")),
        )
        .count()
    )
    for_me = (
        db.query(ApprovalRequest)
        .filter(
            ApprovalRequest.company_id == company_id,
            ApprovalRequest.status.in_(("pending", "approving")),
            ApprovalRequest.action_key.in_(keys or {""}),
        )
        .count()
    )
    can_review = gate.Rights(db, user).can_approve_group("sales")
    edit_waiting, edit_mine = edits.pending_counts(db, company_id, user, can_review=can_review)
    counts["sales"] = int(counts.get("sales", 0)) + edits.pending_counts(db, company_id, user, can_review=True)[0]
    if can_review:
        group_can.add("sales")
    return ApprovalSummary(
        pending_for_me=for_me + edit_waiting,
        my_pending=mine + edit_mine,
        can_approve_any=bool(keys) or can_review,
        groups=[
            GroupSummary(key=key, label=label, pending=int(counts.get(key, 0)), can_approve=key in group_can)
            for key, label in gate.GROUPS.items()
        ],
    )


@router.get("/actions")
def approval_actions() -> dict[str, Any]:
    """The finalizing actions that wait for approval, by group — what the Approve screen explains."""
    return {
        "data": [
            {"key": a.key, "group": a.group, "group_label": gate.GROUPS[a.group], "label": a.label}
            for a in ACTIONS
        ]
    }


def _timeline(row: ApprovalRequest) -> list[TimelineEvent]:
    events = [TimelineEvent(at=row.requested_at, by=row.requested_by_name, text="Sent for approval")]
    if row.last_error and row.status == "pending":
        events.append(TimelineEvent(at=row.updated_at, text=f"Approving was tried and could not finish: {row.last_error}", tone="bad"))
    if row.status == "approving":
        events.append(TimelineEvent(at=row.decided_at or row.updated_at, by=row.decided_by_name, text="Being finalized now", tone="warn"))
    elif row.status == "approved":
        events.append(
            TimelineEvent(
                at=row.decided_at,
                by=row.decided_by_name,
                text="Approved and finalized" + (f": {row.decision_note}" if row.decision_note else ""),
                tone="good",
            )
        )
    elif row.status == "rejected":
        events.append(
            TimelineEvent(at=row.decided_at, by=row.decided_by_name, text="Rejected" + (f": {row.decision_note}" if row.decision_note else ""), tone="bad")
        )
    elif row.status == "cancelled":
        events.append(TimelineEvent(at=row.decided_at, by=row.requested_by_name, text="Cancelled by the sender"))
    return events


@router.get("/{request_id}", response_model=ApprovalDetail)
def approval_detail(
    request_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> ApprovalDetail:
    """Open one request: approvers may open anything they can decide; everyone else only their own."""
    row = _own_row(db, request_id, company_id)
    keys = _approvable_keys(db, user)
    if row.action_key not in keys and row.requested_by != user.id:
        raise HTTPException(status_code=404, detail="Approval request not found")
    action = ACTION_BY_KEY.get(row.action_key)
    params: dict[str, str] = {}
    if action is not None:
        tail = gate.tail_of(row.http_path)
        m = action.compiled().fullmatch(tail) if tail is not None else None
        params = {k: v for k, v in (m.groupdict() if m else {}).items() if v is not None}
    document = build_document(db, row.action_key, params, gate.parse_body((row.body_json or "").encode("utf-8")))
    base = _read(row, keys=keys, user=user)
    return ApprovalDetail(
        **base.model_dump(),
        document=document.to_dict(),
        timeline=_timeline(row),
        http_method=row.http_method,
        http_path=row.http_path,
        request_body=row.body_json,
    )


def _own_row(db: Session, request_id: str, company_id: str) -> ApprovalRequest:
    row = db.get(ApprovalRequest, request_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return row


def _error_text(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except Exception:
        detail = None
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    if isinstance(detail, list):
        return " · ".join(str(d.get("msg", d)) if isinstance(d, dict) else str(d) for d in detail)
    return f"The action was refused ({resp.status_code})."


def _review_edit(request_id: str, user: AuthUser, company_id: str, approve: bool, note: Optional[str]) -> dict[str, Any]:
    """Approve / reject a sales order edit request: the order's own review, run for the Approve screen."""
    db = SessionLocal()
    try:
        can_review = gate.Rights(db, user).can_approve_group("sales")
        edits.review(db, company_id, user, request_id, approve=approve, note=note, can_review=can_review)
        return {"data": {"id": request_id, "status": "approved" if approve else "rejected"}}
    finally:
        db.close()


@router.post("/{request_id}/approve")
async def approve_request(
    request_id: str,
    payload: DecisionIn,
    request: Request,
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    """Approve = run the held call now, as the approver. A call that fails stays pending with the reason."""
    if edits.is_edit_id(request_id):
        return await run_in_threadpool(_review_edit, request_id, user, company_id, True, payload.note)
    authorization = request.headers.get("authorization", "")

    def claim() -> dict[str, Any]:
        db = SessionLocal()
        try:
            row = _own_row(db, request_id, company_id)
            if row.action_key not in _approvable_keys(db, user):
                raise HTTPException(status_code=403, detail="You do not have permission to approve this")
            # one approver wins: only a pending row can be claimed
            claimed = db.execute(
                update(ApprovalRequest)
                .where(ApprovalRequest.id == row.id, ApprovalRequest.status == "pending")
                .values(status="approving", decided_by=user.id, decided_by_name=user.name or user.username)
            ).rowcount
            db.commit()
            if not claimed:
                raise HTTPException(status_code=409, detail="This request was already handled")
            return {
                "method": row.http_method,
                "path": row.http_path,
                "query": row.query_string,
                "body": row.body_json,
            }
        finally:
            db.close()

    held = await run_in_threadpool(claim)

    url = held["path"] + (f"?{held['query']}" if held["query"] else "")
    headers = {"Authorization": authorization, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=request.app), base_url="http://approval.local", timeout=120.0
        ) as client:
            resp = await client.request(
                held["method"], url, content=(held["body"] or "").encode("utf-8") or None, headers=headers
            )
        ok = resp.status_code < 300
        failure = None if ok else _error_text(resp)
        result = resp.text[:4000] if ok else None
    except Exception as exc:  # the replay itself broke: put the request back so nothing is lost
        ok, failure, result = False, f"The action could not be run: {exc}", None

    def finish() -> None:
        db = SessionLocal()
        try:
            row = db.get(ApprovalRequest, request_id)
            if row is None:
                return
            if ok:
                row.status = "approved"
                row.decided_at = datetime.utcnow()
                row.decision_note = (payload.note or "").strip() or None
                row.result_json = result
                row.last_error = None
            else:
                row.status = "pending"
                row.decided_by = None
                row.decided_by_name = None
                row.last_error = failure
            db.commit()
        finally:
            db.close()

    await run_in_threadpool(finish)
    if not ok:
        raise HTTPException(status_code=409, detail=failure or "The action could not be finalized")
    return {"data": {"id": request_id, "status": "approved"}}


@router.post("/{request_id}/reject")
def reject_request(
    request_id: str,
    payload: DecisionIn,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    if edits.is_edit_id(request_id):
        return _review_edit(request_id, user, company_id, False, payload.note)
    row = _own_row(db, request_id, company_id)
    if row.action_key not in _approvable_keys(db, user):
        raise HTTPException(status_code=403, detail="You do not have permission to reject this")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="This request was already handled")
    row.status = "rejected"
    row.decided_by = user.id
    row.decided_by_name = user.name or user.username
    row.decided_at = datetime.utcnow()
    row.decision_note = (payload.note or "").strip() or None
    db.commit()
    return {"data": {"id": row.id, "status": row.status}}


@router.post("/{request_id}/cancel")
def cancel_request(
    request_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
    company_id: str = Depends(get_current_company_id),
) -> dict[str, Any]:
    """The sender takes a still-pending request back."""
    if edits.is_edit_id(request_id):
        raise HTTPException(status_code=400, detail="An order edit request is decided by an approver; it cannot be cancelled here")
    row = _own_row(db, request_id, company_id)
    if row.requested_by != user.id:
        raise HTTPException(status_code=403, detail="Only the sender can cancel a request")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="This request was already handled")
    row.status = "cancelled"
    row.decided_at = datetime.utcnow()
    db.commit()
    return {"data": {"id": row.id, "status": row.status}}
