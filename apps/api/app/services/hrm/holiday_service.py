from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import HrmHoliday, HrmHolidayBranch
from app.models.hrm.org import HrmBranch
from app.schemas.hrm.holiday import HolidayCreate, HolidayRead, HolidayUpdate


def _validate_branches(db: Session, company_id: str, branch_ids: list[str]) -> None:
    for bid in branch_ids:
        row = db.get(HrmBranch, bid)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=400, detail=f"Invalid branch_id: {bid}")


def _branch_ids(db: Session, holiday_id: str) -> list[str]:
    rows = (
        db.query(HrmHolidayBranch.branch_id)
        .filter(HrmHolidayBranch.holiday_id == holiday_id)
        .all()
    )
    return [r[0] for r in rows]


def _to_read(db: Session, row: HrmHoliday) -> HolidayRead:
    data = HolidayRead.model_validate(row)
    data.branch_ids = _branch_ids(db, row.id)
    return data


def _sync_branches(
    db: Session, *, company_id: str, holiday_id: str, branch_ids: list[str]
) -> None:
    existing = (
        db.query(HrmHolidayBranch)
        .filter(HrmHolidayBranch.holiday_id == holiday_id)
        .all()
    )
    for link in existing:
        db.delete(link)
    db.flush()
    for bid in branch_ids:
        db.add(
            HrmHolidayBranch(
                company_id=company_id,
                holiday_id=holiday_id,
                branch_id=bid,
            )
        )


def list_holidays(
    db: Session,
    *,
    company_id: str,
    branch_id: Optional[str] = None,
    q: Optional[str] = None,
) -> list[HolidayRead]:
    query = db.query(HrmHoliday).filter(HrmHoliday.company_id == company_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (HrmHoliday.name.ilike(like)) | (HrmHoliday.description.ilike(like))
        )
    rows = query.order_by(HrmHoliday.start_date.desc().nullslast()).all()
    result: list[HolidayRead] = []
    for row in rows:
        read = _to_read(db, row)
        # empty branch_ids = company-wide; otherwise must include branch_id
        if branch_id and read.branch_ids and branch_id not in read.branch_ids:
            continue
        result.append(read)
    return result


def get_holiday(
    db: Session, holiday_id: str, company_id: Optional[str] = None
) -> HolidayRead:
    row = db.get(HrmHoliday, holiday_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Holiday not found")
    return _to_read(db, row)


def create_holiday(
    db: Session, payload: HolidayCreate, *, created_by: Optional[str]
) -> HolidayRead:
    end = payload.end_date or payload.start_date
    if end < payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")
    _validate_branches(db, payload.company_id, payload.branch_ids)

    row = HrmHoliday(
        company_id=payload.company_id,
        name=payload.name.strip(),
        start_date=payload.start_date,
        end_date=end,
        category=payload.category,
        description=payload.description,
        is_recurring=payload.is_recurring,
        is_paid=payload.is_paid,
        is_half_day=payload.is_half_day,
        created_by=created_by,
    )
    db.add(row)
    db.flush()
    _sync_branches(
        db,
        company_id=payload.company_id,
        holiday_id=row.id,
        branch_ids=payload.branch_ids,
    )
    db.commit()
    db.refresh(row)
    return _to_read(db, row)


def update_holiday(
    db: Session, holiday_id: str, payload: HolidayUpdate, *, company_id: str
) -> HolidayRead:
    row = db.get(HrmHoliday, holiday_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Holiday not found")

    data = payload.model_dump(exclude_unset=True)
    branch_ids = data.pop("branch_ids", None)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    start = data.get("start_date", row.start_date)
    end = data.get("end_date", row.end_date or start)
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")
    for key, value in data.items():
        setattr(row, key, value)
    if branch_ids is not None:
        _validate_branches(db, company_id, branch_ids)
        _sync_branches(
            db, company_id=company_id, holiday_id=row.id, branch_ids=branch_ids
        )
    db.commit()
    db.refresh(row)
    return _to_read(db, row)


def delete_holiday(db: Session, holiday_id: str, *, company_id: str) -> None:
    row = db.get(HrmHoliday, holiday_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Holiday not found")
    db.delete(row)
    db.commit()
