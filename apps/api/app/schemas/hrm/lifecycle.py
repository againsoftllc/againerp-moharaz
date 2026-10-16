from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# --- resignations ---
class ResignationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    resignation_date: Optional[Date] = None
    last_working_day: Optional[Date] = None
    notice_period: Optional[str] = Field(default=None, max_length=50)
    reason: Optional[str] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)


class ResignationUpdate(BaseModel):
    resignation_date: Optional[Date] = None
    last_working_day: Optional[Date] = None
    notice_period: Optional[str] = Field(default=None, max_length=50)
    reason: Optional[str] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    exit_feedback: Optional[str] = None
    exit_interview_conducted: Optional[bool] = None
    exit_interview_date: Optional[Date] = None


class ResignationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    resignation_date: Optional[Date] = None
    last_working_day: Optional[Date] = None
    notice_period: Optional[str] = None
    reason: Optional[str] = None
    description: Optional[str] = None
    status: str
    documents: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    exit_feedback: Optional[str] = None
    exit_interview_conducted: bool
    exit_interview_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ResignationListResponse(BaseModel):
    data: List[ResignationRead]
    meta: dict
    errors: List[str] = []


class ResignationResponse(BaseModel):
    data: ResignationRead
    errors: List[str] = []


class PromotionCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    designation_id: str = Field(min_length=1, max_length=36)
    previous_designation: Optional[str] = Field(default=None, max_length=50)
    promotion_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    salary_adjustment: Optional[Decimal] = None
    reason: Optional[str] = None
    document: Optional[str] = Field(default=None, max_length=50)


class PromotionUpdate(BaseModel):
    designation_id: Optional[str] = Field(default=None, max_length=36)
    previous_designation: Optional[str] = Field(default=None, max_length=50)
    promotion_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    salary_adjustment: Optional[Decimal] = None
    reason: Optional[str] = None
    document: Optional[str] = Field(default=None, max_length=50)


class PromotionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    previous_designation: Optional[str] = None
    designation_id: Optional[str] = None
    promotion_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    salary_adjustment: Optional[Decimal] = None
    reason: Optional[str] = None
    document: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PromotionListResponse(BaseModel):
    data: List[PromotionRead]
    meta: dict
    errors: List[str] = []


class PromotionResponse(BaseModel):
    data: PromotionRead
    errors: List[str] = []


class TerminationCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    termination_type: Optional[str] = Field(default=None, max_length=50)
    termination_date: Optional[Date] = None
    notice_date: Optional[Date] = None
    notice_period: Optional[str] = Field(default=None, max_length=50)
    reason: Optional[str] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)


class TerminationUpdate(BaseModel):
    termination_type: Optional[str] = Field(default=None, max_length=50)
    termination_date: Optional[Date] = None
    notice_date: Optional[Date] = None
    notice_period: Optional[str] = Field(default=None, max_length=50)
    reason: Optional[str] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    exit_feedback: Optional[str] = None
    exit_interview_conducted: Optional[bool] = None
    exit_interview_date: Optional[Date] = None


class TerminationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    termination_type: Optional[str] = None
    termination_date: Optional[Date] = None
    notice_date: Optional[Date] = None
    notice_period: Optional[str] = None
    reason: Optional[str] = None
    description: Optional[str] = None
    status: str
    documents: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    exit_interview_conducted: bool
    exit_interview_date: Optional[Date] = None
    exit_feedback: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TerminationListResponse(BaseModel):
    data: List[TerminationRead]
    meta: dict
    errors: List[str] = []


class TerminationResponse(BaseModel):
    data: TerminationRead
    errors: List[str] = []


class WarningCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    warning_type: Optional[str] = Field(default=None, max_length=50)
    subject: str = Field(min_length=1, max_length=255)
    severity: Optional[str] = Field(
        default="medium", pattern="^(low|medium|high|critical)$"
    )
    warning_date: Optional[Date] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    expiry_date: Optional[Date] = None
    has_improvement_plan: bool = False
    improvement_plan_goals: Optional[str] = None
    improvement_plan_start_date: Optional[Date] = None
    improvement_plan_end_date: Optional[Date] = None


class WarningUpdate(BaseModel):
    warning_type: Optional[str] = Field(default=None, max_length=50)
    subject: Optional[str] = Field(default=None, min_length=1, max_length=255)
    severity: Optional[str] = Field(
        default=None, pattern="^(low|medium|high|critical)$"
    )
    warning_date: Optional[Date] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    employee_response: Optional[str] = None
    expiry_date: Optional[Date] = None
    has_improvement_plan: Optional[bool] = None
    improvement_plan_goals: Optional[str] = None
    improvement_plan_progress: Optional[str] = None
    improvement_plan_start_date: Optional[Date] = None
    improvement_plan_end_date: Optional[Date] = None


class WarningRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    warning_by: Optional[str] = None
    warning_type: Optional[str] = None
    subject: Optional[str] = None
    severity: Optional[str] = None
    warning_date: Optional[Date] = None
    description: Optional[str] = None
    status: str
    documents: Optional[str] = None
    acknowledgment_date: Optional[Date] = None
    employee_response: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    expiry_date: Optional[Date] = None
    has_improvement_plan: bool
    improvement_plan_goals: Optional[str] = None
    improvement_plan_progress: Optional[str] = None
    improvement_plan_start_date: Optional[Date] = None
    improvement_plan_end_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class WarningListResponse(BaseModel):
    data: List[WarningRead]
    meta: dict
    errors: List[str] = []


class WarningResponse(BaseModel):
    data: WarningRead
    errors: List[str] = []


class ComplaintCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: Optional[str] = Field(default=None, max_length=36)
    against_employee_id: Optional[str] = Field(default=None, max_length=36)
    complaint_type: Optional[str] = Field(default=None, max_length=50)
    subject: str = Field(min_length=1, max_length=255)
    complaint_date: Optional[Date] = None
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    is_anonymous: bool = False
    resolution_deadline: Optional[Date] = None


class ComplaintUpdate(BaseModel):
    against_employee_id: Optional[str] = Field(default=None, max_length=36)
    complaint_type: Optional[str] = Field(default=None, max_length=50)
    subject: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    assigned_to: Optional[str] = Field(default=None, max_length=36)
    resolution_deadline: Optional[Date] = None
    investigation_notes: Optional[str] = None
    resolution_action: Optional[str] = None
    follow_up_action: Optional[str] = None
    feedback: Optional[str] = None
    follow_up_date: Optional[Date] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(open|investigating|resolved|closed)$",
    )


class ComplaintRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    against_employee_id: Optional[str] = None
    complaint_type: Optional[str] = None
    subject: Optional[str] = None
    complaint_date: Optional[Date] = None
    description: Optional[str] = None
    status: str
    documents: Optional[str] = None
    is_anonymous: bool
    assigned_to: Optional[str] = None
    resolution_deadline: Optional[Date] = None
    investigation_notes: Optional[str] = None
    resolution_action: Optional[str] = None
    follow_up_action: Optional[str] = None
    feedback: Optional[str] = None
    resolution_date: Optional[Date] = None
    follow_up_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ComplaintListResponse(BaseModel):
    data: List[ComplaintRead]
    meta: dict
    errors: List[str] = []


class ComplaintResponse(BaseModel):
    data: ComplaintRead
    errors: List[str] = []


class TransferCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    to_branch_id: Optional[str] = Field(default=None, max_length=36)
    to_department_id: Optional[str] = Field(default=None, max_length=36)
    to_designation_id: Optional[str] = Field(default=None, max_length=36)
    transfer_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)


class TransferUpdate(BaseModel):
    to_branch_id: Optional[str] = Field(default=None, max_length=36)
    to_department_id: Optional[str] = Field(default=None, max_length=36)
    to_designation_id: Optional[str] = Field(default=None, max_length=36)
    transfer_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)


class TransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    from_branch_id: Optional[str] = None
    to_branch_id: Optional[str] = None
    from_department_id: Optional[str] = None
    to_department_id: Optional[str] = None
    from_designation_id: Optional[str] = None
    to_designation_id: Optional[str] = None
    transfer_date: Optional[Date] = None
    effective_date: Optional[Date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: str
    documents: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TransferListResponse(BaseModel):
    data: List[TransferRead]
    meta: dict
    errors: List[str] = []


class TransferResponse(BaseModel):
    data: TransferRead
    errors: List[str] = []


class TripCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    employee_id: str = Field(min_length=1, max_length=36)
    purpose: Optional[str] = Field(default=None, max_length=50)
    destination: Optional[str] = Field(default=None, max_length=50)
    start_date: Date
    end_date: Date
    description: Optional[str] = None
    expected_outcomes: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    advance_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))

    @model_validator(mode="after")
    def validate_dates(self) -> TripCreate:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class TripUpdate(BaseModel):
    purpose: Optional[str] = Field(default=None, max_length=50)
    destination: Optional[str] = Field(default=None, max_length=50)
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    description: Optional[str] = None
    expected_outcomes: Optional[str] = None
    trip_report: Optional[str] = None
    documents: Optional[str] = Field(default=None, max_length=50)
    advance_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    advance_status: Optional[str] = Field(
        default=None, pattern="^(pending|paid|settled)$"
    )
    reimbursement_status: Optional[str] = Field(
        default=None, pattern="^(pending|submitted|approved|paid)$"
    )


class TripRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    employee_id: Optional[str] = None
    purpose: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    description: Optional[str] = None
    expected_outcomes: Optional[str] = None
    trip_report: Optional[str] = None
    status: str
    documents: Optional[str] = None
    advance_amount: Optional[Decimal] = None
    advance_status: Optional[str] = None
    total_expenses: Optional[Decimal] = None
    reimbursement_status: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TripListResponse(BaseModel):
    data: List[TripRead]
    meta: dict
    errors: List[str] = []


class TripResponse(BaseModel):
    data: TripRead
    errors: List[str] = []


class TripExpenseCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    trip_id: str = Field(min_length=1, max_length=36)
    expense_type: Optional[str] = Field(default=None, max_length=50)
    expense_date: Optional[Date] = None
    amount: Decimal = Field(ge=Decimal("0"))
    currency: str = Field(default="BDT", min_length=1, max_length=50)
    description: Optional[str] = None
    receipt: Optional[str] = Field(default=None, max_length=50)
    is_reimbursable: bool = True


class TripExpenseUpdate(BaseModel):
    expense_type: Optional[str] = Field(default=None, max_length=50)
    expense_date: Optional[Date] = None
    amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    currency: Optional[str] = Field(default=None, min_length=1, max_length=50)
    description: Optional[str] = None
    receipt: Optional[str] = Field(default=None, max_length=50)
    is_reimbursable: Optional[bool] = None
    status: Optional[str] = Field(
        default=None, pattern="^(pending|approved|rejected)$"
    )


class TripExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    trip_id: Optional[str] = None
    expense_type: Optional[str] = None
    expense_date: Optional[Date] = None
    amount: Decimal
    currency: str
    description: Optional[str] = None
    receipt: Optional[str] = None
    is_reimbursable: bool
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TripExpenseListResponse(BaseModel):
    data: List[TripExpenseRead]
    meta: dict
    errors: List[str] = []


class TripExpenseResponse(BaseModel):
    data: TripExpenseRead
    errors: List[str] = []
