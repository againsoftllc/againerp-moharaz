from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.finance_period import FinancePeriod
from app.services.finance.period_service import (
    fiscal_year_of,
    generate_year,
    set_status,
)

router = APIRouter(prefix="/finance/periods", tags=["finance"])


class PeriodRead(BaseModel):
    id: str
    fiscal_year: int
    period_no: int
    name: str
    start_date: date
    end_date: date
    status: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None


class PeriodListResponse(BaseModel):
    data: List[PeriodRead]
    meta: dict


class PeriodResponse(BaseModel):
    data: PeriodRead


class GenerateRequest(BaseModel):
    fiscal_year: int = Field(ge=1900, le=2999)


class StatusRequest(BaseModel):
    status: str = Field(pattern="^(open|closed)$")


def _read(row: FinancePeriod) -> PeriodRead:
    return PeriodRead(
        id=row.id,
        fiscal_year=row.fiscal_year,
        period_no=row.period_no,
        name=row.name,
        start_date=row.start_date,
        end_date=row.end_date,
        status=row.status,
        closed_at=row.closed_at.isoformat() if row.closed_at else None,
        closed_by=row.closed_by,
    )


@router.get("", response_model=PeriodListResponse)
def list_periods(
    fiscal_year: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PeriodListResponse:
    year = fiscal_year or fiscal_year_of(db, company_id, date.today())
    rows = (
        db.query(FinancePeriod)
        .filter(FinancePeriod.company_id == company_id, FinancePeriod.fiscal_year == year)
        .order_by(FinancePeriod.period_no)
        .all()
    )
    years = [
        y
        for (y,) in db.query(FinancePeriod.fiscal_year)
        .filter(FinancePeriod.company_id == company_id)
        .distinct()
        .order_by(FinancePeriod.fiscal_year)
        .all()
    ]
    return PeriodListResponse(
        data=[_read(r) for r in rows],
        meta={"fiscal_year": year, "count": len(rows), "fiscal_years": years},
    )


@router.post("/generate", response_model=PeriodListResponse, status_code=201)
def generate_periods(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PeriodListResponse:
    rows = generate_year(db, company_id, payload.fiscal_year)
    db.commit()
    return PeriodListResponse(
        data=[_read(r) for r in rows],
        meta={"fiscal_year": payload.fiscal_year, "count": len(rows)},
    )


@router.patch("/{period_id}", response_model=PeriodResponse)
def update_period_status(
    period_id: str,
    payload: StatusRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("finance", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PeriodResponse:
    row = set_status(db, company_id, period_id, payload.status, actor_id=user.id)
    db.commit()
    db.refresh(row)
    return PeriodResponse(data=_read(row))
