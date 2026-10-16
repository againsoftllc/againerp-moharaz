# HRM API — step-by-step build plan

> **Current status (API + which UIs are off mock):** see [`HRM-API-UI-STATUS.md`](./HRM-API-UI-STATUS.md).  
> This file is the older phased build plan; Phase G markers below may be stale.

**How we work:** each step = one (or a small group of) API resource(s).  
You **confirm** → we implement that step → you verify → next step.

**Base URL:** `/api/v1/hrm`  
**Stack:** `schemas/hrm/` → `services/hrm/` → `routers/hrm_*.py` → `main.py`  
**Auth:** login required (`require_admin`) + `require_permission("hrm", …)` on endpoints  
**Tenancy:** every query scoped by `company_id` (default `"default"`)

---

## Status legend

| Mark | Meaning |
|------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done (API live) |
| ⏳ | Waiting for your confirm |

---

## Phase A — Org masters (UI shell already exists)

| Step | Resource | Endpoints | Depends on | Status |
|------|----------|-----------|------------|--------|
| **A1** | Branches | `GET/POST /branches`, `GET/PATCH/DELETE /branches/{id}` | — | ✅ |
| **A2** | Departments | `/departments` | A1 (`branch_id`) | ✅ |
| **A3** | Designations | `/designations` | A2 (`department_id`) | ✅ |
| **A4** | Document types | `/document-types` | — | ✅ |
| **A5** | Employees | `/employees` (+ pagination, search) | A1–A3 | ✅ |
| **A6** | Employee documents | `/employee-documents` | A4, A5 | ✅ |
| **A7** | Award types + Awards | `/award-types`, `/awards` | A5 | ✅ |

## Phase B — Attendance & leave

| Step | Resource | Status |
|------|----------|--------|
| **B1** | Leave types, policies | ✅ |
| **B2** | Leave applications, balances | ✅ |
| **B3** | Shifts, attendance policies | ✅ |
| **B4** | Attendance records, regularizations | ✅ |
| **B5** | Time entries, holidays (+ holiday branches) | ✅ |

## Phase C — Payroll

| Step | Resource | Status |
|------|----------|--------|
| **C1** | Salary components | ✅ |
| **C2** | Employee salaries (+ component junction) | ✅ |
| **C3** | Payroll runs, entries, payslips | ✅ |

## Phase D — Recruitment

| Step | Resource | Status |
|------|----------|--------|
| **D1** | Job masters (categories, types, locations) | ✅ |
| **D2** | Requisitions, postings | ✅ |
| **D3** | Candidates, sources | ✅ |
| **D4** | Interviews, feedback, assessments | ✅ |
| **D5** | Offers, onboarding, custom questions | ✅ |

## Phase E — Performance, lifecycle, training

| Step | Resource | Status |
|------|----------|--------|
| **E1** | Indicators, goals, review cycles | ✅ |
| **E2** | Lifecycle (resignations … transfers, trips) | ✅ |
| **E3** | Training programs / sessions / assessments | ✅ |

## Phase F — Assets, meetings, announcements

| Step | Resource | Status |
|------|----------|--------|
| **F1** | Assets | ✅ |
| **F2** | Meetings (+ rooms, attendees, minutes, actions) | ✅ |
| **F3** | Announcements | ✅ |

## Phase G — Frontend wire-up

| Step | Work | Status |
|------|------|--------|
| **G1** | Replace mock on `/hrm/branches` with real API | ✅ |
| **G2** | Wire remaining org pages as each A* lands | ✅ |
| **G3** | Wire employees list/form to real API | ✅ |
| **G4** | Wire awards to real API | ✅ |
| **G5** | Employee documents (employee form tab) | ✅ |
| **G6** | Leave types, policies + holidays | ✅ |
| **G7** | Leave applications + balances | ✅ |
| **G8** | Attendance (shifts → timesheet; skip biometric) | ✅ |
| **G9** | Payroll | ✅ |
| **G10** | Recruitment masters | ✅ |
| **G11** | Recruitment flow | ⬜ |
| **G12** | Lifecycle (rest; awards done) | ⬜ |
| **G13** | Performance | ⬜ |
| **G14** | Training | ⬜ |
| **G15** | Assets | ⬜ |
| **G16** | Meetings | ⬜ |
| **G17** | Announcements / dashboard chrome | ⬜ |

---

## Confirm flow

1. Agent finishes current step and marks it ✅  
2. You reply e.g. **`OK`** / **`next`** to continue  
3. Or say **`aste aste sobgulai`** to keep going through the remaining G* steps  

Skip / reorder anytime.

---

## Current focus

**G10** ✅ done  

Recruitment setup masters wired via `hrm-recruitment-masters.ts` + MasterCrud:  
job categories/types/locations, candidate sources, interview types/rounds, custom questions, offer templates, onboarding checklists + items.  

Career page deferred to **G11** (job-postings).  

**Next:** **G11** — Recruitment flow (jobs, candidates, interviews…). Say **`OK`** / **`next`**.
