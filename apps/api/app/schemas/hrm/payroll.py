from __future__ import annotations

from datetime import date as Date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PayrollRunCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=255)
    payroll_frequency: str = Field(
        default="monthly", pattern="^(weekly|biweekly|monthly)$"
    )
    pay_period_start: Date
    pay_period_end: Date
    pay_date: Optional[Date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_dates(self) -> PayrollRunCreate:
        if self.pay_period_end < self.pay_period_start:
            raise ValueError("pay_period_end must be >= pay_period_start")
        pay_date = self.pay_date or self.pay_period_end
        if pay_date < self.pay_period_end:
            raise ValueError("pay_date must be >= pay_period_end")
        return self


class PayrollRunUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    payroll_frequency: Optional[str] = Field(
        default=None, pattern="^(weekly|biweekly|monthly)$"
    )
    pay_period_start: Optional[Date] = None
    pay_period_end: Optional[Date] = None
    pay_date: Optional[Date] = None
    notes: Optional[str] = None


class PayrollRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: str
    payroll_frequency: str
    pay_period_start: Optional[Date] = None
    pay_period_end: Optional[Date] = None
    pay_date: Optional[Date] = None
    total_gross_pay: Decimal
    total_deductions: Decimal
    total_net_pay: Decimal
    employee_count: int
    status: str
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PayrollRunListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PayrollRunListResponse(BaseModel):
    data: List[PayrollRunRead]
    meta: PayrollRunListMeta
    errors: List[str] = []


class PayrollRunResponse(BaseModel):
    data: PayrollRunRead
    errors: List[str] = []


class PayrollEntryUpdate(BaseModel):
    notes: Optional[str] = None
    overtime_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    unpaid_leave_deduction: Optional[Decimal] = Field(default=None, ge=Decimal("0"))


class PayrollEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    payroll_run_id: Optional[str] = None
    employee_id: Optional[str] = None
    basic_salary: Decimal
    component_earnings: Decimal
    total_earnings: Decimal
    total_deductions: Decimal
    gross_pay: Decimal
    net_pay: Decimal
    overtime_amount: Decimal
    per_day_salary: Decimal
    unpaid_leave_deduction: Decimal
    working_days: int
    present_days: Decimal
    full_present_days: int
    half_days: Decimal
    holiday_days: int
    paid_leave_days: Decimal
    unpaid_leave_days: Decimal
    absent_days: int
    overtime_hours: Decimal
    earnings_breakdown: Dict[str, Any] = {}
    deductions_breakdown: Dict[str, Any] = {}
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PayrollEntryListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PayrollEntryListResponse(BaseModel):
    data: List[PayrollEntryRead]
    meta: PayrollEntryListMeta
    errors: List[str] = []


class PayrollEntryResponse(BaseModel):
    data: PayrollEntryRead
    errors: List[str] = []


class PayslipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    payroll_entry_id: Optional[str] = None
    employee_id: Optional[str] = None
    payslip_number: Optional[str] = None
    pay_period_start: Optional[Date] = None
    pay_period_end: Optional[Date] = None
    pay_date: Optional[Date] = None
    file_path: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    downloaded_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PayslipListMeta(BaseModel):
    count: int
    page: int
    per_page: int


class PayslipListResponse(BaseModel):
    data: List[PayslipRead]
    meta: PayslipListMeta
    errors: List[str] = []


class PayslipResponse(BaseModel):
    data: PayslipRead
    errors: List[str] = []
