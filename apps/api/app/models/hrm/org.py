from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HrmBranch(Base):
    __tablename__ = "hrm_branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmDepartment(Base):
    __tablename__ = "hrm_departments"
    __table_args__ = (
        UniqueConstraint("company_id", "branch_id", "name", name="uq_hrm_departments_company_id_branch_id_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_branches.id", ondelete="CASCADE"), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmDesignation(Base):
    __tablename__ = "hrm_designations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_departments.id", ondelete="CASCADE"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmDocumentType(Base):
    __tablename__ = "hrm_document_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmEmployee(Base):
    __tablename__ = "hrm_employees"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_code", name="uq_hrm_employees_company_id_employee_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    biometric_emp_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    branch_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_branches.id", ondelete="SET NULL"), nullable=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_departments.id", ondelete="SET NULL"), nullable=True)
    designation_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_designations.id", ondelete="SET NULL"), nullable=True)
    reporting_to: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("hrm_employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    shift_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_shifts.id", ondelete="SET NULL"), nullable=True)
    attendance_policy_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_attendance_policies.id", ondelete="SET NULL"), nullable=True)
    date_of_joining: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    base_salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    employee_status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    address_line_1: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address_line_2: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emergency_contact_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_holder_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    bank_identifier_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    bank_branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tax_payer_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    marital_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shift_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    probation_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    confirmation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_working_day: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    hours_per_day: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    days_per_week: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    rate_per_hour: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    create_login: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    account_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    account_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    auth_user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True, index=True, unique=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmEmployeeDocument(Base):
    __tablename__ = "hrm_employee_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    document_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_document_types.id", ondelete="CASCADE"), nullable=True)
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmAwardType(Base):
    __tablename__ = "hrm_award_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmAward(Base):
    __tablename__ = "hrm_awards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    employee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_employees.id", ondelete="CASCADE"), nullable=True)
    award_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("hrm_award_types.id", ondelete="CASCADE"), nullable=True)
    award_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gift: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    monetary_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    certificate: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    photo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class HrmIpRestriction(Base):
    __tablename__ = "hrm_ip_restrictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
