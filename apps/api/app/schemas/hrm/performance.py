from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# --- indicator categories ---


class IndicatorCategoryCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class IndicatorCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class IndicatorCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IndicatorCategoryListResponse(BaseModel):
    data: List[IndicatorCategoryRead]
    meta: dict
    errors: List[str] = []


class IndicatorCategoryResponse(BaseModel):
    data: IndicatorCategoryRead
    errors: List[str] = []


# --- indicators ---


class IndicatorCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    category_id: Optional[str] = Field(default=None, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    measurement_unit: Optional[str] = Field(default=None, max_length=50)
    target_value: Optional[str] = Field(default=None, max_length=50)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class IndicatorUpdate(BaseModel):
    category_id: Optional[str] = Field(default=None, max_length=36)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    measurement_unit: Optional[str] = Field(default=None, max_length=50)
    target_value: Optional[str] = Field(default=None, max_length=50)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class IndicatorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    category_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    measurement_unit: Optional[str] = None
    target_value: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IndicatorListResponse(BaseModel):
    data: List[IndicatorRead]
    meta: dict
    errors: List[str] = []


class IndicatorResponse(BaseModel):
    data: IndicatorRead
    errors: List[str] = []


# --- goal types ---


class GoalTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class GoalTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class GoalTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class GoalTypeListResponse(BaseModel):
    data: List[GoalTypeRead]
    meta: dict
    errors: List[str] = []


class GoalTypeResponse(BaseModel):
    data: GoalTypeRead
    errors: List[str] = []


# --- employee goals ---


class EmployeeGoalCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    goal_type_id: Optional[str] = Field(default=None, max_length=36)
    title: str = Field(min_length=1)
    description: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    target: Optional[str] = Field(default=None, max_length=50)
    progress: int = Field(default=0, ge=0, le=100)

    @model_validator(mode="after")
    def validate_dates(self) -> EmployeeGoalCreate:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class EmployeeGoalUpdate(BaseModel):
    goal_type_id: Optional[str] = Field(default=None, max_length=36)
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    target: Optional[str] = Field(default=None, max_length=50)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    status: Optional[str] = Field(
        default=None, pattern="^(not_started|in_progress|completed)$"
    )


class EmployeeGoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    goal_type_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    target: Optional[str] = None
    progress: int
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeGoalListResponse(BaseModel):
    data: List[EmployeeGoalRead]
    meta: dict
    errors: List[str] = []


class EmployeeGoalResponse(BaseModel):
    data: EmployeeGoalRead
    errors: List[str] = []


# --- review cycles ---


class ReviewCycleCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    frequency: str = Field(
        default="annual",
        pattern="^(monthly|quarterly|semi_annual|annual)$",
    )
    description: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class ReviewCycleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    frequency: Optional[str] = Field(
        default=None, pattern="^(monthly|quarterly|semi_annual|annual)$"
    )
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ReviewCycleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    frequency: Optional[str] = None
    description: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReviewCycleListResponse(BaseModel):
    data: List[ReviewCycleRead]
    meta: dict
    errors: List[str] = []


class ReviewCycleResponse(BaseModel):
    data: ReviewCycleRead
    errors: List[str] = []


# --- employee reviews + ratings ---


class ReviewRatingIn(BaseModel):
    performance_indicator_id: str = Field(min_length=1, max_length=36)
    rating: Decimal = Field(ge=Decimal("0"), le=Decimal("5"))
    comments: Optional[str] = None


class ReviewRatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    performance_indicator_id: Optional[str] = None
    rating: Decimal
    comments: Optional[str] = None


class EmployeeReviewCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    review_cycle_id: str = Field(min_length=1, max_length=36)
    reviewer_id: Optional[str] = Field(default=None, max_length=36)
    review_date: Optional[Date] = None
    comments: Optional[str] = None
    ratings: List[ReviewRatingIn] = Field(default_factory=list)


class EmployeeReviewUpdate(BaseModel):
    review_date: Optional[Date] = None
    comments: Optional[str] = None
    ratings: Optional[List[ReviewRatingIn]] = None
    status: Optional[str] = Field(
        default=None, pattern="^(draft|in_progress|completed)$"
    )


class EmployeeReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    review_cycle_id: Optional[str] = None
    review_date: Optional[Date] = None
    completion_date: Optional[Date] = None
    overall_rating: Optional[Decimal] = None
    comments: Optional[str] = None
    status: str
    ratings: List[ReviewRatingRead] = []
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeReviewListResponse(BaseModel):
    data: List[EmployeeReviewRead]
    meta: dict
    errors: List[str] = []


class EmployeeReviewResponse(BaseModel):
    data: EmployeeReviewRead
    errors: List[str] = []
