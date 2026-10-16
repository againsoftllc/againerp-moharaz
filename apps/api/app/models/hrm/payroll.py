from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HrmSalaryComponent(Base):
    __tablename__ = "hrm_salary_components"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="earning")
    calculation_type: Mapped[str] = mapped_column(String(50), nullable=False, default="fixed")
    default_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    percentage_of_basic: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    is_taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmEmployeeSalary(Base):
    __tablename__ = "hrm_employee_salaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    basic_salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    components: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    calculation_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmEmployeeSalaryComponent(Base):
    __tablename__ = "hrm_employee_salary_components"
    __table_args__ = (
        UniqueConstraint("employee_salary_id", "salary_component_id", name="uq_hrm_employee_salary_components_employee_salary_id_salary_"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_salary_id: Mapped[str] = mapped_column(String(36), ForeignKey("hrm_employee_salaries.id", ondelete="CASCADE"), nullable=False)
    salary_component_id: Mapped[str] = mapped_column(String(36), ForeignKey("hrm_salary_components.id", ondelete="CASCADE"), nullable=False)
    amount_override: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmPayrollRun(Base):
    __tablename__ = "hrm_payroll_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    payroll_frequency: Mapped[str] = mapped_column(String(50), nullable=False, default="monthly")
    pay_period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal('0'))
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal('0'))
    total_net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal('0'))
    employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmPayrollEntry(Base):
    __tablename__ = "hrm_payroll_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    payroll_run_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_payroll_runs.id", ondelete="CASCADE"), nullable=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    basic_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    component_earnings: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    total_earnings: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    net_pay: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    overtime_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    per_day_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    unpaid_leave_deduction: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal('0'))
    working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    present_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    full_present_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    half_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    holiday_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paid_leave_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    unpaid_leave_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    absent_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal('0'))
    earnings_breakdown: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    deductions_breakdown: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmPayslip(Base):
    __tablename__ = "hrm_payslips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    payroll_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_payroll_entries.id", ondelete="CASCADE"), nullable=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    payslip_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True, unique=True)
    pay_period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    downloaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
