from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HrmResignation(Base):
    __tablename__ = "hrm_resignations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    resignation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_working_day: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notice_period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exit_interview_conducted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exit_interview_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmPromotion(Base):
    __tablename__ = "hrm_promotions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    previous_designation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    designation_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_designations.id", ondelete="CASCADE"), nullable=True)
    promotion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    salary_adjustment: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmTermination(Base):
    __tablename__ = "hrm_terminations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    termination_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    termination_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notice_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notice_period: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_interview_conducted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exit_interview_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    exit_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmWarning(Base):
    __tablename__ = "hrm_warnings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    warning_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    warning_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    warning_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    acknowledgment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    employee_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    has_improvement_plan: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    improvement_plan_goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    improvement_plan_progress: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    improvement_plan_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    improvement_plan_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmComplaint(Base):
    __tablename__ = "hrm_complaints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    against_employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="SET NULL"), nullable=True)
    complaint_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    complaint_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    resolution_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    investigation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    follow_up_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    follow_up_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmEmployeeTransfer(Base):
    __tablename__ = "hrm_employee_transfers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    from_branch_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_branches.id", ondelete="SET NULL"), nullable=True)
    to_branch_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_branches.id", ondelete="SET NULL"), nullable=True)
    from_department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_departments.id", ondelete="SET NULL"), nullable=True)
    to_department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_departments.id", ondelete="SET NULL"), nullable=True)
    from_designation_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_designations.id", ondelete="SET NULL"), nullable=True)
    to_designation_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_designations.id", ondelete="SET NULL"), nullable=True)
    transfer_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmTrip(Base):
    __tablename__ = "hrm_trips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    purpose: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_outcomes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trip_report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    documents: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    advance_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    advance_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    total_expenses: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    reimbursement_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmTripExpense(Base):
    __tablename__ = "hrm_trip_expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    trip_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_trips.id", ondelete="CASCADE"), nullable=True)
    expense_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    expense_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal('0'))
    currency: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    receipt: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_reimbursable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
