from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.offer_template import (
    OfferTemplateCreate,
    OfferTemplateListMeta,
    OfferTemplateListResponse,
    OfferTemplateResponse,
    OfferTemplateUpdate,
)
from app.services.hrm import offer_template_service

router = APIRouter(prefix="/offer-templates", tags=["hrm-offer-templates"])


@router.get("", response_model=OfferTemplateListResponse)
def list_offer_templates(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> OfferTemplateListResponse:
    data = offer_template_service.list_offer_templates(
        db, company_id=company_id, status=status, q=q
    )
    return OfferTemplateListResponse(
        data=data, meta=OfferTemplateListMeta(count=len(data))
    )


@router.get("/{template_id}", response_model=OfferTemplateResponse)
def get_offer_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> OfferTemplateResponse:
    data = offer_template_service.get_offer_template(
        db, template_id, company_id=company_id
    )
    return OfferTemplateResponse(data=data)


@router.post("", response_model=OfferTemplateResponse, status_code=201)
def create_offer_template(
    payload: OfferTemplateCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> OfferTemplateResponse:
    data = offer_template_service.create_offer_template(
        db, payload, created_by=user.id
    )
    return OfferTemplateResponse(data=data)


@router.patch("/{template_id}", response_model=OfferTemplateResponse)
def update_offer_template(
    template_id: str,
    payload: OfferTemplateUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> OfferTemplateResponse:
    data = offer_template_service.update_offer_template(
        db, template_id, payload, company_id=company_id
    )
    return OfferTemplateResponse(data=data)


@router.delete("/{template_id}", status_code=204)
def delete_offer_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    offer_template_service.delete_offer_template(
        db, template_id, company_id=company_id
    )
    return Response(status_code=204)
