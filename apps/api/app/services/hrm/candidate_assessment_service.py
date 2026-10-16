from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmCandidate, HrmCandidateAssessment
from app.schemas.hrm.candidate_assessment import (
    CandidateAssessmentCreate,
    CandidateAssessmentUpdate,
)


def list_candidate_assessments(
    db: Session,
    *,
    company_id: str,
    candidate_id: Optional[str] = None,
    pass_fail_status: Optional[str] = None,
) -> Sequence[HrmCandidateAssessment]:
    query = db.query(HrmCandidateAssessment).filter(
        HrmCandidateAssessment.company_id == company_id
    )
    if candidate_id:
        query = query.filter(HrmCandidateAssessment.candidate_id == candidate_id)
    if pass_fail_status:
        query = query.filter(
            HrmCandidateAssessment.pass_fail_status == pass_fail_status
        )
    return query.order_by(HrmCandidateAssessment.created_at.desc()).all()


def get_candidate_assessment(
    db: Session, assessment_id: str, company_id: Optional[str] = None
) -> HrmCandidateAssessment:
    row = db.get(HrmCandidateAssessment, assessment_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Candidate assessment not found")
    return row


def create_candidate_assessment(
    db: Session,
    payload: CandidateAssessmentCreate,
    *,
    created_by: Optional[str],
) -> HrmCandidateAssessment:
    candidate = db.get(HrmCandidate, payload.candidate_id)
    if not candidate or candidate.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid candidate_id")
    data = payload.model_dump()
    data["assessment_name"] = payload.assessment_name.strip()
    data["assessment_date"] = payload.assessment_date or date.today()
    data["conducted_by"] = created_by
    data["created_by"] = created_by
    # auto pass/fail if scores provided and still pending
    if (
        data["pass_fail_status"] == "pending"
        and data.get("score") is not None
        and data.get("max_score")
    ):
        data["pass_fail_status"] = (
            "pass" if data["score"] >= (data["max_score"] / 2) else "fail"
        )
    row = HrmCandidateAssessment(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_candidate_assessment(
    db: Session,
    assessment_id: str,
    payload: CandidateAssessmentUpdate,
    *,
    company_id: str,
) -> HrmCandidateAssessment:
    row = get_candidate_assessment(db, assessment_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "assessment_name" in data and data["assessment_name"] is not None:
        data["assessment_name"] = data["assessment_name"].strip()
    score = data.get("score", row.score)
    max_score = data.get("max_score", row.max_score)
    if score is not None and max_score is not None and score > max_score:
        raise HTTPException(status_code=400, detail="score must be <= max_score")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_candidate_assessment(
    db: Session, assessment_id: str, *, company_id: str
) -> None:
    row = get_candidate_assessment(db, assessment_id, company_id=company_id)
    db.delete(row)
    db.commit()
