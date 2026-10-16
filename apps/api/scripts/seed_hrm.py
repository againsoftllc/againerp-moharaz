"""Seed the HRM module with a small, coherent demo organisation.

The HRM API and screens were fully wired but every table was empty, so every
HRM page rendered a blank state. This creates enough linked data — branches →
departments → designations → employees, plus the masters those screens filter
on — for the module to be usable and demoable.

Idempotent: re-running only fills what is missing, matched on natural keys.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Callable, Optional, TypeVar

from sqlalchemy.orm import Session

from app.models.hrm.attendance import (
    HrmAttendancePolicy,
    HrmHoliday,
    HrmLeavePolicy,
    HrmLeaveType,
    HrmShift,
)
from app.models.hrm.meetings import HrmAnnouncement
from app.models.hrm.org import (
    HrmAward,
    HrmAwardType,
    HrmBranch,
    HrmDepartment,
    HrmDesignation,
    HrmDocumentType,
    HrmEmployee,
)
from app.models.hrm.recruitment import (
    HrmCandidateSource,
    HrmInterviewType,
    HrmJobCategory,
    HrmJobLocation,
    HrmJobType,
)

COMPANY = "default"
T = TypeVar("T")


def _get_or_create(
    db: Session, model: type[T], *, match: dict[str, Any], defaults: dict[str, Any]
) -> tuple[T, bool]:
    row = db.query(model).filter_by(**match).first()
    if row:
        return row, False
    row = model(**match, **defaults)
    db.add(row)
    db.flush()
    return row, True


def seed_hrm(db: Session) -> dict[str, int]:
    created: dict[str, int] = {}

    def count(key: str, made: bool) -> None:
        created[key] = created.get(key, 0) + (1 if made else 0)

    # ------------------------------------------------------------ branches
    branch_rows = [
        ("Dhaka Head Office", "Gulshan-2, Dhaka", "Dhaka", "+880 1711-200001", "dhaka@againerp.local"),
        ("Chittagong Branch", "Agrabad C/A, Chittagong", "Chittagong", "+880 1711-200002", "ctg@againerp.local"),
        ("Sylhet Branch", "Zindabazar, Sylhet", "Sylhet", "+880 1711-200003", "sylhet@againerp.local"),
    ]
    branches: dict[str, HrmBranch] = {}
    for name, address, city, phone, email in branch_rows:
        row, made = _get_or_create(
            db,
            HrmBranch,
            match={"company_id": COMPANY, "name": name},
            defaults={
                "address": address,
                "city": city,
                "country": "Bangladesh",
                "phone": phone,
                "email": email,
                "status": "active",
            },
        )
        branches[name] = row
        count("branches", made)

    hq = branches["Dhaka Head Office"]

    # --------------------------------------------------------- departments
    dept_rows = [
        ("Engineering", hq, "Product and platform development"),
        ("Sales", hq, "Field and inside sales"),
        ("Finance", hq, "Accounts, payroll, and compliance"),
        ("Human Resources", hq, "People operations and recruitment"),
        ("Operations", branches["Chittagong Branch"], "Warehouse and logistics"),
        ("Customer Support", branches["Sylhet Branch"], "Post-sales support desk"),
    ]
    departments: dict[str, HrmDepartment] = {}
    for name, branch, description in dept_rows:
        row, made = _get_or_create(
            db,
            HrmDepartment,
            match={"company_id": COMPANY, "name": name},
            defaults={"branch_id": branch.id, "description": description, "status": "active"},
        )
        departments[name] = row
        count("departments", made)

    # -------------------------------------------------------- designations
    desig_rows = [
        ("Head of Engineering", "Engineering"),
        ("Senior Software Engineer", "Engineering"),
        ("Software Engineer", "Engineering"),
        ("QA Engineer", "Engineering"),
        ("Sales Manager", "Sales"),
        ("Sales Executive", "Sales"),
        ("Accountant", "Finance"),
        ("HR Manager", "Human Resources"),
        ("HR Executive", "Human Resources"),
        ("Warehouse Supervisor", "Operations"),
        ("Support Agent", "Customer Support"),
    ]
    designations: dict[str, HrmDesignation] = {}
    for name, dept in desig_rows:
        row, made = _get_or_create(
            db,
            HrmDesignation,
            match={"company_id": COMPANY, "name": name},
            defaults={"department_id": departments[dept].id, "status": "active"},
        )
        designations[name] = row
        count("designations", made)

    # --------------------------------------------------------------- shifts
    shift_rows = [
        ("General Shift", "09:00", "18:00", 60, False),
        ("Morning Shift", "07:00", "15:00", 45, False),
        ("Night Shift", "22:00", "06:00", 45, True),
    ]
    shifts: dict[str, HrmShift] = {}
    for name, start, end, brk, night in shift_rows:
        row, made = _get_or_create(
            db,
            HrmShift,
            match={"company_id": COMPANY, "name": name},
            defaults={
                "start_time": start,
                "end_time": end,
                "break_duration": brk,
                "grace_period": 10,
                "is_night_shift": night,
                "status": "active",
            },
        )
        shifts[name] = row
        count("shifts", made)

    # ---------------------------------------------------- attendance policy
    policy, made = _get_or_create(
        db,
        HrmAttendancePolicy,
        match={"company_id": COMPANY, "name": "Standard Attendance Policy"},
        defaults={
            "description": "10 minute grace, half day under 4 hours, overtime paid hourly.",
            "late_arrival_grace": 10,
            "early_departure_grace": 10,
            "half_day_threshold": Decimal("4.00"),
            "overtime_rate_per_hour": Decimal("150.00"),
            "status": "active",
        },
    )
    count("attendance_policies", made)

    # ---------------------------------------------------------- leave types
    leave_rows = [
        ("Casual Leave", 10, True, "#3B5BDB"),
        ("Sick Leave", 14, True, "#E03131"),
        ("Earned Leave", 20, True, "#0CA678"),
        ("Maternity Leave", 112, True, "#AE3EC9"),
        ("Unpaid Leave", 30, False, "#868E96"),
    ]
    leave_types: dict[str, HrmLeaveType] = {}
    for name, days, paid, color in leave_rows:
        row, made = _get_or_create(
            db,
            HrmLeaveType,
            match={"company_id": COMPANY, "name": name},
            defaults={
                "max_days_per_year": days,
                "is_paid": paid,
                "color": color,
                "status": "active",
            },
        )
        leave_types[name] = row
        count("leave_types", made)

    # ------------------------------------------------------ leave policies
    policy_rows = [
        ("Casual Leave — Monthly Accrual", "Casual Leave", "monthly", Decimal("0.83"), 5, 3),
        ("Sick Leave — Yearly Grant", "Sick Leave", "yearly", Decimal("14.00"), 0, 7),
        ("Earned Leave — Monthly Accrual", "Earned Leave", "monthly", Decimal("1.67"), 10, 15),
    ]
    for name, leave_type, accrual, rate, carry, max_days in policy_rows:
        _, made = _get_or_create(
            db,
            HrmLeavePolicy,
            match={"company_id": COMPANY, "name": name},
            defaults={
                "description": "Applies to confirmed full-time employees.",
                "leave_type_id": leave_types[leave_type].id,
                "accrual_type": accrual,
                "accrual_rate": rate,
                "carry_forward_limit": carry,
                "min_days_per_application": 1,
                "max_days_per_application": max_days,
                "requires_approval": True,
                "status": "active",
            },
        )
        count("leave_policies", made)

    # ------------------------------------------------------------ holidays
    year = date.today().year
    holiday_rows = [
        ("International Mother Language Day", date(year, 2, 21), "national"),
        ("Independence Day", date(year, 3, 26), "national"),
        ("Bengali New Year", date(year, 4, 14), "festival"),
        ("May Day", date(year, 5, 1), "national"),
        ("Victory Day", date(year, 12, 16), "national"),
    ]
    for name, day, category in holiday_rows:
        _, made = _get_or_create(
            db,
            HrmHoliday,
            match={"company_id": COMPANY, "name": name},
            defaults={
                "start_date": day,
                "end_date": day,
                "category": category,
                "is_recurring": True,
                "is_paid": True,
            },
        )
        count("holidays", made)

    # ------------------------------------------------------ document types
    for name, required in [
        ("National ID", True),
        ("Passport", False),
        ("Academic Certificate", True),
        ("Experience Letter", False),
        ("Bank Statement", False),
    ]:
        _, made = _get_or_create(
            db,
            HrmDocumentType,
            match={"company_id": COMPANY, "name": name},
            defaults={"is_required": required},
        )
        count("document_types", made)

    # ----------------------------------------------------------- employees
    employee_rows = [
        ("EMP-0001", "Rahim Uddin", "rahim@againerp.local", "Head of Engineering", "Engineering",
         hq, "General Shift", date(2021, 3, 1), Decimal("180000"), "male"),
        ("EMP-0002", "Sadia Rahman", "sadia@againerp.local", "Senior Software Engineer", "Engineering",
         hq, "General Shift", date(2022, 7, 15), Decimal("120000"), "female"),
        ("EMP-0003", "Tanvir Hasan", "tanvir@againerp.local", "Software Engineer", "Engineering",
         hq, "General Shift", date(2023, 9, 1), Decimal("85000"), "male"),
        ("EMP-0004", "Nusrat Jahan", "nusrat@againerp.local", "QA Engineer", "Engineering",
         hq, "Morning Shift", date(2024, 1, 8), Decimal("70000"), "female"),
        ("EMP-0005", "Karim Ahmed", "karim@againerp.local", "Sales Manager", "Sales",
         hq, "General Shift", date(2021, 11, 1), Decimal("140000"), "male"),
        ("EMP-0006", "Farhana Akter", "farhana@againerp.local", "Sales Executive", "Sales",
         hq, "General Shift", date(2023, 4, 20), Decimal("65000"), "female"),
        ("EMP-0007", "Imran Chowdhury", "imran@againerp.local", "Accountant", "Finance",
         hq, "General Shift", date(2022, 2, 14), Decimal("90000"), "male"),
        ("EMP-0008", "Mahmuda Khatun", "mahmuda@againerp.local", "HR Manager", "Human Resources",
         hq, "General Shift", date(2020, 6, 1), Decimal("130000"), "female"),
        ("EMP-0009", "Shakil Mia", "shakil@againerp.local", "Warehouse Supervisor", "Operations",
         branches["Chittagong Branch"], "Morning Shift", date(2023, 8, 5), Decimal("60000"), "male"),
        ("EMP-0010", "Rubel Hossain", "rubel@againerp.local", "Support Agent", "Customer Support",
         branches["Sylhet Branch"], "Night Shift", date(2024, 5, 12), Decimal("45000"), "male"),
    ]

    employees: dict[str, HrmEmployee] = {}
    for code, name, email, desig, dept, branch, shift, joined, salary, gender in employee_rows:
        row, made = _get_or_create(
            db,
            HrmEmployee,
            match={"company_id": COMPANY, "employee_code": code},
            defaults={
                "name": name,
                "email": email,
                "phone": f"+880 17{code[-4:]}0000",
                "gender": gender,
                "branch_id": branch.id,
                "department_id": departments[dept].id,
                "designation_id": designations[desig].id,
                "shift_id": shifts[shift].id,
                "attendance_policy_id": policy.id,
                "date_of_joining": joined,
                "base_salary": salary,
                "employment_type": "full_time",
                "employee_status": "active",
                "city": branch.city,
                "country": "Bangladesh",
            },
        )
        employees[code] = row
        count("employees", made)

        # The seed runs on every boot, so it also repairs links that were lost —
        # branch/department/designation FKs are ON DELETE SET NULL, and a master
        # row being replaced leaves existing employees pointing at nothing.
        if not made:
            for field, value in (
                ("branch_id", branch.id),
                ("department_id", departments[dept].id),
                ("designation_id", designations[desig].id),
                ("shift_id", shifts[shift].id),
                ("attendance_policy_id", policy.id),
            ):
                if getattr(row, field) is None:
                    setattr(row, field, value)
                    count("relinked", True)

    # Reporting lines, set after everyone exists.
    reports_to = {
        "EMP-0002": "EMP-0001",
        "EMP-0003": "EMP-0001",
        "EMP-0004": "EMP-0001",
        "EMP-0006": "EMP-0005",
        "EMP-0009": "EMP-0005",
        "EMP-0010": "EMP-0008",
    }
    for staff, manager in reports_to.items():
        if employees[staff].reporting_to is None:
            employees[staff].reporting_to = employees[manager].id

    # -------------------------------------------------------- award types
    award_types: dict[str, HrmAwardType] = {}
    for name, description in [
        ("Employee of the Month", "Outstanding contribution in a calendar month"),
        ("Long Service Award", "Five or more years with the company"),
        ("Innovation Award", "Idea that measurably improved how we work"),
    ]:
        row, made = _get_or_create(
            db,
            HrmAwardType,
            match={"company_id": COMPANY, "name": name},
            defaults={"description": description, "status": "active"},
        )
        award_types[name] = row
        count("award_types", made)

    for code, award_name, days_ago in [
        ("EMP-0002", "Employee of the Month", 30),
        ("EMP-0005", "Innovation Award", 75),
        ("EMP-0008", "Long Service Award", 120),
    ]:
        _, made = _get_or_create(
            db,
            HrmAward,
            match={
                "company_id": COMPANY,
                "employee_id": employees[code].id,
                "award_type_id": award_types[award_name].id,
            },
            defaults={"award_date": date.today() - timedelta(days=days_ago)},
        )
        count("awards", made)

    # ---------------------------------------------------- recruitment setup
    for name in ["Engineering", "Sales & Marketing", "Finance", "Operations"]:
        _, made = _get_or_create(
            db,
            HrmJobCategory,
            match={"company_id": COMPANY, "name": name},
            defaults={"status": "active"},
        )
        count("job_categories", made)

    for name in ["Full Time", "Part Time", "Contract", "Internship"]:
        _, made = _get_or_create(
            db,
            HrmJobType,
            match={"company_id": COMPANY, "name": name},
            defaults={"status": "active"},
        )
        count("job_types", made)

    for name, city, remote in [
        ("Dhaka Head Office", "Dhaka", False),
        ("Chittagong Branch", "Chittagong", False),
        ("Remote — Bangladesh", None, True),
    ]:
        _, made = _get_or_create(
            db,
            HrmJobLocation,
            match={"company_id": COMPANY, "name": name},
            defaults={"city": city, "country": "Bangladesh", "is_remote": remote, "status": "active"},
        )
        count("job_locations", made)

    for name in ["Company Website", "LinkedIn", "Employee Referral", "Job Fair", "Recruitment Agency"]:
        _, made = _get_or_create(
            db,
            HrmCandidateSource,
            match={"company_id": COMPANY, "name": name},
            defaults={"status": "active"},
        )
        count("candidate_sources", made)

    for name in ["Phone Screen", "Technical Interview", "HR Interview", "Final Round"]:
        _, made = _get_or_create(
            db,
            HrmInterviewType,
            match={"company_id": COMPANY, "name": name},
            defaults={"status": "active"},
        )
        count("interview_types", made)

    # ------------------------------------------------------- announcements
    for title, category, body, days_ago in [
        ("Eid holiday schedule", "holiday",
         "Offices remain closed for three days. Support runs a skeleton roster.", 5),
        ("New attendance policy in effect", "policy",
         "A ten minute grace period now applies to all shifts.", 12),
        ("Quarterly town hall", "event",
         "Join the all-hands on the first Thursday of next month.", 20),
    ]:
        _, made = _get_or_create(
            db,
            HrmAnnouncement,
            match={"company_id": COMPANY, "title": title},
            defaults={
                "category": category,
                "description": body,
                "content": body,
                "start_date": date.today() - timedelta(days=days_ago),
                "end_date": date.today() + timedelta(days=30),
            },
        )
        count("announcements", made)

    db.commit()
    return created


def main() -> None:
    # HRM tables carry FKs to auth_users, so every model must be registered
    # before SQLAlchemy can resolve the mappers.
    import scripts.init_db  # noqa: F401 — register all models

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        created = seed_hrm(db)
        total = sum(created.values())
        print(f"  HRM seed: {total} new row(s)")
        for key in sorted(created):
            print(f"    {key}: {created[key]}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
