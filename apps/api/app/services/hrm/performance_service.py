from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.hrm.org import HrmEmployee
from app.models.hrm.performance import (
    HrmEmployeeGoal,
    HrmEmployeeReview,
    HrmEmployeeReviewRating,
    HrmGoalType,
    HrmPerformanceIndicator,
    HrmPerformanceIndicatorCategory,
    HrmReviewCycle,
)
from app.schemas.hrm.performance import (
    EmployeeGoalCreate,
    EmployeeGoalUpdate,
    EmployeeReviewCreate,
    EmployeeReviewRead,
    EmployeeReviewUpdate,
    GoalTypeCreate,
    GoalTypeUpdate,
    IndicatorCategoryCreate,
    IndicatorCategoryUpdate,
    IndicatorCreate,
    IndicatorUpdate,
    ReviewCycleCreate,
    ReviewCycleUpdate,
    ReviewRatingIn,
    ReviewRatingRead,
)

ZERO = Decimal("0")


def _goal_status_from_progress(progress: int) -> str:
    if progress <= 0:
        return "not_started"
    if progress >= 100:
        return "completed"
    return "in_progress"


# --- categories ---


def list_indicator_categories(db: Session, *, company_id: str, status: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmPerformanceIndicatorCategory).filter(
        HrmPerformanceIndicatorCategory.company_id == company_id
    )
    if status:
        query = query.filter(HrmPerformanceIndicatorCategory.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmPerformanceIndicatorCategory.name.ilike(like))
    return query.order_by(HrmPerformanceIndicatorCategory.name.asc()).all()


def get_indicator_category(db: Session, category_id: str, company_id: Optional[str] = None):
    row = db.get(HrmPerformanceIndicatorCategory, category_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Indicator category not found")
    return row


def create_indicator_category(db: Session, payload: IndicatorCategoryCreate, *, created_by: Optional[str]):
    name = payload.name.strip()
    dup = (
        db.query(HrmPerformanceIndicatorCategory)
        .filter(
            HrmPerformanceIndicatorCategory.company_id == payload.company_id,
            func.lower(HrmPerformanceIndicatorCategory.name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Indicator category name already exists")
    row = HrmPerformanceIndicatorCategory(
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


def update_indicator_category(db: Session, category_id: str, payload: IndicatorCategoryUpdate, *, company_id: str):
    row = get_indicator_category(db, category_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmPerformanceIndicatorCategory)
            .filter(
                HrmPerformanceIndicatorCategory.company_id == company_id,
                func.lower(HrmPerformanceIndicatorCategory.name) == name.lower(),
                HrmPerformanceIndicatorCategory.id != category_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Indicator category name already exists")
        data["name"] = name
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_indicator_category(db: Session, category_id: str, *, company_id: str):
    row = get_indicator_category(db, category_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmPerformanceIndicator.id))
        .filter(HrmPerformanceIndicator.category_id == category_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(status_code=409, detail=f"Cannot delete category with {usage} indicator(s)")
    db.delete(row)
    db.commit()


# --- indicators ---


def list_indicators(db: Session, *, company_id: str, category_id: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmPerformanceIndicator).filter(HrmPerformanceIndicator.company_id == company_id)
    if category_id:
        query = query.filter(HrmPerformanceIndicator.category_id == category_id)
    if status:
        query = query.filter(HrmPerformanceIndicator.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmPerformanceIndicator.name.ilike(like))
    return query.order_by(HrmPerformanceIndicator.name.asc()).all()


def get_indicator(db: Session, indicator_id: str, company_id: Optional[str] = None):
    row = db.get(HrmPerformanceIndicator, indicator_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Performance indicator not found")
    return row


def create_indicator(db: Session, payload: IndicatorCreate, *, created_by: Optional[str]):
    if payload.category_id:
        get_indicator_category(db, payload.category_id, company_id=payload.company_id)
    row = HrmPerformanceIndicator(
        company_id=payload.company_id,
        category_id=payload.category_id,
        name=payload.name.strip(),
        description=payload.description,
        measurement_unit=payload.measurement_unit,
        target_value=payload.target_value,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_indicator(db: Session, indicator_id: str, payload: IndicatorUpdate, *, company_id: str):
    row = get_indicator(db, indicator_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"]:
        get_indicator_category(db, data["category_id"], company_id=company_id)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_indicator(db: Session, indicator_id: str, *, company_id: str):
    row = get_indicator(db, indicator_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmEmployeeReviewRating.id))
        .filter(HrmEmployeeReviewRating.performance_indicator_id == indicator_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(status_code=409, detail=f"Cannot delete indicator used in {usage} rating(s)")
    db.delete(row)
    db.commit()


# --- goal types ---


def list_goal_types(db: Session, *, company_id: str, status: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmGoalType).filter(HrmGoalType.company_id == company_id)
    if status:
        query = query.filter(HrmGoalType.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(HrmGoalType.name.ilike(like))
    return query.order_by(HrmGoalType.name.asc()).all()


def get_goal_type(db: Session, type_id: str, company_id: Optional[str] = None):
    row = db.get(HrmGoalType, type_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Goal type not found")
    return row


def create_goal_type(db: Session, payload: GoalTypeCreate, *, created_by: Optional[str]):
    name = payload.name.strip()
    dup = (
        db.query(HrmGoalType)
        .filter(HrmGoalType.company_id == payload.company_id, func.lower(HrmGoalType.name) == name.lower())
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Goal type name already exists")
    row = HrmGoalType(
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


def update_goal_type(db: Session, type_id: str, payload: GoalTypeUpdate, *, company_id: str):
    row = get_goal_type(db, type_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        dup = (
            db.query(HrmGoalType)
            .filter(
                HrmGoalType.company_id == company_id,
                func.lower(HrmGoalType.name) == name.lower(),
                HrmGoalType.id != type_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Goal type name already exists")
        data["name"] = name
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_goal_type(db: Session, type_id: str, *, company_id: str):
    row = get_goal_type(db, type_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmEmployeeGoal.id)).filter(HrmEmployeeGoal.goal_type_id == type_id).scalar()
        or 0
    )
    if usage:
        raise HTTPException(status_code=409, detail=f"Cannot delete goal type used by {usage} goal(s)")
    db.delete(row)
    db.commit()


# --- employee goals ---


def list_employee_goals(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmEmployeeGoal).filter(HrmEmployeeGoal.company_id == company_id)
    if employee_id:
        query = query.filter(HrmEmployeeGoal.employee_id == employee_id)
    if status:
        query = query.filter(HrmEmployeeGoal.status == status)
    return query.order_by(HrmEmployeeGoal.created_at.desc()).all()


def get_employee_goal(db: Session, goal_id: str, company_id: Optional[str] = None):
    row = db.get(HrmEmployeeGoal, goal_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee goal not found")
    return row


def create_employee_goal(db: Session, payload: EmployeeGoalCreate, *, created_by: Optional[str]):
    emp = db.get(HrmEmployee, payload.employee_id)
    if not emp or emp.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    if payload.goal_type_id:
        get_goal_type(db, payload.goal_type_id, company_id=payload.company_id)
    row = HrmEmployeeGoal(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        goal_type_id=payload.goal_type_id,
        title=payload.title.strip(),
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        target=payload.target,
        progress=payload.progress,
        status=_goal_status_from_progress(payload.progress),
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_employee_goal(db: Session, goal_id: str, payload: EmployeeGoalUpdate, *, company_id: str):
    row = get_employee_goal(db, goal_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "goal_type_id" in data and data["goal_type_id"]:
        get_goal_type(db, data["goal_type_id"], company_id=company_id)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "progress" in data and data["progress"] is not None and "status" not in data:
        data["status"] = _goal_status_from_progress(data["progress"])
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_employee_goal(db: Session, goal_id: str, *, company_id: str):
    row = get_employee_goal(db, goal_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- review cycles ---


def list_review_cycles(db: Session, *, company_id: str, status: Optional[str] = None):
    query = db.query(HrmReviewCycle).filter(HrmReviewCycle.company_id == company_id)
    if status:
        query = query.filter(HrmReviewCycle.status == status)
    return query.order_by(HrmReviewCycle.name.asc()).all()


def get_review_cycle(db: Session, cycle_id: str, company_id: Optional[str] = None):
    row = db.get(HrmReviewCycle, cycle_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Review cycle not found")
    return row


def create_review_cycle(db: Session, payload: ReviewCycleCreate, *, created_by: Optional[str]):
    row = HrmReviewCycle(
        company_id=payload.company_id,
        name=payload.name.strip(),
        frequency=payload.frequency,
        description=payload.description,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_review_cycle(db: Session, cycle_id: str, payload: ReviewCycleUpdate, *, company_id: str):
    row = get_review_cycle(db, cycle_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_review_cycle(db: Session, cycle_id: str, *, company_id: str):
    row = get_review_cycle(db, cycle_id, company_id=company_id)
    usage = (
        db.query(func.count(HrmEmployeeReview.id))
        .filter(HrmEmployeeReview.review_cycle_id == cycle_id)
        .scalar()
        or 0
    )
    if usage:
        raise HTTPException(status_code=409, detail=f"Cannot delete cycle with {usage} review(s)")
    db.delete(row)
    db.commit()


# --- employee reviews ---


def _rating_reads(db: Session, review_id: str) -> list[ReviewRatingRead]:
    rows = (
        db.query(HrmEmployeeReviewRating)
        .filter(HrmEmployeeReviewRating.employee_review_id == review_id)
        .all()
    )
    return [ReviewRatingRead.model_validate(r) for r in rows]


def _to_review_read(db: Session, row: HrmEmployeeReview) -> EmployeeReviewRead:
    return EmployeeReviewRead(
        id=row.id,
        company_id=row.company_id,
        employee_id=row.employee_id,
        reviewer_id=row.reviewer_id,
        review_cycle_id=row.review_cycle_id,
        review_date=row.review_date,
        completion_date=row.completion_date,
        overall_rating=row.overall_rating,
        comments=row.comments,
        status=row.status,
        ratings=_rating_reads(db, row.id),
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_ratings(
    db: Session,
    *,
    company_id: str,
    review_id: str,
    ratings: list[ReviewRatingIn],
) -> Decimal:
    existing = (
        db.query(HrmEmployeeReviewRating)
        .filter(HrmEmployeeReviewRating.employee_review_id == review_id)
        .all()
    )
    for r in existing:
        db.delete(r)
    db.flush()
    total = ZERO
    count = 0
    for item in ratings:
        ind = get_indicator(db, item.performance_indicator_id, company_id=company_id)
        if ind.status != "active":
            raise HTTPException(status_code=400, detail=f"Inactive indicator: {item.performance_indicator_id}")
        db.add(
            HrmEmployeeReviewRating(
                company_id=company_id,
                employee_review_id=review_id,
                performance_indicator_id=item.performance_indicator_id,
                rating=item.rating,
                comments=item.comments,
            )
        )
        total += item.rating
        count += 1
    if count == 0:
        return ZERO
    return (total / Decimal(count)).quantize(Decimal("0.1"))


def list_employee_reviews(
    db: Session,
    *,
    company_id: str,
    employee_id: Optional[str] = None,
    review_cycle_id: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmEmployeeReview).filter(HrmEmployeeReview.company_id == company_id)
    if employee_id:
        query = query.filter(HrmEmployeeReview.employee_id == employee_id)
    if review_cycle_id:
        query = query.filter(HrmEmployeeReview.review_cycle_id == review_cycle_id)
    if status:
        query = query.filter(HrmEmployeeReview.status == status)
    rows = query.order_by(HrmEmployeeReview.created_at.desc()).all()
    return [_to_review_read(db, r) for r in rows]


def get_employee_review(db: Session, review_id: str, company_id: Optional[str] = None) -> EmployeeReviewRead:
    row = db.get(HrmEmployeeReview, review_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Employee review not found")
    return _to_review_read(db, row)


def create_employee_review(
    db: Session, payload: EmployeeReviewCreate, *, created_by: Optional[str]
) -> EmployeeReviewRead:
    emp = db.get(HrmEmployee, payload.employee_id)
    if not emp or emp.company_id != payload.company_id:
        raise HTTPException(status_code=400, detail="Invalid employee_id")
    get_review_cycle(db, payload.review_cycle_id, company_id=payload.company_id)
    row = HrmEmployeeReview(
        company_id=payload.company_id,
        employee_id=payload.employee_id,
        reviewer_id=payload.reviewer_id or created_by,
        review_cycle_id=payload.review_cycle_id,
        review_date=payload.review_date or date.today(),
        comments=payload.comments,
        status="draft",
        created_by=created_by,
    )
    db.add(row)
    db.flush()
    if payload.ratings:
        row.overall_rating = _sync_ratings(
            db, company_id=payload.company_id, review_id=row.id, ratings=payload.ratings
        )
    db.commit()
    db.refresh(row)
    return _to_review_read(db, row)


def update_employee_review(
    db: Session, review_id: str, payload: EmployeeReviewUpdate, *, company_id: str
) -> EmployeeReviewRead:
    row = db.get(HrmEmployeeReview, review_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Employee review not found")
    if row.status == "completed":
        raise HTTPException(status_code=409, detail="Completed reviews cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    ratings = data.pop("ratings", None)
    for k, v in data.items():
        setattr(row, k, v)
    if ratings is not None:
        typed = [ReviewRatingIn.model_validate(r) for r in ratings]
        row.overall_rating = _sync_ratings(
            db, company_id=company_id, review_id=row.id, ratings=typed
        )
    db.commit()
    db.refresh(row)
    return _to_review_read(db, row)


def complete_employee_review(
    db: Session, review_id: str, *, company_id: str
) -> EmployeeReviewRead:
    row = db.get(HrmEmployeeReview, review_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Employee review not found")
    if row.status == "completed":
        raise HTTPException(status_code=409, detail="Review already completed")
    row.status = "completed"
    row.completion_date = date.today()
    db.commit()
    db.refresh(row)
    return _to_review_read(db, row)


def delete_employee_review(db: Session, review_id: str, *, company_id: str) -> None:
    row = db.get(HrmEmployeeReview, review_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Employee review not found")
    if row.status == "completed":
        raise HTTPException(status_code=409, detail="Completed reviews cannot be deleted")
    db.delete(row)
    db.commit()
