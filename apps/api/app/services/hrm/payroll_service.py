from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.hrm.attendance import (
    HrmAttendanceRecord,
    HrmLeaveApplication,
    HrmLeaveType,
)
from app.models.hrm.org import HrmEmployee
from app.models.hrm.payroll import (
    HrmEmployeeSalary,
    HrmEmployeeSalaryComponent,
    HrmPayrollEntry,
    HrmPayrollRun,
    HrmPayslip,
    HrmSalaryComponent,
)
from app.schemas.hrm.payroll import (
    PayrollEntryRead,
    PayrollEntryUpdate,
    PayrollRunCreate,
    PayrollRunUpdate,
    PayslipRead,
)

ZERO = Decimal("0")
MONEY = Decimal("0.01")


def _money(value: Decimal | int | float | None) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(str(value)).quantize(MONEY)


def _loads(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _entry_to_read(row: HrmPayrollEntry) -> PayrollEntryRead:
    return PayrollEntryRead(
        id=row.id,
        company_id=row.company_id,
        payroll_run_id=row.payroll_run_id,
        employee_id=row.employee_id,
        basic_salary=row.basic_salary,
        component_earnings=row.component_earnings,
        total_earnings=row.total_earnings,
        total_deductions=row.total_deductions,
        gross_pay=row.gross_pay,
        net_pay=row.net_pay,
        overtime_amount=row.overtime_amount,
        per_day_salary=row.per_day_salary,
        unpaid_leave_deduction=row.unpaid_leave_deduction,
        working_days=row.working_days,
        present_days=row.present_days,
        full_present_days=row.full_present_days,
        half_days=row.half_days,
        holiday_days=row.holiday_days,
        paid_leave_days=row.paid_leave_days,
        unpaid_leave_days=row.unpaid_leave_days,
        absent_days=row.absent_days,
        overtime_hours=row.overtime_hours,
        earnings_breakdown=_loads(row.earnings_breakdown),
        deductions_breakdown=_loads(row.deductions_breakdown),
        notes=row.notes,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _weekday_count(start: date, end: date) -> int:
    n = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            n += 1
        cur += timedelta(days=1)
    return max(n, 1)


def _validate_period(
    start: Optional[date], end: Optional[date], pay_date: Optional[date]
) -> None:
    if start and end and end < start:
        raise HTTPException(
            status_code=400, detail="pay_period_end must be >= pay_period_start"
        )
    if pay_date and end and pay_date < end:
        raise HTTPException(
            status_code=400, detail="pay_date must be >= pay_period_end"
        )


def list_payroll_runs(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    status: Optional[str] = None,
) -> Tuple[list[HrmPayrollRun], int]:
    query = db.query(HrmPayrollRun).filter(HrmPayrollRun.company_id == company_id)
    if status:
        query = query.filter(HrmPayrollRun.status == status)
    total = query.count()
    rows = (
        query.order_by(HrmPayrollRun.pay_period_start.desc().nullslast())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return rows, total


def get_payroll_run(
    db: Session, run_id: str, company_id: Optional[str] = None
) -> HrmPayrollRun:
    row = db.get(HrmPayrollRun, run_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return row


def create_payroll_run(
    db: Session, payload: PayrollRunCreate, *, created_by: Optional[str]
) -> HrmPayrollRun:
    pay_date = payload.pay_date or payload.pay_period_end
    _validate_period(payload.pay_period_start, payload.pay_period_end, pay_date)
    row = HrmPayrollRun(
        company_id=payload.company_id,
        title=payload.title.strip(),
        payroll_frequency=payload.payroll_frequency,
        pay_period_start=payload.pay_period_start,
        pay_period_end=payload.pay_period_end,
        pay_date=pay_date,
        notes=payload.notes,
        status="draft",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_payroll_run(
    db: Session, run_id: str, payload: PayrollRunUpdate, *, company_id: str
) -> HrmPayrollRun:
    row = get_payroll_run(db, run_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft payroll runs can be edited")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    start = data.get("pay_period_start", row.pay_period_start)
    end = data.get("pay_period_end", row.pay_period_end)
    pay_date = data.get("pay_date", row.pay_date)
    _validate_period(start, end, pay_date)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_payroll_run(db: Session, run_id: str, *, company_id: str) -> None:
    row = get_payroll_run(db, run_id, company_id=company_id)
    if row.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft payroll runs can be deleted")
    db.delete(row)
    db.commit()


def cancel_payroll_run(db: Session, run_id: str, *, company_id: str) -> HrmPayrollRun:
    row = get_payroll_run(db, run_id, company_id=company_id)
    if row.status not in ("draft", "processing"):
        raise HTTPException(
            status_code=409, detail="Only draft/processing runs can be cancelled"
        )
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return row


def _component_amount(
    *,
    basic: Decimal,
    link: HrmEmployeeSalaryComponent,
    comp: HrmSalaryComponent,
) -> Decimal:
    if link.amount_override is not None:
        return _money(link.amount_override)
    if comp.calculation_type == "percentage":
        pct = comp.percentage_of_basic or ZERO
        return _money(basic * pct / Decimal("100"))
    return _money(comp.default_amount)


def _attendance_stats(
    db: Session,
    *,
    company_id: str,
    employee_id: str,
    start: date,
    end: date,
) -> dict[str, Any]:
    rows = (
        db.query(HrmAttendanceRecord)
        .filter(
            HrmAttendanceRecord.company_id == company_id,
            HrmAttendanceRecord.employee_id == employee_id,
            HrmAttendanceRecord.date >= start,
            HrmAttendanceRecord.date <= end,
        )
        .all()
    )
    present = ZERO
    half = ZERO
    full = 0
    holiday = 0
    absent = 0
    ot_hours = ZERO
    ot_amount = ZERO
    for r in rows:
        ot_hours += r.overtime_hours or ZERO
        ot_amount += r.overtime_amount or ZERO
        if r.is_holiday:
            holiday += 1
            present += Decimal("1")
            continue
        if r.is_absent:
            absent += 1
            continue
        if r.is_weekend:
            continue
        hours = r.total_hours or ZERO
        if hours > ZERO and hours < Decimal("4"):
            half += Decimal("1")
            present += Decimal("0.5")
        else:
            full += 1
            present += Decimal("1")
    return {
        "present_days": present,
        "half_days": half,
        "full_present_days": full,
        "holiday_days": holiday,
        "absent_days": absent,
        "overtime_hours": _money(ot_hours),
        "overtime_amount": _money(ot_amount),
    }


def _leave_stats(
    db: Session,
    *,
    company_id: str,
    employee_id: str,
    start: date,
    end: date,
) -> tuple[Decimal, Decimal]:
    rows = (
        db.query(HrmLeaveApplication, HrmLeaveType)
        .outerjoin(HrmLeaveType, HrmLeaveType.id == HrmLeaveApplication.leave_type_id)
        .filter(
            HrmLeaveApplication.company_id == company_id,
            HrmLeaveApplication.employee_id == employee_id,
            HrmLeaveApplication.status == "approved",
            HrmLeaveApplication.start_date <= end,
            HrmLeaveApplication.end_date >= start,
        )
        .all()
    )
    paid = ZERO
    unpaid = ZERO
    for app, leave_type in rows:
        days = Decimal(str(app.total_days or 0))
        if leave_type and leave_type.is_paid:
            paid += days
        else:
            unpaid += days
    return paid, unpaid


def _build_entry_for_salary(
    db: Session,
    *,
    run: HrmPayrollRun,
    salary: HrmEmployeeSalary,
    created_by: Optional[str],
) -> HrmPayrollEntry:
    assert run.pay_period_start and run.pay_period_end
    start, end = run.pay_period_start, run.pay_period_end
    basic = _money(salary.basic_salary)
    working_days = _weekday_count(start, end)
    per_day = _money(basic / Decimal(working_days)) if working_days else ZERO

    links = (
        db.query(HrmEmployeeSalaryComponent, HrmSalaryComponent)
        .join(
            HrmSalaryComponent,
            HrmSalaryComponent.id == HrmEmployeeSalaryComponent.salary_component_id,
        )
        .filter(
            HrmEmployeeSalaryComponent.employee_salary_id == salary.id,
            HrmEmployeeSalaryComponent.is_enabled.is_(True),
        )
        .all()
    )
    earnings_bd: dict[str, Any] = {"Basic": float(basic)}
    deductions_bd: dict[str, Any] = {}
    component_earnings = ZERO
    total_deductions = ZERO
    for link, comp in links:
        amount = _component_amount(basic=basic, link=link, comp=comp)
        if comp.type == "deduction":
            deductions_bd[comp.name] = float(amount)
            total_deductions += amount
        else:
            earnings_bd[comp.name] = float(amount)
            component_earnings += amount

    total_earnings = _money(basic + component_earnings)
    att = _attendance_stats(
        db,
        company_id=run.company_id,
        employee_id=salary.employee_id or "",
        start=start,
        end=end,
    )
    paid_leave, unpaid_leave = _leave_stats(
        db,
        company_id=run.company_id,
        employee_id=salary.employee_id or "",
        start=start,
        end=end,
    )
    unpaid_deduction = _money(per_day * unpaid_leave)
    overtime_amount = att["overtime_amount"]
    gross = _money(total_earnings - unpaid_deduction + overtime_amount)
    net = _money(gross - total_deductions)

    return HrmPayrollEntry(
        company_id=run.company_id,
        payroll_run_id=run.id,
        employee_id=salary.employee_id,
        basic_salary=basic,
        component_earnings=_money(component_earnings),
        total_earnings=total_earnings,
        total_deductions=_money(total_deductions),
        gross_pay=gross,
        net_pay=net,
        overtime_amount=overtime_amount,
        per_day_salary=per_day,
        unpaid_leave_deduction=unpaid_deduction,
        working_days=working_days,
        present_days=att["present_days"],
        full_present_days=att["full_present_days"],
        half_days=att["half_days"],
        holiday_days=att["holiday_days"],
        paid_leave_days=paid_leave,
        unpaid_leave_days=unpaid_leave,
        absent_days=att["absent_days"],
        overtime_hours=att["overtime_hours"],
        earnings_breakdown=json.dumps(earnings_bd),
        deductions_breakdown=json.dumps(deductions_bd),
        created_by=created_by,
    )


def _reaggregate_run(db: Session, run: HrmPayrollRun) -> None:
    entries = (
        db.query(HrmPayrollEntry)
        .filter(HrmPayrollEntry.payroll_run_id == run.id)
        .all()
    )
    run.employee_count = len(entries)
    run.total_gross_pay = _money(sum((e.gross_pay for e in entries), ZERO))
    run.total_deductions = _money(sum((e.total_deductions for e in entries), ZERO))
    run.total_net_pay = _money(sum((e.net_pay for e in entries), ZERO))


def calculate_payroll_run(
    db: Session, run_id: str, *, company_id: str, created_by: Optional[str]
) -> HrmPayrollRun:
    run = get_payroll_run(db, run_id, company_id=company_id)
    if run.status not in ("draft", "processing"):
        raise HTTPException(
            status_code=409, detail="Only draft payroll runs can be calculated"
        )
    if not run.pay_period_start or not run.pay_period_end:
        raise HTTPException(status_code=400, detail="Payroll period dates are required")

    run.status = "processing"
    db.flush()

    # wipe previous entries (payslips cascade)
    existing = (
        db.query(HrmPayrollEntry)
        .filter(HrmPayrollEntry.payroll_run_id == run.id)
        .all()
    )
    for e in existing:
        db.delete(e)
    db.flush()

    salaries = (
        db.query(HrmEmployeeSalary)
        .filter(
            HrmEmployeeSalary.company_id == company_id,
            HrmEmployeeSalary.is_active.is_(True),
            HrmEmployeeSalary.employee_id.isnot(None),
        )
        .all()
    )
    if not salaries:
        raise HTTPException(
            status_code=400, detail="No active employee salaries to calculate"
        )

    for salary in salaries:
        entry = _build_entry_for_salary(
            db, run=run, salary=salary, created_by=created_by
        )
        db.add(entry)
        salary.calculation_status = "calculated"

    db.flush()
    _reaggregate_run(db, run)
    run.status = "draft"
    db.commit()
    db.refresh(run)
    return run


def _payslip_number(db: Session, *, employee: HrmEmployee, period_end: date) -> str:
    digits = re.sub(r"\D", "", employee.employee_code or "") or "0"
    suffix = digits[-4:].zfill(4)
    prefix = f"PS-{period_end.strftime('%Y%m')}-{suffix}"
    # ensure uniqueness if collision
    candidate = prefix
    n = 1
    while db.query(HrmPayslip).filter(HrmPayslip.payslip_number == candidate).first():
        n += 1
        candidate = f"{prefix}-{n}"
    return candidate


def complete_payroll_run(
    db: Session, run_id: str, *, company_id: str, created_by: Optional[str]
) -> HrmPayrollRun:
    run = get_payroll_run(db, run_id, company_id=company_id)
    if run.status != "draft":
        raise HTTPException(
            status_code=409, detail="Only draft runs with calculated entries can be completed"
        )
    entries = (
        db.query(HrmPayrollEntry)
        .filter(HrmPayrollEntry.payroll_run_id == run.id)
        .all()
    )
    if not entries:
        raise HTTPException(
            status_code=400, detail="Calculate payroll before completing the run"
        )

    for entry in entries:
        existing = (
            db.query(HrmPayslip)
            .filter(HrmPayslip.payroll_entry_id == entry.id)
            .first()
        )
        if existing:
            continue
        employee = db.get(HrmEmployee, entry.employee_id) if entry.employee_id else None
        number = None
        if employee and run.pay_period_end:
            number = _payslip_number(db, employee=employee, period_end=run.pay_period_end)
        db.add(
            HrmPayslip(
                company_id=company_id,
                payroll_entry_id=entry.id,
                employee_id=entry.employee_id,
                payslip_number=number,
                pay_period_start=run.pay_period_start,
                pay_period_end=run.pay_period_end,
                pay_date=run.pay_date,
                status="generated",
                created_by=created_by,
            )
        )

    run.status = "completed"
    db.commit()
    db.refresh(run)
    return run


# --- entries ---


def list_payroll_entries(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    payroll_run_id: Optional[str] = None,
    employee_id: Optional[str] = None,
) -> Tuple[list[PayrollEntryRead], int]:
    query = db.query(HrmPayrollEntry).filter(HrmPayrollEntry.company_id == company_id)
    if payroll_run_id:
        query = query.filter(HrmPayrollEntry.payroll_run_id == payroll_run_id)
    if employee_id:
        query = query.filter(HrmPayrollEntry.employee_id == employee_id)
    total = query.count()
    rows = (
        query.order_by(HrmPayrollEntry.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return [_entry_to_read(r) for r in rows], total


def get_payroll_entry(
    db: Session, entry_id: str, company_id: Optional[str] = None
) -> PayrollEntryRead:
    row = db.get(HrmPayrollEntry, entry_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    return _entry_to_read(row)


def update_payroll_entry(
    db: Session, entry_id: str, payload: PayrollEntryUpdate, *, company_id: str
) -> PayrollEntryRead:
    row = db.get(HrmPayrollEntry, entry_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    run = get_payroll_run(db, row.payroll_run_id, company_id=company_id) if row.payroll_run_id else None
    if run and run.status != "draft":
        raise HTTPException(
            status_code=409, detail="Entries can only be edited while the run is draft"
        )

    data = payload.model_dump(exclude_unset=True)
    if "notes" in data:
        row.notes = data["notes"]
    if "overtime_amount" in data and data["overtime_amount"] is not None:
        row.overtime_amount = _money(data["overtime_amount"])
    if "unpaid_leave_deduction" in data and data["unpaid_leave_deduction"] is not None:
        row.unpaid_leave_deduction = _money(data["unpaid_leave_deduction"])

    row.gross_pay = _money(
        row.total_earnings - row.unpaid_leave_deduction + row.overtime_amount
    )
    row.net_pay = _money(row.gross_pay - row.total_deductions)
    db.flush()
    if run:
        _reaggregate_run(db, run)
    db.commit()
    db.refresh(row)
    return _entry_to_read(row)


# --- payslips ---


def list_payslips(
    db: Session,
    *,
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    employee_id: Optional[str] = None,
    payroll_run_id: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[list[PayslipRead], int]:
    query = db.query(HrmPayslip).filter(HrmPayslip.company_id == company_id)
    if employee_id:
        query = query.filter(HrmPayslip.employee_id == employee_id)
    if status:
        query = query.filter(HrmPayslip.status == status)
    if payroll_run_id:
        query = query.join(
            HrmPayrollEntry, HrmPayrollEntry.id == HrmPayslip.payroll_entry_id
        ).filter(HrmPayrollEntry.payroll_run_id == payroll_run_id)
    total = query.count()
    rows = (
        query.order_by(HrmPayslip.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return [PayslipRead.model_validate(r) for r in rows], total


def get_payslip(
    db: Session, payslip_id: str, company_id: Optional[str] = None
) -> HrmPayslip:
    row = db.get(HrmPayslip, payslip_id)
    if not row or (company_id and row.company_id != company_id):
        raise HTTPException(status_code=404, detail="Payslip not found")
    return row


def mark_payslip_sent(
    db: Session, payslip_id: str, *, company_id: str
) -> HrmPayslip:
    row = get_payslip(db, payslip_id, company_id=company_id)
    row.status = "sent"
    row.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def mark_payslip_downloaded(
    db: Session, payslip_id: str, *, company_id: str
) -> HrmPayslip:
    row = get_payslip(db, payslip_id, company_id=company_id)
    row.status = "downloaded"
    row.downloaded_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
