from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.hrm.documents import (
    HrmDocumentAcknowledgment,
    HrmDocumentCategory,
    HrmDocumentTemplate,
    HrmHrDocument,
)
from app.schemas.hrm.documents import (
    DocumentAcknowledgmentCreate,
    DocumentAcknowledgmentUpdate,
    DocumentCategoryCreate,
    DocumentCategoryUpdate,
    DocumentTemplateCreate,
    DocumentTemplateUpdate,
    HrDocumentCreate,
    HrDocumentUpdate,
)


# --- categories ---


def list_document_categories(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmDocumentCategory).filter(
        HrmDocumentCategory.company_id == company_id
    )
    if status:
        query = query.filter(HrmDocumentCategory.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmDocumentCategory.name.ilike(like),
                HrmDocumentCategory.description.ilike(like),
            )
        )
    return query.order_by(
        HrmDocumentCategory.sort_order.asc(), HrmDocumentCategory.name.asc()
    ).all()


def get_document_category(
    db: Session, category_id: str, company_id: Optional[str] = None
):
    row = db.get(HrmDocumentCategory, category_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Document category not found")
    return row


def create_document_category(
    db: Session, payload: DocumentCategoryCreate, *, created_by: Optional[str]
):
    name = payload.name.strip()
    dup = (
        db.query(HrmDocumentCategory)
        .filter(
            HrmDocumentCategory.company_id == payload.company_id,
            func.lower(HrmDocumentCategory.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Document category name already exists")
    row = HrmDocumentCategory(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        color=payload.color.strip(),
        icon=payload.icon.strip(),
        sort_order=payload.sort_order,
        is_mandatory=payload.is_mandatory,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_document_category(
    db: Session,
    category_id: str,
    payload: DocumentCategoryUpdate,
    *,
    company_id: str,
):
    row = get_document_category(db, category_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmDocumentCategory)
            .filter(
                HrmDocumentCategory.company_id == company_id,
                func.lower(HrmDocumentCategory.name) == name.lower(),
                HrmDocumentCategory.id != category_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409, detail="Document category name already exists"
            )
        data["name"] = name
    if "color" in data and data["color"] is not None:
        data["color"] = data["color"].strip()
    if "icon" in data and data["icon"] is not None:
        data["icon"] = data["icon"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_document_category(db: Session, category_id: str, *, company_id: str):
    row = get_document_category(db, category_id, company_id=company_id)
    db.delete(row)
    db.commit()


def count_documents_in_category(db: Session, category_id: str) -> int:
    return (
        db.query(func.count(HrmHrDocument.id))
        .filter(HrmHrDocument.category_id == category_id)
        .scalar()
        or 0
    )


# --- HR documents ---


def list_hr_documents(
    db: Session,
    *,
    company_id: str,
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmHrDocument).filter(HrmHrDocument.company_id == company_id)
    if category_id:
        query = query.filter(HrmHrDocument.category_id == category_id)
    if status:
        query = query.filter(HrmHrDocument.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmHrDocument.title.ilike(like),
                HrmHrDocument.description.ilike(like),
            )
        )
    return query.order_by(HrmHrDocument.created_at.desc()).all()


def get_hr_document(db: Session, document_id: str, company_id: Optional[str] = None):
    row = db.get(HrmHrDocument, document_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="HR document not found")
    return row


def create_hr_document(
    db: Session, payload: HrDocumentCreate, *, created_by: Optional[str]
):
    if payload.category_id:
        get_document_category(db, payload.category_id, company_id=payload.company_id)
    row = HrmHrDocument(
        company_id=payload.company_id,
        title=payload.title.strip(),
        description=payload.description,
        category_id=payload.category_id,
        file_name=payload.file_name,
        file_path=payload.file_path,
        file_type=payload.file_type,
        file_size=payload.file_size,
        version=payload.version.strip(),
        status="draft",
        effective_date=payload.effective_date,
        expiry_date=payload.expiry_date,
        requires_acknowledgment=payload.requires_acknowledgment,
        uploaded_by=created_by,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_hr_document(
    db: Session, document_id: str, payload: HrDocumentUpdate, *, company_id: str
):
    row = get_hr_document(db, document_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        get_document_category(db, data["category_id"], company_id=company_id)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "version" in data and data["version"] is not None:
        data["version"] = data["version"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def publish_hr_document(
    db: Session, document_id: str, *, company_id: str, approved_by: Optional[str]
):
    row = get_hr_document(db, document_id, company_id=company_id)
    if row.status == "archived":
        raise HTTPException(status_code=400, detail="Archived document cannot be published")
    row.status = "published"
    row.approved_by = approved_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def archive_hr_document(db: Session, document_id: str, *, company_id: str):
    row = get_hr_document(db, document_id, company_id=company_id)
    row.status = "archived"
    db.commit()
    db.refresh(row)
    return row


def delete_hr_document(db: Session, document_id: str, *, company_id: str):
    row = get_hr_document(db, document_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- templates ---


def list_document_templates(
    db: Session,
    *,
    company_id: str,
    category_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmDocumentTemplate).filter(
        HrmDocumentTemplate.company_id == company_id
    )
    if category_id:
        query = query.filter(HrmDocumentTemplate.category_id == category_id)
    if status:
        query = query.filter(HrmDocumentTemplate.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                HrmDocumentTemplate.name.ilike(like),
                HrmDocumentTemplate.description.ilike(like),
            )
        )
    return query.order_by(HrmDocumentTemplate.name.asc()).all()


def get_document_template(
    db: Session, template_id: str, company_id: Optional[str] = None
):
    row = db.get(HrmDocumentTemplate, template_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Document template not found")
    return row


def create_document_template(
    db: Session, payload: DocumentTemplateCreate, *, created_by: Optional[str]
):
    if payload.category_id:
        get_document_category(db, payload.category_id, company_id=payload.company_id)
    name = payload.name.strip()
    row = HrmDocumentTemplate(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        category_id=payload.category_id,
        template_content=payload.template_content,
        placeholders=payload.placeholders,
        default_values=payload.default_values,
        is_default=payload.is_default,
        file_format=payload.file_format.strip(),
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_document_template(
    db: Session,
    template_id: str,
    payload: DocumentTemplateUpdate,
    *,
    company_id: str,
):
    row = get_document_template(db, template_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        get_document_category(db, data["category_id"], company_id=company_id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "file_format" in data and data["file_format"] is not None:
        data["file_format"] = data["file_format"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_document_template(db: Session, template_id: str, *, company_id: str):
    row = get_document_template(db, template_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- acknowledgments ---


def list_document_acknowledgments(
    db: Session,
    *,
    company_id: str,
    document_id: Optional[str] = None,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmDocumentAcknowledgment).filter(
        HrmDocumentAcknowledgment.company_id == company_id
    )
    if document_id:
        query = query.filter(HrmDocumentAcknowledgment.document_id == document_id)
    if user_id:
        query = query.filter(HrmDocumentAcknowledgment.user_id == user_id)
    if status:
        query = query.filter(HrmDocumentAcknowledgment.status == status)
    return query.order_by(HrmDocumentAcknowledgment.created_at.desc()).all()


def get_document_acknowledgment(
    db: Session, ack_id: str, company_id: Optional[str] = None
):
    row = db.get(HrmDocumentAcknowledgment, ack_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Document acknowledgment not found")
    return row


def create_document_acknowledgment(
    db: Session,
    payload: DocumentAcknowledgmentCreate,
    *,
    created_by: Optional[str],
):
    get_hr_document(db, payload.document_id, company_id=payload.company_id)
    existing = (
        db.query(HrmDocumentAcknowledgment)
        .filter(
            HrmDocumentAcknowledgment.company_id == payload.company_id,
            HrmDocumentAcknowledgment.document_id == payload.document_id,
            HrmDocumentAcknowledgment.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Acknowledgment already assigned for this user and document",
        )
    row = HrmDocumentAcknowledgment(
        company_id=payload.company_id,
        document_id=payload.document_id,
        user_id=payload.user_id,
        status="pending",
        due_date=payload.due_date,
        acknowledgment_note=payload.acknowledgment_note,
        assigned_by=created_by,
        assigned_at=datetime.utcnow(),
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_document_acknowledgment(
    db: Session,
    ack_id: str,
    payload: DocumentAcknowledgmentUpdate,
    *,
    company_id: str,
):
    row = get_document_acknowledgment(db, ack_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def acknowledge_document(
    db: Session,
    ack_id: str,
    *,
    company_id: str,
    note: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    row = get_document_acknowledgment(db, ack_id, company_id=company_id)
    if row.status == "acknowledged":
        raise HTTPException(status_code=400, detail="Already acknowledged")
    row.status = "acknowledged"
    row.acknowledged_at = datetime.utcnow()
    if note is not None:
        row.acknowledgment_note = note
    if ip_address is not None:
        row.ip_address = ip_address[:64]
    if user_agent is not None:
        row.user_agent = user_agent[:50]
    db.commit()
    db.refresh(row)
    return row


def delete_document_acknowledgment(db: Session, ack_id: str, *, company_id: str):
    row = get_document_acknowledgment(db, ack_id, company_id=company_id)
    db.delete(row)
    db.commit()
