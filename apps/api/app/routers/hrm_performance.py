from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.performance import (
    EmployeeGoalCreate,
    EmployeeGoalListResponse,
    EmployeeGoalRead,
    EmployeeGoalResponse,
    EmployeeGoalUpdate,
    EmployeeReviewCreate,
    EmployeeReviewListResponse,
    EmployeeReviewResponse,
    EmployeeReviewUpdate,
    GoalTypeCreate,
    GoalTypeListResponse,
    GoalTypeRead,
    GoalTypeResponse,
    GoalTypeUpdate,
    IndicatorCategoryCreate,
    IndicatorCategoryListResponse,
    IndicatorCategoryRead,
    IndicatorCategoryResponse,
    IndicatorCategoryUpdate,
    IndicatorCreate,
    IndicatorListResponse,
    IndicatorRead,
    IndicatorResponse,
    IndicatorUpdate,
    ReviewCycleCreate,
    ReviewCycleListResponse,
    ReviewCycleRead,
    ReviewCycleResponse,
    ReviewCycleUpdate,
)
from app.services.hrm import performance_service as svc

categories_router = APIRouter(
    prefix="/performance-indicator-categories",
    tags=["hrm-performance-indicator-categories"],
)
indicators_router = APIRouter(
    prefix="/performance-indicators", tags=["hrm-performance-indicators"]
)
goal_types_router = APIRouter(prefix="/goal-types", tags=["hrm-goal-types"])
employee_goals_router = APIRouter(prefix="/employee-goals", tags=["hrm-employee-goals"])
review_cycles_router = APIRouter(prefix="/review-cycles", tags=["hrm-review-cycles"])
employee_reviews_router = APIRouter(
    prefix="/employee-reviews", tags=["hrm-employee-reviews"]
)


@categories_router.get("", response_model=IndicatorCategoryListResponse)
def list_categories(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_indicator_categories(db, company_id=company_id, status=status, q=q)
    data = [IndicatorCategoryRead.model_validate(r) for r in rows]
    return IndicatorCategoryListResponse(data=data, meta={"count": len(data)})


@categories_router.post("", response_model=IndicatorCategoryResponse, status_code=201)
def create_category(
    payload: IndicatorCategoryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_indicator_category(db, payload, created_by=user.id)
    return IndicatorCategoryResponse(data=IndicatorCategoryRead.model_validate(row))


@categories_router.patch("/{category_id}", response_model=IndicatorCategoryResponse)
def update_category(
    category_id: str,
    payload: IndicatorCategoryUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_indicator_category(
        db, category_id, payload, company_id=company_id
    )
    return IndicatorCategoryResponse(data=IndicatorCategoryRead.model_validate(row))


@categories_router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_indicator_category(db, category_id, company_id=company_id)
    return Response(status_code=204)


@indicators_router.get("", response_model=IndicatorListResponse)
def list_indicators(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    category_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_indicators(
        db, company_id=company_id, category_id=category_id, status=status, q=q
    )
    data = [IndicatorRead.model_validate(r) for r in rows]
    return IndicatorListResponse(data=data, meta={"count": len(data)})


@indicators_router.post("", response_model=IndicatorResponse, status_code=201)
def create_indicator(
    payload: IndicatorCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_indicator(db, payload, created_by=user.id)
    return IndicatorResponse(data=IndicatorRead.model_validate(row))


@indicators_router.patch("/{indicator_id}", response_model=IndicatorResponse)
def update_indicator(
    indicator_id: str,
    payload: IndicatorUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_indicator(db, indicator_id, payload, company_id=company_id)
    return IndicatorResponse(data=IndicatorRead.model_validate(row))


@indicators_router.delete("/{indicator_id}", status_code=204)
def delete_indicator(
    indicator_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_indicator(db, indicator_id, company_id=company_id)
    return Response(status_code=204)


@goal_types_router.get("", response_model=GoalTypeListResponse)
def list_goal_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    q: Optional[str] = Query(default=None),
):
    rows = svc.list_goal_types(db, company_id=company_id, status=status, q=q)
    data = [GoalTypeRead.model_validate(r) for r in rows]
    return GoalTypeListResponse(data=data, meta={"count": len(data)})


@goal_types_router.post("", response_model=GoalTypeResponse, status_code=201)
def create_goal_type(
    payload: GoalTypeCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_goal_type(db, payload, created_by=user.id)
    return GoalTypeResponse(data=GoalTypeRead.model_validate(row))


@goal_types_router.patch("/{type_id}", response_model=GoalTypeResponse)
def update_goal_type(
    type_id: str,
    payload: GoalTypeUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_goal_type(db, type_id, payload, company_id=company_id)
    return GoalTypeResponse(data=GoalTypeRead.model_validate(row))


@goal_types_router.delete("/{type_id}", status_code=204)
def delete_goal_type(
    type_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_goal_type(db, type_id, company_id=company_id)
    return Response(status_code=204)


@employee_goals_router.get("", response_model=EmployeeGoalListResponse)
def list_employee_goals(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(not_started|in_progress|completed)$"
    ),
):
    rows = svc.list_employee_goals(
        db, company_id=company_id, employee_id=employee_id, status=status
    )
    data = [EmployeeGoalRead.model_validate(r) for r in rows]
    return EmployeeGoalListResponse(data=data, meta={"count": len(data)})


@employee_goals_router.post("", response_model=EmployeeGoalResponse, status_code=201)
def create_employee_goal(
    payload: EmployeeGoalCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_employee_goal(db, payload, created_by=user.id)
    return EmployeeGoalResponse(data=EmployeeGoalRead.model_validate(row))


@employee_goals_router.patch("/{goal_id}", response_model=EmployeeGoalResponse)
def update_employee_goal(
    goal_id: str,
    payload: EmployeeGoalUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_employee_goal(db, goal_id, payload, company_id=company_id)
    return EmployeeGoalResponse(data=EmployeeGoalRead.model_validate(row))


@employee_goals_router.delete("/{goal_id}", status_code=204)
def delete_employee_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_employee_goal(db, goal_id, company_id=company_id)
    return Response(status_code=204)


@review_cycles_router.get("", response_model=ReviewCycleListResponse)
def list_review_cycles(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
):
    rows = svc.list_review_cycles(db, company_id=company_id, status=status)
    data = [ReviewCycleRead.model_validate(r) for r in rows]
    return ReviewCycleListResponse(data=data, meta={"count": len(data)})


@review_cycles_router.post("", response_model=ReviewCycleResponse, status_code=201)
def create_review_cycle(
    payload: ReviewCycleCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    row = svc.create_review_cycle(db, payload, created_by=user.id)
    return ReviewCycleResponse(data=ReviewCycleRead.model_validate(row))


@review_cycles_router.patch("/{cycle_id}", response_model=ReviewCycleResponse)
def update_review_cycle(
    cycle_id: str,
    payload: ReviewCycleUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    row = svc.update_review_cycle(db, cycle_id, payload, company_id=company_id)
    return ReviewCycleResponse(data=ReviewCycleRead.model_validate(row))


@review_cycles_router.delete("/{cycle_id}", status_code=204)
def delete_review_cycle(
    cycle_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_review_cycle(db, cycle_id, company_id=company_id)
    return Response(status_code=204)


@employee_reviews_router.get("", response_model=EmployeeReviewListResponse)
def list_employee_reviews(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
    employee_id: Optional[str] = Query(default=None),
    review_cycle_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(
        default=None, pattern="^(draft|in_progress|completed)$"
    ),
):
    data = svc.list_employee_reviews(
        db,
        company_id=company_id,
        employee_id=employee_id,
        review_cycle_id=review_cycle_id,
        status=status,
    )
    return EmployeeReviewListResponse(data=data, meta={"count": len(data)})


@employee_reviews_router.get("/{review_id}", response_model=EmployeeReviewResponse)
def get_employee_review(
    review_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "read")),
    company_id: str = Depends(get_current_company_id),
):
    data = svc.get_employee_review(db, review_id, company_id=company_id)
    return EmployeeReviewResponse(data=data)


@employee_reviews_router.post("", response_model=EmployeeReviewResponse, status_code=201)
def create_employee_review(
    payload: EmployeeReviewCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("hrm", "create")),
):
    data = svc.create_employee_review(db, payload, created_by=user.id)
    return EmployeeReviewResponse(data=data)


@employee_reviews_router.patch("/{review_id}", response_model=EmployeeReviewResponse)
def update_employee_review(
    review_id: str,
    payload: EmployeeReviewUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    data = svc.update_employee_review(
        db, review_id, payload, company_id=company_id
    )
    return EmployeeReviewResponse(data=data)


@employee_reviews_router.post(
    "/{review_id}/complete", response_model=EmployeeReviewResponse
)
def complete_employee_review(
    review_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "write")),
    company_id: str = Depends(get_current_company_id),
):
    data = svc.complete_employee_review(db, review_id, company_id=company_id)
    return EmployeeReviewResponse(data=data)


@employee_reviews_router.delete("/{review_id}", status_code=204)
def delete_employee_review(
    review_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("hrm", "delete")),
    company_id: str = Depends(get_current_company_id),
):
    svc.delete_employee_review(db, review_id, company_id=company_id)
    return Response(status_code=204)
