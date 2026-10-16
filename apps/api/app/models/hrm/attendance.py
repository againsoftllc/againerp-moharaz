from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HrmLeaveType(Base):
    __tablename__ = "hrm_leave_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_days_per_year: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmLeavePolicy(Base):
    __tablename__ = "hrm_leave_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    leave_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_leave_types.id", ondelete="CASCADE"), nullable=True)
    accrual_type: Mapped[str] = mapped_column(String(50), nullable=False)
    accrual_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    carry_forward_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_days_per_application: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_days_per_application: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmLeaveApplication(Base):
    __tablename__ = "hrm_leave_applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    leave_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_leave_types.id", ondelete="CASCADE"), nullable=True)
    leave_policy_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_leave_policies.id", ondelete="CASCADE"), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    manager_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmLeaveBalance(Base):
    __tablename__ = "hrm_leave_balances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    leave_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_leave_types.id", ondelete="CASCADE"), nullable=True)
    leave_policy_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_leave_policies.id", ondelete="CASCADE"), nullable=True)
    year: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    allocated_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    used_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    remaining_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    carried_forward: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    manual_adjustment: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    adjustment_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmShift(Base):
    __tablename__ = "hrm_shifts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_time: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    break_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    break_start_time: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    break_end_time: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    grace_period: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_night_shift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmAttendancePolicy(Base):
    __tablename__ = "hrm_attendance_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    late_arrival_grace: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    early_departure_grace: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    half_day_threshold: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    overtime_rate_per_hour: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmAttendanceRecord(Base):
    __tablename__ = "hrm_attendance_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    biometric_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    shift_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_shifts.id", ondelete="SET NULL"), nullable=True)
    attendance_policy_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_attendance_policies.id", ondelete="SET NULL"), nullable=True)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    clock_in: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    clock_out: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    break_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    overtime_amount: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=Decimal('0'))
    is_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_early_departure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_absent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_holiday: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_weekend: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmAttendanceRegularization(Base):
    __tablename__ = "hrm_attendance_regularizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    attendance_record_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_attendance_records.id", ondelete="CASCADE"), nullable=True)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    requested_clock_in: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    requested_clock_out: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    original_clock_in: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    original_clock_out: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    manager_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmTimeEntry(Base):
    __tablename__ = "hrm_time_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending", index=True)
    manager_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmHoliday(Base):
    __tablename__ = "hrm_holidays"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_half_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmHolidayBranch(Base):
    __tablename__ = "hrm_holiday_branches"
    __table_args__ = (
        UniqueConstraint("holiday_id", "branch_id", name="uq_hrm_holiday_branches_holiday_id_branch_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    holiday_id: Mapped[str] = mapped_column(String(36), ForeignKey("hrm_holidays.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(36), ForeignKey("hrm_branches.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
