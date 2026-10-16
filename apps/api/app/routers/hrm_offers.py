from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.offer import (
    OfferCreate,
    OfferDecline,
    OfferListMeta,
    OfferListResponse,
    OfferRead,
    OfferResponse,
    OfferUpdate,
)
from app.services.hrm import offer_service

router = APIRouter(prefix="/offers", tags=["hrm-offers"])


@router.get("", response_model=OfferListResponse)
def list_offers(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    candidate_id: Optional[str] = Query(default=None),
    job_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None,
        pattern="^(draft|sent|accepted|negotiating|declined|expired)$",
    ),
) -> OfferListResponse:
    rows, total = offer_service.list_offers(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        candidate_id=candidate_id,
        job_id=job_id,
        status=status,
    )
    data = [OfferRead.model_validate(r) for r in rows]
    return OfferListResponse(
        data=data,
        meta=OfferListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{offer_id}", response_model=OfferResponse)
def get_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.get_offer(db, offer_id, company_id=company_id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("", response_model=OfferResponse, status_code=201)
def create_offer(
    payload: OfferCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> OfferResponse:
    row = offer_service.create_offer(db, payload, created_by=user.id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.patch("/{offer_id}", response_model=OfferResponse)
def update_offer(
    offer_id: str,
    payload: OfferUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.update_offer(db, offer_id, payload, company_id=company_id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("/{offer_id}/send", response_model=OfferResponse)
def send_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.send_offer(
        db, offer_id, company_id=company_id, approved_by=user.id
    )
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("/{offer_id}/accept", response_model=OfferResponse)
def accept_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.accept_offer(db, offer_id, company_id=company_id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("/{offer_id}/decline", response_model=OfferResponse)
def decline_offer(
    offer_id: str,
    payload: OfferDecline,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.decline_offer(
        db, offer_id, payload, company_id=company_id
    )
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("/{offer_id}/negotiate", response_model=OfferResponse)
def negotiate_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.negotiate_offer(db, offer_id, company_id=company_id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.post("/{offer_id}/expire", response_model=OfferResponse)
def expire_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferResponse:
    row = offer_service.expire_offer(db, offer_id, company_id=company_id)
    return OfferResponse(data=OfferRead.model_validate(row))


@router.delete("/{offer_id}", status_code=204)
def delete_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    offer_service.delete_offer(db, offer_id, company_id=company_id)
    return Response(status_code=204)
