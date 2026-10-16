from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.documents import (
    DocumentAcknowledgmentCreate,
    DocumentAcknowledgmentListResponse,
    DocumentAcknowledgmentRead,
    DocumentAcknowledgmentResponse,
    DocumentAcknowledgmentUpdate,
    DocumentCategoryCreate,
    DocumentCategoryListResponse,
    DocumentCategoryRead,
    DocumentCategoryResponse,
    DocumentCategoryUpdate,
    DocumentTemplateCreate,
    DocumentTemplateListResponse,
    DocumentTemplateRead,
    DocumentTemplateResponse,
    DocumentTemplateUpdate,
    HrDocumentCreate,
    HrDocumentListResponse,
    HrDocumentRead,
    HrDocumentResponse,
    HrDocumentUpdate,
)
from app.services.hrm import documents_service as svc

categories_router = APIRouter(
    prefix="/document-categories", tags=["hrm-document-categories"]
)
hr_documents_router = APIRouter(prefix="/hr-documents", tags=["hrm-hr-documents"])
templates_router = APIRouter(
    prefix="/document-templates", tags=["hrm-document-templates"]
)
acknowledgments_router = APIRouter(
    prefix="/document-acknowledgments", tags=["hrm-document-acknowledgments"]
)


class AcknowledgeBody(BaseModel):
    acknowledgment_note: Optional[str] = None
    ip_address: Optional[str] = Field(default=None, max_length=64)
    user_agent: Optional[str] = Field(default=None, max_length=50)


# --- categories ---


@categories_router.get("", response_model=DocumentCategoryListResponse)
def list_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_document_categories(
        db, company_id=company_id, status=status, q=q
    )
    data = [DocumentCategoryRead.model_validate(r) for r in rows]
    return DocumentCategoryListResponse(data=data, meta={"count": len(data)})


@categories_router.post("", response_model=DocumentCategoryResponse, status_code=201)
def create_category(
    payload: DocumentCategoryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_document_category(db, payload, created_by=user.id)
    return DocumentCategoryResponse(data=DocumentCategoryRead.model_validate(row))


@categories_router.patch("/{category_id}", response_model=DocumentCategoryResponse)
def update_category(
    category_id: str,
    payload: DocumentCategoryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_document_category(
        db, category_id, payload, company_id=company_id
    )
    return DocumentCategoryResponse(data=DocumentCategoryRead.model_validate(row))


@categories_router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_document_category(db, category_id, company_id=company_id)
    return Response(status_code=204)


# --- HR documents ---


@hr_documents_router.get("", response_model=HrDocumentListResponse)
def list_hr_documents(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    category_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|published|archived)$"
    ),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_hr_documents(
        db,
        company_id=company_id,
        category_id=category_id,
        status=status,
        q=q,
    )
    data = [HrDocumentRead.model_validate(r) for r in rows]
    return HrDocumentListResponse(data=data, meta={"count": len(data)})


@hr_documents_router.post("", response_model=HrDocumentResponse, status_code=201)
def create_hr_document(
    payload: HrDocumentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_hr_document(db, payload, created_by=user.id)
    return HrDocumentResponse(data=HrDocumentRead.model_validate(row))


@hr_documents_router.patch("/{document_id}", response_model=HrDocumentResponse)
def update_hr_document(
    document_id: str,
    payload: HrDocumentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_hr_document(db, document_id, payload, company_id=company_id)
    return HrDocumentResponse(data=HrDocumentRead.model_validate(row))


@hr_documents_router.post(
    "/{document_id}/publish", response_model=HrDocumentResponse
)
def publish_hr_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.publish_hr_document(
        db, document_id, company_id=company_id, approved_by=user.id
    )
    return HrDocumentResponse(data=HrDocumentRead.model_validate(row))


@hr_documents_router.post(
    "/{document_id}/archive", response_model=HrDocumentResponse
)
def archive_hr_document(
    document_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.archive_hr_document(db, document_id, company_id=company_id)
    return HrDocumentResponse(data=HrDocumentRead.model_validate(row))


@hr_documents_router.delete("/{document_id}", status_code=204)
def delete_hr_document(
    document_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_hr_document(db, document_id, company_id=company_id)
    return Response(status_code=204)


# --- templates ---


@templates_router.get("", response_model=DocumentTemplateListResponse)
def list_templates(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    category_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_document_templates(
        db,
        company_id=company_id,
        category_id=category_id,
        status=status,
        q=q,
    )
    data = [DocumentTemplateRead.model_validate(r) for r in rows]
    return DocumentTemplateListResponse(data=data, meta={"count": len(data)})


@templates_router.post("", response_model=DocumentTemplateResponse, status_code=201)
def create_template(
    payload: DocumentTemplateCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_document_template(db, payload, created_by=user.id)
    return DocumentTemplateResponse(data=DocumentTemplateRead.model_validate(row))


@templates_router.patch("/{template_id}", response_model=DocumentTemplateResponse)
def update_template(
    template_id: str,
    payload: DocumentTemplateUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_document_template(
        db, template_id, payload, company_id=company_id
    )
    return DocumentTemplateResponse(data=DocumentTemplateRead.model_validate(row))


@templates_router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_document_template(db, template_id, company_id=company_id)
    return Response(status_code=204)


# --- acknowledgments ---


@acknowledgments_router.get("", response_model=DocumentAcknowledgmentListResponse)
def list_acknowledgments(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    document_id: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(pending|acknowledged|overdue)$"
    ),
):
    rows = svc.list_document_acknowledgments(
        db,
        company_id=company_id,
        document_id=document_id,
        user_id=user_id,
        status=status,
    )
    data = [DocumentAcknowledgmentRead.model_validate(r) for r in rows]
    return DocumentAcknowledgmentListResponse(data=data, meta={"count": len(data)})


@acknowledgments_router.post(
    "", response_model=DocumentAcknowledgmentResponse, status_code=201
)
def create_acknowledgment(
    payload: DocumentAcknowledgmentCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_document_acknowledgment(db, payload, created_by=user.id)
    return DocumentAcknowledgmentResponse(
        data=DocumentAcknowledgmentRead.model_validate(row)
    )


@acknowledgments_router.patch(
    "/{ack_id}", response_model=DocumentAcknowledgmentResponse
)
def update_acknowledgment(
    ack_id: str,
    payload: DocumentAcknowledgmentUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_document_acknowledgment(
        db, ack_id, payload, company_id=company_id
    )
    return DocumentAcknowledgmentResponse(
        data=DocumentAcknowledgmentRead.model_validate(row)
    )


@acknowledgments_router.post(
    "/{ack_id}/acknowledge", response_model=DocumentAcknowledgmentResponse
)
def acknowledge(
    ack_id: str,
    body: AcknowledgeBody | None = None,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    payload = body or AcknowledgeBody()
    row = svc.acknowledge_document(
        db,
        ack_id,
        company_id=company_id,
        note=payload.acknowledgment_note,
        ip_address=payload.ip_address,
        user_agent=payload.user_agent,
    )
    return DocumentAcknowledgmentResponse(
        data=DocumentAcknowledgmentRead.model_validate(row)
    )


@acknowledgments_router.delete("/{ack_id}", status_code=204)
def delete_acknowledgment(
    ack_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_document_acknowledgment(db, ack_id, company_id=company_id)
    return Response(status_code=204)
