# HRM API + UI status checklist

Last updated: **2026-07-27** (polish pass: career `?job=`, HR doc upload, Settings links)

Quick map of what is **done** (backend API + UI wired off mock).

**Base URL:** `/api/v1/hrm`  
**ZKTeco plugin:** `/api/v1/plugins/zkteco` + device ADMS `/iclock`  
**Frontend helpers:** `apps/web/src/lib/api/hrm-*.ts`  
**Pattern:** schemas → services → routers → `main.py` → `lib/api/hrm-*.ts` → component `loadAll` (no `*_SEED` as state)

> Note: many components still **import types / labels / helpers** from `lib/mock-data/*`. That is fine. “API connected” means list/create/update/delete (and sync where relevant) use the real API, not seed arrays.

---

## Legend

| Mark | Meaning |
|------|---------|
| ✅ | Backend API live **and** admin UI wired |
| 🔌 | Backend API live; UI not wired / still mock / partial |
| 🧠 | Model only (no router / no UI) |
| ⬜ | Not started / still mock end-to-end |
| 📎 | Uses shared / non-HRM API (e.g. media) |

---

## 1) Done — API + UI connected

### Org / workforce

| UI route | API | Frontend helper | Status |
|----------|-----|-----------------|--------|
| `/hrm/branches` | `/branches` | `hrm-branches.ts` | ✅ |
| `/hrm/departments` | `/departments` | `hrm-departments.ts` | ✅ |
| `/hrm/designations` | `/designations` | `hrm-designations.ts` | ✅ |
| `/hrm/document-types` | `/document-types` | `hrm-document-types.ts` | ✅ |
| `/hrm/employees` | `/employees`, `/employee-documents` | `hrm-employees.ts`, `hrm-employee-documents.ts` | ✅ |
| `/hrm/org-chart` | `/employees` (+ `reporting_to`) | `hrm-employees.ts` | ✅ |
| `/hrm/holidays` | `/holidays` | `hrm-holidays.ts` | ✅ |
| `/hrm/announcements` | `/announcements` | `hrm-announcements.ts` | ✅ |
| `/hrm/award-types` | `/award-types` | `hrm-award-types.ts` | ✅ |
| `/hrm/lifecycle/awards` | `/awards` | `hrm-awards.ts` | ✅ |
| `/hrm/dashboard` | aggregate of several HRM APIs | `hrm-dashboard.ts` | ✅ |
| `/hrm/calendar` | meetings + holidays + approved leaves | `hrm-calendar.ts` | ✅ |

**Employee extras done**

- `biometric_emp_id` (form “Employee code”)
- `reporting_to` (Reporting manager → Org Chart tree)

### Attendance & leave

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| `/hrm/leave/types` | `/leave-types` | `hrm-leave-types.ts` | ✅ |
| `/hrm/leave/policies` | `/leave-policies` | `hrm-leave-policies.ts` | ✅ |
| `/hrm/leave/applications` | `/leave-applications` | `hrm-leave-applications.ts` | ✅ |
| `/hrm/leave/balances` | `/leave-balances` | `hrm-leave-balances.ts` | ✅ |
| `/hrm/attendance/shifts` | `/shifts` | `hrm-shifts.ts` | ✅ |
| `/hrm/attendance/policies` | `/attendance-policies` | `hrm-attendance-policies.ts` | ✅ |
| `/hrm/attendance/records` | `/attendance-records` | `hrm-attendance-records.ts` | ✅ |
| `/hrm/attendance/regularizations` | `/attendance-regularizations` | `hrm-attendance-regularizations.ts` | ✅ |
| `/hrm/attendance/timesheet` | `/time-entries` | `hrm-time-entries.ts` | ✅ |
| `/hrm/attendance/biometric` | `/biometric/*` (+ ZK punches) | `hrm-biometric.ts` | ✅ |

### Payroll

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| `/hrm/payroll/components` | `/salary-components` | `hrm-salary-components.ts` | ✅ |
| `/hrm/payroll/salaries` | `/employee-salaries` | `hrm-employee-salaries.ts` | ✅ |
| `/hrm/payroll/runs` | `/payroll-runs` | `hrm-payroll.ts` | ✅ |
| `/hrm/payroll/entries` | `/payroll-entries` | `hrm-payroll.ts` | ✅ |
| `/hrm/payroll/payslips` (+ `/hrm/payslips`) | `/payslips` | `hrm-payslips.ts` | ✅ |

### Recruitment

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Job categories / types / locations | masters | `hrm-recruitment-masters.ts` | ✅ |
| Candidate sources, interview types/rounds | masters | `hrm-recruitment-masters.ts` | ✅ |
| Custom questions, offer templates | masters | `hrm-recruitment-masters.ts` | ✅ |
| Onboarding checklists + items | masters | `hrm-recruitment-masters.ts` | ✅ |
| `/hrm/recruitment/job-requisitions` | `/job-requisitions` | `hrm-job-requisitions.ts` | ✅ |
| `/hrm/recruitment/jobs` | `/job-postings` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/career` | published `/job-postings` | `hrm-career-board.tsx` | ✅ |
| `/hrm/recruitment/candidates` | `/candidates` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/interviews` | `/interviews` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/interview-feedback` | `/interview-feedback` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/offers` | `/offers` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/assessments` | `/candidate-assessments` | `hrm-recruitment.ts` | ✅ |
| `/hrm/recruitment/onboarding` | candidate onboarding | `hrm-recruitment.ts` | ✅ |

### Lifecycle

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Resignations | `/resignations` | `hrm-lifecycle.ts` | ✅ |
| Promotions | `/promotions` | `hrm-lifecycle.ts` | ✅ |
| Terminations | `/terminations` | `hrm-lifecycle.ts` | ✅ |
| Warnings | `/warnings` | `hrm-lifecycle.ts` | ✅ |
| Complaints | `/complaints` | `hrm-lifecycle.ts` | ✅ |
| Transfers | `/transfers` | `hrm-lifecycle.ts` | ✅ |
| Trips (+ expenses) | `/trips`, `/trip-expenses` | `hrm-lifecycle.ts` | ✅ |

### Performance

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Indicator categories | `/performance-indicator-categories` | `hrm-performance.ts` | ✅ |
| Indicators | `/performance-indicators` | `hrm-performance.ts` | ✅ |
| Goal types | `/goal-types` | `hrm-performance.ts` | ✅ |
| Employee goals | `/employee-goals` | `hrm-performance.ts` | ✅ |
| Review cycles | `/review-cycles` | `hrm-performance.ts` | ✅ |
| Employee reviews | `/employee-reviews` | `hrm-performance.ts` | ✅ |

### Training

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Training types | `/training-types` | `hrm-training.ts` | ✅ |
| Programs | `/training-programs` | `hrm-training.ts` | ✅ |
| Sessions (+ attendance) | `/training-sessions`, attendance | `hrm-training.ts` | ✅ |
| Assessments (+ results) | `/training-assessments`, results | `hrm-training.ts` | ✅ |
| Employee trainings | `/employee-trainings` | `hrm-training.ts` | ✅ |

### Assets

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Asset types | `/asset-types` | `hrm-assets.ts` | ✅ |
| Assets list / detail | `/assets` (+ assignments / maintenances) | `hrm-assets.ts` | ✅ |
| Depreciation | `/asset-depreciations` / report | `hrm-assets.ts` | ✅ |
| Assets dashboard | aggregate assets APIs | `hrm-assets.ts` | ✅ |

### Meetings

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Meeting types | `/meeting-types` | `hrm-meetings.ts` | ✅ |
| Rooms | `/meeting-rooms` | `hrm-meetings.ts` | ✅ |
| Meetings | `/meetings` | `hrm-meetings.ts` | ✅ |
| Attendees | `/meeting-attendees` | `hrm-meetings.ts` | ✅ |
| Minutes | `/meeting-minutes` | `hrm-meetings.ts` | ✅ |
| Action items | `/action-items` | `hrm-meetings.ts` | ✅ |

### Documents library

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Categories | `/document-categories` | `hrm-documents.ts` | ✅ |
| HR Documents | `/hr-documents` (+ publish/archive) | `hrm-documents.ts` | ✅ |
| Document templates | `/document-templates` | `hrm-documents.ts` | ✅ |
| Acknowledgements | `/document-acknowledgments` (+ acknowledge) | `hrm-documents.ts` | ✅ |

### Contracts

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| Contract types | `/contract-types` | `hrm-contracts.ts` | ✅ |
| Contract templates | `/contract-templates` | `hrm-contracts.ts` | ✅ |
| Employee contracts | `/employee-contracts` (+ activate) | `hrm-contracts.ts` | ✅ |
| Contract renewals | `/contract-renewals` (+ approve) | `hrm-contracts.ts` | ✅ |

### Settings / security

| UI route | API | Helper | Status |
|----------|-----|--------|--------|
| `/hrm/settings` → **IP Restriction** | `/ip-restrictions` | `hrm-ip-restrictions.ts` | ✅ |
| `/hrm/settings` → other sections | — | local draft form (Workdo chrome) | 🔌 partial (see below) |

### ZKTeco (device + HRM bridge)

| Surface | API | Notes | Status |
|---------|-----|-------|--------|
| Plugin UI `/workspace/plugins/zkteco` | `/api/v1/plugins/zkteco`, `/punches` | Config + live punches; includes `employee_id` / `employee_name` / `matched` | ✅ |
| Device ADMS | `/iclock/*` | Saves into `zkteco_attendance_logs` | ✅ |
| HRM Biometric day view | `GET /biometric/day-records` | Match PIN → `hrm_employees.biometric_emp_id` | ✅ |
| Manual sync | `POST /biometric/sync` | Upsert `/attendance-records` | ✅ |
| Auto-sync on punch | inside `save_punches` | After ADMS save → best-effort HRM attendance upsert | ✅ |
| Unmatched PINs | `GET /biometric/unmatched` | Codes with punches but no employee | ✅ |

**Match rule:** device `employee_code` (PIN) = employee **biometric code**.

### Shared / non-HRM

| Item | Status |
|------|--------|
| `/hrm/media-library` | 📎 shared media library (not HRM mock) |

---

## 2) Polish done + optional leftovers

| Item | Status |
|------|--------|
| Career Apply `?job=` | ✅ Candidates page pre-selects job + opens add form once |
| HR Documents file upload | ✅ Media library upload → `file_path`; Download opens URL |
| Settings IP Restriction | ✅ API CRUD |
| Settings ZKTeco tab | ✅ Links to plugin + biometric + employees (no mock device fields) |
| Settings other tabs | Browser `localStorage` draft (`againerp.hrm.settings.draft.v1`) — not server config |
| Seed data | Empty lists until you create records / device punches |

---

## 3) How to verify quickly

```powershell
# API routes present after rebuild
docker compose up -d --build --force-recreate api

# Web cache
docker compose stop web
Remove-Item -Recurse -Force apps/web/.next -ErrorAction SilentlyContinue
docker compose up -d --no-deps --force-recreate web
```

Browser: **Ctrl+Shift+R**

Spot-check:

1. `/hrm/calendar` — meetings / holidays / approved leaves  
2. `/hrm/recruitment/career` — published jobs  
3. `/hrm/recruitment/job-requisitions` — CRUD  
4. `/hrm/documents/contract-renewals` — renewals  
5. `/hrm/settings` → IP Restriction — real list CRUD  
6. `/hrm/attendance/biometric` + ZK plugin punches — match + sync  

---

## 4) Related docs

- `docs/HRM-DATABASE.md` — table / field notes  
- `docs/HRM-API-STEPS.md` — older phased plan  

**This file is the current source of truth for API+UI status.**
