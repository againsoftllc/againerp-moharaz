from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.super_admin_auth import require_super_admin
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.super_admin import (
    SubscriptionPlanCreate,
    SubscriptionPlanListResponse,
    SubscriptionPlanRead,
    SubscriptionPlanResponse,
    SubscriptionPlanUpdate,
)

router = APIRouter(
    prefix="/super-admin/plans",
    tags=["super-admin-plans"],
    dependencies=[Depends(require_super_admin)],
)


def _read(row: SubscriptionPlan) -> SubscriptionPlanRead:
    return SubscriptionPlanRead(
        id=row.id,
        slug=row.slug,
        name=row.name,
        price_amount=float(row.price_amount),
        price_interval=row.price_interval,
        max_users=row.max_users,
        is_trial_default=row.is_trial_default,
        is_active=row.is_active,
    )


@router.get("", response_model=SubscriptionPlanListResponse)
def list_plans(db: Session = Depends(get_db)) -> SubscriptionPlanListResponse:
    rows = db.query(SubscriptionPlan).order_by(SubscriptionPlan.created_at.asc()).all()
    return SubscriptionPlanListResponse(data=[_read(r) for r in rows])


@router.post("", response_model=SubscriptionPlanResponse, status_code=201)
def create_plan(payload: SubscriptionPlanCreate, db: Session = Depends(get_db)) -> SubscriptionPlanResponse:
    if db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Plan slug already exists")
    row = SubscriptionPlan(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return SubscriptionPlanResponse(data=_read(row))


@router.patch("/{plan_id}", response_model=SubscriptionPlanResponse)
def update_plan(plan_id: str, payload: SubscriptionPlanUpdate, db: Session = Depends(get_db)) -> SubscriptionPlanResponse:
    row = db.get(SubscriptionPlan, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return SubscriptionPlanResponse(data=_read(row))
