from __future__ import annotations

import json
import re
import secrets
from datetime import datetime
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmBranch, HrmDepartment
from app.models.hrm.recruitment import (
    HrmCandidate,
    HrmJobLocation,
    HrmJobPosting,
    HrmJobType,
)
from app.schemas.hrm.job_posting import (
    JobPostingCreate,
    JobPostingRead,
    JobPostingUpdate,
)

_JOB_RE = re.compile(r"^JOB-(\d+)$", re.IGNORECASE)
JSON_FIELDS = ("skills", "applicant", "visibility", "custom_question")


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


def _to_read(row: HrmJobPosting) -> JobPostingRead:
    return JobPostingRead(
        id=row.id,
        company_id=row.company_id,
        job_code=row.job_code,
        code=row.code,
        title=row.title,
        job_type_id=row.job_type_id,
        location_id=row.location_id,
        branch_id=row.branch_id,
        department_id=row.department_id,
        min_experience=row.min_experience,
        max_experience=row.max_experience,
        min_salary=row.min_salary,
        max_salary=row.max_salary,
        description=row.description,
        requirements=row.requirements,
        benefits=row.benefits,
        application_deadline=row.application_deadline,
        start_date=row.start_date,
        positions=row.positions,
        priority=row.priority,
        skills=_loads(row.skills, []),
        applicant=_loads(row.applicant, {}),
        visibility=_loads(row.visibility, {}),
        custom_question=_loads(row.custom_question, []),
        application_type=row.application_type,
        application_url=row.application_url,
        is_published=row.is_published,
        publish_date=row.publish_date,
        is_featured=row.is_featured,
        status=row.status,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _next_job_code(db: Session, company_id: str) -> str:
    rows = (
        db.query(HrmJobPosting.job_code)
        .filter(HrmJobPosting.company_id == company_id)
        .all()
    )
    max_n = 0
    for (code,) in rows:
        m = _JOB_RE.match((code or "").strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"JOB-{max_n + 1:05d}"


def _public_code(db: Session) -> str:
    for _ in range(10):
        code = secrets.token_hex(6)
        if not db.query(HrmJobPosting).filter(HrmJobPosting.code == code).first():
            return code
    return secrets.token_hex(8)


def _require_fks(
    db: Session,
    *,
    company_id: str,
    job_type_id: Optional[str],
    location_id: Optional[str],
    branch_id: Optional[str],
    department_id: Optional[str],
) -> None:
    if job_type_id:
        row = db.get(HrmJobType, job_type_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid job_type_id")
    if location_id:
        row = db.get(HrmJobLocation, location_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid location_id")
    if branch_id:
        row = db.get(HrmBranch, branch_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid branch_id")
    if department_id:
        row = db.get(HrmDepartment, department_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid department_id")


def list_job_postings(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    status: Optional[str] = None,
    is_published: Optional[bool] = None,
    q: Optional[str] = None,
) -> Tuple[list[JobPostingRead], int]:
    query = db.query(HrmJobPosting).filter(HrmJobPosting.company_id == company_id)
    if status:
        query = query.filter(HrmJobPosting.status == status)
    if is_published is not None:
        query = query.filter(HrmJobPosting.is_published.is_(is_published))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmJobPosting.title.ilike(like))
            | (HrmJobPosting.job_code.ilike(like))
            | (HrmJobPosting.code.ilike(like))
        )
    total = query.count()
    rows = (
        query.order_by(HrmJobPosting.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return [_to_read(r) for r in rows], total


def get_job_posting(
    db: Session, posting_id: str, company_id: Optional[str] = None
) -> JobPostingRead:
    row = db.get(HrmJobPosting, posting_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Job posting not found")
    return _to_read(row)


def create_job_posting(
    db: Session, payload: JobPostingCreate, *, created_by: Optional[str]
) -> JobPostingRead:
    _require_fks(
        db,
        company_id=payload.company_id,
        job_type_id=payload.job_type_id,
        location_id=payload.location_id,
        branch_id=payload.branch_id,
        department_id=payload.department_id,
    )
    data = payload.model_dump()
    data["title"] = payload.title.strip()
    data["job_code"] = _next_job_code(db, payload.company_id)
    data["code"] = _public_code(db)
    data["status"] = "draft"
    data["is_published"] = False
    data["created_by"] = created_by
    for key in JSON_FIELDS:
        data[key] = _dumps(data.get(key))
    row = HrmJobPosting(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def update_job_posting(
    db: Session, posting_id: str, payload: JobPostingUpdate, *, company_id: str
) -> JobPostingRead:
    row = db.get(HrmJobPosting, posting_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job posting not found")
    if row.status == "closed":
        raise HTTPException(status_code=409, detail="Closed postings cannot be edited")

    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    _require_fks(
        db,
        company_id=company_id,
        job_type_id=data.get("job_type_id", row.job_type_id),
        location_id=data.get("location_id", row.location_id),
        branch_id=data.get("branch_id", row.branch_id),
        department_id=data.get("department_id", row.department_id),
    )
    app_type = data.get("application_type", row.application_type)
    app_url = data.get("application_url", row.application_url)
    if app_type == "custom" and not app_url:
        raise HTTPException(
            status_code=400,
            detail="application_url is required when application_type=custom",
        )
    for key in JSON_FIELDS:
        if key in data:
            data[key] = _dumps(data[key])
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def publish_job_posting(
    db: Session, posting_id: str, *, company_id: str
) -> JobPostingRead:
    row = db.get(HrmJobPosting, posting_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job posting not found")
    if row.status == "closed":
        raise HTTPException(status_code=409, detail="Closed postings cannot be published")
    row.status = "published"
    row.is_published = True
    row.publish_date = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_read(row)


def close_job_posting(
    db: Session, posting_id: str, *, company_id: str
) -> JobPostingRead:
    row = db.get(HrmJobPosting, posting_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job posting not found")
    row.status = "closed"
    row.is_published = False
    db.commit()
    db.refresh(row)
    return _to_read(row)


def delete_job_posting(db: Session, posting_id: str, *, company_id: str) -> None:
    row = db.get(HrmJobPosting, posting_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job posting not found")
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft postings can be deleted")
    usage = (
        db.query(HrmCandidate)
        .filter(HrmCandidate.job_id == posting_id)
        .count()
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete posting with {usage} candidate(s)",
        )
    db.delete(row)
    db.commit()
