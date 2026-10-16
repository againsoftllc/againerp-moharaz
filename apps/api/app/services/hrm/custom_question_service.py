from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmCustomQuestion
from app.schemas.hrm.custom_question import CustomQuestionCreate, CustomQuestionUpdate


def list_custom_questions(
    db: Session, *, company_id: str, q: Optional[str] = None
) -> Sequence[HrmCustomQuestion]:
    query = db.query(HrmCustomQuestion).filter(HrmCustomQuestion.company_id == company_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmCustomQuestion.question.ilike(like))
    return query.order_by(HrmCustomQuestion.created_at.desc()).all()


def get_custom_question(
    db: Session, question_id: str, company_id: Optional[str] = None
) -> HrmCustomQuestion:
    row = db.get(HrmCustomQuestion, question_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Custom question not found")
    return row


def create_custom_question(
    db: Session, payload: CustomQuestionCreate, *, created_by: Optional[str]
) -> HrmCustomQuestion:
    row = HrmCustomQuestion(
        company_id=payload.company_id,
        question=payload.question.strip(),
        required=payload.required,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_custom_question(
    db: Session, question_id: str, payload: CustomQuestionUpdate, *, company_id: str
) -> HrmCustomQuestion:
    row = get_custom_question(db, question_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "question" in data and data["question"] is not None:
        data["question"] = data["question"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_custom_question(
    db: Session, question_id: str, *, company_id: str
) -> None:
    row = get_custom_question(db, question_id, company_id=company_id)
    db.delete(row)
    db.commit()
