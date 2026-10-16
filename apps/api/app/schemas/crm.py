from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CrmListMeta(BaseModel):
    total: int
    limit: int
    offset: int


# ── Leads ───────────────────────────────────────────────────────────────────


class CrmLeadCreate(BaseModel):
    company_id: str = "default"
    name: str = Field(min_length=1, max_length=120)
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    source: str = "other"
    estimated_value: Optional[Decimal] = Field(default=None, ge=0)
    owner_id: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None
    next_follow_up_type: Optional[str] = None
    next_follow_up_note: Optional[str] = None


class CrmLeadUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    source: Optional[str] = None
    estimated_value: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None


class CrmLeadStatusRequest(BaseModel):
    status: str
    lost_reason: Optional[str] = None
    lost_note: Optional[str] = None


class CrmLeadConvertRequest(BaseModel):
    title: Optional[str] = None
    value: Decimal = Decimal("0")
    owner_id: Optional[str] = None


class CrmLeadAssignRequest(BaseModel):
    assigned_to: Optional[str] = None
    department: Optional[str] = None


class CrmLeadQualifyRequest(BaseModel):
    business_need: Optional[str] = None
    budget: Optional[str] = None
    timeline: Optional[str] = None
    decision_maker: Optional[str] = None
    requirements: Optional[str] = None


class CrmFollowUpScheduleRequest(BaseModel):
    at: datetime
    type: str = "call"
    note: Optional[str] = None


class CrmFollowUpCompleteRequest(BaseModel):
    result_note: Optional[str] = None


class CrmFollowUpRescheduleRequest(BaseModel):
    at: datetime


class CrmLeadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    source: str
    status: str
    estimated_value: Optional[Decimal] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None
    lead_score: int = 0
    qual_business_need: Optional[str] = None
    qual_budget: Optional[str] = None
    qual_timeline: Optional[str] = None
    qual_decision_maker: Optional[str] = None
    qual_requirements: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None
    next_follow_up_type: Optional[str] = None
    next_follow_up_note: Optional[str] = None
    follow_up_status: Optional[str] = None
    converted_deal_id: Optional[str] = None
    lost_reason: Optional[str] = None
    lost_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CrmLeadListResponse(BaseModel):
    data: list[CrmLeadRead]
    meta: CrmListMeta


class CrmLeadResponse(BaseModel):
    data: CrmLeadRead


class CrmLeadSummaryRead(BaseModel):
    total_leads: int
    new_leads: int
    active_leads: int
    follow_ups_due: int
    qualified_leads: int
    converted_leads: int
    my_leads: int
    unassigned_leads: int


class CrmLeadSummaryResponse(BaseModel):
    data: CrmLeadSummaryRead


# ── Deals ───────────────────────────────────────────────────────────────────


class CrmDealCreate(BaseModel):
    company_id: str = "default"
    title: str = Field(min_length=1, max_length=160)
    lead_id: Optional[str] = None
    customer_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = None
    value: Decimal = Field(default=Decimal("0"), ge=0)
    expected_close_date: Optional[date] = None
    owner_id: Optional[str] = None
    notes: Optional[str] = None


class CrmDealUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    customer_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    value: Optional[Decimal] = Field(default=None, ge=0)
    expected_close_date: Optional[date] = None
    owner_id: Optional[str] = None
    notes: Optional[str] = None


class CrmDealStageRequest(BaseModel):
    stage: str
    lost_reason: Optional[str] = None


class CrmDealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: str
    lead_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = None
    stage: str
    value: Decimal
    probability: int
    expected_close_date: Optional[date] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    lost_reason: Optional[str] = None
    notes: Optional[str] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CrmDealListResponse(BaseModel):
    data: list[CrmDealRead]
    meta: CrmListMeta


class CrmDealResponse(BaseModel):
    data: CrmDealRead


# ── Projects ────────────────────────────────────────────────────────────────


class CrmProjectCreate(BaseModel):
    company_id: str = "default"
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    customer_id: Optional[str] = None
    deal_id: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    budget: Optional[Decimal] = Field(default=None, ge=0)
    owner_id: Optional[str] = None


class CrmProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = None
    customer_id: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    budget: Optional[Decimal] = Field(default=None, ge=0)
    owner_id: Optional[str] = None


class CrmProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    deal_id: Optional[str] = None
    status: str
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    budget: Optional[Decimal] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    task_count: int = 0
    open_task_count: int = 0
    created_at: datetime
    updated_at: datetime


class CrmProjectListResponse(BaseModel):
    data: list[CrmProjectRead]
    meta: CrmListMeta


class CrmProjectResponse(BaseModel):
    data: CrmProjectRead


# ── Tasks ───────────────────────────────────────────────────────────────────


class CrmTaskCreate(BaseModel):
    company_id: str = "default"
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    project_id: Optional[str] = None
    milestone_id: Optional[str] = None
    related_type: Optional[str] = None
    related_id: Optional[str] = None
    priority: str = "medium"
    points: int = Field(default=1, ge=0)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_id: Optional[str] = None


class CrmTaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    project_id: Optional[str] = None
    milestone_id: Optional[str] = None
    related_type: Optional[str] = None
    related_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    points: Optional[int] = Field(default=None, ge=0)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_id: Optional[str] = None


class CrmTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: str
    description: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    milestone_id: Optional[str] = None
    milestone_title: Optional[str] = None
    related_type: Optional[str] = None
    related_id: Optional[str] = None
    related_name: Optional[str] = None
    status: str
    priority: str
    points: int = 1
    collaborator_names: list[str] = []
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    timer_started_at: Optional[datetime] = None
    total_time_seconds: int = 0
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CrmTaskListResponse(BaseModel):
    data: list[CrmTaskRead]
    meta: CrmListMeta


class CrmMilestoneCreate(BaseModel):
    # project_id deliberately not here — it comes from the URL path
    # (POST /projects/{project_id}/milestones), not duplicated in the body.
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class CrmMilestoneUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None


class CrmMilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    project_id: str
    title: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: str
    task_count: int = 0
    open_task_count: int = 0
    created_at: datetime
    updated_at: datetime


class CrmMilestoneListResponse(BaseModel):
    data: list[CrmMilestoneRead]


class CrmMilestoneResponse(BaseModel):
    data: CrmMilestoneRead


class CrmProjectMemberCreate(BaseModel):
    user_id: str
    role: str = "member"


class CrmProjectMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    project_id: str
    user_id: str
    user_name: Optional[str] = None
    role: str
    created_at: datetime


class CrmProjectMemberListResponse(BaseModel):
    data: list[CrmProjectMemberRead]


class CrmProjectMemberResponse(BaseModel):
    data: CrmProjectMemberRead


class CrmProjectFeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    submitted_by_name: Optional[str] = None


class CrmProjectFeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    project_id: str
    rating: int
    comment: Optional[str] = None
    submitted_by_name: Optional[str] = None
    created_at: datetime


class CrmProjectFeedbackListResponse(BaseModel):
    data: list[CrmProjectFeedbackRead]
    average_rating: Optional[float] = None


class CrmProjectFeedbackResponse(BaseModel):
    data: CrmProjectFeedbackRead


class CrmTimeEntryCreate(BaseModel):
    # project_id comes from the URL path, same convention as CrmMilestoneCreate.
    task_id: Optional[str] = None
    hours: Decimal = Field(gt=0, le=24)
    entry_date: date
    note: Optional[str] = None


class CrmTimeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    project_id: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    hours: Decimal
    entry_date: date
    note: Optional[str] = None
    created_at: datetime


class CrmTimeEntryListResponse(BaseModel):
    data: list[CrmTimeEntryRead]
    total_hours: Decimal


class CrmTimeEntryResponse(BaseModel):
    data: CrmTimeEntryRead


class CrmTaskResponse(BaseModel):
    data: CrmTaskRead


class CrmTaskCollaboratorCreate(BaseModel):
    user_id: str


class CrmTaskCollaboratorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    task_id: str
    user_id: str
    user_name: Optional[str] = None
    created_at: datetime


class CrmTaskCollaboratorListResponse(BaseModel):
    data: list[CrmTaskCollaboratorRead]


class CrmTaskCollaboratorResponse(BaseModel):
    data: CrmTaskCollaboratorRead


class CrmTaskChecklistItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=255)


class CrmTaskChecklistItemUpdate(BaseModel):
    text: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_checked: Optional[bool] = None


class CrmTaskChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    task_id: str
    text: str
    is_checked: bool
    sort_order: int
    created_at: datetime


class CrmTaskChecklistItemListResponse(BaseModel):
    data: list[CrmTaskChecklistItemRead]


class CrmTaskChecklistItemResponse(BaseModel):
    data: CrmTaskChecklistItemRead


# ── Support tickets ─────────────────────────────────────────────────────────


class CrmTicketCreate(BaseModel):
    company_id: str = "default"
    subject: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    customer_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    category: str = "general"
    priority: str = "medium"
    assignee_id: Optional[str] = None


class CrmTicketUpdate(BaseModel):
    subject: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None


class CrmTicketStatusRequest(BaseModel):
    status: str


class CrmTicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    ticket_number: str
    subject: str
    description: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    category: str
    priority: str
    status: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CrmTicketListResponse(BaseModel):
    data: list[CrmTicketRead]
    meta: CrmListMeta


class CrmTicketResponse(BaseModel):
    data: CrmTicketRead


# ── Dashboard ───────────────────────────────────────────────────────────────


class CrmDashboardRead(BaseModel):
    open_leads_count: int
    open_deals_count: int
    pipeline_value: Decimal
    won_this_month: Decimal
    active_projects_count: int
    open_tasks_count: int
    overdue_tasks_count: int
    open_tickets_count: int
    recent_leads: list[CrmLeadRead]
    recent_deals: list[CrmDealRead]
    recent_tasks: list[CrmTaskRead]
    recent_tickets: list[CrmTicketRead]


class CrmDashboardResponse(BaseModel):
    data: CrmDashboardRead
