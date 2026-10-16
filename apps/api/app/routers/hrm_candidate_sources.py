from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.candidate_source import (
    CandidateSourceCreate,
    CandidateSourceListMeta,
    CandidateSourceListResponse,
    CandidateSourceRead,
    CandidateSourceResponse,
    CandidateSourceUpdate,
)
from app.services.hrm import candidate_source_service

router = APIRouter(prefix="/candidate-sources", tags=["hrm-candidate-sources"])


@router.get("", response_model=CandidateSourceListResponse)
def list_candidate_sources(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
) -> CandidateSourceListResponse:
    rows = candidate_source_service.list_candidate_sources(
        db, company_id=company_id, status=status, q=q
    )
    data = [CandidateSourceRead.model_validate(r) for r in rows]
    return CandidateSourceListResponse(
        data=data, meta=CandidateSourceListMeta(count=len(data))
    )


@router.get("/{source_id}", response_model=CandidateSourceResponse)
def get_candidate_source(
    source_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateSourceResponse:
    row = candidate_source_service.get_candidate_source(
        db, source_id, company_id=company_id
    )
    return CandidateSourceResponse(data=CandidateSourceRead.model_validate(row))


@router.post("", response_model=CandidateSourceResponse, status_code=201)
def create_candidate_source(
    payload: CandidateSourceCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> CandidateSourceResponse:
    row = candidate_source_service.create_candidate_source(
        db, payload, created_by=user.id
    )
    return CandidateSourceResponse(data=CandidateSourceRead.model_validate(row))


@router.patch("/{source_id}", response_model=CandidateSourceResponse)
def update_candidate_source(
    source_id: str,
    payload: CandidateSourceUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateSourceResponse:
    row = candidate_source_service.update_candidate_source(
        db, source_id, payload, company_id=company_id
    )
    return CandidateSourceResponse(data=CandidateSourceRead.model_validate(row))


@router.delete("/{source_id}", status_code=204)
def delete_candidate_source(
    source_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    candidate_source_service.delete_candidate_source(
        db, source_id, company_id=company_id
    )
    return Response(status_code=204)
