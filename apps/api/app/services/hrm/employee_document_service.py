from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmDocumentType, HrmEmployee, HrmEmployeeDocument
from app.schemas.hrm.employee_document import (
    EmployeeDocumentCreate,
    EmployeeDocumentUpdate,
)


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def _require_document_type(
    db: Session, document_type_id: str, company_id: str
) -> HrmDocumentType:
    row = db.get(HrmDocumentType, document_type_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid document_type_id")
    return row


def list_employee_documents(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    document_type_id: Optional[str] = None,
    verification_status: Optional[str] = None,
) -> Sequence[HrmEmployeeDocument]:
    query = db.query(HrmEmployeeDocument).filter(
        HrmEmployeeDocument.company_id == company_id
    )
    if employee_id:
        query = query.filter(HrmEmployeeDocument.employee_id == employee_id)
    if document_type_id:
        query = query.filter(HrmEmployeeDocument.document_type_id == document_type_id)
    if verification_status:
        query = query.filter(
            HrmEmployeeDocument.verification_status == verification_status
        )
    return query.order_by(HrmEmployeeDocument.created_at.desc()).all()


def get_employee_document(
    db: Session, document_id: str, company_id: Optional[str] = None
) -> HrmEmployeeDocument:
    row = db.get(HrmEmployeeDocument, document_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee document not found")
    return row


def create_employee_document(
    db: Session, payload: EmployeeDocumentCreate, *, created_by: Optional[str]
) -> HrmEmployeeDocument:
    _require_employee(db, payload.employee_id, payload.company_id)
    _require_document_type(db, payload.document_type_id, payload.company_id)

    row = HrmEmployeeDocument(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        document_type_id=payload.document_type_id,
        file_path=payload.file_path.strip(),
        file_name=(payload.file_name or "").strip() or None,
        expiry_date=payload.expiry_date,
        verification_status=payload.verification_status,
        notes=payload.notes,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_employee_document(
    db: Session,
    document_id: str,
    payload: EmployeeDocumentUpdate,
    *,
    company_id: str,
) -> HrmEmployeeDocument:
    row = get_employee_document(db, document_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "document_type_id" in data and data["document_type_id"] is not None:
        _require_document_type(db, data["document_type_id"], company_id)
    if "file_path" in data and data["file_path"] is not None:
        data["file_path"] = data["file_path"].strip()
    if "file_name" in data and data["file_name"] is not None:
        data["file_name"] = data["file_name"].strip() or None
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_employee_document(db: Session, document_id: str, *, company_id: str) -> None:
    row = get_employee_document(db, document_id, company_id=company_id)
    db.delete(row)
    db.commit()
