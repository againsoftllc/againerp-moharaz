from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.job_requisition import (
    JobRequisitionCreate,
    JobRequisitionListMeta,
    JobRequisitionListResponse,
    JobRequisitionRead,
    JobRequisitionResponse,
    JobRequisitionUpdate,
)
from app.services.hrm import job_requisition_service

router = APIRouter(prefix="/job-requisitions", tags=["hrm-job-requisitions"])


@router.get("", response_model=JobRequisitionListResponse)
def list_job_requisitions(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(
        default=None,
        pattern="^(draft|pending_approval|approved|on_hold|closed)$",
    ),
    department_id: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
) -> JobRequisitionListResponse:
    rows, total = job_requisition_service.list_job_requisitions(
        db,
        company_id=company_id,
        page=page,
        per_page=per_page,
        status=status,
        department_id=department_id,
        q=q,
    )
    data = [JobRequisitionRead.model_validate(r) for r in rows]
    return JobRequisitionListResponse(
        data=data,
        meta=JobRequisitionListMeta(count=total, page=page, per_page=per_page),
    )


@router.get("/{requisition_id}", response_model=JobRequisitionResponse)
def get_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.get_job_requisition(
        db, requisition_id, company_id=company_id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.post("", response_model=JobRequisitionResponse, status_code=201)
def create_job_requisition(
    payload: JobRequisitionCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> JobRequisitionResponse:
    row = job_requisition_service.create_job_requisition(
        db, payload, created_by=user.id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.patch("/{requisition_id}", response_model=JobRequisitionResponse)
def update_job_requisition(
    requisition_id: str,
    payload: JobRequisitionUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.update_job_requisition(
        db, requisition_id, payload, company_id=company_id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.post("/{requisition_id}/submit", response_model=JobRequisitionResponse)
def submit_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.submit_job_requisition(
        db, requisition_id, company_id=company_id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.post("/{requisition_id}/approve", response_model=JobRequisitionResponse)
def approve_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.approve_job_requisition(
        db, requisition_id, company_id=company_id, approved_by=user.id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.post("/{requisition_id}/hold", response_model=JobRequisitionResponse)
def hold_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.hold_job_requisition(
        db, requisition_id, company_id=company_id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.post("/{requisition_id}/close", response_model=JobRequisitionResponse)
def close_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> JobRequisitionResponse:
    row = job_requisition_service.close_job_requisition(
        db, requisition_id, company_id=company_id
    )
    return JobRequisitionResponse(data=JobRequisitionRead.model_validate(row))


@router.delete("/{requisition_id}", status_code=204)
def delete_job_requisition(
    requisition_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    job_requisition_service.delete_job_requisition(
        db, requisition_id, company_id=company_id
    )
    return Response(status_code=204)
