from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmDocumentType, HrmEmployeeDocument
from app.schemas.hrm.document_type import DocumentTypeCreate, DocumentTypeUpdate


def list_document_types(
    db: Session,
    *,
    company_id: str,
    q: Optional[str] = None,
) -> Sequence[HrmDocumentType]:
    query = db.query(HrmDocumentType).filter(HrmDocumentType.company_id == company_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmDocumentType.name.ilike(like)) | (HrmDocumentType.description.ilike(like))
        )
    return query.order_by(HrmDocumentType.name.asc()).all()


def get_document_type(
    db: Session, document_type_id: str, company_id: Optional[str] = None
) -> HrmDocumentType:
    row = db.get(HrmDocumentType, document_type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Document type not found")
    return row


def create_document_type(
    db: Session, payload: DocumentTypeCreate, *, created_by: Optional[str]
) -> HrmDocumentType:
    name = payload.name.strip()
    dup = (
        db.query(HrmDocumentType)
        .filter(
            HrmDocumentType.company_id == payload.company_id,
            func.lower(HrmDocumentType.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Document type name already exists")

    row = HrmDocumentType(
        company_id=payload.company_id,
        name=name,
        is_required=payload.is_required,
        description=payload.description,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_document_type(
    db: Session,
    document_type_id: str,
    payload: DocumentTypeUpdate,
    *,
    company_id: str,
) -> HrmDocumentType:
    row = get_document_type(db, document_type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmDocumentType)
            .filter(
                HrmDocumentType.company_id == company_id,
                func.lower(HrmDocumentType.name) == name.lower(),
                HrmDocumentType.id != document_type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Document type name already exists")
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_document_type(db: Session, document_type_id: str, *, company_id: str) -> None:
    row = get_document_type(db, document_type_id, company_id=company_id)
    doc_count = (
        db.query(func.count(HrmEmployeeDocument.id))
        .filter(HrmEmployeeDocument.document_type_id == document_type_id)
        .scalar()
        or 0
    )
    if doc_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete document type with {doc_count} employee document(s)",
        )
    db.delete(row)
    db.commit()
