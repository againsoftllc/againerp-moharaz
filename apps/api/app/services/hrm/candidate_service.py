from __future__ import annotations

import json
from datetime import date
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmEmployee
from app.models.hrm.recruitment import (
    HrmCandidate,
    HrmCandidateSource,
    HrmInterview,
    HrmJobPosting,
)
from app.schemas.hrm.candidate import (
    CandidateCreate,
    CandidateRead,
    CandidateStatusUpdate,
    CandidateUpdate,
)

STATUS_FLOW = {
    "new": {"screening", "rejected"},
    "screening": {"interview", "rejected", "new"},
    "interview": {"offer", "rejected", "screening"},
    "offer": {"hired", "rejected", "interview"},
    "hired": set(),
    "rejected": {"new", "screening"},
}


def _dumps(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


def _loads(raw: Optional[str], default: Any = None) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def _to_read(row: HrmCandidate) -> CandidateRead:
    return CandidateRead(
        id=row.id,
        company_id=row.company_id,
        job_id=row.job_id,
        source_id=row.source_id,
        first_name=row.first_name,
        last_name=row.last_name,
        email=row.email,
        phone=row.phone,
        current_company=row.current_company,
        current_position=row.current_position,
        experience_years=row.experience_years,
        current_salary=row.current_salary,
        expected_salary=row.expected_salary,
        final_salary=row.final_salary,
        notice_period=row.notice_period,
        resume_path=row.resume_path,
        cover_letter_path=row.cover_letter_path,
        coverletter_message=row.coverletter_message,
        skills=row.skills,
        education=row.education,
        portfolio_url=row.portfolio_url,
        linkedin_url=row.linkedin_url,
        referral_employee_id=row.referral_employee_id,
        gender=row.gender,
        date_of_birth=row.date_of_birth,
        address=row.address,
        city=row.city,
        state=row.state,
        zip_code=row.zip_code,
        country=row.country,
        rating=row.rating,
        is_archive=row.is_archive,
        is_employee=row.is_employee,
        custom_question=_loads(row.custom_question, {}),
        terms_condition_check=row.terms_condition_check,
        branch_id=row.branch_id,
        department_id=row.department_id,
        status=row.status,
        application_date=row.application_date,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _require_fks(
    db: Session,
    *,
    company_id: str,
    job_id: Optional[str],
    source_id: Optional[str],
    referral_employee_id: Optional[str],
) -> Optional[HrmJobPosting]:
    posting = None
    if job_id:
        posting = db.get(HrmJobPosting, job_id)
        if not posting or posting.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid job_id")
    if source_id:
        row = db.get(HrmCandidateSource, source_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid source_id")
    if referral_employee_id:
        row = db.get(HrmEmployee, referral_employee_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid referral_employee_id")
    return posting


def _assert_unique_application(
    db: Session,
    *,
    company_id: str,
    email: str,
    job_id: Optional[str],
    exclude_id: Optional[str] = None,
) -> None:
    if not job_id:
        return
    query = db.query(HrmCandidate).filter(
        HrmCandidate.company_id == company_id,
        func.lower(HrmCandidate.email) == email.lower(),
        HrmCandidate.job_id == job_id,
    )
    if exclude_id:
        query = query.filter(HrmCandidate.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=409,
            detail="Candidate with this email already applied to this job",
        )


def list_candidates(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    job_id: Optional[str] = None,
    source_id: Optional[str] = None,
    status: Optional[str] = None,
    is_archive: Optional[bool] = None,
    q: Optional[str] = None,
) -> Tuple[list[CandidateRead], int]:
    query = db.query(HrmCandidate).filter(HrmCandidate.company_id == company_id)
    if job_id:
        query = query.filter(HrmCandidate.job_id == job_id)
    if source_id:
        query = query.filter(HrmCandidate.source_id == source_id)
    if status:
        query = query.filter(HrmCandidate.status == status)
    if is_archive is not None:
        if is_archive:
            query = query.filter(HrmCandidate.is_archive.is_(True))
        else:
            query = query.filter(
                (HrmCandidate.is_archive.is_(False)) | (HrmCandidate.is_archive.is_(None))
            )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmCandidate.first_name.ilike(like))
            | (HrmCandidate.last_name.ilike(like))
            | (HrmCandidate.email.ilike(like))
            | (HrmCandidate.phone.ilike(like))
        )
    total = query.count()
    rows = (
        query.order_by(HrmCandidate.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return [_to_read(r) for r in rows], total


def get_candidate(
    db: Session, candidate_id: str, company_id: Optional[str] = None
) -> CandidateRead:
    row = db.get(HrmCandidate, candidate_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _to_read(row)


def create_candidate(
    db: Session, payload: CandidateCreate, *, created_by: Optional[str]
) -> CandidateRead:
    posting = _require_fks(
        db,
        company_id=payload.company_id,
        job_id=payload.job_id,
        source_id=payload.source_id,
        referral_employee_id=payload.referral_employee_id,
    )
    email = str(payload.email).strip().lower()
    _assert_unique_application(
        db, company_id=payload.company_id, email=email, job_id=payload.job_id
    )
    data = payload.model_dump()
    data["email"] = email
    data["first_name"] = payload.first_name.strip()
    if payload.last_name:
        data["last_name"] = payload.last_name.strip()
    data["custom_question"] = _dumps(payload.custom_question)
    data["status"] = "new"
    data["is_archive"] = False
    data["is_employee"] = False
    data["application_date"] = payload.application_date or date.today()
    data["created_by"] = created_by
    if posting:
        data["branch_id"] = posting.branch_id
        data["department_id"] = posting.department_id
    row = HrmCandidate(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def update_candidate(
    db: Session, candidate_id: str, payload: CandidateUpdate, *, company_id: str
) -> CandidateRead:
    row = db.get(HrmCandidate, candidate_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if row.status == "hired":
        raise HTTPException(status_code=409, detail="Hired candidates cannot be edited")

    data = payload.model_dump(exclude_unset=True)
    posting = _require_fks(
        db,
        company_id=company_id,
        job_id=data.get("job_id", row.job_id),
        source_id=data.get("source_id", row.source_id),
        referral_employee_id=data.get(
            "referral_employee_id", row.referral_employee_id
        ),
    )
    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"]).strip().lower()
    if "first_name" in data and data["first_name"] is not None:
        data["first_name"] = data["first_name"].strip()
    if "last_name" in data and data["last_name"] is not None:
        data["last_name"] = data["last_name"].strip()
    if "custom_question" in data:
        data["custom_question"] = _dumps(data["custom_question"])

    email = data.get("email", row.email)
    job_id = data.get("job_id", row.job_id)
    if email and job_id:
        _assert_unique_application(
            db,
            company_id=company_id,
            email=email,
            job_id=job_id,
            exclude_id=candidate_id,
        )

    if "status" in data and data["status"] != row.status:
        allowed = STATUS_FLOW.get(row.status, set())
        if data["status"] not in allowed:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot transition from {row.status} to {data['status']}",
            )
        if data["status"] == "hired":
            row.is_employee = True

    if posting and ("job_id" in data):
        data["branch_id"] = posting.branch_id
        data["department_id"] = posting.department_id

    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def set_candidate_status(
    db: Session,
    candidate_id: str,
    payload: CandidateStatusUpdate,
    *,
    company_id: str,
) -> CandidateRead:
    row = db.get(HrmCandidate, candidate_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if row.status == payload.status:
        return _to_read(row)
    allowed = STATUS_FLOW.get(row.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition from {row.status} to {payload.status}",
        )
    row.status = payload.status
    if payload.status == "hired":
        row.is_employee = True
        if payload.final_salary is not None:
            row.final_salary = payload.final_salary
    elif payload.final_salary is not None:
        row.final_salary = payload.final_salary
    db.commit()
    db.refresh(row)
    return _to_read(row)


def archive_candidate(
    db: Session, candidate_id: str, *, company_id: str, archived: bool = True
) -> CandidateRead:
    row = db.get(HrmCandidate, candidate_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    row.is_archive = archived
    db.commit()
    db.refresh(row)
    return _to_read(row)


def delete_candidate(db: Session, candidate_id: str, *, company_id: str) -> None:
    row = db.get(HrmCandidate, candidate_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if row.status == "hired":
        raise HTTPException(status_code=409, detail="Hired candidates cannot be deleted")
    interviews = (
        db.query(func.count(HrmInterview.id))
        .filter(HrmInterview.candidate_id == candidate_id)
        .scalar()
        or 0
    )
    if interviews:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete candidate with {interviews} interview(s); archive instead",
        )
    db.delete(row)
    db.commit()
