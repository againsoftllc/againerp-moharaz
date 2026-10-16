from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmTimeEntry
from app.models.hrm.org import HrmEmployee
from app.schemas.hrm.time_entry import TimeEntryCreate, TimeEntryDecision, TimeEntryUpdate


def _require_employee(db: Session, employee_id: str, company_id: str) -> HrmEmployee:
    row = db.get(HrmEmployee, employee_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    return row


def list_time_entries(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[Sequence[HrmTimeEntry], int]:
    query = db.query(HrmTimeEntry).filter(HrmTimeEntry.company_id == company_id)
    if employee_id:
        query = query.filter(HrmTimeEntry.employee_id == employee_id)
    if status:
        query = query.filter(HrmTimeEntry.status == status)
    total = query.count()
    offset = (page - 1) * per_page
    rows = (
        query.order_by(HrmTimeEntry.date.desc().nullslast())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_time_entry(
    db: Session, entry_id: str, company_id: Optional[str] = None
) -> HrmTimeEntry:
    row = db.get(HrmTimeEntry, entry_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Time entry not found")
    return row


def create_time_entry(
    db: Session, payload: TimeEntryCreate, *, created_by: Optional[str]
) -> HrmTimeEntry:
    _require_employee(db, payload.employee_id, payload.company_id)
    data = payload.model_dump()
    data["status"] = "pending"
    data["created_by"] = created_by
    row = HrmTimeEntry(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_time_entry(
    db: Session, entry_id: str, payload: TimeEntryUpdate, *, company_id: str
) -> HrmTimeEntry:
    row = get_time_entry(db, entry_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending time entries can be edited")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def decide_time_entry(
    db: Session,
    entry_id: str,
    *,
    company_id: str,
    decision: str,
    payload: TimeEntryDecision,
    decided_by: str,
) -> HrmTimeEntry:
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    row = get_time_entry(db, entry_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Time entry already decided")
    row.status = decision
    row.manager_comments = payload.manager_comments
    row.approved_by = decided_by
    row.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_time_entry(db: Session, entry_id: str, *, company_id: str) -> None:
    row = get_time_entry(db, entry_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending time entries can be deleted")
    db.delete(row)
    db.commit()
