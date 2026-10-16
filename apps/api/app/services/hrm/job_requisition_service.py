from __future__ import annotations

import re
from datetime import datetime
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmDepartment
from app.models.hrm.recruitment import HrmJobCategory, HrmJobRequisition
from app.schemas.hrm.job_requisition import JobRequisitionCreate, JobRequisitionUpdate

_REQ_RE = re.compile(r"^REQ-(\d+)$", re.IGNORECASE)


def _next_requisition_code(db: Session, company_id: str) -> str:
    rows = (
        db.query(HrmJobRequisition.requisition_code)
        .filter(HrmJobRequisition.company_id == company_id)
        .all()
    )
    max_n = 0
    for (code,) in rows:
        m = _REQ_RE.match((code or "").strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"REQ-{max_n + 1:04d}"


def _require_fks(
    db: Session,
    *,
    company_id: str,
    job_category_id: Optional[str],
    department_id: Optional[str],
) -> None:
    if job_category_id:
        row = db.get(HrmJobCategory, job_category_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid job_category_id")
    if department_id:
        row = db.get(HrmDepartment, department_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid department_id")


def list_job_requisitions(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    q: Optional[str] = None,
) -> Tuple[list[HrmJobRequisition], int]:
    query = db.query(HrmJobRequisition).filter(
        HrmJobRequisition.company_id == company_id
    )
    if status:
        query = query.filter(HrmJobRequisition.status == status)
    if department_id:
        query = query.filter(HrmJobRequisition.department_id == department_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmJobRequisition.title.ilike(like))
            | (HrmJobRequisition.requisition_code.ilike(like))
        )
    total = query.count()
    rows = (
        query.order_by(HrmJobRequisition.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_job_requisition(
    db: Session, requisition_id: str, company_id: Optional[str] = None
) -> HrmJobRequisition:
    row = db.get(HrmJobRequisition, requisition_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Job requisition not found")
    return row


def create_job_requisition(
    db: Session, payload: JobRequisitionCreate, *, created_by: Optional[str]
) -> HrmJobRequisition:
    _require_fks(
        db,
        company_id=payload.company_id,
        job_category_id=payload.job_category_id,
        department_id=payload.department_id,
    )
    data = payload.model_dump()
    data["title"] = payload.title.strip()
    data["requisition_code"] = _next_requisition_code(db, payload.company_id)
    data["status"] = "draft"
    data["created_by"] = created_by
    row = HrmJobRequisition(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_job_requisition(
    db: Session, requisition_id: str, payload: JobRequisitionUpdate, *, company_id: str
) -> HrmJobRequisition:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status in ("approved", "closed"):
        raise HTTPException(
            status_code=409,
            detail="Approved/closed requisitions cannot be edited; use hold/close actions",
        )
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    _require_fks(
        db,
        company_id=company_id,
        job_category_id=data.get("job_category_id", row.job_category_id),
        department_id=data.get("department_id", row.department_id),
    )
    budget_min = data.get("budget_min", row.budget_min)
    budget_max = data.get("budget_max", row.budget_max)
    if budget_min is not None and budget_max is not None and budget_max < budget_min:
        raise HTTPException(status_code=400, detail="budget_max must be >= budget_min")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def submit_job_requisition(
    db: Session, requisition_id: str, *, company_id: str
) -> HrmJobRequisition:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status not in ("draft", "on_hold"):
        raise HTTPException(
            status_code=409, detail="Only draft/on_hold requisitions can be submitted"
        )
    row.status = "pending_approval"
    db.commit()
    db.refresh(row)
    return row


def approve_job_requisition(
    db: Session, requisition_id: str, *, company_id: str, approved_by: str
) -> HrmJobRequisition:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status != "pending_approval":
        raise HTTPException(
            status_code=409, detail="Only pending_approval requisitions can be approved"
        )
    row.status = "approved"
    row.approved_by = approved_by
    row.approval_date = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def hold_job_requisition(
    db: Session, requisition_id: str, *, company_id: str
) -> HrmJobRequisition:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status not in ("draft", "pending_approval", "approved"):
        raise HTTPException(status_code=409, detail="Cannot put this requisition on hold")
    row.status = "on_hold"
    db.commit()
    db.refresh(row)
    return row


def close_job_requisition(
    db: Session, requisition_id: str, *, company_id: str
) -> HrmJobRequisition:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status == "closed":
        raise HTTPException(status_code=409, detail="Requisition already closed")
    row.status = "closed"
    db.commit()
    db.refresh(row)
    return row


def delete_job_requisition(
    db: Session, requisition_id: str, *, company_id: str
) -> None:
    row = get_job_requisition(db, requisition_id, company_id=company_id)
    if row.status not in ("draft", "on_hold"):
        raise HTTPException(
            status_code=409, detail="Only draft/on_hold requisitions can be deleted"
        )
    db.delete(row)
    db.commit()
