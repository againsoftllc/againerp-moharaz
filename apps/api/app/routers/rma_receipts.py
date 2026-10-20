"""RMA supplier receipts (docs/RMA.md Stage D): record, approve (stocks the unit back in), cancel, print."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.rma.receipt import (
    RmaReceiptCancel,
    RmaReceiptCopyRead,
    RmaReceiptCopyResponse,
    RmaReceiptDecision,
    RmaReceiptListResponse,
    RmaReceiptRead,
    RmaReceiptResponse,
    RmaReceiptUpdate,
)
from app.services import rbac
from app.services.rma import claim_service, receipt_service

router = APIRouter(prefix="/rma", tags=["rma-receipts"])


def _read(row) -> RmaReceiptRead:
    return RmaReceiptRead.model_validate(row)


def _need(db: Session, user: AuthUser, module: str, what: str) -> None:
    if not rbac.has_permission(db, user, module, "write"):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")


def _receipt(db: Session, receipt_id: str, company_id: str):
    return receipt_service.get_receipt(db, receipt_id, company_id=company_id)


@router.get("/claims/{claim_id}/receipts", response_model=RmaReceiptListResponse)
def list_receipts(
    claim_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptListResponse:
    claim = claim_service.get_claim(db, claim_id, company_id=company_id)
    return RmaReceiptListResponse(data=[_read(r) for r in receipt_service.list_receipts(db, claim.id)])


@router.post("/claims/{claim_id}/receipts", response_model=RmaReceiptResponse, status_code=201)
def create_receipt(
    claim_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    """Open a receipt for a dispatched claim. The received serial starts as the serial that was sent."""
    claim = claim_service.get_claim(db, claim_id, company_id=company_id)
    receipt = receipt_service.create_receipt(db, claim, actor=user.id)
    db.commit()
    db.refresh(receipt)
    return RmaReceiptResponse(data=_read(receipt))


@router.get("/receipts/{receipt_id}", response_model=RmaReceiptResponse)
def get_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    return RmaReceiptResponse(data=_read(_receipt(db, receipt_id, company_id)))


@router.patch("/receipts/{receipt_id}", response_model=RmaReceiptResponse)
def update_receipt(
    receipt_id: str,
    payload: RmaReceiptUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    receipt = _receipt(db, receipt_id, company_id)
    receipt_service.update_receipt(
        db,
        receipt,
        payload.model_dump(exclude_unset=True),
        actor=user.id,
        can_change_serial=rbac.has_permission(db, user, "rma_serial_change", "write"),
    )
    db.commit()
    db.refresh(receipt)
    return RmaReceiptResponse(data=_read(receipt))


@router.post("/receipts/{receipt_id}/submit", response_model=RmaReceiptResponse)
def submit_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    receipt = _receipt(db, receipt_id, company_id)
    receipt_service.submit_receipt(db, receipt, actor=user.id)
    db.commit()
    db.refresh(receipt)
    return RmaReceiptResponse(data=_read(receipt))


@router.post("/receipts/{receipt_id}/decision", response_model=RmaReceiptResponse)
def decide_receipt(
    receipt_id: str,
    payload: RmaReceiptDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    """Approve (stocks the unit back into the RMA store, once), reject, or send back."""
    _need(db, user, "rma_receive_approve", "approve or reject supplier receipts")
    receipt = _receipt(db, receipt_id, company_id)
    receipt_service.decide_receipt(
        db,
        receipt,
        decision=payload.decision,
        reason=payload.reason,
        user=user,
        can_change_serial=rbac.has_permission(db, user, "rma_serial_change", "write"),
    )
    db.commit()
    db.refresh(receipt)
    return RmaReceiptResponse(data=_read(receipt))


@router.post("/receipts/{receipt_id}/cancel", response_model=RmaReceiptResponse)
def cancel_receipt(
    receipt_id: str,
    payload: RmaReceiptCancel,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptResponse:
    receipt = _receipt(db, receipt_id, company_id)
    receipt_service.cancel_receipt(db, receipt, actor=user.id, reason=payload.reason)
    db.commit()
    db.refresh(receipt)
    return RmaReceiptResponse(data=_read(receipt))


@router.post("/receipts/{receipt_id}/print", response_model=RmaReceiptCopyResponse)
def print_receipt_copy(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaReceiptCopyResponse:
    """The Replacement Receive Copy. The first print is free; a reprint needs the reprint permission."""
    receipt = _receipt(db, receipt_id, company_id)
    if receipt.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=400, detail="Send the receipt for approval before printing it.")
    reprint = (receipt.print_count or 0) > 0
    if reprint:
        _need(db, user, "rma_reprint", "reprint documents")
    receipt_service.count_receipt_print(db, receipt, actor=user.id)
    payload = receipt_service.receipt_payload(db, receipt, printed_by=user.name or user.username, reprint=reprint)
    db.commit()
    return RmaReceiptCopyResponse(data=RmaReceiptCopyRead(**payload))
