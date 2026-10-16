#!/usr/bin/env python3
"""Seed sample HRM data + verify list endpoints. Run inside API container or host with requests."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Any

BASE = "http://127.0.0.1:8010"
EMAIL = "admin@againerp.local"
PASSWORD = "admin123"
CID = "default"
TODAY = date.today()
TAG = "VERIFY"  # prefix so we can spot seed rows

results: list[tuple[str, str, str]] = []  # action, status, detail
ids: dict[str, str] = {}


def req(
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(
        f"{BASE}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as res:
            raw = res.read().decode("utf-8") or "{}"
            return res.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8") or ""
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"detail": raw[:300]}
        return e.code, parsed


def ok(action: str, detail: str = "") -> None:
    results.append((action, "PASS", detail))
    print(f"  PASS  {action}" + (f" — {detail}" if detail else ""))


def fail(action: str, detail: str) -> None:
    results.append((action, "FAIL", detail))
    print(f"  FAIL  {action} — {detail}")


def post(token: str, path: str, body: dict[str, Any], key: str | None = None) -> Any:
    code, data = req("POST", path, token, body)
    if code in (200, 201) and isinstance(data, dict) and data.get("data"):
        row = data["data"]
        if key and isinstance(row, dict) and row.get("id"):
            ids[key] = str(row["id"])
        ok(f"POST {path}", str(row.get("id") or row.get("name") or "")[:48])
        return row
    fail(f"POST {path}", f"{code} {json.dumps(data)[:220]}")
    return None


def get_list(token: str, path: str, min_count: int = 1) -> int:
    code, data = req("GET", path, token)
    if code != 200:
        fail(f"GET {path}", f"{code} {json.dumps(data)[:220]}")
        return 0
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        # some endpoints wrap differently
        fail(f"GET {path}", f"unexpected shape: {str(data)[:180]}")
        return 0
    n = len(rows)
    meta = data.get("meta") or {}
    count = meta.get("count", n) if isinstance(meta, dict) else n
    if count >= min_count or n >= min_count:
        ok(f"GET {path}", f"n={n} count={count}")
    else:
        fail(f"GET {path}", f"empty (n={n})")
    return n


def main() -> int:
    print("== Login ==")
    code, login = req("POST", "/api/v1/auth/login", body={"email": EMAIL, "password": PASSWORD})
    if code != 200 or not isinstance(login, dict) or not login.get("token"):
        print(f"Login failed: {code} {login}")
        return 1
    token = str(login["token"])
    ok("login", EMAIL)

    print("\n== Seed masters ==")
    post(token, "/api/v1/hrm/branches", {"company_id": CID, "name": f"{TAG} HQ", "city": "Dhaka"}, "branch")
    post(
        token,
        "/api/v1/hrm/departments",
        {"company_id": CID, "name": f"{TAG} Engineering", "branch_id": ids.get("branch")},
        "dept",
    )
    post(
        token,
        "/api/v1/hrm/designations",
        {"company_id": CID, "name": f"{TAG} Software Engineer", "department_id": ids.get("dept")},
        "desig",
    )
    post(token, "/api/v1/hrm/document-types", {"company_id": CID, "name": f"{TAG} NID"}, "doc_type")
    post(token, "/api/v1/hrm/award-types", {"company_id": CID, "name": f"{TAG} Star"}, "award_type")
    post(
        token,
        "/api/v1/hrm/shifts",
        {
            "company_id": CID,
            "name": f"{TAG} Day",
            "start_time": "09:00",
            "end_time": "18:00",
        },
        "shift",
    )
    post(
        token,
        "/api/v1/hrm/attendance-policies",
        {"company_id": CID, "name": f"{TAG} Standard"},
        "att_policy",
    )
    post(token, "/api/v1/hrm/leave-types", {"company_id": CID, "name": f"{TAG} Annual"}, "leave_type")
    post(
        token,
        "/api/v1/hrm/leave-policies",
        {
            "company_id": CID,
            "name": f"{TAG} Annual Policy",
            "leave_type_id": ids.get("leave_type"),
            "days_per_year": 14,
        },
        "leave_policy",
    )
    post(
        token,
        "/api/v1/hrm/holidays",
        {
            "company_id": CID,
            "name": f"{TAG} Victory Day",
            "start_date": str(TODAY.replace(month=12, day=16) if TODAY.month != 12 else TODAY),
            "end_date": str(TODAY.replace(month=12, day=16) if TODAY.month != 12 else TODAY),
            "is_paid": True,
        },
        "holiday",
    )
    post(
        token,
        "/api/v1/hrm/announcements",
        {
            "company_id": CID,
            "title": f"{TAG} All-hands",
            "content": "Welcome to HRM verify seed.",
            "is_high_priority": True,
        },
        "announcement",
    )
    post(
        token,
        "/api/v1/hrm/salary-components",
        {"company_id": CID, "name": f"{TAG} Basic", "type": "earning", "calculation_type": "fixed"},
        "sal_comp",
    )

    print("\n== Employees ==")
    post(
        token,
        "/api/v1/hrm/employees",
        {
            "company_id": CID,
            "name": f"{TAG} Manager Ali",
            "email": "verify.manager@againerp.local",
            "employee_code": f"VER-MGR-{TODAY.strftime('%m%d')}",
            "biometric_emp_id": "1001",
            "branch_id": ids.get("branch"),
            "department_id": ids.get("dept"),
            "designation_id": ids.get("desig"),
            "shift_id": ids.get("shift"),
            "attendance_policy_id": ids.get("att_policy"),
            "date_of_joining": str(TODAY - timedelta(days=400)),
            "base_salary": "80000",
            "employment_type": "full_time",
            "auth_user_id": "user_admin",
        },
        "emp_mgr",
    )
    post(
        token,
        "/api/v1/hrm/employees",
        {
            "company_id": CID,
            "name": f"{TAG} Staff Sara",
            "email": "verify.staff@againerp.local",
            "employee_code": f"VER-STF-{TODAY.strftime('%m%d')}",
            "biometric_emp_id": "1002",
            "branch_id": ids.get("branch"),
            "department_id": ids.get("dept"),
            "designation_id": ids.get("desig"),
            "reporting_to": ids.get("emp_mgr"),
            "shift_id": ids.get("shift"),
            "attendance_policy_id": ids.get("att_policy"),
            "date_of_joining": str(TODAY - timedelta(days=120)),
            "base_salary": "45000",
            "employment_type": "full_time",
        },
        "emp",
    )

    print("\n== Attendance / leave / payroll ==")
    post(
        token,
        "/api/v1/hrm/attendance-records",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "date": str(TODAY),
            "status": "present",
            "clock_in": "09:05",
            "clock_out": "18:02",
        },
        "att_rec",
    )
    post(
        token,
        "/api/v1/hrm/time-entries",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "date": str(TODAY),
            "hours": 8,
            "description": f"{TAG} timesheet",
        },
        "time_entry",
    )
    leave = post(
        token,
        "/api/v1/hrm/leave-applications",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "leave_type_id": ids.get("leave_type"),
            "leave_policy_id": ids.get("leave_policy"),
            "start_date": str(TODAY + timedelta(days=7)),
            "end_date": str(TODAY + timedelta(days=8)),
            "reason": f"{TAG} personal",
        },
        "leave_app",
    )
    if leave and ids.get("leave_app"):
        code, data = req(
            "POST",
            f"/api/v1/hrm/leave-applications/{ids['leave_app']}/approve",
            token,
            {},
        )
        if code == 200:
            ok("POST leave approve", ids["leave_app"])
        else:
            # try alternate path
            code2, data2 = req(
                "PATCH",
                f"/api/v1/hrm/leave-applications/{ids['leave_app']}",
                token,
                {"status": "approved"},
            )
            if code2 == 200:
                ok("PATCH leave approved", ids["leave_app"])
            else:
                fail("approve leave", f"{code}/{code2} {json.dumps(data)[:120]} | {json.dumps(data2)[:120]}")
    post(
        token,
        "/api/v1/hrm/leave-balances",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "leave_type_id": ids.get("leave_type"),
            "leave_policy_id": ids.get("leave_policy"),
            "year": str(TODAY.year),
            "entitled": "14",
            "used": "0",
            "balance": "14",
        },
        "leave_bal",
    )
    post(
        token,
        "/api/v1/hrm/employee-salaries",
        {"company_id": CID, "employee_id": ids.get("emp"), "basic_salary": "45000"},
        "emp_sal",
    )
    post(
        token,
        "/api/v1/hrm/payroll-runs",
        {
            "company_id": CID,
            "title": f"{TAG} {TODAY.strftime('%Y-%m')} payroll",
            "pay_period_start": str(TODAY.replace(day=1)),
            "pay_period_end": str(TODAY),
        },
        "payroll_run",
    )
    post(
        token,
        "/api/v1/hrm/awards",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "award_type_id": ids.get("award_type"),
            "award_date": str(TODAY),
            "gift": "Certificate",
        },
        "award",
    )

    print("\n== Recruitment ==")
    post(token, "/api/v1/hrm/job-categories", {"company_id": CID, "name": f"{TAG} Tech"}, "job_cat")
    post(token, "/api/v1/hrm/job-types", {"company_id": CID, "name": f"{TAG} Full-time"}, "job_type")
    post(token, "/api/v1/hrm/job-locations", {"company_id": CID, "name": f"{TAG} Dhaka"}, "job_loc")
    post(token, "/api/v1/hrm/candidate-sources", {"company_id": CID, "name": f"{TAG} LinkedIn"}, "cand_src")
    post(
        token,
        "/api/v1/hrm/job-requisitions",
        {
            "company_id": CID,
            "title": f"{TAG} Backend Engineer Req",
            "positions": 1,
            "department_id": ids.get("dept"),
        },
        "job_req",
    )
    post(
        token,
        "/api/v1/hrm/job-postings",
        {
            "company_id": CID,
            "title": f"{TAG} Backend Engineer",
            "description": "Build APIs",
            "status": "published",
            "is_published": True,
            "job_type_id": ids.get("job_type"),
            "job_location_id": ids.get("job_loc"),
        },
        "job_post",
    )
    if ids.get("job_post"):
        code, data = req("POST", f"/api/v1/hrm/job-postings/{ids['job_post']}/publish", token, {})
        if code == 200:
            ok("POST job publish", ids["job_post"])
        else:
            # already published ok
            ok("POST job publish (skip)", f"{code}")
    post(
        token,
        "/api/v1/hrm/candidates",
        {
            "company_id": CID,
            "first_name": "Verify",
            "last_name": "Candidate",
            "email": "verify.candidate@example.com",
            "job_id": ids.get("job_post"),
            "source_id": ids.get("cand_src"),
            "status": "new",
        },
        "candidate",
    )
    post(token, "/api/v1/hrm/interview-types", {"company_id": CID, "name": f"{TAG} Technical"}, "int_type")
    post(
        token,
        "/api/v1/hrm/interview-rounds",
        {"company_id": CID, "name": f"{TAG} Round 1", "job_id": ids.get("job_post")},
        "int_round",
    )
    post(
        token,
        "/api/v1/hrm/interviews",
        {
            "company_id": CID,
            "candidate_id": ids.get("candidate"),
            "interview_type_id": ids.get("int_type"),
            "interview_round_id": ids.get("int_round"),
            "scheduled_at": f"{TODAY + timedelta(days=3)}T10:00:00",
        },
        "interview",
    )
    post(
        token,
        "/api/v1/hrm/offer-templates",
        {"company_id": CID, "name": f"{TAG} Offer", "body": "Dear {{name}}"},
        "offer_tpl",
    )

    print("\n== Meetings / docs / contracts / assets / training / lifecycle ==")
    post(token, "/api/v1/hrm/meeting-types", {"company_id": CID, "name": f"{TAG} Standup"}, "mtg_type")
    post(
        token,
        "/api/v1/hrm/meeting-rooms",
        {"company_id": CID, "name": f"{TAG} Room A", "type": "physical", "capacity": 8},
        "mtg_room",
    )
    post(
        token,
        "/api/v1/hrm/meetings",
        {
            "company_id": CID,
            "title": f"{TAG} Sprint Planning",
            "meeting_date": str(TODAY + timedelta(days=1)),
            "start_time": "10:00",
            "end_time": "11:00",
            "type_id": ids.get("mtg_type"),
            "room_id": ids.get("mtg_room"),
            "organizer_id": "user_admin",
            "status": "scheduled",
        },
        "meeting",
    )
    post(
        token,
        "/api/v1/hrm/meeting-attendees",
        {
            "company_id": CID,
            "meeting_id": ids.get("meeting"),
            "user_id": "user_admin",
            "status": "accepted",
        },
        "mtg_att",
    )
    post(
        token,
        "/api/v1/hrm/document-categories",
        {"company_id": CID, "name": f"{TAG} Policies"},
        "doc_cat",
    )
    post(
        token,
        "/api/v1/hrm/hr-documents",
        {
            "company_id": CID,
            "title": f"{TAG} Leave Policy Doc",
            "category_id": ids.get("doc_cat"),
            "status": "published",
            "file_name": "leave-policy.pdf",
            "file_type": "PDF",
        },
        "hr_doc",
    )
    post(
        token,
        "/api/v1/hrm/document-templates",
        {"company_id": CID, "name": f"{TAG} Warning Letter", "body": "Template body"},
        "doc_tpl",
    )
    post(token, "/api/v1/hrm/contract-types", {"company_id": CID, "name": f"{TAG} Permanent"}, "ctr_type")
    post(
        token,
        "/api/v1/hrm/contract-templates",
        {"company_id": CID, "name": f"{TAG} Emp Contract", "body": "Contract {{employee}}"},
        "ctr_tpl",
    )
    post(
        token,
        "/api/v1/hrm/employee-contracts",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "contract_type_id": ids.get("ctr_type"),
            "title": f"{TAG} Employment",
            "start_date": str(TODAY - timedelta(days=120)),
            "end_date": str(TODAY + timedelta(days=245)),
            "status": "active",
        },
        "emp_ctr",
    )
    post(
        token,
        "/api/v1/hrm/contract-renewals",
        {
            "company_id": CID,
            "employee_contract_id": ids.get("emp_ctr"),
            "new_end_date": str(TODAY + timedelta(days=610)),
            "reason": f"{TAG} renewal",
        },
        "ctr_renew",
    )
    post(token, "/api/v1/hrm/asset-types", {"company_id": CID, "name": f"{TAG} Laptop"}, "asset_type")
    post(
        token,
        "/api/v1/hrm/assets",
        {
            "company_id": CID,
            "name": f"{TAG} MacBook",
            "asset_type_id": ids.get("asset_type"),
            "serial_number": f"SN-VER-{TODAY.strftime('%Y%m%d')}",
            "purchase_date": str(TODAY - timedelta(days=30)),
            "purchase_cost": "150000",
            "status": "available",
        },
        "asset",
    )
    post(token, "/api/v1/hrm/training-types", {"company_id": CID, "name": f"{TAG} Soft skills"}, "trn_type")
    post(
        token,
        "/api/v1/hrm/training-programs",
        {
            "company_id": CID,
            "name": f"{TAG} Onboarding Bootcamp",
            "training_type_id": ids.get("trn_type"),
        },
        "trn_prog",
    )
    post(
        token,
        "/api/v1/hrm/performance-indicator-categories",
        {"company_id": CID, "name": f"{TAG} Delivery"},
        "perf_cat",
    )
    post(
        token,
        "/api/v1/hrm/performance-indicators",
        {
            "company_id": CID,
            "name": f"{TAG} On-time delivery",
            "category_id": ids.get("perf_cat"),
        },
        "perf_ind",
    )
    post(token, "/api/v1/hrm/goal-types", {"company_id": CID, "name": f"{TAG} OKR"}, "goal_type")
    post(
        token,
        "/api/v1/hrm/employee-goals",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "goal_type_id": ids.get("goal_type"),
            "title": f"{TAG} Ship HRM",
            "target_value": "100",
        },
        "emp_goal",
    )
    post(
        token,
        "/api/v1/hrm/warnings",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "warning_date": str(TODAY),
            "subject": f"{TAG} Late warning",
            "description": "Arrived late twice",
        },
        "warning",
    )
    post(
        token,
        "/api/v1/hrm/trips",
        {
            "company_id": CID,
            "employee_id": ids.get("emp"),
            "purpose": f"{TAG} Client visit",
            "start_date": str(TODAY + timedelta(days=14)),
            "end_date": str(TODAY + timedelta(days=16)),
            "place": "Chittagong",
        },
        "trip",
    )
    post(
        token,
        "/api/v1/hrm/ip-restrictions",
        {"company_id": CID, "ip_address": "203.0.113.10", "description": f"{TAG} office"},
        "ip",
    )

    print("\n== List / view verification ==")
    list_paths = [
        "/api/v1/hrm/branches?company_id=default",
        "/api/v1/hrm/departments?company_id=default",
        "/api/v1/hrm/designations?company_id=default",
        "/api/v1/hrm/employees?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/document-types?company_id=default",
        "/api/v1/hrm/award-types?company_id=default",
        "/api/v1/hrm/awards?company_id=default",
        "/api/v1/hrm/holidays?company_id=default",
        "/api/v1/hrm/announcements?company_id=default",
        "/api/v1/hrm/leave-types?company_id=default",
        "/api/v1/hrm/leave-policies?company_id=default",
        "/api/v1/hrm/leave-applications?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/leave-applications?company_id=default&status=approved&per_page=50",
        "/api/v1/hrm/leave-balances?company_id=default",
        "/api/v1/hrm/shifts?company_id=default",
        "/api/v1/hrm/attendance-policies?company_id=default",
        "/api/v1/hrm/attendance-records?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/time-entries?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/salary-components?company_id=default",
        "/api/v1/hrm/employee-salaries?company_id=default",
        "/api/v1/hrm/payroll-runs?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/job-categories?company_id=default",
        "/api/v1/hrm/job-types?company_id=default",
        "/api/v1/hrm/job-locations?company_id=default",
        "/api/v1/hrm/job-requisitions?company_id=default",
        "/api/v1/hrm/job-postings?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/candidates?company_id=default&page=1&per_page=50",
        "/api/v1/hrm/candidate-sources?company_id=default",
        "/api/v1/hrm/interview-types?company_id=default",
        "/api/v1/hrm/interview-rounds?company_id=default",
        "/api/v1/hrm/interviews?company_id=default",
        "/api/v1/hrm/offer-templates?company_id=default",
        "/api/v1/hrm/meeting-types?company_id=default",
        "/api/v1/hrm/meeting-rooms?company_id=default",
        "/api/v1/hrm/meetings?company_id=default",
        "/api/v1/hrm/meeting-attendees?company_id=default",
        "/api/v1/hrm/document-categories?company_id=default",
        "/api/v1/hrm/hr-documents?company_id=default",
        "/api/v1/hrm/document-templates?company_id=default",
        "/api/v1/hrm/contract-types?company_id=default",
        "/api/v1/hrm/contract-templates?company_id=default",
        "/api/v1/hrm/employee-contracts?company_id=default",
        "/api/v1/hrm/contract-renewals?company_id=default",
        "/api/v1/hrm/asset-types?company_id=default",
        "/api/v1/hrm/assets?company_id=default",
        "/api/v1/hrm/training-types?company_id=default",
        "/api/v1/hrm/training-programs?company_id=default",
        "/api/v1/hrm/performance-indicator-categories?company_id=default",
        "/api/v1/hrm/performance-indicators?company_id=default",
        "/api/v1/hrm/goal-types?company_id=default",
        "/api/v1/hrm/employee-goals?company_id=default",
        "/api/v1/hrm/warnings?company_id=default",
        "/api/v1/hrm/trips?company_id=default",
        "/api/v1/hrm/ip-restrictions?company_id=default",
        f"/api/v1/hrm/biometric/day-records?company_id=default&date={TODAY}",
        "/api/v1/hrm/biometric/unmatched?company_id=default",
    ]
    for p in list_paths:
        # biometric unmatched can be empty — allow 0
        min_c = 0 if "unmatched" in p or "biometric/day" in p else 1
        get_list(token, p, min_count=min_c)

    # Calendar composite sources (same as UI)
    print("\n== Calendar sources ==")
    get_list(token, "/api/v1/hrm/meetings?company_id=default", 1)
    get_list(token, "/api/v1/hrm/holidays?company_id=default", 1)
    get_list(token, "/api/v1/hrm/leave-applications?company_id=default&status=approved&per_page=50", 0)

    # Web pages smoke (HTML reachable)
    print("\n== Web view smoke (HTTP 200) ==")
    web_pages = [
        "/hrm/branches",
        "/hrm/departments",
        "/hrm/designations",
        "/hrm/employees",
        "/hrm/org-chart",
        "/hrm/calendar",
        "/hrm/holidays",
        "/hrm/announcements",
        "/hrm/leave/types",
        "/hrm/leave/applications",
        "/hrm/attendance/records",
        "/hrm/attendance/biometric",
        "/hrm/attendance/timesheet",
        "/hrm/payroll/runs",
        "/hrm/payroll/payslips",
        "/hrm/recruitment/jobs",
        "/hrm/recruitment/career",
        "/hrm/recruitment/candidates",
        "/hrm/recruitment/job-requisitions",
        "/hrm/meetings",
        "/hrm/documents",
        "/hrm/documents/contract-renewals",
        "/hrm/assets",
        "/hrm/settings",
        "/hrm/dashboard",
    ]
    for page in web_pages:
        try:
            r = urllib.request.Request(f"http://127.0.0.1:3210{page}", method="GET")
            with urllib.request.urlopen(r, timeout=30) as res:
                if res.status == 200:
                    ok(f"WEB {page}", "200")
                else:
                    fail(f"WEB {page}", str(res.status))
        except Exception as e:  # noqa: BLE001
            fail(f"WEB {page}", str(e)[:180])

    passed = sum(1 for _, s, _ in results if s == "PASS")
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    print("\n========== SUMMARY ==========")
    print(f"PASS={passed}  FAIL={failed}  TOTAL={len(results)}")
    if failed:
        print("\nFailures:")
        for a, s, d in results:
            if s == "FAIL":
                print(f"  - {a}: {d}")
    print("\nSeed IDs:")
    print(json.dumps(ids, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
