from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmInterview, HrmInterviewRound, HrmJobPosting
from app.schemas.hrm.interview_round import InterviewRoundCreate, InterviewRoundUpdate


def list_interview_rounds(
    db: Session,
    *,
    company_id: str,
    job_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Sequence[HrmInterviewRound]:
    query = db.query(HrmInterviewRound).filter(
        HrmInterviewRound.company_id == company_id
    )
    if job_id:
        query = query.filter(HrmInterviewRound.job_id == job_id)
    if status:
        query = query.filter(HrmInterviewRound.status == status)
    return query.order_by(
        HrmInterviewRound.job_id.asc(), HrmInterviewRound.sequence_number.asc()
    ).all()


def get_interview_round(
    db: Session, round_id: str, company_id: Optional[str] = None
) -> HrmInterviewRound:
    row = db.get(HrmInterviewRound, round_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Interview round not found")
    return row


def create_interview_round(
    db: Session, payload: InterviewRoundCreate, *, created_by: Optional[str]
) -> HrmInterviewRound:
    posting = db.get(HrmJobPosting, payload.job_id)
    if not posting or posting.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid job_id")
    row = HrmInterviewRound(
        company_id=payload.company_id,
        job_id=payload.job_id,
        name=payload.name.strip(),
        sequence_number=payload.sequence_number,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_interview_round(
    db: Session, round_id: str, payload: InterviewRoundUpdate, *, company_id: str
) -> HrmInterviewRound:
    row = get_interview_round(db, round_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_interview_round(db: Session, round_id: str, *, company_id: str) -> None:
    row = get_interview_round(db, round_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmInterview.id))
        .filter(HrmInterview.round_id == round_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete round used by {usage} interview(s)",
        )
    db.delete(row)
    db.commit()
