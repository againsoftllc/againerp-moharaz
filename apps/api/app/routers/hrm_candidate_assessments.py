from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.candidate_assessment import (
    CandidateAssessmentCreate,
    CandidateAssessmentListMeta,
    CandidateAssessmentListResponse,
    CandidateAssessmentRead,
    CandidateAssessmentResponse,
    CandidateAssessmentUpdate,
)
from app.services.hrm import candidate_assessment_service

router = APIRouter(prefix="/candidate-assessments", tags=["hrm-candidate-assessments"])


@router.get("", response_model=CandidateAssessmentListResponse)
def list_candidate_assessments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    candidate_id: Optional[str] = Query(default=None),
    pass_fail_status: Optional[str] = Query(
        default=None, pattern="^(pass|fail|pending)$"
    ),
) -> CandidateAssessmentListResponse:
    rows = candidate_assessment_service.list_candidate_assessments(
        db,
        company_id=company_id,
        candidate_id=candidate_id,
        pass_fail_status=pass_fail_status,
    )
    data = [CandidateAssessmentRead.model_validate(r) for r in rows]
    return CandidateAssessmentListResponse(
        data=data, meta=CandidateAssessmentListMeta(count=len(data))
    )


@router.get("/{assessment_id}", response_model=CandidateAssessmentResponse)
def get_candidate_assessment(
    assessment_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateAssessmentResponse:
    row = candidate_assessment_service.get_candidate_assessment(
        db, assessment_id, company_id=company_id
    )
    return CandidateAssessmentResponse(
        data=CandidateAssessmentRead.model_validate(row)
    )


@router.post("", response_model=CandidateAssessmentResponse, status_code=201)
def create_candidate_assessment(
    payload: CandidateAssessmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> CandidateAssessmentResponse:
    row = candidate_assessment_service.create_candidate_assessment(
        db, payload, created_by=user.id
    )
    return CandidateAssessmentResponse(
        data=CandidateAssessmentRead.model_validate(row)
    )


@router.patch("/{assessment_id}", response_model=CandidateAssessmentResponse)
def update_candidate_assessment(
    assessment_id: str,
    payload: CandidateAssessmentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CandidateAssessmentResponse:
    row = candidate_assessment_service.update_candidate_assessment(
        db, assessment_id, payload, company_id=company_id
    )
    return CandidateAssessmentResponse(
        data=CandidateAssessmentRead.model_validate(row)
    )


@router.delete("/{assessment_id}", status_code=204)
def delete_candidate_assessment(
    assessment_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    candidate_assessment_service.delete_candidate_assessment(
        db, assessment_id, company_id=company_id
    )
    return Response(status_code=204)
