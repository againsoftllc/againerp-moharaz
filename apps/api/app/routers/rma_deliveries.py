"""RMA customer deliveries (docs/RMA.md Stage E): create, edit, approve (posts), cancel, print. Money lives in rma_settlements."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.schemas.rma.delivery import (
    RmaDeliveryCancel,
    RmaDeliveryCopyRead,
    RmaDeliveryCopyResponse,
    RmaDeliveryDecision,
    RmaDeliveryListResponse,
    RmaDeliveryRead,
    RmaDeliveryResponse,
    RmaDeliverySummary,
    RmaDeliverySummaryResponse,
    RmaDeliveryUpdate,
)
from app.services import rbac
from app.services.rma import delivery_service, rma_service

router = APIRouter(prefix="/rma", tags=["rma-deliveries"])


def _read(row) -> RmaDeliveryRead:
    return RmaDeliveryRead.model_validate(row)


def _need(db: Session, user: AuthUser, module: str, what: str) -> None:
    if not rbac.has_permission(db, user, module, "write"):
        raise HTTPException(status_code=403, detail=f"You need the RMA permission to {what}.")


def _delivery(db: Session, delivery_id: str, company_id: str):
    return delivery_service.get_delivery(db, delivery_id, company_id=company_id)


@router.get("/tickets/{ticket_id}/delivery-summary", response_model=RmaDeliverySummaryResponse)
def delivery_summary(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliverySummaryResponse:
    """The charges, what is owed, and whether the product can be handed over right now (and if not, why)."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaDeliverySummaryResponse(data=RmaDeliverySummary(**delivery_service.summary(db, ticket)))


@router.get("/tickets/{ticket_id}/deliveries", response_model=RmaDeliveryListResponse)
def list_deliveries(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryListResponse:
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    return RmaDeliveryListResponse(data=[_read(d) for d in delivery_service.list_deliveries(db, ticket.id)])


@router.post("/tickets/{ticket_id}/deliveries", response_model=RmaDeliveryResponse, status_code=201)
def create_delivery(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "create")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    """Open a delivery (the hand-over of the unit) for an RMA. Nothing is posted until it is approved."""
    ticket = rma_service.get_ticket(db, ticket_id, company_id=company_id)
    d = delivery_service.create_delivery(db, ticket, actor=user.id)
    db.commit()
    db.refresh(d)
    return RmaDeliveryResponse(data=_read(d))


@router.get("/deliveries/{delivery_id}", response_model=RmaDeliveryResponse)
def get_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    return RmaDeliveryResponse(data=_read(_delivery(db, delivery_id, company_id)))


@router.patch("/deliveries/{delivery_id}", response_model=RmaDeliveryResponse)
def update_delivery(
    delivery_id: str,
    payload: RmaDeliveryUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    d = _delivery(db, delivery_id, company_id)
    delivery_service.update_delivery(db, d, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(d)
    return RmaDeliveryResponse(data=_read(d))


@router.post("/deliveries/{delivery_id}/submit", response_model=RmaDeliveryResponse)
def submit_delivery(
    delivery_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    d = _delivery(db, delivery_id, company_id)
    delivery_service.submit_delivery(db, d, actor=user.id)
    db.commit()
    db.refresh(d)
    return RmaDeliveryResponse(data=_read(d))


@router.post("/deliveries/{delivery_id}/decision", response_model=RmaDeliveryResponse)
def decide_delivery(
    delivery_id: str,
    payload: RmaDeliveryDecision,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    """Approve (takes the unit out of the RMA store, invoices any charges once, completes the RMA), reject, or send back."""
    _need(db, user, "rma_delivery_approve", "approve or reject customer deliveries")
    d = _delivery(db, delivery_id, company_id)
    delivery_service.decide_delivery(db, d, decision=payload.decision, reason=payload.reason, user=user)
    db.commit()
    db.refresh(d)
    return RmaDeliveryResponse(data=_read(d))


@router.post("/deliveries/{delivery_id}/cancel", response_model=RmaDeliveryResponse)
def cancel_delivery(
    delivery_id: str,
    payload: RmaDeliveryCancel,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "write")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryResponse:
    d = _delivery(db, delivery_id, company_id)
    delivery_service.cancel_delivery(db, d, actor=user.id, reason=payload.reason)
    db.commit()
    db.refresh(d)
    return RmaDeliveryResponse(data=_read(d))


@router.post("/deliveries/{delivery_id}/print", response_model=RmaDeliveryCopyResponse)
def print_delivery_copy(
    delivery_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("rma", "read")),
    company_id: str = Depends(get_current_company_id),
) -> RmaDeliveryCopyResponse:
    """The Customer Delivery Copy. The first print is free; a reprint needs the reprint permission."""
    d = _delivery(db, delivery_id, company_id)
    if d.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=400, detail="Send the delivery for approval before printing it.")
    reprint = (d.print_count or 0) > 0
    if reprint:
        _need(db, user, "rma_reprint", "reprint documents")
    delivery_service.count_delivery_print(db, d, actor=user.id)
    payload = delivery_service.delivery_payload(db, d, printed_by=user.name or user.username, reprint=reprint)
    db.commit()
    return RmaDeliveryCopyResponse(data=RmaDeliveryCopyRead(**payload))
