"""RMA settlements: money in / money out against an RMA — create, edit, approve (posts), cancel. Separate from deliveries."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.rma.settlement import (
    RmaSettlementCancel,
    RmaSettlementCreate,
    RmaSettlementDecision,
    RmaSettlementListResponse,
    RmaSettlementRead,
    RmaSettlementResponse,
    RmaSettlementReverse,
    RmaSettlementSummary,
    RmaSettlementSummaryResponse,
    RmaSettlementUpdate,
)
from app.services import rbac
from app.services.rma import decision_rights
from app.services.core.approval_service import assert_can_approve
from app.services.rma import rma_service, settlement_service

router = APIRouter(prefix="/rma", tags=["rma-settlements"])


def _read(row) -> RmaSettlementRead:
    return RmaSettlementRead.model_validate(row)


def _need(db: Session, user: AuthUser, module: str, what: str) -> None:
    if not rbac.has_permission(db, user, module, "write"):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")


def _settlement(db: Session, settlement_id: str, company_id: str):
    return settlement_service.get_settlement(db, settlement_id, company_id=company_id)


@router.get("/tickets/{ticket_id}/settlement-summary", response_model=RmaSettlementSummaryResponse)
def settlement_summary(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    __: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementSummaryResponse:
    """The RMA's charges, what is owed, and what settlements have moved so far."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaSettlementSummaryResponse(data=RmaSettlementSummary(**settlement_service.summary(db, ticket)))


@router.get("/tickets/{ticket_id}/settlements", response_model=RmaSettlementListResponse)
def list_settlements(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    __: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementListResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaSettlementListResponse(data=[_read(s) for s in settlement_service.list_settlements(db, ticket.id)])


@router.post("/tickets/{ticket_id}/settlements", response_model=RmaSettlementResponse, status_code=201)
def create_settlement(
    ticket_id: str,
    payload: RmaSettlementCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    """Open a settlement entry (a draft: nothing is posted until it is approved)."""
    _need(db, user, "rma_payment", "record settlements")
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    s = settlement_service.create_settlement(db, ticket, payload.model_dump(exclude_unset=True), user=user)
    db.commit()
    db.refresh(s)
    return RmaSettlementResponse(data=_read(s))


@router.get("/settlements/{settlement_id}", response_model=RmaSettlementResponse)
def get_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    __: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    return RmaSettlementResponse(data=_read(_settlement(db, settlement_id, company_id)))


@router.patch("/settlements/{settlement_id}", response_model=RmaSettlementResponse)
def update_settlement(
    settlement_id: str,
    payload: RmaSettlementUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    _need(db, user, "rma_payment", "edit settlements")
    s = _settlement(db, settlement_id, company_id)
    settlement_service.update_settlement(db, s, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(s)
    return RmaSettlementResponse(data=_read(s))


@router.post("/settlements/{settlement_id}/submit", response_model=RmaSettlementResponse)
def submit_settlement(
    settlement_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    _need(db, user, "rma_payment", "send settlements for approval")
    s = _settlement(db, settlement_id, company_id)
    settlement_service.submit_settlement(db, s, actor=user.id)
    db.commit()
    db.refresh(s)
    return RmaSettlementResponse(data=_read(s))


@router.post("/settlements/{settlement_id}/decision", response_model=RmaSettlementResponse)
def decide_settlement(
    settlement_id: str,
    payload: RmaSettlementDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    """Approve (posts the payment and journal through Finance, once), reject, or send back."""
    decision_rights.need_to_decide(db, user, "rma_settlement_approve", "approve or reject settlements")
    s = _settlement(db, settlement_id, company_id)
    if payload.decision == "approved":
        assert_can_approve(db, company_id, user, "finance.payment", s.amount, what="RMA settlement")
    settlement_service.decide_settlement(db, s, decision=payload.decision, reason=payload.reason, user=user)
    db.commit()
    db.refresh(s)
    return RmaSettlementResponse(data=_read(s))


@router.post("/settlements/{settlement_id}/cancel", response_model=RmaSettlementResponse)
def cancel_settlement(
    settlement_id: str,
    payload: RmaSettlementCancel,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    _need(db, user, "rma_payment", "cancel settlements")
    s = _settlement(db, settlement_id, company_id)
    settlement_service.cancel_settlement(db, s, actor=user.id, reason=payload.reason)
    db.commit()
    db.refresh(s)
    return RmaSettlementResponse(data=_read(s))


@router.post("/settlements/{settlement_id}/reverse", response_model=RmaSettlementResponse, status_code=201)
def reverse_settlement(
    settlement_id: str,
    payload: RmaSettlementReverse,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaSettlementResponse:
    """Correct an approved settlement: opens a linked draft that mirrors it (it still has to be sent and approved)."""
    _need(db, user, "rma_payment", "reverse settlements")
    s = _settlement(db, settlement_id, company_id)
    reversal = settlement_service.reverse_settlement(db, s, reason=payload.reason, user=user)
    db.commit()
    db.refresh(reversal)
    return RmaSettlementResponse(data=_read(reversal))

