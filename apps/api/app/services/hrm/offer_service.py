from __future__ import annotations

from datetime import date
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmDepartment
from app.models.hrm.recruitment import HrmCandidate, HrmJobPosting, HrmOffer
from app.schemas.hrm.offer import OfferCreate, OfferDecline, OfferUpdate


def list_offers(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    candidate_id: Optional[str] = None,
    job_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[list[HrmOffer], int]:
    query = db.query(HrmOffer).filter(HrmOffer.company_id == company_id)
    if candidate_id:
        query = query.filter(HrmOffer.candidate_id == candidate_id)
    if job_id:
        query = query.filter(HrmOffer.job_id == job_id)
    if status:
        query = query.filter(HrmOffer.status == status)
    total = query.count()
    rows = (
        query.order_by(HrmOffer.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_offer(
    db: Session, offer_id: str, company_id: Optional[str] = None
) -> HrmOffer:
    row = db.get(HrmOffer, offer_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Offer not found")
    return row


def create_offer(
    db: Session, payload: OfferCreate, *, created_by: Optional[str]
) -> HrmOffer:
    candidate = db.get(HrmCandidate, payload.candidate_id)
    if not candidate or candidate.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid candidate_id")
    job_id = payload.job_id or candidate.job_id
    if job_id:
        posting = db.get(HrmJobPosting, job_id)
        if not posting or posting.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid job_id")
    if payload.department_id:
        dept = db.get(HrmDepartment, payload.department_id)
        if not dept or dept.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Invalid department_id")

    existing = (
        db.query(HrmOffer)
        .filter(
            HrmOffer.company_id == payload.company_id,
            HrmOffer.candidate_id == payload.candidate_id,
            HrmOffer.job_id == job_id,
            HrmOffer.status.notin_(("declined", "expired")),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An active offer already exists for this candidate and job",
        )

    data = payload.model_dump()
    data["job_id"] = job_id
    data["offer_date"] = payload.offer_date or date.today()
    data["status"] = "draft"
    data["created_by"] = created_by
    if not data.get("department_id") and candidate.department_id:
        data["department_id"] = candidate.department_id
    if not data.get("position") and job_id:
        posting = db.get(HrmJobPosting, job_id)
        if posting:
            data["position"] = (posting.title or "")[:50] or None
    row = HrmOffer(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_offer(
    db: Session, offer_id: str, payload: OfferUpdate, *, company_id: str
) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status not in ("draft", "negotiating"):
        raise HTTPException(
            status_code=409, detail="Only draft/negotiating offers can be edited"
        )
    data = payload.model_dump(exclude_unset=True)
    if "department_id" in data and data["department_id"]:
        dept = db.get(HrmDepartment, data["department_id"])
        if not dept or dept.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid department_id")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def send_offer(
    db: Session, offer_id: str, *, company_id: str, approved_by: Optional[str]
) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status not in ("draft", "negotiating"):
        raise HTTPException(
            status_code=409, detail="Only draft/negotiating offers can be sent"
        )
    row.status = "sent"
    row.approved_by = approved_by
    if not row.offer_date:
        row.offer_date = date.today()
    # nudge candidate pipeline
    if row.candidate_id:
        cand = db.get(HrmCandidate, row.candidate_id)
        if cand and cand.status in ("interview", "screening", "new"):
            cand.status = "offer"
    db.commit()
    db.refresh(row)
    return row


def accept_offer(db: Session, offer_id: str, *, company_id: str) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status not in ("sent", "negotiating"):
        raise HTTPException(
            status_code=409, detail="Only sent/negotiating offers can be accepted"
        )
    row.status = "accepted"
    row.response_date = date.today()
    if row.candidate_id:
        cand = db.get(HrmCandidate, row.candidate_id)
        if cand:
            cand.status = "hired"
            cand.is_employee = True
            cand.final_salary = row.salary
    db.commit()
    db.refresh(row)
    return row


def decline_offer(
    db: Session, offer_id: str, payload: OfferDecline, *, company_id: str
) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status not in ("sent", "negotiating"):
        raise HTTPException(
            status_code=409, detail="Only sent/negotiating offers can be declined"
        )
    row.status = "declined"
    row.response_date = date.today()
    row.decline_reason = payload.decline_reason
    db.commit()
    db.refresh(row)
    return row


def negotiate_offer(db: Session, offer_id: str, *, company_id: str) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status != "sent":
        raise HTTPException(
            status_code=409, detail="Only sent offers can enter negotiation"
        )
    row.status = "negotiating"
    db.commit()
    db.refresh(row)
    return row


def expire_offer(db: Session, offer_id: str, *, company_id: str) -> HrmOffer:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status not in ("draft", "sent", "negotiating"):
        raise HTTPException(status_code=409, detail="Offer cannot be expired")
    row.status = "expired"
    db.commit()
    db.refresh(row)
    return row


def delete_offer(db: Session, offer_id: str, *, company_id: str) -> None:
    row = get_offer(db, offer_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft offers can be deleted")
    db.delete(row)
    db.commit()
