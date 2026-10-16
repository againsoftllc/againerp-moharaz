from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.employee_document import (
    EmployeeDocumentCreate,
    EmployeeDocumentListMeta,
    EmployeeDocumentListResponse,
    EmployeeDocumentRead,
    EmployeeDocumentResponse,
    EmployeeDocumentUpdate,
)
from app.services.hrm import employee_document_service

router = APIRouter(prefix="/employee-documents", tags=["hrm-employee-documents"])


@router.get("", response_model=EmployeeDocumentListResponse)
def list_employee_documents(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    document_type_id: Optional[str] = Query(default=None),
    verification_status: Optional[str] = Query(
        default=None, pattern="^(pending|verified|rejected)$"
    ),
) -> EmployeeDocumentListResponse:
    rows = employee_document_service.list_employee_documents(
        db,
        company_id=company_id,
        employee_id=employee_id,
        document_type_id=document_type_id,
        verification_status=verification_status,
    )
    data = [EmployeeDocumentRead.model_validate(r) for r in rows]
    return EmployeeDocumentListResponse(
        data=data, meta=EmployeeDocumentListMeta(count=len(data))
    )


@router.get("/{document_id}", response_model=EmployeeDocumentResponse)
def get_employee_document(
    document_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeDocumentResponse:
    row = employee_document_service.get_employee_document(
        db, document_id, company_id=company_id
    )
    return EmployeeDocumentResponse(data=EmployeeDocumentRead.model_validate(row))


@router.post("", response_model=EmployeeDocumentResponse, status_code=201)
def create_employee_document(
    payload: EmployeeDocumentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> EmployeeDocumentResponse:
    row = employee_document_service.create_employee_document(
        db, payload, created_by=user.id
    )
    return EmployeeDocumentResponse(data=EmployeeDocumentRead.model_validate(row))


@router.patch("/{document_id}", response_model=EmployeeDocumentResponse)
def update_employee_document(
    document_id: str,
    payload: EmployeeDocumentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> EmployeeDocumentResponse:
    row = employee_document_service.update_employee_document(
        db, document_id, payload, company_id=company_id
    )
    return EmployeeDocumentResponse(data=EmployeeDocumentRead.model_validate(row))


@router.delete("/{document_id}", status_code=204)
def delete_employee_document(
    document_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    employee_document_service.delete_employee_document(
        db, document_id, company_id=company_id
    )
    return Response(status_code=204)
