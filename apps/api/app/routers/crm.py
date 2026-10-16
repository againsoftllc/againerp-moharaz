from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.models.commerce_customer import CommerceCustomer
from app.models.crm import (
    CrmDeal,
    CrmLead,
    CrmMilestone,
    CrmProject,
    CrmProjectFeedback,
    CrmProjectMember,
    CrmTask,
    CrmTaskChecklistItem,
    CrmTaskCollaborator,
    CrmTicket,
    CrmTimeEntry,
)
from app.schemas.crm import (
    CrmDashboardRead,
    CrmDashboardResponse,
    CrmDealCreate,
    CrmDealListResponse,
    CrmDealRead,
    CrmDealResponse,
    CrmDealStageRequest,
    CrmDealUpdate,
    CrmFollowUpCompleteRequest,
    CrmFollowUpRescheduleRequest,
    CrmFollowUpScheduleRequest,
    CrmLeadAssignRequest,
    CrmLeadConvertRequest,
    CrmLeadCreate,
    CrmLeadListResponse,
    CrmLeadQualifyRequest,
    CrmLeadRead,
    CrmLeadResponse,
    CrmLeadStatusRequest,
    CrmLeadSummaryResponse,
    CrmLeadUpdate,
    CrmListMeta,
    CrmMilestoneCreate,
    CrmMilestoneListResponse,
    CrmMilestoneRead,
    CrmMilestoneResponse,
    CrmMilestoneUpdate,
    CrmProjectCreate,
    CrmProjectFeedbackCreate,
    CrmProjectFeedbackListResponse,
    CrmProjectFeedbackRead,
    CrmProjectFeedbackResponse,
    CrmProjectListResponse,
    CrmProjectMemberCreate,
    CrmProjectMemberListResponse,
    CrmProjectMemberRead,
    CrmProjectMemberResponse,
    CrmProjectRead,
    CrmProjectResponse,
    CrmProjectUpdate,
    CrmTaskChecklistItemCreate,
    CrmTaskChecklistItemListResponse,
    CrmTaskChecklistItemRead,
    CrmTaskChecklistItemResponse,
    CrmTaskChecklistItemUpdate,
    CrmTaskCollaboratorCreate,
    CrmTaskCollaboratorListResponse,
    CrmTaskCollaboratorRead,
    CrmTaskCollaboratorResponse,
    CrmTaskCreate,
    CrmTaskListResponse,
    CrmTaskRead,
    CrmTaskResponse,
    CrmTaskUpdate,
    CrmTimeEntryCreate,
    CrmTimeEntryListResponse,
    CrmTimeEntryRead,
    CrmTimeEntryResponse,
    CrmTicketCreate,
    CrmTicketListResponse,
    CrmTicketRead,
    CrmTicketResponse,
    CrmTicketStatusRequest,
    CrmTicketUpdate,
)
from app.services.crm.crm_service import CrmService

router = APIRouter(prefix="/crm", tags=["crm"])


def _user_name(db: Session, user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    user = db.get(AuthUser, user_id)
    return user.name if user else None


def _customer_name(db: Session, customer_id: Optional[str]) -> Optional[str]:
    if not customer_id:
        return None
    customer = db.get(CommerceCustomer, customer_id)
    return customer.name if customer else None


def _lead_follow_up_status(lead: CrmLead) -> Optional[str]:
    if not lead.next_follow_up_at:
        return None
    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    tomorrow_start = today_start + timedelta(days=1)
    if lead.next_follow_up_at < today_start:
        return "overdue"
    if lead.next_follow_up_at < tomorrow_start:
        return "today"
    return "upcoming"


def _lead_read(db: Session, lead: CrmLead) -> CrmLeadRead:
    data = CrmLeadRead.model_validate(lead).model_dump()
    data["owner_name"] = _user_name(db, lead.owner_id)
    data["follow_up_status"] = _lead_follow_up_status(lead)
    return CrmLeadRead(**data)


def _deal_read(db: Session, deal: CrmDeal) -> CrmDealRead:
    data = CrmDealRead.model_validate(deal).model_dump()
    data["owner_name"] = _user_name(db, deal.owner_id)
    data["customer_name"] = _customer_name(db, deal.customer_id)
    return CrmDealRead(**data)


def _project_read(db: Session, project: CrmProject) -> CrmProjectRead:
    data = CrmProjectRead.model_validate(project).model_dump()
    data["owner_name"] = _user_name(db, project.owner_id)
    data["customer_name"] = _customer_name(db, project.customer_id)
    counts = (
        db.query(
            func.count(CrmTask.id),
            func.coalesce(func.sum(case((CrmTask.status.in_(("todo", "in_progress")), 1), else_=0)), 0),
        )
        .filter(CrmTask.project_id == project.id)
        .first()
    )
    data["task_count"] = int(counts[0] or 0) if counts else 0
    data["open_task_count"] = int(counts[1] or 0) if counts else 0
    return CrmProjectRead(**data)


def _related_name(db: Session, related_type: Optional[str], related_id: Optional[str]) -> Optional[str]:
    if not related_type or not related_id:
        return None
    if related_type == "lead":
        row = db.get(CrmLead, related_id)
        return row.name if row else None
    if related_type == "deal":
        row = db.get(CrmDeal, related_id)
        return row.title if row else None
    if related_type == "ticket":
        row = db.get(CrmTicket, related_id)
        return row.subject if row else None
    if related_type == "customer":
        row = db.get(CommerceCustomer, related_id)
        return row.name if row else None
    if related_type == "invoice":
        from app.models.sales import SalesInvoice

        row = db.get(SalesInvoice, related_id)
        return row.invoice_number if row else None
    return None


def _task_read(db: Session, task: CrmTask) -> CrmTaskRead:
    data = CrmTaskRead.model_validate(task).model_dump()
    data["assignee_name"] = _user_name(db, task.assignee_id)
    project = db.get(CrmProject, task.project_id) if task.project_id else None
    data["project_name"] = project.name if project else None
    milestone = db.get(CrmMilestone, task.milestone_id) if task.milestone_id else None
    data["milestone_title"] = milestone.title if milestone else None
    data["related_name"] = _related_name(db, task.related_type, task.related_id)
    collaborators = (
        db.query(CrmTaskCollaborator).filter(CrmTaskCollaborator.task_id == task.id).all()
    )
    data["collaborator_names"] = [
        name for c in collaborators if (name := _user_name(db, c.user_id))
    ]
    return CrmTaskRead(**data)


def _task_collaborator_read(db: Session, row: CrmTaskCollaborator) -> CrmTaskCollaboratorRead:
    data = CrmTaskCollaboratorRead.model_validate(row).model_dump()
    data["user_name"] = _user_name(db, row.user_id)
    return CrmTaskCollaboratorRead(**data)


def _milestone_read(db: Session, milestone: CrmMilestone) -> CrmMilestoneRead:
    data = CrmMilestoneRead.model_validate(milestone).model_dump()
    counts = (
        db.query(
            func.count(CrmTask.id),
            func.coalesce(func.sum(case((CrmTask.status.in_(("todo", "in_progress")), 1), else_=0)), 0),
        )
        .filter(CrmTask.milestone_id == milestone.id)
        .first()
    )
    data["task_count"] = int(counts[0] or 0) if counts else 0
    data["open_task_count"] = int(counts[1] or 0) if counts else 0
    return CrmMilestoneRead(**data)


def _member_read(db: Session, member: CrmProjectMember) -> CrmProjectMemberRead:
    data = CrmProjectMemberRead.model_validate(member).model_dump()
    data["user_name"] = _user_name(db, member.user_id)
    return CrmProjectMemberRead(**data)


def _time_entry_read(db: Session, entry: CrmTimeEntry) -> CrmTimeEntryRead:
    data = CrmTimeEntryRead.model_validate(entry).model_dump()
    data["user_name"] = _user_name(db, entry.user_id)
    task = db.get(CrmTask, entry.task_id) if entry.task_id else None
    data["task_title"] = task.title if task else None
    return CrmTimeEntryRead(**data)


def _ticket_read(db: Session, ticket: CrmTicket) -> CrmTicketRead:
    data = CrmTicketRead.model_validate(ticket).model_dump()
    data["assignee_name"] = _user_name(db, ticket.assignee_id)
    data["customer_name"] = _customer_name(db, ticket.customer_id)
    return CrmTicketRead(**data)


# ── Dashboard ─────────────────────────────────────────────────────────────


@router.get("/dashboard", response_model=CrmDashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmDashboardResponse:
    service = CrmService(db)
    raw = service.get_dashboard(company_id)
    payload = {
        **{k: raw[k] for k in ("open_leads_count", "open_deals_count", "pipeline_value", "won_this_month", "active_projects_count", "open_tasks_count", "overdue_tasks_count", "open_tickets_count")},
        "recent_leads": [_lead_read(db, r) for r in raw["recent_leads"]],
        "recent_deals": [_deal_read(db, r) for r in raw["recent_deals"]],
        "recent_tasks": [_task_read(db, r) for r in raw["recent_tasks"]],
        "recent_tickets": [_ticket_read(db, r) for r in raw["recent_tickets"]],
    }
    return CrmDashboardResponse(data=CrmDashboardRead(**payload))


# ── Leads ─────────────────────────────────────────────────────────────────


@router.get("/leads/summary", response_model=CrmLeadSummaryResponse)
def lead_summary(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadSummaryResponse:
    service = CrmService(db)
    return CrmLeadSummaryResponse(data=service.get_lead_summary(company_id, current_user_id=user.id))


@router.get("/leads", response_model=CrmLeadListResponse)
def list_leads(
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    assigned_to: Optional[str] = Query(default=None),
    mine: bool = Query(default=False),
    unassigned: bool = Query(default=False),
    source: Optional[str] = Query(default=None),
    follow_up: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> CrmLeadListResponse:
    service = CrmService(db)
    rows, total = service.list_leads(
        company_id=company_id,
        status=status,
        search=search,
        assigned_to=user.id if mine else assigned_to,
        unassigned=unassigned,
        source=source,
        follow_up=follow_up,
        date_from=datetime.fromisoformat(date_from).date() if date_from else None,
        date_to=datetime.fromisoformat(date_to).date() if date_to else None,
        limit=limit,
        offset=offset,
    )
    return CrmLeadListResponse(data=[_lead_read(db, r) for r in rows], meta=CrmListMeta(total=total, limit=limit, offset=offset))


@router.post("/leads", response_model=CrmLeadResponse, status_code=201)
def create_lead(
    payload: CrmLeadCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    payload.company_id = company_id
    service = CrmService(db)
    lead = service.create_lead(**payload.model_dump(), created_by=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.patch("/leads/{lead_id}", response_model=CrmLeadResponse)
def update_lead(
    lead_id: str,
    payload: CrmLeadUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.update_lead(lead, actor_id=user.id, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/assign", response_model=CrmLeadResponse)
def assign_lead(
    lead_id: str,
    payload: CrmLeadAssignRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.assign_lead(lead, payload.assigned_to, department=payload.department, actor_id=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/qualify", response_model=CrmLeadResponse)
def qualify_lead(
    lead_id: str,
    payload: CrmLeadQualifyRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.qualify_lead(
        lead,
        business_need=payload.business_need,
        budget=payload.budget,
        timeline=payload.timeline,
        decision_maker=payload.decision_maker,
        requirements=payload.requirements,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/status", response_model=CrmLeadResponse)
def transition_lead_status(
    lead_id: str,
    payload: CrmLeadStatusRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.transition_lead_status(
        lead, payload.status, lost_reason=payload.lost_reason, lost_note=payload.lost_note, actor_id=user.id
    )
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/follow-up", response_model=CrmLeadResponse)
def schedule_follow_up(
    lead_id: str,
    payload: CrmFollowUpScheduleRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.schedule_follow_up(lead, at=payload.at, follow_up_type=payload.type, note=payload.note, actor_id=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/follow-up/complete", response_model=CrmLeadResponse)
def complete_follow_up(
    lead_id: str,
    payload: CrmFollowUpCompleteRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.complete_follow_up(lead, result_note=payload.result_note, actor_id=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/follow-up/reschedule", response_model=CrmLeadResponse)
def reschedule_follow_up(
    lead_id: str,
    payload: CrmFollowUpRescheduleRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.reschedule_follow_up(lead, at=payload.at, actor_id=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/follow-up/cancel", response_model=CrmLeadResponse)
def cancel_follow_up(
    lead_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmLeadResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    service.cancel_follow_up(lead, actor_id=user.id)
    db.commit()
    db.refresh(lead)
    return CrmLeadResponse(data=_lead_read(db, lead))


@router.post("/leads/{lead_id}/convert", response_model=CrmDealResponse)
def convert_lead(
    lead_id: str,
    payload: CrmLeadConvertRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmDealResponse:
    service = CrmService(db)
    lead = service.get_lead(lead_id, company_id=company_id)
    deal = service.convert_lead_to_deal(
        lead, title=payload.title, value=payload.value, owner_id=payload.owner_id, actor_id=user.id
    )
    db.commit()
    db.refresh(deal)
    return CrmDealResponse(data=_deal_read(db, deal))


# ── Deals ─────────────────────────────────────────────────────────────────


@router.get("/deals", response_model=CrmDealListResponse)
def list_deals(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
    stage: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> CrmDealListResponse:
    service = CrmService(db)
    rows, total = service.list_deals(company_id=company_id, stage=stage, limit=limit, offset=offset)
    return CrmDealListResponse(data=[_deal_read(db, r) for r in rows], meta=CrmListMeta(total=total, limit=limit, offset=offset))


@router.post("/deals", response_model=CrmDealResponse, status_code=201)
def create_deal(
    payload: CrmDealCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmDealResponse:
    payload.company_id = company_id
    service = CrmService(db)
    deal = service.create_deal(**payload.model_dump())
    db.commit()
    db.refresh(deal)
    return CrmDealResponse(data=_deal_read(db, deal))


@router.patch("/deals/{deal_id}", response_model=CrmDealResponse)
def update_deal(
    deal_id: str,
    payload: CrmDealUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmDealResponse:
    service = CrmService(db)
    deal = service.get_deal(deal_id, company_id=company_id)
    service.update_deal(deal, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(deal)
    return CrmDealResponse(data=_deal_read(db, deal))


@router.post("/deals/{deal_id}/stage", response_model=CrmDealResponse)
def transition_deal_stage(
    deal_id: str,
    payload: CrmDealStageRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmDealResponse:
    service = CrmService(db)
    deal = service.get_deal(deal_id, company_id=company_id)
    service.transition_deal_stage(deal, payload.stage, lost_reason=payload.lost_reason)
    db.commit()
    db.refresh(deal)
    return CrmDealResponse(data=_deal_read(db, deal))


# ── Projects ──────────────────────────────────────────────────────────────


@router.get("/projects", response_model=CrmProjectListResponse)
def list_projects(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    overdue: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> CrmProjectListResponse:
    service = CrmService(db)
    rows, total = service.list_projects(
        company_id=company_id, status=status, customer_id=customer_id, search=search, overdue=overdue, limit=limit, offset=offset
    )
    return CrmProjectListResponse(data=[_project_read(db, r) for r in rows], meta=CrmListMeta(total=total, limit=limit, offset=offset))


@router.post("/projects", response_model=CrmProjectResponse, status_code=201)
def create_project(
    payload: CrmProjectCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectResponse:
    payload.company_id = company_id
    service = CrmService(db)
    project = service.create_project(**payload.model_dump(), created_by=user.id)
    db.commit()
    db.refresh(project)
    return CrmProjectResponse(data=_project_read(db, project))


@router.patch("/projects/{project_id}", response_model=CrmProjectResponse)
def update_project(
    project_id: str,
    payload: CrmProjectUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectResponse:
    service = CrmService(db)
    project = service.get_project(project_id, company_id=company_id)
    service.update_project(project, actor_id=user.id, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(project)
    return CrmProjectResponse(data=_project_read(db, project))


# ── Milestones ───────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/milestones", response_model=CrmMilestoneListResponse)
def list_milestones(
    project_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmMilestoneListResponse:
    service = CrmService(db)
    rows = service.list_milestones(project_id, company_id=company_id)
    return CrmMilestoneListResponse(data=[_milestone_read(db, r) for r in rows])


@router.post("/projects/{project_id}/milestones", response_model=CrmMilestoneResponse, status_code=201)
def create_milestone(
    project_id: str,
    payload: CrmMilestoneCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmMilestoneResponse:
    service = CrmService(db)
    milestone = service.create_milestone(
        company_id=company_id,
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        start_date=payload.start_date,
        due_date=payload.due_date,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(milestone)
    return CrmMilestoneResponse(data=_milestone_read(db, milestone))


@router.patch("/milestones/{milestone_id}", response_model=CrmMilestoneResponse)
def update_milestone(
    milestone_id: str,
    payload: CrmMilestoneUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmMilestoneResponse:
    service = CrmService(db)
    milestone = service.get_milestone(milestone_id, company_id=company_id)
    service.update_milestone(milestone, actor_id=user.id, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(milestone)
    return CrmMilestoneResponse(data=_milestone_read(db, milestone))


# ── Project members ──────────────────────────────────────────────────────


@router.get("/projects/{project_id}/members", response_model=CrmProjectMemberListResponse)
def list_members(
    project_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectMemberListResponse:
    service = CrmService(db)
    rows = service.list_members(project_id, company_id=company_id)
    return CrmProjectMemberListResponse(data=[_member_read(db, r) for r in rows])


@router.post("/projects/{project_id}/members", response_model=CrmProjectMemberResponse, status_code=201)
def add_member(
    project_id: str,
    payload: CrmProjectMemberCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectMemberResponse:
    service = CrmService(db)
    member = service.add_member(
        company_id=company_id,
        project_id=project_id,
        user_id=payload.user_id,
        role=payload.role,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(member)
    return CrmProjectMemberResponse(data=_member_read(db, member))


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
def remove_member(
    project_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = CrmService(db)
    service.remove_member(project_id, user_id, company_id=company_id)
    db.commit()


# ── Customer feedback ────────────────────────────────────────────────────


@router.get("/projects/{project_id}/feedback", response_model=CrmProjectFeedbackListResponse)
def list_feedback(
    project_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectFeedbackListResponse:
    service = CrmService(db)
    rows = service.list_feedback(project_id, company_id=company_id)
    avg = round(sum(r.rating for r in rows) / len(rows), 1) if rows else None
    return CrmProjectFeedbackListResponse(
        data=[CrmProjectFeedbackRead.model_validate(r) for r in rows], average_rating=avg,
    )


@router.post("/projects/{project_id}/feedback", response_model=CrmProjectFeedbackResponse, status_code=201)
def add_feedback(
    project_id: str,
    payload: CrmProjectFeedbackCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmProjectFeedbackResponse:
    service = CrmService(db)
    row = service.add_feedback(
        company_id=company_id,
        project_id=project_id,
        rating=payload.rating,
        comment=payload.comment,
        submitted_by_name=payload.submitted_by_name,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(row)
    return CrmProjectFeedbackResponse(data=CrmProjectFeedbackRead.model_validate(row))


# ── Time entries ─────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/time-entries", response_model=CrmTimeEntryListResponse)
def list_time_entries(
    project_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTimeEntryListResponse:
    service = CrmService(db)
    rows = service.list_time_entries(project_id, company_id=company_id)
    total = sum((r.hours for r in rows), start=Decimal("0"))
    return CrmTimeEntryListResponse(data=[_time_entry_read(db, r) for r in rows], total_hours=total)


@router.post("/projects/{project_id}/time-entries", response_model=CrmTimeEntryResponse, status_code=201)
def create_time_entry(
    project_id: str,
    payload: CrmTimeEntryCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTimeEntryResponse:
    service = CrmService(db)
    entry = service.create_time_entry(
        company_id=company_id,
        project_id=project_id,
        task_id=payload.task_id,
        user_id=user.id,
        hours=payload.hours,
        entry_date=payload.entry_date,
        note=payload.note,
    )
    db.commit()
    db.refresh(entry)
    return CrmTimeEntryResponse(data=_time_entry_read(db, entry))


@router.delete("/time-entries/{entry_id}", status_code=204)
def delete_time_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = CrmService(db)
    entry = service.get_time_entry(entry_id, company_id=company_id)
    service.delete_time_entry(entry)
    db.commit()


# ── Tasks ─────────────────────────────────────────────────────────────────


@router.get("/tasks", response_model=CrmTaskListResponse)
def list_tasks(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    assignee_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    related_type: Optional[str] = Query(default=None),
    related_id: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> CrmTaskListResponse:
    service = CrmService(db)
    rows, total = service.list_tasks(
        company_id=company_id, status=status, assignee_id=assignee_id, project_id=project_id,
        related_type=related_type, related_id=related_id, limit=limit, offset=offset,
    )
    return CrmTaskListResponse(data=[_task_read(db, r) for r in rows], meta=CrmListMeta(total=total, limit=limit, offset=offset))


@router.post("/tasks", response_model=CrmTaskResponse, status_code=201)
def create_task(
    payload: CrmTaskCreate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskResponse:
    payload.company_id = company_id
    service = CrmService(db)
    task = service.create_task(**payload.model_dump(), created_by=user.id)
    db.commit()
    db.refresh(task)
    return CrmTaskResponse(data=_task_read(db, task))


@router.patch("/tasks/{task_id}", response_model=CrmTaskResponse)
def update_task(
    task_id: str,
    payload: CrmTaskUpdate,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskResponse:
    service = CrmService(db)
    task = service.get_task(task_id, company_id=company_id)
    service.update_task(task, actor_id=user.id, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(task)
    return CrmTaskResponse(data=_task_read(db, task))


@router.post("/tasks/{task_id}/complete", response_model=CrmTaskResponse)
def complete_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskResponse:
    service = CrmService(db)
    task = service.get_task(task_id, company_id=company_id)
    service.update_task(task, actor_id=user.id, status="done")
    db.commit()
    db.refresh(task)
    return CrmTaskResponse(data=_task_read(db, task))


@router.post("/tasks/{task_id}/timer/start", response_model=CrmTaskResponse)
def start_task_timer(
    task_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskResponse:
    service = CrmService(db)
    task = service.get_task(task_id, company_id=company_id)
    service.start_task_timer(task)
    db.commit()
    db.refresh(task)
    return CrmTaskResponse(data=_task_read(db, task))


@router.post("/tasks/{task_id}/timer/stop", response_model=CrmTaskResponse)
def stop_task_timer(
    task_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskResponse:
    service = CrmService(db)
    task = service.get_task(task_id, company_id=company_id)
    service.stop_task_timer(task)
    db.commit()
    db.refresh(task)
    return CrmTaskResponse(data=_task_read(db, task))


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "delete")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = CrmService(db)
    task = service.get_task(task_id, company_id=company_id)
    service.delete_task(task)
    db.commit()


# ── Task collaborators ───────────────────────────────────────────────────


@router.get("/tasks/{task_id}/collaborators", response_model=CrmTaskCollaboratorListResponse)
def list_task_collaborators(
    task_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskCollaboratorListResponse:
    service = CrmService(db)
    rows = service.list_task_collaborators(task_id, company_id=company_id)
    return CrmTaskCollaboratorListResponse(data=[_task_collaborator_read(db, r) for r in rows])


@router.post("/tasks/{task_id}/collaborators", response_model=CrmTaskCollaboratorResponse, status_code=201)
def add_task_collaborator(
    task_id: str,
    payload: CrmTaskCollaboratorCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskCollaboratorResponse:
    service = CrmService(db)
    row = service.add_task_collaborator(task_id, payload.user_id, company_id=company_id)
    db.commit()
    db.refresh(row)
    return CrmTaskCollaboratorResponse(data=_task_collaborator_read(db, row))


@router.delete("/tasks/{task_id}/collaborators/{user_id}", status_code=204)
def remove_task_collaborator(
    task_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = CrmService(db)
    service.remove_task_collaborator(task_id, user_id, company_id=company_id)
    db.commit()


# ── Task checklist ───────────────────────────────────────────────────────


@router.get("/tasks/{task_id}/checklist", response_model=CrmTaskChecklistItemListResponse)
def list_task_checklist(
    task_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskChecklistItemListResponse:
    service = CrmService(db)
    rows = service.list_task_checklist_items(task_id, company_id=company_id)
    return CrmTaskChecklistItemListResponse(data=[CrmTaskChecklistItemRead.model_validate(r) for r in rows])


@router.post("/tasks/{task_id}/checklist", response_model=CrmTaskChecklistItemResponse, status_code=201)
def add_task_checklist_item(
    task_id: str,
    payload: CrmTaskChecklistItemCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskChecklistItemResponse:
    service = CrmService(db)
    row = service.add_task_checklist_item(task_id, payload.text, company_id=company_id)
    db.commit()
    db.refresh(row)
    return CrmTaskChecklistItemResponse(data=CrmTaskChecklistItemRead.model_validate(row))


@router.patch("/tasks/{task_id}/checklist/{item_id}", response_model=CrmTaskChecklistItemResponse)
def update_task_checklist_item(
    task_id: str,
    item_id: str,
    payload: CrmTaskChecklistItemUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTaskChecklistItemResponse:
    service = CrmService(db)
    item = service.get_task_checklist_item(item_id, company_id=company_id)
    service.update_task_checklist_item(item, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return CrmTaskChecklistItemResponse(data=CrmTaskChecklistItemRead.model_validate(item))


@router.delete("/tasks/{task_id}/checklist/{item_id}", status_code=204)
def delete_task_checklist_item(
    task_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> None:
    service = CrmService(db)
    item = service.get_task_checklist_item(item_id, company_id=company_id)
    service.delete_task_checklist_item(item)
    db.commit()


# ── Support tickets ───────────────────────────────────────────────────────


@router.get("/tickets", response_model=CrmTicketListResponse)
def list_tickets(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "read")),
    company_id: str = Depends(get_current_company_id),
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> CrmTicketListResponse:
    service = CrmService(db)
    rows, total = service.list_tickets(
        company_id=company_id, status=status, priority=priority, customer_id=customer_id, search=search, limit=limit, offset=offset
    )
    return CrmTicketListResponse(data=[_ticket_read(db, r) for r in rows], meta=CrmListMeta(total=total, limit=limit, offset=offset))


@router.post("/tickets", response_model=CrmTicketResponse, status_code=201)
def create_ticket(
    payload: CrmTicketCreate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "create")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTicketResponse:
    payload.company_id = company_id
    service = CrmService(db)
    ticket = service.create_ticket(**payload.model_dump())
    db.commit()
    db.refresh(ticket)
    return CrmTicketResponse(data=_ticket_read(db, ticket))


@router.patch("/tickets/{ticket_id}", response_model=CrmTicketResponse)
def update_ticket(
    ticket_id: str,
    payload: CrmTicketUpdate,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTicketResponse:
    service = CrmService(db)
    ticket = service.get_ticket(ticket_id, company_id=company_id)
    service.update_ticket(ticket, **payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(ticket)
    return CrmTicketResponse(data=_ticket_read(db, ticket))


@router.post("/tickets/{ticket_id}/status", response_model=CrmTicketResponse)
def transition_ticket_status(
    ticket_id: str,
    payload: CrmTicketStatusRequest,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("crm", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CrmTicketResponse:
    service = CrmService(db)
    ticket = service.get_ticket(ticket_id, company_id=company_id)
    service.transition_ticket_status(ticket, payload.status)
    db.commit()
    db.refresh(ticket)
    return CrmTicketResponse(data=_ticket_read(db, ticket))
