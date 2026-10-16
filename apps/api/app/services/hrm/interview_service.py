from __future__ import annotations

import json
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import (
    HrmCandidate,
    HrmInterview,
    HrmInterviewFeedback,
    HrmInterviewRound,
    HrmInterviewType,
    HrmJobPosting,
)
from app.schemas.hrm.interview import (
    InterviewCreate,
    InterviewFeedbackCreate,
    InterviewFeedbackRead,
    InterviewFeedbackUpdate,
    InterviewRead,
    InterviewUpdate,
)


def _dumps(value: Any) -> str:
    return json.dumps(value if value is not None else [])


def _loads_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
        return []
    except json.JSONDecodeError:
        return []


def _to_read(row: HrmInterview) -> InterviewRead:
    return InterviewRead(
        id=row.id,
        company_id=row.company_id,
        candidate_id=row.candidate_id,
        job_id=row.job_id,
        round_id=row.round_id,
        interview_type_id=row.interview_type_id,
        scheduled_date=row.scheduled_date,
        scheduled_time=row.scheduled_time,
        duration=row.duration,
        location=row.location,
        meeting_link=row.meeting_link,
        interviewers=_loads_list(row.interviewers),
        status=row.status,
        feedback_submitted=row.feedback_submitted,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _require_interview_fks(
    db: Session,
    *,
    company_id: str,
    candidate_id: Optional[str],
    job_id: Optional[str],
    round_id: Optional[str],
    interview_type_id: Optional[str],
) -> tuple[Optional[HrmCandidate], Optional[str]]:
    candidate = None
    if candidate_id:
        candidate = db.get(HrmCandidate, candidate_id)
        if not candidate or candidate.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid candidate_id")
    if job_id:
        posting = db.get(HrmJobPosting, job_id)
        if not posting or posting.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid job_id")
    if round_id:
        rnd = db.get(HrmInterviewRound, round_id)
        if not rnd or rnd.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid round_id")
        if job_id and rnd.job_id and rnd.job_id != job_id:
            raise HTTPException(
                status_code=400, detail="round_id does not belong to job_id"
            )
    if interview_type_id:
        itype = db.get(HrmInterviewType, interview_type_id)
        if not itype or itype.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid interview_type_id")
    resolved_job = job_id
    if not resolved_job and candidate and candidate.job_id:
        resolved_job = candidate.job_id
    return candidate, resolved_job


def list_interviews(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    candidate_id: Optional[str] = None,
    job_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[list[InterviewRead], int]:
    query = db.query(HrmInterview).filter(HrmInterview.company_id == company_id)
    if candidate_id:
        query = query.filter(HrmInterview.candidate_id == candidate_id)
    if job_id:
        query = query.filter(HrmInterview.job_id == job_id)
    if status:
        query = query.filter(HrmInterview.status == status)
    total = query.count()
    rows = (
        query.order_by(HrmInterview.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return [_to_read(r) for r in rows], total


def get_interview(
    db: Session, interview_id: str, company_id: Optional[str] = None
) -> InterviewRead:
    row = db.get(HrmInterview, interview_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    return _to_read(row)


def create_interview(
    db: Session, payload: InterviewCreate, *, created_by: Optional[str]
) -> InterviewRead:
    _, job_id = _require_interview_fks(
        db,
        company_id=payload.company_id,
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        round_id=payload.round_id,
        interview_type_id=payload.interview_type_id,
    )
    row = HrmInterview(
        company_id=payload.company_id,
        candidate_id=payload.candidate_id,
        job_id=job_id,
        round_id=payload.round_id,
        interview_type_id=payload.interview_type_id,
        scheduled_date=payload.scheduled_date,
        scheduled_time=payload.scheduled_time,
        duration=payload.duration,
        location=payload.location,
        meeting_link=payload.meeting_link,
        interviewers=_dumps(payload.interviewers),
        status="scheduled",
        feedback_submitted=False,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def update_interview(
    db: Session, interview_id: str, payload: InterviewUpdate, *, company_id: str
) -> InterviewRead:
    row = db.get(HrmInterview, interview_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    if row.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=409, detail="Completed/cancelled interviews cannot be edited"
        )
    data = payload.model_dump(exclude_unset=True)
    _require_interview_fks(
        db,
        company_id=company_id,
        candidate_id=row.candidate_id,
        job_id=row.job_id,
        round_id=data.get("round_id", row.round_id),
        interview_type_id=data.get("interview_type_id", row.interview_type_id),
    )
    if "interviewers" in data:
        data["interviewers"] = _dumps(data["interviewers"])
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def complete_interview(
    db: Session, interview_id: str, *, company_id: str
) -> InterviewRead:
    row = db.get(HrmInterview, interview_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    if row.status != "scheduled":
        raise HTTPException(
            status_code=409, detail="Only scheduled interviews can be completed"
        )
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return _to_read(row)


def cancel_interview(
    db: Session, interview_id: str, *, company_id: str
) -> InterviewRead:
    row = db.get(HrmInterview, interview_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    if row.status not in ("scheduled",):
        raise HTTPException(
            status_code=409, detail="Only scheduled interviews can be cancelled"
        )
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return _to_read(row)


def mark_no_show(db: Session, interview_id: str, *, company_id: str) -> InterviewRead:
    row = db.get(HrmInterview, interview_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    if row.status != "scheduled":
        raise HTTPException(
            status_code=409, detail="Only scheduled interviews can be marked no-show"
        )
    row.status = "no_show"
    db.commit()
    db.refresh(row)
    return _to_read(row)


def delete_interview(db: Session, interview_id: str, *, company_id: str) -> None:
    row = db.get(HrmInterview, interview_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    if row.status not in ("scheduled", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail="Only scheduled/cancelled interviews can be deleted",
        )
    db.delete(row)
    db.commit()


# --- feedback ---


def list_interview_feedback(
    db: Session,
    *,
    company_id: str,
    interview_id: Optional[str] = None,
) -> list[InterviewFeedbackRead]:
    query = db.query(HrmInterviewFeedback).filter(
        HrmInterviewFeedback.company_id == company_id
    )
    if interview_id:
        query = query.filter(HrmInterviewFeedback.interview_id == interview_id)
    rows = query.order_by(HrmInterviewFeedback.created_at.desc()).all()
    return [InterviewFeedbackRead.model_validate(r) for r in rows]


def get_interview_feedback(
    db: Session, feedback_id: str, company_id: Optional[str] = None
) -> InterviewFeedbackRead:
    row = db.get(HrmInterviewFeedback, feedback_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Interview feedback not found")
    return InterviewFeedbackRead.model_validate(row)


def create_interview_feedback(
    db: Session, payload: InterviewFeedbackCreate, *, created_by: Optional[str]
) -> InterviewFeedbackRead:
    interview = db.get(HrmInterview, payload.interview_id)
    if not interview or interview.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid interview_id")
    interviewer_id = payload.interviewer_id or created_by
    if interviewer_id:
        dup = (
            db.query(HrmInterviewFeedback)
            .filter(
                HrmInterviewFeedback.interview_id == payload.interview_id,
                HrmInterviewFeedback.interviewer_id == interviewer_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail="Feedback already submitted by this interviewer",
            )
    data = payload.model_dump()
    data["interviewer_id"] = interviewer_id
    data["created_by"] = created_by
    row = HrmInterviewFeedback(**data)
    db.add(row)
    interview.feedback_submitted = True
    if interview.status == "scheduled":
        interview.status = "completed"
    db.commit()
    db.refresh(row)
    return InterviewFeedbackRead.model_validate(row)


def update_interview_feedback(
    db: Session,
    feedback_id: str,
    payload: InterviewFeedbackUpdate,
    *,
    company_id: str,
) -> InterviewFeedbackRead:
    row = db.get(HrmInterviewFeedback, feedback_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview feedback not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return InterviewFeedbackRead.model_validate(row)


def delete_interview_feedback(
    db: Session, feedback_id: str, *, company_id: str
) -> None:
    row = db.get(HrmInterviewFeedback, feedback_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview feedback not found")
    interview_id = row.interview_id
    db.delete(row)
    db.flush()
    if interview_id:
        remaining = (
            db.query(HrmInterviewFeedback)
            .filter(HrmInterviewFeedback.interview_id == interview_id)
            .count()
        )
        interview = db.get(HrmInterview, interview_id)
        if interview and remaining == 0:
            interview.feedback_submitted = False
    db.commit()
