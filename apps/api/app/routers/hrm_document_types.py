from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.document_type import (
    DocumentTypeCreate,
    DocumentTypeListMeta,
    DocumentTypeListResponse,
    DocumentTypeRead,
    DocumentTypeResponse,
    DocumentTypeUpdate,
)
from app.services.hrm import document_type_service

router = APIRouter(prefix="/document-types", tags=["hrm-document-types"])


@router.get("", response_model=DocumentTypeListResponse)
def list_document_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    q: Optional[str] = Query(default=None),
) -> DocumentTypeListResponse:
    rows = document_type_service.list_document_types(db, company_id=company_id, q=q)
    data = [DocumentTypeRead.model_validate(r) for r in rows]
    return DocumentTypeListResponse(
        data=data, meta=DocumentTypeListMeta(count=len(data))
    )


@router.get("/{document_type_id}", response_model=DocumentTypeResponse)
def get_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> DocumentTypeResponse:
    row = document_type_service.get_document_type(
        db, document_type_id, company_id=company_id
    )
    return DocumentTypeResponse(data=DocumentTypeRead.model_validate(row))


@router.post("", response_model=DocumentTypeResponse, status_code=201)
def create_document_type(
    payload: DocumentTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
) -> DocumentTypeResponse:
    row = document_type_service.create_document_type(db, payload, created_by=user.id)
    return DocumentTypeResponse(data=DocumentTypeRead.model_validate(row))


@router.patch("/{document_type_id}", response_model=DocumentTypeResponse)
def update_document_type(
    document_type_id: str,
    payload: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> DocumentTypeResponse:
    row = document_type_service.update_document_type(
        db, document_type_id, payload, company_id=company_id
    )
    return DocumentTypeResponse(data=DocumentTypeRead.model_validate(row))


@router.delete("/{document_type_id}", status_code=204)
def delete_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> Response:
    document_type_service.delete_document_type(
        db, document_type_id, company_id=company_id
    )
    return Response(status_code=204)
