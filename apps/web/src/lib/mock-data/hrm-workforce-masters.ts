/**
 * Workdo-aligned workforce / leave master data for dedicated HrmMasterCrud screens.
 * Fills former HrmEntityPage stubs with realistic mock seed.
 */

import {
  type MasterEntityConfig,
  type MasterRow,
} from "@/lib/mock-data/hrm-recruitment-setup";

const ACTIVE_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const BRANCH_OPTS = [
  { value: "Dhaka HQ", label: "Dhaka HQ" },
  { value: "Gazipur DC", label: "Gazipur DC" },
  { value: "Chittagong", label: "Chittagong" },
  { value: "All branches", label: "All branches" },
];

const DEPT_OPTS = [
  "Operations",
  "Sales",
  "Finance",
  "Human Resources",
  "Technology",
  "Customer Support",
  "Marketing",
  "Warehouse & Fulfillment",
  "Procurement",
  "Logistics",
].map((d) => ({ value: d, label: d }));

const HOLIDAY_CAT = [
  { value: "National", label: "National" },
  { value: "Religious", label: "Religious" },
  { value: "Company", label: "Company" },
];

const ANN_CAT = [
  { value: "Company news", label: "Company news" },
  { value: "Policy updates", label: "Policy updates" },
  { value: "Events", label: "Events" },
  { value: "HR notice", label: "HR notice" },
];

const ACCRUAL_OPTS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const BRANCHES_CONFIG: MasterEntityConfig = {
  title: "Branches",
  addLabel: "Add Branch",
  idPrefix: "br",
  sheetHint: "Company locations and branch offices.",
  fields: [
    { key: "name", label: "Branch Name", type: "text", required: true },
    { key: "address", label: "Address", type: "textarea", list: true },
    { key: "city", label: "City", type: "text", list: true },
    { key: "state", label: "State", type: "text", list: true },
    { key: "country", label: "Country", type: "text", list: true },
    { key: "zip_code", label: "Zip Code", type: "text", list: false },
    { key: "phone", label: "Phone", type: "text", list: true },
    { key: "email", label: "Email", type: "text", list: true },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const DEPARTMENTS_CONFIG: MasterEntityConfig = {
  title: "Departments",
  addLabel: "Add Department",
  idPrefix: "dept",
  sheetHint: "Departments linked to branches.",
  fields: [
    { key: "name", label: "Department", type: "text", required: true },
    { key: "branch_id", label: "Branch", type: "select", required: true, options: [] },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const DESIGNATIONS_CONFIG: MasterEntityConfig = {
  title: "Designations",
  addLabel: "Add Designation",
  idPrefix: "des",
  sheetHint: "Job titles linked to departments.",
  fields: [
    { key: "name", label: "Designation", type: "text", required: true },
    { key: "department_id", label: "Department", type: "select", required: true, options: [] },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const HOLIDAYS_CONFIG: MasterEntityConfig = {
  title: "Holidays",
  addLabel: "Add Holiday",
  idPrefix: "hol",
  sheetHint: "Workdo — company and branch holiday calendar.",
  fields: [
    { key: "name", label: "Holiday", type: "text", required: true },
    { key: "category", label: "Category", type: "select", required: true, options: HOLIDAY_CAT },
    { key: "startDate", label: "Start Date", type: "date", required: true },
    { key: "endDate", label: "End Date", type: "date", required: true },
    { key: "branch_id", label: "Branch", type: "select", options: [], list: true },
    { key: "isPaid", label: "Paid", type: "checkbox", list: true },
    { key: "isHalfDay", label: "Half Day", type: "checkbox", list: true },
    { key: "isRecurring", label: "Recurring", type: "checkbox", list: false },
    { key: "description", label: "Description", type: "textarea", list: false },
  ],
  seed: [],
};

export const ANNOUNCEMENTS_CONFIG: MasterEntityConfig = {
  title: "Announcements",
  addLabel: "Add Announcement",
  idPrefix: "ann",
  sheetHint: "Workdo — company-wide and department announcements.",
  fields: [
    { key: "name", label: "Title", type: "text", required: true },
    { key: "category", label: "Category", type: "select", required: true, options: ANN_CAT },
    { key: "content", label: "Content", type: "textarea", list: false },
    { key: "startDate", label: "Start Date", type: "date", required: true },
    { key: "endDate", label: "End Date", type: "date", required: true },
    { key: "branch", label: "Branch", type: "select", options: BRANCH_OPTS, list: true },
    { key: "department", label: "Department", type: "select", options: [{ value: "All", label: "All" }, ...DEPT_OPTS], list: true },
    { key: "isFeatured", label: "Featured", type: "checkbox", list: true },
    { key: "isHighPriority", label: "High Priority", type: "checkbox", list: true },
    { key: "isCompanyWide", label: "Company Wide", type: "checkbox", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [
    { id: "ann_01", name: "Ramadan working hours", category: "Policy updates", content: "Office hours shift to 9:00–15:00 during Ramadan.", startDate: "2026-02-20", endDate: "2026-03-20", branch: "All branches", department: "All", isFeatured: true, isHighPriority: true, isCompanyWide: true, status: "active" },
    { id: "ann_02", name: "Q3 town hall", category: "Events", content: "All-hands town hall on Friday 4 PM in Board Room / Zoom.", startDate: "2026-07-20", endDate: "2026-07-25", branch: "Dhaka HQ", department: "All", isFeatured: true, isHighPriority: false, isCompanyWide: true, status: "active" },
    { id: "ann_03", name: "Leave balance audit", category: "HR notice", content: "HR will reconcile leave balances by July 31. Raise disputes by July 28.", startDate: "2026-07-15", endDate: "2026-07-31", branch: "All branches", department: "Human Resources", isFeatured: false, isHighPriority: true, isCompanyWide: true, status: "active" },
    { id: "ann_04", name: "Warehouse safety drill", category: "Events", content: "Mandatory safety drill at Gazipur DC.", startDate: "2026-08-01", endDate: "2026-08-01", branch: "Gazipur DC", department: "Warehouse & Fulfillment", isFeatured: false, isHighPriority: false, isCompanyWide: false, status: "active" },
    { id: "ann_05", name: "Old referral bonus (ended)", category: "Company news", content: "Referral bonus campaign ended Dec 2025.", startDate: "2025-10-01", endDate: "2025-12-31", branch: "All branches", department: "All", isFeatured: false, isHighPriority: false, isCompanyWide: true, status: "inactive" },
  ],
};

export const AWARD_TYPES_CONFIG: MasterEntityConfig = {
  title: "Award Types",
  addLabel: "Add Award Type",
  idPrefix: "awt",
  sheetHint: "Configurable award categories.",
  fields: [
    { key: "name", label: "Award Type", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: true },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const DOCUMENT_TYPES_CONFIG: MasterEntityConfig = {
  title: "Document Types",
  addLabel: "Add Document Type",
  idPrefix: "doctype",
  sheetHint: "Employee document type master.",
  fields: [
    { key: "name", label: "Document Type", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: true },
    { key: "is_required", label: "Required", type: "checkbox", list: true },
  ],
  seed: [],
};

export const LEAVE_TYPES_CONFIG: MasterEntityConfig = {
  title: "Leave Types",
  addLabel: "Add Leave Type",
  idPrefix: "lt",
  sheetHint: "Workdo — annual, sick, casual, and custom leave types.",
  fields: [
    { key: "name", label: "Leave Type", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    {
      key: "maxDaysPerYear",
      label: "Max Days per Year",
      type: "number",
      required: true,
      suffix: "days",
    },
    { key: "isPaid", label: "Paid", type: "checkbox", list: true },
    { key: "color", label: "Color", type: "text", placeholder: "#4caf50", list: true },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const LEAVE_POLICIES_CONFIG: MasterEntityConfig = {
  title: "Leave Policies",
  addLabel: "Add Leave Policy",
  idPrefix: "lp",
  sheetHint: "Workdo — accrual and approval policies.",
  fields: [
    { key: "name", label: "Policy Name", type: "text", required: true },
    { key: "leave_type_id", label: "Leave Type", type: "select", required: true, options: [] },
    { key: "accrualType", label: "Accrual", type: "select", required: true, options: ACCRUAL_OPTS },
    { key: "accrualRate", label: "Accrual Rate", type: "number", list: true },
    { key: "carryForwardLimit", label: "Carry Forward", type: "number", list: true },
    { key: "minDaysPerApplication", label: "Min Days", type: "number", list: true },
    { key: "maxDaysPerApplication", label: "Max Days", type: "number", list: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

/** Flatten helper used by payroll entries page. */
export type { MasterRow };
