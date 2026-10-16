import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const navPath = path.join(__dirname, "../apps/web/src/lib/hrm/hrm-nav.ts");
const src = fs.readFileSync(navPath, "utf8");

const itemRe =
  /\{\s*kind:\s*"item",\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)",\s*description:\s*"([^"]*)",?\s*\}/g;

const skip = new Set([
  "/hrm/dashboard",
  "/hrm/employees",
  "/hrm/calendar",
  "/hrm/media-library",
  "/hrm/org-chart",
  "/hrm/settings",
  "/hrm/attendance/records",
  "/hrm/attendance/timesheet",
  "/hrm/attendance/biometric",
  "/hrm/attendance/regularizations",
  "/hrm/attendance/shifts",
  "/hrm/attendance/policies",
  "/hrm/leave/applications",
  "/hrm/leave/balances",
  "/hrm/branches",
  "/hrm/departments",
  "/hrm/designations",
  "/hrm/holidays",
  "/hrm/announcements",
  "/hrm/award-types",
  "/hrm/document-types",
  "/hrm/leave/types",
  "/hrm/leave/policies",
  "/hrm/recruitment/jobs",
  "/hrm/recruitment/candidates",
  "/hrm/recruitment/interviews",
  "/hrm/recruitment/interview-feedback",
  "/hrm/recruitment/offers",
  "/hrm/recruitment/onboarding",
  "/hrm/recruitment/assessments",
  "/hrm/recruitment/onboarding-checklists",
  "/hrm/recruitment/checklist-items",
  "/hrm/recruitment/career",
  "/hrm/recruitment/job-categories",
  "/hrm/recruitment/job-types",
  "/hrm/recruitment/job-locations",
  "/hrm/recruitment/candidate-sources",
  "/hrm/recruitment/interview-types",
  "/hrm/recruitment/interview-rounds",
  "/hrm/recruitment/offer-templates",
  "/hrm/recruitment/custom-questions",
  "/hrm/lifecycle/awards",
  "/hrm/lifecycle/promotions",
  "/hrm/lifecycle/transfers",
  "/hrm/lifecycle/warnings",
  "/hrm/lifecycle/resignations",
  "/hrm/lifecycle/terminations",
  "/hrm/lifecycle/trips",
  "/hrm/lifecycle/complaints",
  "/hrm/performance/reviews",
  "/hrm/performance/goals",
  "/hrm/performance/review-cycles",
  "/hrm/performance/indicators",
  "/hrm/performance/goal-types",
  "/hrm/performance/indicator-categories",
  "/hrm/training/employee-trainings",
  "/hrm/training/sessions",
  "/hrm/training/programs",
  "/hrm/training/assessments",
  "/hrm/training/types",
  "/hrm/payroll/payslips",
  "/hrm/payroll/runs",
  "/hrm/payroll/entries",
  "/hrm/payroll/salaries",
  "/hrm/payroll/components",
  "/hrm/assets/dashboard",
  "/hrm/assets",
  "/hrm/assets/depreciation",
  "/hrm/assets/types",
  "/hrm/meetings",
  "/hrm/meetings/attendees",
  "/hrm/meetings/minutes",
  "/hrm/meetings/action-items",
  "/hrm/meetings/types",
  "/hrm/meetings/rooms",
  "/hrm/documents",
  "/hrm/documents/contracts",
  "/hrm/documents/acknowledgements",
  "/hrm/documents/contract-templates",
  "/hrm/documents/document-templates",
  "/hrm/documents/contract-types",
  "/hrm/documents/categories",
]);
const screens = [];
let m;
while ((m = itemRe.exec(src))) {
  const href = m[3];
  if (skip.has(href)) continue;
  screens.push({ href });
}

const root = path.join(__dirname, "../apps/web/src/app/(admin)");
for (const s of screens) {
  const dir = path.join(root, s.href.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "page.tsx");
  fs.writeFileSync(
    file,
    `"use client";

import { HrmEntityPage } from "@/components/hrm/hrm-entity-page";

export default function Page() {
  return <HrmEntityPage href=${JSON.stringify(s.href)} />;
}
`,
  );
}

console.log(`entity CRUD pages written: ${screens.length}`);
