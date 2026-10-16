from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.recruitment import HrmCandidate, HrmCandidateSource
from app.schemas.hrm.candidate_source import CandidateSourceCreate, CandidateSourceUpdate


def list_candidate_sources(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> Sequence[HrmCandidateSource]:
    query = db.query(HrmCandidateSource).filter(
        HrmCandidateSource.company_id == company_id
    )
    if status:
        query = query.filter(HrmCandidateSource.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmCandidateSource.name.ilike(like))
            | (HrmCandidateSource.description.ilike(like))
        )
    return query.order_by(HrmCandidateSource.name.asc()).all()


def get_candidate_source(
    db: Session, source_id: str, company_id: Optional[str] = None
) -> HrmCandidateSource:
    row = db.get(HrmCandidateSource, source_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Candidate source not found")
    return row


def _assert_unique_name(
    db: Session, *, company_id: str, name: str, exclude_id: Optional[str] = None
) -> None:
    query = db.query(HrmCandidateSource).filter(
        HrmCandidateSource.company_id == company_id,
        func.lower(HrmCandidateSource.name) == name.lower(),
    )
    if exclude_id:
        query = query.filter(HrmCandidateSource.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=409, detail="Candidate source name already exists"
        )


def create_candidate_source(
    db: Session, payload: CandidateSourceCreate, *, created_by: Optional[str]
) -> HrmCandidateSource:
    name = payload.name.strip()
    _assert_unique_name(db, company_id=payload.company_id, name=name)
    row = HrmCandidateSource(
        company_id=payload.company_id,
        name=name,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_candidate_source(
    db: Session, source_id: str, payload: CandidateSourceUpdate, *, company_id: str
) -> HrmCandidateSource:
    row = get_candidate_source(db, source_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        _assert_unique_name(
            db, company_id=company_id, name=name, exclude_id=source_id
        )
        data["name"] = name
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_candidate_source(
    db: Session, source_id: str, *, company_id: str
) -> None:
    row = get_candidate_source(db, source_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmCandidate.id))
        .filter(HrmCandidate.source_id == source_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete source used by {usage} candidate(s)",
        )
    db.delete(row)
    db.commit()
