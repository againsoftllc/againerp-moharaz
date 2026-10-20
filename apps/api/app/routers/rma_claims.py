"""RMA supplier claims (docs/RMA.md Stage C): create, edit, approve, dispatch, cancel, print."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.rma.claim import (
    RmaClaimCancel,
    RmaClaimCopyRead,
    RmaClaimCopyResponse,
    RmaClaimCreate,
    RmaClaimDecision,
    RmaClaimDispatch,
    RmaClaimListResponse,
    RmaClaimRead,
    RmaClaimResponse,
    RmaClaimUpdate,
)
from app.services import rbac
from app.services.rma import claim_service, rma_service

router = APIRouter(prefix="/rma", tags=["rma-claims"])


def _read(claim) -> RmaClaimRead:
    return RmaClaimRead.model_validate(claim)


def _need(db: Session, user: AuthUser, module: str, what: str) -> None:
    if not rbac.has_permission(db, user, module, "write"):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")


def _claim(db: Session, claim_id: str, company_id: str):
    return claim_service.get_claim(db, claim_id, company_id=company_id)


@router.get("/tickets/{ticket_id}/claims", response_model=RmaClaimListResponse)
def list_claims(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimListResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaClaimListResponse(data=[_read(c) for c in claim_service.list_claims(db, ticket.id)])


@router.post("/tickets/{ticket_id}/claims", response_model=RmaClaimResponse, status_code=201)
def create_claim(
    ticket_id: str,
    payload: RmaClaimCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    """Raise a supplier claim from an approved RMA whose unit is in the RMA store."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    claim = claim_service.create_claim(
        db,
        ticket,
        actor=user.id,
        supplier_id=payload.supplier_id,
        override_reason=payload.override_reason,
        can_override=rbac.has_permission(db, user, "rma_override", "write"),
    )
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.get("/claims/{claim_id}", response_model=RmaClaimResponse)
def get_claim(
    claim_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    return RmaClaimResponse(data=_read(_claim(db, claim_id, company_id)))


@router.patch("/claims/{claim_id}", response_model=RmaClaimResponse)
def update_claim(
    claim_id: str,
    payload: RmaClaimUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    claim = _claim(db, claim_id, company_id)
    claim_service.update_claim(db, claim, payload.model_dump(exclude_unset=True), actor=user.id)
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.post("/claims/{claim_id}/submit", response_model=RmaClaimResponse)
def submit_claim(
    claim_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    claim = _claim(db, claim_id, company_id)
    claim_service.submit_claim(db, claim, actor=user.id)
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.post("/claims/{claim_id}/decision", response_model=RmaClaimResponse)
def decide_claim(
    claim_id: str,
    payload: RmaClaimDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    _need(db, user, "rma_claim_approve", "approve or reject supplier claims")
    claim = _claim(db, claim_id, company_id)
    claim_service.decide_claim(db, claim, decision=payload.decision, reason=payload.reason, user=user)
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.post("/claims/{claim_id}/dispatch", response_model=RmaClaimResponse)
def dispatch_claim(
    claim_id: str,
    payload: RmaClaimDispatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    """Hand the approved claim's unit to the supplier: moves it out of the RMA store to Supplier / In Transit, once."""
    _need(db, user, "rma_dispatch", "dispatch units to a supplier")
    claim = _claim(db, claim_id, company_id)
    claim_service.dispatch_claim(
        db,
        claim,
        user=user,
        dispatch_date=payload.dispatch_date,
        courier=payload.courier,
        tracking_number=payload.tracking_number,
        expected_return_date=payload.expected_return_date,
        note=payload.note,
    )
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.post("/claims/{claim_id}/cancel", response_model=RmaClaimResponse)
def cancel_claim(
    claim_id: str,
    payload: RmaClaimCancel,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimResponse:
    claim = _claim(db, claim_id, company_id)
    claim_service.cancel_claim(db, claim, actor=user.id, reason=payload.reason)
    db.commit()
    db.refresh(claim)
    return RmaClaimResponse(data=_read(claim))


@router.post("/claims/{claim_id}/print", response_model=RmaClaimCopyResponse)
def print_claim_copy(
    claim_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaClaimCopyResponse:
    """The Supplier Claim / Dispatch Copy. The first print is free; a reprint needs the reprint permission."""
    claim = _claim(db, claim_id, company_id)
    if claim.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=400, detail="Send the claim for approval before printing it.")
    reprint = (claim.print_count or 0) > 0
    if reprint:
        _need(db, user, "rma_reprint", "reprint documents")
    claim_service.count_claim_print(db, claim, actor=user.id)
    payload = claim_service.claim_payload(db, claim, printed_by=user.name or user.username, reprint=reprint)
    db.commit()
    return RmaClaimCopyResponse(data=RmaClaimCopyRead(**payload))
