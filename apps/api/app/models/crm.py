"""CRM foundation — Leads, Deals, Projects, Tasks, Support Tickets."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CrmLead(Base):
    """A pre-qualification prospect — not yet a customer or deal."""

    __tablename__ = "crm_leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    alternate_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    source: Mapped[str] = mapped_column(String(24), nullable=False, default="other")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new", index=True)
    estimated_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True, index=True)
    department: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Foundation for future AI scoring — a plain int today, model-agnostic.
    lead_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Set together when the lead moves to "qualified" (see qualify_lead()).
    qual_business_need: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qual_budget: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    qual_timeline: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    qual_decision_maker: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    qual_requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Single "what's next" pointer — kept on the row (not a child table) so
    # list-page filters like "follow-up today/overdue" stay a plain indexed
    # WHERE clause. Each schedule/complete/reschedule is still logged to the
    # generic collaboration Activity feed for full history.
    next_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    next_follow_up_type: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    next_follow_up_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    converted_deal_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lost_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    lost_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CrmDeal(Base):
    """A sales opportunity being pursued — before it becomes a confirmed sales order."""

    __tablename__ = "crm_deals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    lead_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    # Denormalized so the card still reads correctly if no customer/lead is linked yet.
    contact_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    contact_company: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)

    stage: Mapped[str] = mapped_column(String(20), nullable=False, default="new", index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    probability: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    expected_close_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    lost_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CrmProject(Base):
    """Client-facing (or internal) delivery project, optionally born from a won deal."""

    __tablename__ = "crm_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    deal_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("crm_deals.id", ondelete="SET NULL"), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planning", index=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CrmProjectMember(Base):
    """A user granted visibility/involvement on a project beyond its single owner."""

    __tablename__ = "crm_project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_crm_project_members_project_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class CrmProjectFeedback(Base):
    """Client satisfaction feedback captured against a project."""

    __tablename__ = "crm_project_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class CrmMilestone(Base):
    """A dated checkpoint within a project — groups tasks toward a sub-goal."""

    __tablename__ = "crm_milestones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_projects.id", ondelete="CASCADE"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CrmTask(Base):
    """A single actionable item — standalone, or hung off a project/lead/deal/ticket."""

    __tablename__ = "crm_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("crm_projects.id", ondelete="CASCADE"), nullable=True, index=True)
    milestone_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("crm_milestones.id", ondelete="SET NULL"), nullable=True, index=True)

    # Generic link to any other CRM record (lead/deal/ticket) when not project work.
    related_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    related_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo", index=True)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    # Relative effort estimate (AgainCRM's "Points") — a plain int, no story-point ceremony implied.
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)

    # Simple start/stop timer — independent of CrmTimeEntry (which requires a project_id
    # and is for manual logging), so it works on standalone tasks too.
    timer_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    total_time_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CrmTaskCollaborator(Base):
    """A user given visibility on a task beyond its single assignee."""

    __tablename__ = "crm_task_collaborators"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_crm_task_collaborators_task_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class CrmTimeEntry(Base):
    """Hours logged against a project, optionally against one task within it."""

    __tablename__ = "crm_time_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("crm_tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)

    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class CrmTaskChecklistItem(Base):
    """A single checkable line item within a task's checklist."""

    __tablename__ = "crm_task_checklist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(String(255), nullable=False)
    is_checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class CrmTicket(Base):
    """A general customer-support ticket — not warranty/returns (see RMA for that)."""

    __tablename__ = "crm_tickets"
    __table_args__ = (
        UniqueConstraint("company_id", "ticket_number", name="uq_crm_ticket_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    ticket_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    category: Mapped[str] = mapped_column(String(20), nullable=False, default="general")
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="open", index=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)

    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
