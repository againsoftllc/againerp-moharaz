"""CRM transaction engine — Leads, Deals, Projects, Tasks, Support Tickets."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import engine
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
from app.services.collaboration.collaboration_service import CollaborationService
from app.services.crm.constants import (
    DEAL_STAGE_DEFAULT_PROBABILITY,
    DEAL_STAGE_TRANSITIONS,
    DEAL_STAGES,
    LEAD_OPEN_STATUSES,
    LEAD_STATUS_TRANSITIONS,
    LEAD_STATUSES,
    PROJECT_OPEN_STATUSES,
    PROJECT_STATUSES,
    TASK_STATUSES,
    TICKET_STATUS_TRANSITIONS,
    TICKET_STATUSES,
)
from app.services.core.sequence_service import next_number as allocate_number

ENTITY_TYPE_LEAD = "lead"
ENTITY_TYPE_PROJECT = "project"
ENTITY_TYPE_TASK = "task"


def ensure_crm_lead_columns() -> None:
    statements = [
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS job_title VARCHAR(120)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(32)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS department VARCHAR(128)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS qual_business_need TEXT",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS qual_budget VARCHAR(120)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS qual_timeline VARCHAR(120)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS qual_decision_maker VARCHAR(120)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS qual_requirements TEXT",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS next_follow_up_type VARCHAR(24)",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS next_follow_up_note TEXT",
        "ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lost_note TEXT",
        "CREATE INDEX IF NOT EXISTS ix_crm_leads_owner_id ON crm_leads (owner_id)",
        "CREATE INDEX IF NOT EXISTS ix_crm_leads_next_follow_up_at ON crm_leads (next_follow_up_at)",
        "ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255)",
        "ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32)",
        "ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS source VARCHAR(24)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_crm_task_columns() -> None:
    statements = [
        "ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS milestone_id VARCHAR(36) REFERENCES crm_milestones(id) ON DELETE SET NULL",
        "ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS start_date DATE",
        "ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP",
        "ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS total_time_seconds INTEGER NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS ix_crm_tasks_milestone_id ON crm_tasks (milestone_id)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_crm_milestone_columns() -> None:
    """start_date — lets the Milestones Gantt view render a date range, not just a due date."""
    statements = [
        "ALTER TABLE crm_milestones ADD COLUMN IF NOT EXISTS start_date DATE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


class CrmService:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Leads ────────────────────────────────────────────────────────────────

    def list_leads(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        search: Optional[str] = None,
        assigned_to: Optional[str] = None,
        unassigned: bool = False,
        source: Optional[str] = None,
        follow_up: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[CrmLead], int]:
        query = self._db.query(CrmLead).filter(CrmLead.company_id == company_id)
        if status == "active":
            query = query.filter(CrmLead.status.in_(LEAD_OPEN_STATUSES))
        elif status:
            query = query.filter(CrmLead.status == status)
        if search:
            like = f"%{search}%"
            query = query.filter(
                (CrmLead.name.ilike(like))
                | (CrmLead.company_name.ilike(like))
                | (CrmLead.email.ilike(like))
                | (CrmLead.phone.ilike(like))
            )
        if unassigned:
            query = query.filter(CrmLead.owner_id.is_(None))
        elif assigned_to:
            query = query.filter(CrmLead.owner_id == assigned_to)
        if source:
            query = query.filter(CrmLead.source == source)
        if follow_up:
            today_start = datetime.combine(date.today(), time.min)
            tomorrow_start = today_start + timedelta(days=1)
            if follow_up == "due":
                query = query.filter(CrmLead.next_follow_up_at.isnot(None), CrmLead.next_follow_up_at < tomorrow_start)
            elif follow_up == "overdue":
                query = query.filter(CrmLead.next_follow_up_at.isnot(None), CrmLead.next_follow_up_at < today_start)
            elif follow_up == "today":
                query = query.filter(
                    CrmLead.next_follow_up_at >= today_start, CrmLead.next_follow_up_at < tomorrow_start
                )
            elif follow_up == "upcoming":
                query = query.filter(CrmLead.next_follow_up_at >= tomorrow_start)
            elif follow_up == "none":
                query = query.filter(CrmLead.next_follow_up_at.is_(None))
        if date_from:
            query = query.filter(CrmLead.created_at >= datetime.combine(date_from, time.min))
        if date_to:
            query = query.filter(CrmLead.created_at <= datetime.combine(date_to, time.max))
        total = query.count()
        rows = query.order_by(CrmLead.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_lead(self, lead_id: str, *, company_id: str = "default") -> CrmLead:
        lead = self._db.get(CrmLead, lead_id)
        if not lead or lead.company_id != company_id:
            raise HTTPException(status_code=404, detail="Lead not found")
        return lead

    def get_lead_summary(self, company_id: str = "default", *, current_user_id: Optional[str] = None) -> dict:
        def count(*filters) -> int:
            return self._db.query(func.count(CrmLead.id)).filter(CrmLead.company_id == company_id, *filters).scalar() or 0

        tomorrow_start = datetime.combine(date.today(), time.min) + timedelta(days=1)
        return {
            "total_leads": count(),
            "new_leads": count(CrmLead.status == "new"),
            "active_leads": count(CrmLead.status.in_(LEAD_OPEN_STATUSES)),
            "follow_ups_due": count(
                CrmLead.next_follow_up_at.isnot(None),
                CrmLead.next_follow_up_at < tomorrow_start,
                CrmLead.status.in_(LEAD_OPEN_STATUSES),
            ),
            "qualified_leads": count(CrmLead.status == "qualified"),
            "converted_leads": count(CrmLead.status == "converted"),
            "my_leads": count(CrmLead.owner_id == current_user_id, CrmLead.status.in_(LEAD_OPEN_STATUSES))
            if current_user_id
            else 0,
            "unassigned_leads": count(CrmLead.owner_id.is_(None), CrmLead.status.in_(LEAD_OPEN_STATUSES)),
        }

    def create_lead(
        self,
        *,
        company_id: str = "default",
        name: str,
        company_name: Optional[str] = None,
        job_title: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        alternate_phone: Optional[str] = None,
        source: str = "other",
        estimated_value: Optional[Decimal] = None,
        owner_id: Optional[str] = None,
        department: Optional[str] = None,
        notes: Optional[str] = None,
        next_follow_up_at: Optional[datetime] = None,
        next_follow_up_type: Optional[str] = None,
        next_follow_up_note: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> CrmLead:
        lead = CrmLead(
            company_id=company_id,
            name=name,
            company_name=company_name,
            job_title=job_title,
            email=email,
            phone=phone,
            alternate_phone=alternate_phone,
            source=source,
            status="new",
            estimated_value=estimated_value,
            owner_id=owner_id,
            department=department,
            notes=notes,
            next_follow_up_at=next_follow_up_at,
            next_follow_up_type=next_follow_up_type,
            next_follow_up_note=next_follow_up_note,
        )
        self._db.add(lead)
        self._db.flush()

        collab = CollaborationService(self._db, company_id=company_id)
        collab.ensure_ownership(ENTITY_TYPE_LEAD, lead.id, created_by=created_by, assigned_to=owner_id)
        collab.record_activity(ENTITY_TYPE_LEAD, lead.id, "created", performed_by=created_by, details={"source": source})
        if next_follow_up_at:
            collab.record_activity(
                ENTITY_TYPE_LEAD,
                lead.id,
                "follow_up_scheduled",
                performed_by=created_by,
                new_value=next_follow_up_at.isoformat(),
                details={"type": next_follow_up_type, "note": next_follow_up_note},
            )
        return lead

    def update_lead(self, lead: CrmLead, *, actor_id: Optional[str] = None, **patch) -> CrmLead:
        if lead.status in ("converted", "lost", "unqualified"):
            raise HTTPException(status_code=400, detail="Closed leads can't be edited")
        changed: list[str] = []
        for key, value in patch.items():
            if value is not None and getattr(lead, key, None) != value:
                setattr(lead, key, value)
                changed.append(key)
        self._db.flush()
        if changed:
            CollaborationService(self._db, company_id=lead.company_id).record_activity(
                ENTITY_TYPE_LEAD, lead.id, "updated", performed_by=actor_id, details={"fields": changed}
            )
        return lead

    def assign_lead(
        self,
        lead: CrmLead,
        assigned_to: Optional[str],
        *,
        department: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmLead:
        old_owner = lead.owner_id
        lead.owner_id = assigned_to
        if department is not None:
            lead.department = department
        self._db.flush()

        collab = CollaborationService(self._db, company_id=lead.company_id)
        collab.update_ownership(ENTITY_TYPE_LEAD, lead.id, assigned_to=assigned_to)
        collab.record_activity(
            ENTITY_TYPE_LEAD, lead.id, "assignment", performed_by=actor_id, old_value=old_owner, new_value=assigned_to
        )
        return lead

    def transition_lead_status(
        self,
        lead: CrmLead,
        status: str,
        *,
        lost_reason: Optional[str] = None,
        lost_note: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmLead:
        if status not in LEAD_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unknown lead status {status}")
        allowed = LEAD_STATUS_TRANSITIONS.get(lead.status, frozenset())
        if status not in allowed:
            raise HTTPException(status_code=400, detail=f"Cannot move lead from {lead.status} to {status}")
        if status == "lost" and not lost_reason:
            raise HTTPException(status_code=400, detail="A lost reason is required")
        old_status = lead.status
        lead.status = status
        if status == "lost":
            lead.lost_reason = lost_reason
            lead.lost_note = lost_note
        self._db.flush()
        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "stage_changed",
            performed_by=actor_id,
            old_value=old_status,
            new_value=status,
            details={"lost_reason": lost_reason, "lost_note": lost_note} if status == "lost" else None,
        )
        return lead

    def qualify_lead(
        self,
        lead: CrmLead,
        *,
        business_need: Optional[str] = None,
        budget: Optional[str] = None,
        timeline: Optional[str] = None,
        decision_maker: Optional[str] = None,
        requirements: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmLead:
        lead.qual_business_need = business_need
        lead.qual_budget = budget
        lead.qual_timeline = timeline
        lead.qual_decision_maker = decision_maker
        lead.qual_requirements = requirements
        self._db.flush()

        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "qualification_updated",
            performed_by=actor_id,
            details={
                "business_need": business_need,
                "budget": budget,
                "timeline": timeline,
                "decision_maker": decision_maker,
            },
        )
        if lead.status != "qualified":
            self.transition_lead_status(lead, "qualified", actor_id=actor_id)
        return lead

    def schedule_follow_up(
        self,
        lead: CrmLead,
        *,
        at: datetime,
        follow_up_type: str = "call",
        note: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmLead:
        lead.next_follow_up_at = at
        lead.next_follow_up_type = follow_up_type
        lead.next_follow_up_note = note
        self._db.flush()
        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "follow_up_scheduled",
            performed_by=actor_id,
            new_value=at.isoformat(),
            details={"type": follow_up_type, "note": note},
        )
        return lead

    def complete_follow_up(
        self, lead: CrmLead, *, result_note: Optional[str] = None, actor_id: Optional[str] = None
    ) -> CrmLead:
        if not lead.next_follow_up_at:
            raise HTTPException(status_code=400, detail="No follow-up scheduled")
        completed_type = lead.next_follow_up_type
        lead.next_follow_up_at = None
        lead.next_follow_up_type = None
        lead.next_follow_up_note = None
        self._db.flush()
        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "follow_up_completed",
            performed_by=actor_id,
            details={"type": completed_type, "result": result_note},
        )
        return lead

    def cancel_follow_up(self, lead: CrmLead, *, actor_id: Optional[str] = None) -> CrmLead:
        if not lead.next_follow_up_at:
            raise HTTPException(status_code=400, detail="No follow-up scheduled")
        cancelled_at = lead.next_follow_up_at
        cancelled_type = lead.next_follow_up_type
        lead.next_follow_up_at = None
        lead.next_follow_up_type = None
        lead.next_follow_up_note = None
        self._db.flush()
        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "follow_up_cancelled",
            performed_by=actor_id,
            old_value=cancelled_at.isoformat(),
            details={"type": cancelled_type},
        )
        return lead

    def reschedule_follow_up(self, lead: CrmLead, *, at: datetime, actor_id: Optional[str] = None) -> CrmLead:
        old_at = lead.next_follow_up_at
        lead.next_follow_up_at = at
        self._db.flush()
        CollaborationService(self._db, company_id=lead.company_id).record_activity(
            ENTITY_TYPE_LEAD,
            lead.id,
            "follow_up_rescheduled",
            performed_by=actor_id,
            old_value=old_at.isoformat() if old_at else None,
            new_value=at.isoformat(),
        )
        return lead

    def convert_lead_to_deal(
        self,
        lead: CrmLead,
        *,
        title: Optional[str] = None,
        value: Decimal = Decimal("0"),
        owner_id: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmDeal:
        if lead.status != "qualified":
            raise HTTPException(status_code=400, detail="Only qualified leads can be converted")
        deal = self.create_deal(
            company_id=lead.company_id,
            title=title or f"{lead.company_name or lead.name} — opportunity",
            lead_id=lead.id,
            contact_name=lead.name,
            contact_company=lead.company_name,
            contact_email=lead.email,
            contact_phone=lead.phone,
            source=lead.source,
            value=value or lead.estimated_value or Decimal("0"),
            owner_id=owner_id or lead.owner_id,
            notes=lead.notes,
        )
        lead.status = "converted"
        lead.converted_deal_id = deal.id
        self._db.flush()

        collab = CollaborationService(self._db, company_id=lead.company_id)
        collab.ensure_ownership("deal", deal.id, created_by=actor_id, assigned_to=deal.owner_id)
        collab.record_activity(ENTITY_TYPE_LEAD, lead.id, "converted", performed_by=actor_id, new_value=deal.id)
        collab.record_activity("deal", deal.id, "created", performed_by=actor_id, details={"source_lead_id": lead.id})
        return deal

    # ── Deals ────────────────────────────────────────────────────────────────

    def list_deals(
        self,
        *,
        company_id: str = "default",
        stage: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[CrmDeal], int]:
        query = self._db.query(CrmDeal).filter(CrmDeal.company_id == company_id)
        if stage:
            query = query.filter(CrmDeal.stage == stage)
        total = query.count()
        rows = query.order_by(CrmDeal.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_deal(self, deal_id: str, *, company_id: str = "default") -> CrmDeal:
        deal = self._db.get(CrmDeal, deal_id)
        if not deal or deal.company_id != company_id:
            raise HTTPException(status_code=404, detail="Deal not found")
        return deal

    def create_deal(
        self,
        *,
        company_id: str = "default",
        title: str,
        lead_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        contact_name: Optional[str] = None,
        contact_company: Optional[str] = None,
        contact_email: Optional[str] = None,
        contact_phone: Optional[str] = None,
        source: Optional[str] = None,
        value: Decimal = Decimal("0"),
        expected_close_date: Optional[date] = None,
        owner_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> CrmDeal:
        deal = CrmDeal(
            company_id=company_id,
            title=title,
            lead_id=lead_id,
            customer_id=customer_id,
            contact_name=contact_name,
            contact_company=contact_company,
            contact_email=contact_email,
            contact_phone=contact_phone,
            source=source,
            stage="new",
            value=value,
            probability=DEAL_STAGE_DEFAULT_PROBABILITY["new"],
            expected_close_date=expected_close_date,
            owner_id=owner_id,
            notes=notes,
        )
        self._db.add(deal)
        self._db.flush()
        return deal

    def update_deal(self, deal: CrmDeal, **patch) -> CrmDeal:
        if deal.stage in ("won", "lost"):
            raise HTTPException(status_code=400, detail="Closed deals can't be edited")
        for key, value in patch.items():
            if value is not None:
                setattr(deal, key, value)
        self._db.flush()
        return deal

    def transition_deal_stage(self, deal: CrmDeal, stage: str, *, lost_reason: Optional[str] = None) -> CrmDeal:
        if stage not in DEAL_STAGES:
            raise HTTPException(status_code=400, detail=f"Unknown deal stage {stage}")
        allowed = DEAL_STAGE_TRANSITIONS.get(deal.stage, frozenset())
        if stage not in allowed:
            raise HTTPException(status_code=400, detail=f"Cannot move deal from {deal.stage} to {stage}")
        deal.stage = stage
        deal.probability = DEAL_STAGE_DEFAULT_PROBABILITY.get(stage, deal.probability)
        if stage in ("won", "lost"):
            deal.closed_at = datetime.utcnow()
            if stage == "lost" and lost_reason:
                deal.lost_reason = lost_reason
        self._db.flush()
        return deal

    # ── Projects ─────────────────────────────────────────────────────────────

    def list_projects(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        customer_id: Optional[str] = None,
        search: Optional[str] = None,
        overdue: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[CrmProject], int]:
        query = self._db.query(CrmProject).filter(CrmProject.company_id == company_id)
        if status:
            query = query.filter(CrmProject.status == status)
        if customer_id:
            query = query.filter(CrmProject.customer_id == customer_id)
        if search:
            like = f"%{search}%"
            query = query.filter((CrmProject.name.ilike(like)) | (CrmProject.description.ilike(like)))
        if overdue:
            query = query.filter(
                CrmProject.due_date.isnot(None),
                CrmProject.due_date < date.today(),
                CrmProject.status.in_(PROJECT_OPEN_STATUSES),
            )
        total = query.count()
        rows = query.order_by(CrmProject.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_project(self, project_id: str, *, company_id: str = "default") -> CrmProject:
        project = self._db.get(CrmProject, project_id)
        if not project or project.company_id != company_id:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    def create_project(
        self,
        *,
        company_id: str = "default",
        name: str,
        description: Optional[str] = None,
        customer_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        start_date: Optional[date] = None,
        due_date: Optional[date] = None,
        budget: Optional[Decimal] = None,
        owner_id: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> CrmProject:
        project = CrmProject(
            company_id=company_id,
            name=name,
            description=description,
            customer_id=customer_id,
            deal_id=deal_id,
            status="planning",
            start_date=start_date,
            due_date=due_date,
            budget=budget,
            owner_id=owner_id,
        )
        self._db.add(project)
        self._db.flush()

        collab = CollaborationService(self._db, company_id=company_id)
        collab.ensure_ownership(ENTITY_TYPE_PROJECT, project.id, created_by=created_by, assigned_to=owner_id)
        collab.record_activity(ENTITY_TYPE_PROJECT, project.id, "created", performed_by=created_by)
        return project

    def update_project(self, project: CrmProject, *, actor_id: Optional[str] = None, **patch) -> CrmProject:
        if "status" in patch and patch["status"] is not None and patch["status"] not in PROJECT_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unknown project status {patch['status']}")
        old_status = project.status
        old_owner = project.owner_id
        changed: list[str] = []
        for key, value in patch.items():
            if value is not None and getattr(project, key, None) != value:
                setattr(project, key, value)
                changed.append(key)
        self._db.flush()
        if changed:
            collab = CollaborationService(self._db, company_id=project.company_id)
            if "status" in changed:
                collab.record_activity(
                    ENTITY_TYPE_PROJECT, project.id, "status_changed",
                    performed_by=actor_id, old_value=old_status, new_value=project.status,
                )
            if "owner_id" in changed:
                collab.update_ownership(ENTITY_TYPE_PROJECT, project.id, assigned_to=project.owner_id)
                collab.record_activity(
                    ENTITY_TYPE_PROJECT, project.id, "assignment",
                    performed_by=actor_id, old_value=old_owner, new_value=project.owner_id,
                )
            other_fields = [f for f in changed if f not in ("status", "owner_id")]
            if other_fields:
                collab.record_activity(
                    ENTITY_TYPE_PROJECT, project.id, "updated", performed_by=actor_id, details={"fields": other_fields}
                )
        return project

    # ── Milestones ───────────────────────────────────────────────────────────

    def list_milestones(self, project_id: str, *, company_id: str = "default") -> list[CrmMilestone]:
        return (
            self._db.query(CrmMilestone)
            .filter(CrmMilestone.company_id == company_id, CrmMilestone.project_id == project_id)
            .order_by(CrmMilestone.due_date.asc().nullslast(), CrmMilestone.created_at.asc())
            .all()
        )

    def get_milestone(self, milestone_id: str, *, company_id: str = "default") -> CrmMilestone:
        milestone = self._db.get(CrmMilestone, milestone_id)
        if not milestone or milestone.company_id != company_id:
            raise HTTPException(status_code=404, detail="Milestone not found")
        return milestone

    def create_milestone(
        self,
        *,
        company_id: str = "default",
        project_id: str,
        title: str,
        description: Optional[str] = None,
        start_date: Optional[date] = None,
        due_date: Optional[date] = None,
        actor_id: Optional[str] = None,
    ) -> CrmMilestone:
        # 404s if the project doesn't exist or belongs to another company — same
        # tenant check every other project mutation already goes through.
        self.get_project(project_id, company_id=company_id)
        milestone = CrmMilestone(
            company_id=company_id, project_id=project_id, title=title, description=description,
            start_date=start_date, due_date=due_date,
        )
        self._db.add(milestone)
        self._db.flush()
        CollaborationService(self._db, company_id=company_id).record_activity(
            ENTITY_TYPE_PROJECT, project_id, "milestone_added", performed_by=actor_id, new_value=title,
        )
        return milestone

    def update_milestone(self, milestone: CrmMilestone, *, actor_id: Optional[str] = None, **patch) -> CrmMilestone:
        was_open = milestone.status != "completed"
        for key, value in patch.items():
            if value is not None:
                setattr(milestone, key, value)
        self._db.flush()
        if was_open and milestone.status == "completed":
            CollaborationService(self._db, company_id=milestone.company_id).record_activity(
                ENTITY_TYPE_PROJECT, milestone.project_id, "milestone_completed", performed_by=actor_id, new_value=milestone.title,
            )
        return milestone

    # ── Project members ──────────────────────────────────────────────────────

    def list_members(self, project_id: str, *, company_id: str = "default") -> list[CrmProjectMember]:
        return (
            self._db.query(CrmProjectMember)
            .filter(CrmProjectMember.company_id == company_id, CrmProjectMember.project_id == project_id)
            .order_by(CrmProjectMember.created_at.asc())
            .all()
        )

    def add_member(
        self,
        *,
        company_id: str = "default",
        project_id: str,
        user_id: str,
        role: str = "member",
        actor_id: Optional[str] = None,
    ) -> CrmProjectMember:
        # 404s if the project doesn't exist or belongs to another company.
        self.get_project(project_id, company_id=company_id)
        existing = (
            self._db.query(CrmProjectMember)
            .filter(
                CrmProjectMember.company_id == company_id,
                CrmProjectMember.project_id == project_id,
                CrmProjectMember.user_id == user_id,
            )
            .first()
        )
        if existing:
            return existing
        member = CrmProjectMember(company_id=company_id, project_id=project_id, user_id=user_id, role=role)
        self._db.add(member)
        self._db.flush()
        CollaborationService(self._db, company_id=company_id).record_activity(
            ENTITY_TYPE_PROJECT, project_id, "member_added", performed_by=actor_id, new_value=user_id,
        )
        return member

    def remove_member(self, project_id: str, user_id: str, *, company_id: str = "default") -> bool:
        member = (
            self._db.query(CrmProjectMember)
            .filter(
                CrmProjectMember.company_id == company_id,
                CrmProjectMember.project_id == project_id,
                CrmProjectMember.user_id == user_id,
            )
            .first()
        )
        if not member:
            return False
        self._db.delete(member)
        self._db.flush()
        return True

    # ── Customer feedback ────────────────────────────────────────────────────

    def list_feedback(self, project_id: str, *, company_id: str = "default") -> list[CrmProjectFeedback]:
        return (
            self._db.query(CrmProjectFeedback)
            .filter(CrmProjectFeedback.company_id == company_id, CrmProjectFeedback.project_id == project_id)
            .order_by(CrmProjectFeedback.created_at.desc())
            .all()
        )

    def add_feedback(
        self,
        *,
        company_id: str = "default",
        project_id: str,
        rating: int,
        comment: Optional[str] = None,
        submitted_by_name: Optional[str] = None,
        actor_id: Optional[str] = None,
    ) -> CrmProjectFeedback:
        # 404s if the project doesn't exist or belongs to another company.
        self.get_project(project_id, company_id=company_id)
        row = CrmProjectFeedback(
            company_id=company_id, project_id=project_id, rating=rating, comment=comment,
            submitted_by_name=submitted_by_name,
        )
        self._db.add(row)
        self._db.flush()
        CollaborationService(self._db, company_id=company_id).record_activity(
            ENTITY_TYPE_PROJECT, project_id, "feedback_added", performed_by=actor_id, new_value=f"{rating}/5",
        )
        return row

    # ── Time entries ─────────────────────────────────────────────────────────

    def list_time_entries(self, project_id: str, *, company_id: str = "default") -> list[CrmTimeEntry]:
        return (
            self._db.query(CrmTimeEntry)
            .filter(CrmTimeEntry.company_id == company_id, CrmTimeEntry.project_id == project_id)
            .order_by(CrmTimeEntry.entry_date.desc(), CrmTimeEntry.created_at.desc())
            .all()
        )

    def create_time_entry(
        self,
        *,
        company_id: str = "default",
        project_id: str,
        task_id: Optional[str] = None,
        user_id: Optional[str] = None,
        hours: Decimal,
        entry_date: date,
        note: Optional[str] = None,
    ) -> CrmTimeEntry:
        # 404s if the project doesn't exist or belongs to another company.
        self.get_project(project_id, company_id=company_id)
        entry = CrmTimeEntry(
            company_id=company_id, project_id=project_id, task_id=task_id, user_id=user_id,
            hours=hours, entry_date=entry_date, note=note,
        )
        self._db.add(entry)
        self._db.flush()
        CollaborationService(self._db, company_id=company_id).record_activity(
            ENTITY_TYPE_PROJECT, project_id, "time_logged", performed_by=user_id, new_value=f"{hours}h",
        )
        return entry

    def get_time_entry(self, entry_id: str, *, company_id: str = "default") -> CrmTimeEntry:
        entry = self._db.get(CrmTimeEntry, entry_id)
        if not entry or entry.company_id != company_id:
            raise HTTPException(status_code=404, detail="Time entry not found")
        return entry

    def delete_time_entry(self, entry: CrmTimeEntry) -> None:
        self._db.delete(entry)
        self._db.flush()

    # ── Tasks ────────────────────────────────────────────────────────────────

    def list_tasks(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        assignee_id: Optional[str] = None,
        project_id: Optional[str] = None,
        related_type: Optional[str] = None,
        related_id: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> tuple[list[CrmTask], int]:
        query = self._db.query(CrmTask).filter(CrmTask.company_id == company_id)
        if status:
            query = query.filter(CrmTask.status == status)
        if assignee_id:
            query = query.filter(CrmTask.assignee_id == assignee_id)
        if project_id:
            query = query.filter(CrmTask.project_id == project_id)
        if related_type:
            query = query.filter(CrmTask.related_type == related_type)
        if related_id:
            query = query.filter(CrmTask.related_id == related_id)
        total = query.count()
        rows = (
            query.order_by(CrmTask.due_date.asc().nulls_last(), CrmTask.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return rows, total

    def get_task(self, task_id: str, *, company_id: str = "default") -> CrmTask:
        task = self._db.get(CrmTask, task_id)
        if not task or task.company_id != company_id:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

    def create_task(
        self,
        *,
        company_id: str = "default",
        title: str,
        description: Optional[str] = None,
        project_id: Optional[str] = None,
        milestone_id: Optional[str] = None,
        related_type: Optional[str] = None,
        related_id: Optional[str] = None,
        priority: str = "medium",
        points: int = 1,
        start_date: Optional[date] = None,
        due_date: Optional[date] = None,
        assignee_id: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> CrmTask:
        task = CrmTask(
            company_id=company_id,
            title=title,
            description=description,
            project_id=project_id,
            milestone_id=milestone_id,
            related_type=related_type,
            related_id=related_id,
            status="todo",
            priority=priority,
            points=points,
            start_date=start_date,
            due_date=due_date,
            assignee_id=assignee_id,
        )
        self._db.add(task)
        self._db.flush()
        collab = CollaborationService(self._db, company_id=company_id)
        collab.ensure_ownership(ENTITY_TYPE_TASK, task.id, created_by=created_by, assigned_to=assignee_id)
        collab.record_activity(ENTITY_TYPE_TASK, task.id, "created", performed_by=created_by)
        return task

    def update_task(self, task: CrmTask, *, actor_id: Optional[str] = None, **patch) -> CrmTask:
        status = patch.get("status")
        if status is not None and status not in TASK_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unknown task status {status}")
        old_status = task.status
        old_assignee = task.assignee_id
        changed: list[str] = []
        for key, value in patch.items():
            if value is not None and getattr(task, key, None) != value:
                setattr(task, key, value)
                changed.append(key)
        if status == "done" and task.completed_at is None:
            task.completed_at = datetime.utcnow()
        elif status is not None and status != "done":
            task.completed_at = None
        self._db.flush()
        if changed:
            collab = CollaborationService(self._db, company_id=task.company_id)
            if "status" in changed:
                collab.record_activity(
                    ENTITY_TYPE_TASK, task.id, "status_changed",
                    performed_by=actor_id, old_value=old_status, new_value=task.status,
                )
            if "assignee_id" in changed:
                collab.update_ownership(ENTITY_TYPE_TASK, task.id, assigned_to=task.assignee_id)
                collab.record_activity(
                    ENTITY_TYPE_TASK, task.id, "assignment",
                    performed_by=actor_id, old_value=old_assignee, new_value=task.assignee_id,
                )
            other_fields = [f for f in changed if f not in ("status", "assignee_id")]
            if other_fields:
                collab.record_activity(
                    ENTITY_TYPE_TASK, task.id, "updated", performed_by=actor_id, details={"fields": other_fields}
                )
        return task

    def complete_task(self, task: CrmTask) -> CrmTask:
        task.status = "done"
        task.completed_at = datetime.utcnow()
        self._db.flush()
        return task

    def delete_task(self, task: CrmTask) -> None:
        self._db.delete(task)
        self._db.flush()

    def start_task_timer(self, task: CrmTask) -> CrmTask:
        if task.timer_started_at is None:
            task.timer_started_at = datetime.utcnow()
            self._db.flush()
        return task

    def stop_task_timer(self, task: CrmTask) -> CrmTask:
        if task.timer_started_at is not None:
            elapsed = (datetime.utcnow() - task.timer_started_at).total_seconds()
            task.total_time_seconds += max(0, int(elapsed))
            task.timer_started_at = None
            self._db.flush()
        return task

    # ── Task collaborators ───────────────────────────────────────────────────

    def list_task_collaborators(self, task_id: str, *, company_id: str = "default") -> list[CrmTaskCollaborator]:
        return (
            self._db.query(CrmTaskCollaborator)
            .filter(CrmTaskCollaborator.company_id == company_id, CrmTaskCollaborator.task_id == task_id)
            .order_by(CrmTaskCollaborator.created_at.asc())
            .all()
        )

    def add_task_collaborator(
        self, task_id: str, user_id: str, *, company_id: str = "default",
    ) -> CrmTaskCollaborator:
        # 404s if the task doesn't exist or belongs to another company.
        self.get_task(task_id, company_id=company_id)
        existing = (
            self._db.query(CrmTaskCollaborator)
            .filter(
                CrmTaskCollaborator.company_id == company_id,
                CrmTaskCollaborator.task_id == task_id,
                CrmTaskCollaborator.user_id == user_id,
            )
            .first()
        )
        if existing:
            return existing
        row = CrmTaskCollaborator(company_id=company_id, task_id=task_id, user_id=user_id)
        self._db.add(row)
        self._db.flush()
        return row

    def remove_task_collaborator(self, task_id: str, user_id: str, *, company_id: str = "default") -> bool:
        row = (
            self._db.query(CrmTaskCollaborator)
            .filter(
                CrmTaskCollaborator.company_id == company_id,
                CrmTaskCollaborator.task_id == task_id,
                CrmTaskCollaborator.user_id == user_id,
            )
            .first()
        )
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True

    # ── Task checklist ───────────────────────────────────────────────────────

    def list_task_checklist_items(self, task_id: str, *, company_id: str = "default") -> list[CrmTaskChecklistItem]:
        return (
            self._db.query(CrmTaskChecklistItem)
            .filter(CrmTaskChecklistItem.company_id == company_id, CrmTaskChecklistItem.task_id == task_id)
            .order_by(CrmTaskChecklistItem.sort_order.asc(), CrmTaskChecklistItem.created_at.asc())
            .all()
        )

    def add_task_checklist_item(
        self, task_id: str, text: str, *, company_id: str = "default",
    ) -> CrmTaskChecklistItem:
        # 404s if the task doesn't exist or belongs to another company.
        self.get_task(task_id, company_id=company_id)
        next_order = (
            self._db.query(func.coalesce(func.max(CrmTaskChecklistItem.sort_order), -1))
            .filter(CrmTaskChecklistItem.task_id == task_id)
            .scalar()
        ) + 1
        row = CrmTaskChecklistItem(company_id=company_id, task_id=task_id, text=text, sort_order=next_order)
        self._db.add(row)
        self._db.flush()
        return row

    def get_task_checklist_item(self, item_id: str, *, company_id: str = "default") -> CrmTaskChecklistItem:
        row = self._db.get(CrmTaskChecklistItem, item_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Checklist item not found")
        return row

    def update_task_checklist_item(self, item: CrmTaskChecklistItem, **patch) -> CrmTaskChecklistItem:
        for key, value in patch.items():
            if value is not None:
                setattr(item, key, value)
        self._db.flush()
        return item

    def delete_task_checklist_item(self, item: CrmTaskChecklistItem) -> None:
        self._db.delete(item)
        self._db.flush()

    # ── Support tickets ──────────────────────────────────────────────────────

    def list_tickets(
        self,
        *,
        company_id: str = "default",
        status: Optional[str] = None,
        priority: Optional[str] = None,
        customer_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[CrmTicket], int]:
        query = self._db.query(CrmTicket).filter(CrmTicket.company_id == company_id)
        if status:
            query = query.filter(CrmTicket.status == status)
        if priority:
            query = query.filter(CrmTicket.priority == priority)
        if customer_id:
            query = query.filter(CrmTicket.customer_id == customer_id)
        if search:
            like = f"%{search}%"
            query = query.filter(
                (CrmTicket.subject.ilike(like))
                | (CrmTicket.ticket_number.ilike(like))
                | (CrmTicket.contact_name.ilike(like))
            )
        total = query.count()
        rows = query.order_by(CrmTicket.created_at.desc()).offset(offset).limit(limit).all()
        return rows, total

    def get_ticket(self, ticket_id: str, *, company_id: str = "default") -> CrmTicket:
        ticket = self._db.get(CrmTicket, ticket_id)
        if not ticket or ticket.company_id != company_id:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return ticket

    def create_ticket(
        self,
        *,
        company_id: str = "default",
        subject: str,
        description: Optional[str] = None,
        customer_id: Optional[str] = None,
        contact_name: Optional[str] = None,
        contact_email: Optional[str] = None,
        contact_phone: Optional[str] = None,
        category: str = "general",
        priority: str = "medium",
        assignee_id: Optional[str] = None,
    ) -> CrmTicket:
        ticket = CrmTicket(
            company_id=company_id,
            ticket_number=self._next_ticket_number(company_id),
            subject=subject,
            description=description,
            customer_id=customer_id,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            category=category,
            priority=priority,
            status="open",
            assignee_id=assignee_id,
        )
        self._db.add(ticket)
        self._db.flush()
        return ticket

    def update_ticket(self, ticket: CrmTicket, **patch) -> CrmTicket:
        for key, value in patch.items():
            if value is not None:
                setattr(ticket, key, value)
        self._db.flush()
        return ticket

    def transition_ticket_status(self, ticket: CrmTicket, status: str) -> CrmTicket:
        if status not in TICKET_STATUSES:
            raise HTTPException(status_code=400, detail=f"Unknown ticket status {status}")
        allowed = TICKET_STATUS_TRANSITIONS.get(ticket.status, frozenset())
        if status not in allowed:
            raise HTTPException(status_code=400, detail=f"Cannot move ticket from {ticket.status} to {status}")
        ticket.status = status
        now = datetime.utcnow()
        if status == "resolved":
            ticket.resolved_at = now
        elif status == "closed":
            ticket.closed_at = now
        self._db.flush()
        return ticket

    def _next_ticket_number(self, company_id: str) -> str:
        return allocate_number(
            self._db,
            company_id,
            "crm.ticket",
            initial=lambda: (
                self._db.query(func.count(CrmTicket.id))
                .filter(CrmTicket.company_id == company_id)
                .scalar()
                or 0
            )
            + 1,
        )

    # ── Dashboard ────────────────────────────────────────────────────────────

    def get_dashboard(self, company_id: str = "default") -> dict:
        open_leads = (
            self._db.query(func.count(CrmLead.id))
            .filter(CrmLead.company_id == company_id, CrmLead.status.in_(("new", "contacted", "qualified")))
            .scalar()
        ) or 0

        pipeline_value = (
            self._db.query(func.coalesce(func.sum(CrmDeal.value), 0))
            .filter(CrmDeal.company_id == company_id, CrmDeal.stage.notin_(("won", "lost")))
            .scalar()
        )
        month_start = date.today().replace(day=1)
        won_this_month = (
            self._db.query(func.coalesce(func.sum(CrmDeal.value), 0))
            .filter(CrmDeal.company_id == company_id, CrmDeal.stage == "won", CrmDeal.closed_at >= month_start)
            .scalar()
        )
        open_deals_count = (
            self._db.query(func.count(CrmDeal.id))
            .filter(CrmDeal.company_id == company_id, CrmDeal.stage.notin_(("won", "lost")))
            .scalar()
        ) or 0

        active_projects = (
            self._db.query(func.count(CrmProject.id))
            .filter(CrmProject.company_id == company_id, CrmProject.status.in_(("planning", "active", "on_hold")))
            .scalar()
        ) or 0

        open_tasks = (
            self._db.query(func.count(CrmTask.id))
            .filter(CrmTask.company_id == company_id, CrmTask.status.in_(("todo", "in_progress")))
            .scalar()
        ) or 0
        overdue_tasks = (
            self._db.query(func.count(CrmTask.id))
            .filter(
                CrmTask.company_id == company_id,
                CrmTask.status.in_(("todo", "in_progress")),
                CrmTask.due_date.isnot(None),
                CrmTask.due_date < date.today(),
            )
            .scalar()
        ) or 0

        open_tickets = (
            self._db.query(func.count(CrmTicket.id))
            .filter(CrmTicket.company_id == company_id, CrmTicket.status.in_(("open", "in_progress", "waiting_on_customer")))
            .scalar()
        ) or 0

        recent_leads, _ = self.list_leads(company_id=company_id, limit=5)
        recent_deals, _ = self.list_deals(company_id=company_id, limit=5)
        recent_tasks, _ = self.list_tasks(company_id=company_id, status="todo", limit=5)
        recent_tickets, _ = self.list_tickets(company_id=company_id, limit=5)

        return {
            "open_leads_count": open_leads,
            "open_deals_count": open_deals_count,
            "pipeline_value": Decimal(str(pipeline_value or 0)),
            "won_this_month": Decimal(str(won_this_month or 0)),
            "active_projects_count": active_projects,
            "open_tasks_count": open_tasks,
            "overdue_tasks_count": overdue_tasks,
            "open_tickets_count": open_tickets,
            "recent_leads": recent_leads,
            "recent_deals": recent_deals,
            "recent_tasks": recent_tasks,
            "recent_tickets": recent_tickets,
        }
