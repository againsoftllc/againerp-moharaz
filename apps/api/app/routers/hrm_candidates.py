from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.candidate import (
    CandidateCreate,
    CandidateListMeta,
    CandidateListResponse,
    CandidateResponse,
    CandidateStatusUpdate,
    CandidateUpdate,
)
from app.services.hrm import candidate_service

router = APIRouter(prefix="/candidates", tags=["hrm-candidates"])


@router.get("", response_model=CandidateListResponse)
def list_candidates(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    job_id: Optional[str] = Query(default=None),
    source_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None,
        pattern="^(new|screening|interview|offer|hired|rejected)$",
    ),
    is_archive: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> CandidateListResponse:
    data, total = candidate_service.list_candidates(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        job_id=job_id,
        source_id=source_id,
        status=status,
        is_archive=is_archive,
        q=q,
    )
    return CandidateListResponse(
        data=data,
        meta=CandidateListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateResponse:
    data = candidate_service.get_candidate(db, candidate_id, company_id=company_id)
    return CandidateResponse(data=data)


@router.post("", response_model=CandidateResponse, status_code=201)
def create_candidate(
    payload: CandidateCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> CandidateResponse:
    data = candidate_service.create_candidate(db, payload, created_by=user.id)
    return CandidateResponse(data=data)


@router.patch("/{candidate_id}", response_model=CandidateResponse)
def update_candidate(
    candidate_id: str,
    payload: CandidateUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateResponse:
    data = candidate_service.update_candidate(
        db, candidate_id, payload, company_id=company_id
    )
    return CandidateResponse(data=data)


@router.post("/{candidate_id}/status", response_model=CandidateResponse)
def set_candidate_status(
    candidate_id: str,
    payload: CandidateStatusUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateResponse:
    data = candidate_service.set_candidate_status(
        db, candidate_id, payload, company_id=company_id
    )
    return CandidateResponse(data=data)


@router.post("/{candidate_id}/archive", response_model=CandidateResponse)
def archive_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateResponse:
    data = candidate_service.archive_candidate(
        db, candidate_id, company_id=company_id, archived=True
    )
    return CandidateResponse(data=data)


@router.post("/{candidate_id}/unarchive", response_model=CandidateResponse)
def unarchive_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateResponse:
    data = candidate_service.archive_candidate(
        db, candidate_id, company_id=company_id, archived=False
    )
    return CandidateResponse(data=data)


@router.delete("/{candidate_id}", status_code=204)
def delete_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    candidate_service.delete_candidate(db, candidate_id, company_id=company_id)
    return Response(status_code=204)
