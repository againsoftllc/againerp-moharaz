from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmEmployee
from app.models.hrm.recruitment import (
    HrmCandidate,
    HrmCandidateOnboarding,
    HrmChecklistItem,
    HrmOnboardingChecklist,
)
from app.schemas.hrm.onboarding import (
    CandidateOnboardingCreate,
    CandidateOnboardingUpdate,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    OnboardingChecklistCreate,
    OnboardingChecklistUpdate,
)


# --- checklists ---


def list_checklists(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
) -> Sequence[HrmOnboardingChecklist]:
    query = db.query(HrmOnboardingChecklist).filter(
        HrmOnboardingChecklist.company_id == company_id
    )
    if status:
        query = query.filter(HrmOnboardingChecklist.status == status)
    return query.order_by(HrmOnboardingChecklist.name.asc()).all()


def get_checklist(
    db: Session, checklist_id: str, company_id: Optional[str] = None
) -> HrmOnboardingChecklist:
    row = db.get(HrmOnboardingChecklist, checklist_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Onboarding checklist not found")
    return row


def create_checklist(
    db: Session, payload: OnboardingChecklistCreate, *, created_by: Optional[str]
) -> HrmOnboardingChecklist:
    if payload.is_default:
        db.query(HrmOnboardingChecklist).filter(
            HrmOnboardingChecklist.company_id == payload.company_id,
            HrmOnboardingChecklist.is_default.is_(True),
        ).update({"is_default": False})
    row = HrmOnboardingChecklist(
        company_id=payload.company_id,
        name=payload.name.strip(),
        description=payload.description,
        is_default=payload.is_default,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_checklist(
    db: Session,
    checklist_id: str,
    payload: OnboardingChecklistUpdate,
    *,
    company_id: str,
) -> HrmOnboardingChecklist:
    row = get_checklist(db, checklist_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default"):
        db.query(HrmOnboardingChecklist).filter(
            HrmOnboardingChecklist.company_id == company_id,
            HrmOnboardingChecklist.is_default.is_(True),
            HrmOnboardingChecklist.id != checklist_id,
        ).update({"is_default": False})
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_checklist(db: Session, checklist_id: str, *, company_id: str) -> None:
    row = get_checklist(db, checklist_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmCandidateOnboarding.id))
        .filter(HrmCandidateOnboarding.checklist_id == checklist_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete checklist used by {usage} onboarding(s)",
        )
    db.delete(row)
    db.commit()


# --- checklist items ---


def list_checklist_items(
    db: Session, *, company_id: str, checklist_id: Optional[str] = None
) -> Sequence[HrmChecklistItem]:
    query = db.query(HrmChecklistItem).filter(HrmChecklistItem.company_id == company_id)
    if checklist_id:
        query = query.filter(HrmChecklistItem.checklist_id == checklist_id)
    return query.order_by(HrmChecklistItem.due_day.asc(), HrmChecklistItem.created_at.asc()).all()


def get_checklist_item(
    db: Session, item_id: str, company_id: Optional[str] = None
) -> HrmChecklistItem:
    row = db.get(HrmChecklistItem, item_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return row


def create_checklist_item(
    db: Session, payload: ChecklistItemCreate, *, created_by: Optional[str]
) -> HrmChecklistItem:
    get_checklist(db, payload.checklist_id, company_id=payload.company_id)
    row = HrmChecklistItem(
        company_id=payload.company_id,
        checklist_id=payload.checklist_id,
        task_name=payload.task_name.strip(),
        description=payload.description,
        category=payload.category,
        assigned_to_role=payload.assigned_to_role,
        due_day=payload.due_day,
        is_required=payload.is_required,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_checklist_item(
    db: Session, item_id: str, payload: ChecklistItemUpdate, *, company_id: str
) -> HrmChecklistItem:
    row = get_checklist_item(db, item_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "task_name" in data and data["task_name"] is not None:
        data["task_name"] = data["task_name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_checklist_item(db: Session, item_id: str, *, company_id: str) -> None:
    row = get_checklist_item(db, item_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- candidate onboarding ---


def list_candidate_onboardings(
    db: Session,
    *,
    company_id: str,
    candidate_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Sequence[HrmCandidateOnboarding]:
    query = db.query(HrmCandidateOnboarding).filter(
        HrmCandidateOnboarding.company_id == company_id
    )
    if candidate_id:
        query = query.filter(HrmCandidateOnboarding.candidate_id == candidate_id)
    if employee_id:
        query = query.filter(HrmCandidateOnboarding.employee_id == employee_id)
    if status:
        query = query.filter(HrmCandidateOnboarding.status == status)
    return query.order_by(HrmCandidateOnboarding.created_at.desc()).all()


def get_candidate_onboarding(
    db: Session, onboarding_id: str, company_id: Optional[str] = None
) -> HrmCandidateOnboarding:
    row = db.get(HrmCandidateOnboarding, onboarding_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Candidate onboarding not found")
    return row


def create_candidate_onboarding(
    db: Session, payload: CandidateOnboardingCreate, *, created_by: Optional[str]
) -> HrmCandidateOnboarding:
    if not payload.candidate_id and not payload.employee_id:
        raise HTTPException(
            status_code=400, detail="candidate_id or employee_id is required"
        )
    get_checklist(db, payload.checklist_id, company_id=payload.company_id)
    if payload.candidate_id:
        cand = db.get(HrmCandidate, payload.candidate_id)
        if not cand or cand.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid candidate_id")
    if payload.employee_id:
        emp = db.get(HrmEmployee, payload.employee_id)
        if not emp or emp.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid employee_id")
    if payload.buddy_employee_id:
        buddy = db.get(HrmEmployee, payload.buddy_employee_id)
        if not buddy or buddy.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid buddy_employee_id")

    row = HrmCandidateOnboarding(
        company_id=payload.company_id,
        candidate_id=payload.candidate_id,
        employee_id=payload.employee_id,
        checklist_id=payload.checklist_id,
        start_date=payload.start_date or date.today(),
        buddy_employee_id=payload.buddy_employee_id,
        status="pending",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_candidate_onboarding(
    db: Session,
    onboarding_id: str,
    payload: CandidateOnboardingUpdate,
    *,
    company_id: str,
) -> HrmCandidateOnboarding:
    row = get_candidate_onboarding(db, onboarding_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "checklist_id" in data and data["checklist_id"]:
        get_checklist(db, data["checklist_id"], company_id=company_id)
    if "employee_id" in data and data["employee_id"]:
        emp = db.get(HrmEmployee, data["employee_id"])
        if not emp or emp.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid employee_id")
    if "buddy_employee_id" in data and data["buddy_employee_id"]:
        buddy = db.get(HrmEmployee, data["buddy_employee_id"])
        if not buddy or buddy.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid buddy_employee_id")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def start_candidate_onboarding(
    db: Session, onboarding_id: str, *, company_id: str
) -> HrmCandidateOnboarding:
    row = get_candidate_onboarding(db, onboarding_id, company_id=company_id)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending onboardings can start")
    row.status = "in_progress"
    if not row.start_date:
        row.start_date = date.today()
    db.commit()
    db.refresh(row)
    return row


def complete_candidate_onboarding(
    db: Session, onboarding_id: str, *, company_id: str
) -> HrmCandidateOnboarding:
    row = get_candidate_onboarding(db, onboarding_id, company_id=company_id)
    if row.status not in ("pending", "in_progress"):
        raise HTTPException(status_code=409, detail="Onboarding already completed")
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def delete_candidate_onboarding(
    db: Session, onboarding_id: str, *, company_id: str
) -> None:
    row = get_candidate_onboarding(db, onboarding_id, company_id=company_id)
    if row.status == "completed":
        raise HTTPException(
            status_code=409, detail="Completed onboardings cannot be deleted"
        )
    db.delete(row)
    db.commit()
