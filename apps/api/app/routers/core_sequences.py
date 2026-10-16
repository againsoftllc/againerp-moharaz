from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.core_sequence import CoreSequence
from app.services.core.sequence_service import (
    DEFAULT_SEQUENCES,
    format_number,
    get_or_create,
)

router = APIRouter(prefix="/workspace/sequences", tags=["workspace-sequences"])


class SequenceRead(BaseModel):
    id: str
    code: str
    name: str
    prefix: str
    suffix: str
    padding: int
    next_number: int
    step: int
    reset_policy: str
    period_key: str
    is_active: bool
    # What the next allocated number will look like with the current settings.
    preview: str


class SequenceListResponse(BaseModel):
    data: List[SequenceRead]
    meta: dict


class SequenceResponse(BaseModel):
    data: SequenceRead


class SequenceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    prefix: Optional[str] = Field(default=None, max_length=32)
    suffix: Optional[str] = Field(default=None, max_length=32)
    padding: Optional[int] = Field(default=None, ge=0, le=12)
    next_number: Optional[int] = Field(default=None, ge=1)
    step: Optional[int] = Field(default=None, ge=1, le=1000)
    reset_policy: Optional[str] = Field(default=None, pattern="^(never|yearly|monthly)$")
    is_active: Optional[bool] = None


def _read(row: CoreSequence) -> SequenceRead:
    return SequenceRead(
        id=row.id,
        code=row.code,
        name=row.name,
        prefix=row.prefix,
        suffix=row.suffix,
        padding=row.padding,
        next_number=row.next_number,
        step=row.step,
        reset_policy=row.reset_policy,
        period_key=row.period_key,
        is_active=row.is_active,
        preview=format_number(row, row.next_number, date.today()),
    )


@router.get("", response_model=SequenceListResponse)
def list_sequences(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "read")),
    company_id: str = Depends(get_current_company_id),
) -> SequenceListResponse:
    """Every document type the ERP can number.

    Types that have not issued a number yet have no row; they are returned from
    the shipping defaults so admins can see and pre-configure them.
    """
    rows = {
        row.code: row
        for row in db.query(CoreSequence).filter(CoreSequence.company_id == company_id).all()
    }
    data: List[SequenceRead] = []
    for code in sorted(set(DEFAULT_SEQUENCES) | set(rows)):
        row = rows.get(code)
        if row is None:
            spec = DEFAULT_SEQUENCES[code]
            row = CoreSequence(
                id="",
                company_id=company_id,
                code=code,
                name=spec.name,
                prefix=spec.prefix,
                suffix=spec.suffix,
                padding=spec.padding,
                next_number=1,
                step=1,
                reset_policy=spec.reset_policy,
                period_key="",
                is_active=True,
            )
        data.append(_read(row))
    return SequenceListResponse(data=data, meta={"count": len(data)})


@router.patch("/{code}", response_model=SequenceResponse)
def update_sequence(
    code: str,
    payload: SequenceUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("workspace", "write")),
    company_id: str = Depends(get_current_company_id),
) -> SequenceResponse:
    if code not in DEFAULT_SEQUENCES:
        exists = (
            db.query(CoreSequence)
            .filter(CoreSequence.company_id == company_id, CoreSequence.code == code)
            .first()
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Unknown document type")

    row = get_or_create(db, company_id, code, lock=False)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return SequenceResponse(data=_read(row))
