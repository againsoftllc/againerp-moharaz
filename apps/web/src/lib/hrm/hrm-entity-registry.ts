import { HRM_NAV_MENUS } from "@/lib/hrm/hrm-nav";
import {
  HRM_STATUS_OPTIONS,
  type HrmEntityDef,
  type HrmEntityRow,
  type HrmFieldDef,
} from "@/lib/hrm/hrm-entity-types";

const SKIP_HREFS = new Set([
  "/hrm/dashboard",
  "/hrm/employees",
  "/hrm/settings", // Configuration — keep settings form later; still give simple CRUD list
]);

/** Screens that keep a dedicated UI (not generic entity CRUD). */
export const HRM_DEDICATED_CRUD_HREFS = new Set([
  "/hrm/dashboard",
  "/hrm/employees",
  "/hrm/calendar",
  "/hrm/org-chart",
  "/hrm/settings",
]);

const NAMES = [
  "Karim Ahmed",
  "Sadia Rahman",
  "Nusrat Jahan",
  "Rafiq Ahmed",
  "Sumaiya Akter",
  "Tanvir Hasan",
  "Farzana Islam",
  "Imran Hossain",
];

const DEPTS = [
  "Operations",
  "Sales",
  "Finance",
  "Human Resources",
  "Technology",
  "Warehouse & Fulfillment",
  "Customer Support",
  "Marketing",
  "Procurement",
  "Logistics",
];
const BRANCHES = ["Dhaka HQ", "Gazipur DC", "Chittagong"];

/** Workdo-style department master seed (Name, Branch, Description, Status). */
const DEPARTMENTS_SEED: HrmEntityRow[] = [
  {
    id: "dept_001",
    name: "Operations",
    branch: "Dhaka HQ",
    description:
      "Day-to-day order fulfillment coordination, process improvement, and cross-team delivery SLAs.",
    status: "active",
  },
  {
    id: "dept_002",
    name: "Sales",
    branch: "Dhaka HQ",
    description:
      "B2B and retail sales, key-account management, and pipeline reporting for the Dhaka market.",
    status: "active",
  },
  {
    id: "dept_003",
    name: "Finance",
    branch: "Dhaka HQ",
    description:
      "Accounts payable/receivable, payroll support, budgeting, and statutory compliance.",
    status: "active",
  },
  {
    id: "dept_004",
    name: "Human Resources",
    branch: "Dhaka HQ",
    description:
      "Recruitment, employee relations, leave & attendance policy, and performance cycles.",
    status: "active",
  },
  {
    id: "dept_005",
    name: "Technology",
    branch: "Dhaka HQ",
    description:
      "Product engineering, QA, infrastructure, and internal tools for AgainERP operations.",
    status: "active",
  },
  {
    id: "dept_006",
    name: "Warehouse & Fulfillment",
    branch: "Gazipur DC",
    description:
      "Inbound receiving, put-away, picking, packing, and outbound dispatch at Gazipur DC.",
    status: "active",
  },
  {
    id: "dept_007",
    name: "Sales",
    branch: "Chittagong",
    description:
      "Regional sales coverage for Chittagong and port-side B2B accounts.",
    status: "active",
  },
  {
    id: "dept_008",
    name: "Customer Support",
    branch: "Dhaka HQ",
    description:
      "Order issues, returns, courier escalations, and customer communication (phone & chat).",
    status: "active",
  },
  {
    id: "dept_009",
    name: "Marketing",
    branch: "Dhaka HQ",
    description:
      "Campaigns, brand assets, marketplace promotions, and performance creatives.",
    status: "active",
  },
  {
    id: "dept_010",
    name: "Procurement",
    branch: "Gazipur DC",
    description:
      "Vendor sourcing, purchase orders, and stock replenishment for the distribution center.",
    status: "active",
  },
  {
    id: "dept_011",
    name: "Logistics",
    branch: "Chittagong",
    description:
      "Last-mile and line-haul coordination for southern region deliveries.",
    status: "active",
  },
  {
    id: "dept_012",
    name: "Quality Assurance",
    branch: "Gazipur DC",
    description:
      "Inbound QC sampling and returns inspection — currently paused pending new SOP rollout.",
    status: "inactive",
  },
];

/** Workdo-style designation master seed (Name, Department, Description, Status). */
const DESIGNATIONS_SEED: HrmEntityRow[] = [
  {
    id: "des_001",
    name: "Operations Manager",
    department: "Operations",
    description: "Owns end-to-end ops KPIs, shift planning, and cross-department escalations.",
    status: "active",
  },
  {
    id: "des_002",
    name: "Operations Coordinator",
    department: "Operations",
    description: "Coordinates daily order flow, courier handoffs, and exception tracking.",
    status: "active",
  },
  {
    id: "des_003",
    name: "Admin Assistant",
    department: "Operations",
    description: "Office administration, vendor appointments, and internal documentation.",
    status: "active",
  },
  {
    id: "des_004",
    name: "Sales Executive",
    department: "Sales",
    description: "Handles retail and SME outbound sales with weekly pipeline targets.",
    status: "active",
  },
  {
    id: "des_005",
    name: "Key Account Manager",
    department: "Sales",
    description: "Manages strategic B2B accounts, renewals, and commercial negotiations.",
    status: "active",
  },
  {
    id: "des_006",
    name: "Inside Sales Representative",
    department: "Sales",
    description: "Inbound lead qualification, quotations, and CRM follow-ups.",
    status: "active",
  },
  {
    id: "des_007",
    name: "Accountant",
    department: "Finance",
    description: "Bookkeeping, reconciliations, and month-end close support.",
    status: "active",
  },
  {
    id: "des_008",
    name: "Payroll Officer",
    department: "Finance",
    description: "Salary processing, payslips, tax deductions, and statutory filings.",
    status: "active",
  },
  {
    id: "des_009",
    name: "Finance Controller",
    department: "Finance",
    description: "Budget control, cost centers, and management reporting.",
    status: "active",
  },
  {
    id: "des_010",
    name: "HR Officer",
    department: "Human Resources",
    description: "Employee lifecycle admin, policy queries, and onboarding checklists.",
    status: "active",
  },
  {
    id: "des_011",
    name: "Recruitment Specialist",
    department: "Human Resources",
    description: "Job posting, screening, interview scheduling, and offer coordination.",
    status: "active",
  },
  {
    id: "des_012",
    name: "HR Business Partner",
    department: "Human Resources",
    description: "Partnering with department heads on performance and workforce planning.",
    status: "active",
  },
  {
    id: "des_013",
    name: "Software Engineer",
    department: "Technology",
    description: "Builds and maintains AgainERP features across web and API services.",
    status: "active",
  },
  {
    id: "des_014",
    name: "QA Analyst",
    department: "Technology",
    description: "Test planning, regression suites, and release quality gates.",
    status: "active",
  },
  {
    id: "des_015",
    name: "DevOps Engineer",
    department: "Technology",
    description: "CI/CD, container hosting, monitoring, and environment reliability.",
    status: "active",
  },
  {
    id: "des_016",
    name: "Support Agent",
    department: "Customer Support",
    description: "First-line ticket handling for order, delivery, and return issues.",
    status: "active",
  },
  {
    id: "des_017",
    name: "Support Team Lead",
    department: "Customer Support",
    description: "Queue management, SLA monitoring, and agent coaching.",
    status: "active",
  },
  {
    id: "des_018",
    name: "Marketing Executive",
    department: "Marketing",
    description: "Campaign execution, marketplace ads, and creative brief coordination.",
    status: "active",
  },
  {
    id: "des_019",
    name: "Content Specialist",
    department: "Marketing",
    description: "Product content, banners, and social/email copy for promotions.",
    status: "active",
  },
  {
    id: "des_020",
    name: "Warehouse Supervisor",
    department: "Warehouse & Fulfillment",
    description: "Floor supervision for receiving, picking accuracy, and dispatch cut-offs.",
    status: "active",
  },
  {
    id: "des_021",
    name: "Picker",
    department: "Warehouse & Fulfillment",
    description: "Order picking against wave lists with barcode scanning.",
    status: "active",
  },
  {
    id: "des_022",
    name: "Packer",
    department: "Warehouse & Fulfillment",
    description: "Packaging, labeling, and handover to courier staging.",
    status: "active",
  },
  {
    id: "des_023",
    name: "Procurement Officer",
    department: "Procurement",
    description: "PO creation, vendor follow-up, and replenishment planning for Gazipur DC.",
    status: "active",
  },
  {
    id: "des_024",
    name: "Logistics Coordinator",
    department: "Logistics",
    description: "Line-haul and last-mile scheduling for the Chittagong region.",
    status: "active",
  },
  {
    id: "des_025",
    name: "Regional Sales Executive",
    department: "Sales",
    description: "Field sales for Chittagong and nearby industrial accounts.",
    status: "active",
  },
  {
    id: "des_026",
    name: "Night Shift Supervisor",
    department: "Warehouse & Fulfillment",
    description: "Legacy night-ops role — kept inactive after shift consolidation.",
    status: "inactive",
  },
];

const ATTENDANCE_STATUS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half Day" },
  { value: "holiday", label: "Holiday" },
  { value: "on_leave", label: "On Leave" },
] as const;

const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

/** Workdo Attendance Records seed — Employee, Shift, Policy, Date, Clock In/Out, hours, flags, Status. */
const ATTENDANCE_RECORDS_SEED: HrmEntityRow[] = [
  {
    id: "att_001",
    name: "Karim Ahmed",
    employeeName: "Karim Ahmed",
    employeeCode: "EMP-1001",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-22",
    clockIn: "09:02",
    clockOut: "18:05",
    totalHours: 8.05,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "",
  },
  {
    id: "att_002",
    name: "Sadia Rahman",
    employeeName: "Sadia Rahman",
    employeeCode: "EMP-1002",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-22",
    clockIn: "09:28",
    clockOut: "18:10",
    totalHours: 7.7,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "yes",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Late by 13 min (within escalation, beyond grace).",
  },
  {
    id: "att_003",
    name: "Nusrat Jahan",
    employeeName: "Nusrat Jahan",
    employeeCode: "EMP-1003",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-22",
    clockIn: "08:55",
    clockOut: "19:20",
    totalHours: 9.42,
    breakHours: 1,
    overtimeHours: 1.42,
    overtimeAmount: 850,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "OT approved for recruitment drive.",
  },
  {
    id: "att_004",
    name: "Ruma Begum",
    employeeName: "Ruma Begum",
    employeeCode: "EMP-1015",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-22",
    clockIn: "",
    clockOut: "",
    totalHours: 0,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "on_leave",
    notes: "Approved sick leave.",
  },
  {
    id: "att_005",
    name: "Tanvir Hasan",
    employeeName: "Tanvir Hasan",
    employeeCode: "EMP-1006",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-22",
    clockIn: "09:00",
    clockOut: "13:05",
    totalHours: 4.08,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "yes",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "half_day",
    notes: "Half day — medical appointment.",
  },
  {
    id: "att_006",
    name: "Ashik Rahman",
    employeeName: "Ashik Rahman",
    employeeCode: "EMP-1010",
    shift: "Morning",
    attendancePolicy: "Warehouse Shift Policy",
    date: "2026-07-22",
    clockIn: "06:58",
    clockOut: "15:12",
    totalHours: 7.23,
    breakHours: 0.75,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Gazipur DC morning wave.",
  },
  {
    id: "att_007",
    name: "Mahbub Alam",
    employeeName: "Mahbub Alam",
    employeeCode: "EMP-1014",
    shift: "Morning",
    attendancePolicy: "Warehouse Shift Policy",
    date: "2026-07-22",
    clockIn: "",
    clockOut: "",
    totalHours: 0,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "yes",
    isHoliday: "no",
    isWeekend: "no",
    status: "absent",
    notes: "No biometric punch — marked absent.",
  },
  {
    id: "att_008",
    name: "Farzana Islam",
    employeeName: "Farzana Islam",
    employeeCode: "EMP-1007",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-21",
    clockIn: "09:05",
    clockOut: "18:00",
    totalHours: 7.92,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "",
  },
  {
    id: "att_009",
    name: "Imran Hossain",
    employeeName: "Imran Hossain",
    employeeCode: "EMP-1008",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-21",
    clockIn: "09:40",
    clockOut: "17:15",
    totalHours: 6.58,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "yes",
    isEarlyDeparture: "yes",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Late + early leave — regularization pending.",
  },
  {
    id: "att_010",
    name: "Mehnaz Chowdhury",
    employeeName: "Mehnaz Chowdhury",
    employeeCode: "EMP-1009",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-21",
    clockIn: "08:50",
    clockOut: "18:30",
    totalHours: 8.67,
    breakHours: 1,
    overtimeHours: 0.67,
    overtimeAmount: 400,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "",
  },
  {
    id: "att_011",
    name: "Karim Ahmed",
    employeeName: "Karim Ahmed",
    employeeCode: "EMP-1001",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-20",
    clockIn: "09:00",
    clockOut: "18:00",
    totalHours: 8,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "",
  },
  {
    id: "att_012",
    name: "Sadia Rahman",
    employeeName: "Sadia Rahman",
    employeeCode: "EMP-1002",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-20",
    clockIn: "",
    clockOut: "",
    totalHours: 0,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "on_leave",
    notes: "Approved casual leave (1 day).",
  },
  {
    id: "att_013",
    name: "Lamia Sultana",
    employeeName: "Lamia Sultana",
    employeeCode: "EMP-1011",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-20",
    clockIn: "09:10",
    clockOut: "18:05",
    totalHours: 7.92,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "",
  },
  {
    id: "att_014",
    name: "All staff",
    employeeName: "—",
    employeeCode: "",
    shift: "—",
    attendancePolicy: "Holiday Calendar",
    date: "2026-07-27",
    clockIn: "",
    clockOut: "",
    totalHours: 0,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "yes",
    isWeekend: "no",
    status: "holiday",
    notes: "Ashura — company holiday.",
  },
  {
    id: "att_015",
    name: "Priya Das",
    employeeName: "Priya Das",
    employeeCode: "EMP-1013",
    shift: "General",
    attendancePolicy: "Probation Attendance Policy",
    date: "2026-07-22",
    clockIn: "08:45",
    clockOut: "18:00",
    totalHours: 8.25,
    breakHours: 1,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Probation — early punch habit.",
  },
  {
    id: "att_016",
    name: "Rafiq Ahmed",
    employeeName: "Rafiq Ahmed",
    employeeCode: "EMP-1004",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-19",
    clockIn: "",
    clockOut: "",
    totalHours: 0,
    breakHours: 0,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "yes",
    status: "holiday",
    notes: "Weekend — no duty roster.",
  },
  {
    id: "att_017",
    name: "Sumaiya Akter",
    employeeName: "Sumaiya Akter",
    employeeCode: "EMP-1005",
    shift: "Evening",
    attendancePolicy: "Warehouse Shift Policy",
    date: "2026-07-22",
    clockIn: "14:05",
    clockOut: "22:10",
    totalHours: 7.08,
    breakHours: 0.75,
    overtimeHours: 0,
    overtimeAmount: 0,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Evening pack lane.",
  },
  {
    id: "att_018",
    name: "Karim Ahmed",
    employeeName: "Karim Ahmed",
    employeeCode: "EMP-1001",
    shift: "General",
    attendancePolicy: "Standard Office Policy",
    date: "2026-07-18",
    clockIn: "09:01",
    clockOut: "20:15",
    totalHours: 10.23,
    breakHours: 1,
    overtimeHours: 2.23,
    overtimeAmount: 1350,
    isLate: "no",
    isEarlyDeparture: "no",
    isAbsent: "no",
    isHoliday: "no",
    isWeekend: "no",
    status: "present",
    notes: "Month-end ops review OT.",
  },
];

function f(
  key: string,
  label: string,
  type: HrmFieldDef["type"],
  opts?: Partial<HrmFieldDef>,
): HrmFieldDef {
  return { key, label, type, list: true, ...opts };
}

function baseMasterFields(): HrmFieldDef[] {
  return [
    f("code", "Code", "text", { required: true }),
    f("name", "Name", "text", { required: true }),
    f("description", "Description", "textarea", { list: false }),
    f("status", "Status", "status", {
      required: true,
      options: HRM_STATUS_OPTIONS.filter((o) =>
        ["active", "inactive", "draft"].includes(o.value),
      ),
    }),
  ];
}

function employeeRecordFields(extra: HrmFieldDef[] = []): HrmFieldDef[] {
  return [
    f("name", "Title", "text", { required: true }),
    f("employeeName", "Employee", "text", { required: true }),
    f("department", "Department", "select", {
      options: DEPTS.map((d) => ({ value: d, label: d })),
    }),
    ...extra,
    f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    f("notes", "Notes", "textarea", { list: false }),
  ];
}

/**
 * Exact field definitions captured from the Workdo HRM demo (demo.workdo.io/hrm)
 * for entities that need precise, non-generic fields. Checked before the
 * keyword-based heuristics in fieldsFor() below.
 */
function idSpecificFields(id: string): HrmFieldDef[] | null {
  switch (id) {
    // ---------------- Workforce — Org Structure ----------------
    case "org-chart":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("designation", "Designation", "text", { required: true }),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("branch", "Branch", "select", {
          options: BRANCHES.map((b) => ({ value: b, label: b })),
        }),
        f("reportsTo", "Reports To", "text"),
        f("level", "Level", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "branches":
      return [
        f("name", "Branch Name", "text", { required: true }),
        f("address", "Address", "textarea", { list: false }),
        f("phone", "Phone", "text"),
        f("email", "Email", "text"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "departments":
      return [
        f("name", "Department Name", "text", { required: true }),
        f("branch", "Branch", "select", {
          options: BRANCHES.map((b) => ({ value: b, label: b })),
        }),
        f("description", "Description", "textarea", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "designations":
      return [
        f("name", "Designation", "text", { required: true }),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("description", "Description", "textarea", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "holidays":
      return [
        f("name", "Holiday Name", "text", { required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date"),
        f("category", "Category", "select", {
          options: [
            { value: "national", label: "National" },
            { value: "religious", label: "Religious" },
            { value: "company", label: "Company-specific" },
            { value: "other", label: "Other" },
          ],
        }),
        f("description", "Description", "textarea", { list: false }),
        f("isRecurring", "Is Recurring", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("isPaid", "Is Paid", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("isHalfDay", "Is Half Day", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("branch", "Branches", "select", {
          options: [
            { value: "all", label: "All branches" },
            ...BRANCHES.map((b) => ({ value: b, label: b })),
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "announcements":
      return [
        f("name", "Title", "text", { required: true }),
        f("category", "Category", "select", {
          options: [
            { value: "company_news", label: "Company news" },
            { value: "policy_updates", label: "Policy updates" },
            { value: "events", label: "Events" },
            { value: "other", label: "Other" },
          ],
        }),
        f("description", "Summary", "textarea", { list: false }),
        f("content", "Content", "textarea", { list: false, required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date"),
        f("isFeatured", "Is Featured", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("isHighPriority", "Is High Priority", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("isCompanyWide", "Company Wide", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("department", "Target Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
          list: false,
        }),
        f("branch", "Target Branch", "select", {
          options: BRANCHES.map((b) => ({ value: b, label: b })),
          list: false,
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
      ];

    case "award-types":
      return [
        f("name", "Award Type Name", "text", { required: true }),
        f("criteria", "Criteria", "textarea", { list: false }),
        f("benefits", "Benefits", "textarea", { list: false }),
        f("eligibility", "Eligibility", "textarea", { list: false }),
        f("frequency", "Frequency", "select", {
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "annual", label: "Annual" },
            { value: "ad_hoc", label: "Ad hoc" },
          ],
        }),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "document-types":
      return [
        f("name", "Document Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("required", "Required", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    // ---------------- Workforce — Attendance ----------------
    case "attendance-records":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("employeeCode", "Employee ID", "text", { list: false }),
        f("date", "Date", "date", { required: true }),
        f("shift", "Shift", "select", {
          options: [
            { value: "General", label: "General" },
            { value: "Morning", label: "Morning" },
            { value: "Evening", label: "Evening" },
            { value: "Night", label: "Night" },
          ],
        }),
        f("clockIn", "Clock In", "text", { placeholder: "HH:MM" }),
        f("clockOut", "Clock Out", "text", { placeholder: "HH:MM" }),
        f("totalHours", "Total Hours", "number"),
        f("status", "Status", "status", {
          required: true,
          options: [...ATTENDANCE_STATUS],
        }),
        f("attendancePolicy", "Attendance Policy", "select", {
          options: [
            { value: "Standard Office Policy", label: "Standard Office Policy" },
            { value: "Warehouse Shift Policy", label: "Warehouse Shift Policy" },
            { value: "Probation Attendance Policy", label: "Probation Attendance Policy" },
            { value: "Holiday Calendar", label: "Holiday Calendar" },
          ],
          list: false,
        }),
        f("breakHours", "Break Hours", "number", { list: false }),
        f("overtimeHours", "Overtime Hours", "number", { list: false }),
        f("overtimeAmount", "Overtime Amount", "number", { list: false }),
        f("isLate", "Is Late", "select", { options: [...YES_NO], list: false }),
        f("isEarlyDeparture", "Early Departure", "select", {
          options: [...YES_NO],
          list: false,
        }),
        f("isAbsent", "Is Absent", "select", { options: [...YES_NO], list: false }),
        f("isHoliday", "Is Holiday", "select", { options: [...YES_NO], list: false }),
        f("isWeekend", "Is Weekend", "select", { options: [...YES_NO], list: false }),
        f("notes", "Notes", "textarea", { list: false }),
      ];

    case "timesheet":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("date", "Date", "date", { required: true }),
        f("hours", "Hours", "number", { required: true }),
        f("project", "Project", "text"),
        f("description", "Description", "textarea", { list: false }),
        f("approvedAt", "Approved At", "date", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ],
        }),
      ];

    case "biometric":
      return [
        f("employeeCode", "Employee Code", "text", { required: true }),
        f("employeeName", "Employee Name", "text", { required: true }),
        f("date", "Date", "date", { required: true }),
        f("clockIn", "Clock In Time", "text"),
        f("clockOut", "Clock Out Time", "text"),
        f("totalEntries", "Total Entries", "number"),
        f("punchDetails", "Punch Details", "textarea", { list: false }),
        f("verifyType", "Verify Type", "text", { list: false }),
        f("terminal", "Terminal", "text"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "synced", label: "Synced" },
            { value: "pending", label: "Pending" },
            { value: "failed", label: "Failed" },
          ],
        }),
      ];

    case "attendance-regularizations":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("attendanceRecord", "Attendance Record", "text", { list: false }),
        f("date", "Date", "date", { required: true }),
        f("originalClockIn", "Original Clock In", "text"),
        f("originalClockOut", "Original Clock Out", "text"),
        f("requestedClockIn", "Requested Clock In", "text", { required: true }),
        f("requestedClockOut", "Requested Clock Out", "text", { required: true }),
        f("reason", "Reason", "textarea", { list: false, required: true }),
        f("approvedAt", "Approved At", "date", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ],
        }),
      ];

    case "shifts":
      return [
        f("name", "Shift Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("startTime", "Start Time", "text", { required: true }),
        f("endTime", "End Time", "text", { required: true }),
        f("breakDuration", "Break Duration (min)", "number"),
        f("breakStartTime", "Break Start Time", "text", { list: false }),
        f("breakEndTime", "Break End Time", "text", { list: false }),
        f("gracePeriod", "Grace Period (min)", "number"),
        f("isNightShift", "Is Night Shift", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "attendance-policies":
      return [
        f("name", "Policy Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("lateArrivalGrace", "Late Arrival Grace (min)", "number"),
        f("earlyDepartureGrace", "Early Departure Grace (min)", "number"),
        f("overtimeRatePerHour", "Overtime Rate / Hour", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    // ---------------- Workforce — Leave Management ----------------
    case "leave-types":
      return [
        f("name", "Leave Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("maxDaysPerYear", "Max Days per Year", "number"),
        f("isPaid", "Is Paid", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("color", "Color", "text", { placeholder: "#22c55e", list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "leave-policies":
      return [
        f("name", "Policy Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("leaveType", "Leave Type", "select", {
          required: true,
          options: [
            { value: "annual", label: "Annual Leave" },
            { value: "sick", label: "Sick Leave" },
            { value: "maternity", label: "Maternity Leave" },
            { value: "personal", label: "Personal Leave" },
            { value: "casual", label: "Casual Leave" },
          ],
        }),
        f("accrualType", "Accrual Type", "select", {
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "yearly", label: "Yearly" },
            { value: "fixed", label: "Fixed" },
          ],
        }),
        f("accrualRate", "Accrual Rate", "number"),
        f("carryForwardLimit", "Carry Forward Limit", "number"),
        f("minDaysPerApplication", "Min Days / Application", "number"),
        f("maxDaysPerApplication", "Max Days / Application", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "leave-applications":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("leaveType", "Leave Type", "select", {
          required: true,
          options: [
            { value: "annual", label: "Annual Leave" },
            { value: "sick", label: "Sick Leave" },
            { value: "maternity", label: "Maternity Leave" },
            { value: "personal", label: "Personal Leave" },
            { value: "casual", label: "Casual Leave" },
          ],
        }),
        f("leavePolicy", "Leave Policy", "text", { list: false }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date", { required: true }),
        f("totalDays", "Total Days", "number"),
        f("reason", "Reason", "textarea", { list: false }),
        f("attachment", "Attachment", "text", { list: false, placeholder: "Filename / URL" }),
        f("approvedAt", "Approved At", "date", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ],
        }),
      ];

    case "leave-balances":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("leaveType", "Leave Type", "text", { required: true }),
        f("leavePolicy", "Leave Policy", "text", { list: false }),
        f("year", "Year", "number", { required: true }),
        f("allocatedDays", "Allocated Days", "number"),
        f("usedDays", "Used Days", "number"),
        f("remainingDays", "Remaining Days", "number"),
        f("carriedForward", "Carried Forward", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    // ---------------- Talent — Recruitment ----------------
    case "job-categories":
      return [
        f("name", "Category Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "job-types":
      return [
        f("name", "Job Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "job-locations":
      return [
        f("name", "Location Name", "text", { required: true }),
        f("address", "Address", "textarea", { list: false }),
        f("city", "City", "text"),
        f("state", "State / Province", "text"),
        f("country", "Country", "text"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "job-postings":
      return [
        f("name", "Job Title", "text", { required: true }),
        f("jobCode", "Job Code", "text"),
        f("jobType", "Job Type", "select", {
          required: true,
          options: [
            { value: "full_time", label: "Full-time" },
            { value: "part_time", label: "Part-time" },
            { value: "contract", label: "Contract" },
            { value: "internship", label: "Internship" },
          ],
        }),
        f("location", "Location", "text", { required: true }),
        f("branch", "Branch", "select", {
          required: true,
          options: BRANCHES.map((b) => ({ value: b, label: b })),
        }),
        f("department", "Department", "select", {
          required: true,
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("priority", "Priority", "select", {
          required: true,
          options: [
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ],
        }),
        f("requiredSkills", "Required Skills", "textarea", { list: false, required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("applicationDeadline", "Application Deadline", "date", { required: true }),
        f("jobApplication", "Job Application", "select", {
          required: true,
          options: [
            { value: "career_page", label: "Career Page" },
            { value: "external_url", label: "External URL" },
            { value: "email", label: "Email" },
          ],
        }),
        f("applicationUrl", "Application URL", "text", { list: false }),
        f("numberOfPositions", "Number of Positions", "number"),
        f("minExperience", "Min Experience (Years)", "number", { required: true }),
        f("maxExperience", "Max Experience (Years)", "number", { required: true }),
        f("minSalary", "Min Salary", "number", { required: true }),
        f("maxSalary", "Max Salary", "number", { required: true }),
        f("description", "Job Description", "textarea", { list: false, required: true }),
        f("requirements", "Requirements", "textarea", { list: false, required: true }),
        f("benefits", "Benefits", "textarea", { list: false, required: true }),
        f("isFeatured", "Is Featured", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
          list: false,
        }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "published", label: "Published" },
            { value: "closed", label: "Closed" },
            { value: "on_hold", label: "On Hold" },
          ],
        }),
      ];

    case "custom-questions":
      return [
        f("name", "Question", "text", { required: true }),
        f("required", "Required", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("questionType", "Answer Type", "select", {
          options: [
            { value: "text", label: "Text" },
            { value: "textarea", label: "Long text" },
            { value: "select", label: "Select" },
            { value: "yes_no", label: "Yes / No" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "candidate-sources":
      return [
        f("name", "Source Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("sourceType", "Type", "select", {
          options: [
            { value: "website", label: "Website" },
            { value: "referral", label: "Referral" },
            { value: "agency", label: "Agency" },
            { value: "walk_in", label: "Walk-in" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "candidates":
      return [
        f("name", "Candidate", "text", { required: true }),
        f("email", "Email", "text", { required: true }),
        f("phone", "Phone", "text"),
        f("gender", "Gender", "select", {
          options: [
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
          ],
          list: false,
        }),
        f("dateOfBirth", "Date of Birth", "date", { list: false }),
        f("address", "Address", "textarea", { list: false }),
        f("jobTitle", "Applied For", "text", { required: true }),
        f("source", "Source", "text"),
        f("currentCompany", "Current / Previous Company", "text"),
        f("currentPosition", "Current Position", "text", { list: false }),
        f("totalExperience", "Total Experience (Years)", "number"),
        f("currentSalary", "Current Salary", "number", { list: false }),
        f("expectedSalary", "Expected Salary", "number"),
        f("resume", "Resume / CV", "text", { list: false, placeholder: "Filename" }),
        f("coverLetter", "Cover Letter", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "new", label: "New" },
            { value: "screening", label: "Screening" },
            { value: "interview", label: "Interview" },
            { value: "offer", label: "Offer" },
            { value: "hired", label: "Hired" },
            { value: "rejected", label: "Rejected" },
          ],
        }),
      ];

    case "interview-types":
      return [
        f("name", "Interview Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("duration", "Duration (min)", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "interview-rounds":
      return [
        f("name", "Round Name", "text", { required: true }),
        f("jobPosting", "Job Posting", "text"),
        f("interviewType", "Interview Type", "text"),
        f("sequence", "Sequence", "number"),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "interviews":
      return [
        f("candidate", "Candidate", "text", { required: true }),
        f("jobPosting", "Job Posting", "text"),
        f("interviewRound", "Interview Round", "text"),
        f("interviewType", "Interview Type", "text"),
        f("date", "Date", "date", { required: true }),
        f("time", "Time", "text", { required: true }),
        f("location", "Location / Meeting Link", "text"),
        f("interviewer", "Interviewer", "text"),
        f("notes", "Notes", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "rescheduled", label: "Rescheduled" },
          ],
        }),
      ];

    case "interview-feedback":
      return [
        f("interview", "Interview", "text", { required: true }),
        f("interviewer", "Interviewer", "text", { required: true }),
        f("candidate", "Candidate", "text"),
        f("overallRating", "Overall Rating (1-10)", "number", { required: true }),
        f("technicalSkills", "Technical Skills", "number"),
        f("communication", "Communication", "number"),
        f("culturalFit", "Cultural Fit", "number"),
        f("comments", "Comments", "textarea", { list: false }),
        f("recommendation", "Recommendation", "select", {
          required: true,
          options: [
            { value: "hire", label: "Hire" },
            { value: "maybe", label: "Maybe" },
            { value: "no_hire", label: "No Hire" },
          ],
        }),
        f("nextSteps", "Next Steps", "textarea", { list: false }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "candidate-assessments":
      return [
        f("candidate", "Candidate", "text", { required: true }),
        f("name", "Assessment Title", "text", { required: true }),
        f("assessmentType", "Assessment Type", "select", {
          options: [
            { value: "technical", label: "Technical" },
            { value: "behavioral", label: "Behavioral" },
            { value: "aptitude", label: "Aptitude" },
            { value: "personality", label: "Personality" },
          ],
        }),
        f("assessmentDate", "Assessment Date", "date"),
        f("score", "Score", "number"),
        f("maxScore", "Max Score", "number"),
        f("duration", "Duration (min)", "number"),
        f("notes", "Notes", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ],
        }),
      ];

    case "offer-templates":
      return [
        f("name", "Template Name", "text", { required: true }),
        f("jobType", "Job Type", "select", {
          options: [
            { value: "full_time", label: "Full-time" },
            { value: "part_time", label: "Part-time" },
            { value: "contract", label: "Contract" },
            { value: "internship", label: "Internship" },
          ],
        }),
        f("content", "Content", "textarea", {
          list: false,
          placeholder: "Use {{candidate_name}}, {{salary}}, {{position}}",
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "offers":
      return [
        f("candidate", "Candidate", "text", { required: true }),
        f("name", "Position", "text", { required: true }),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("salary", "Salary", "number", { required: true }),
        f("startDate", "Start Date", "date"),
        f("expirationDate", "Expiration Date", "date"),
        f("approvedBy", "Approved By", "text"),
        f("benefits", "Benefits", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "negotiation", label: "Negotiation" },
            { value: "declined", label: "Declined" },
            { value: "expired", label: "Expired" },
          ],
        }),
      ];

    case "onboarding-checklists":
      return [
        f("name", "Checklist Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("jobType", "Job Type", "select", {
          options: [
            { value: "full_time", label: "Full-time" },
            { value: "part_time", label: "Part-time" },
            { value: "contract", label: "Contract" },
            { value: "internship", label: "Internship" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "checklist-items":
      return [
        f("checklist", "Checklist", "text", { required: true }),
        f("name", "Item / Task", "text", { required: true }),
        f("responsible", "Responsible", "text"),
        f("dueDays", "Due Days (after joining)", "number"),
        f("mandatory", "Mandatory", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("order", "Order", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "candidate-onboarding":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("checklist", "Checklist", "text", { required: true }),
        f("startDate", "Start Date", "date"),
        f("expectedCompletion", "Expected Completion", "date"),
        f("assignedTo", "Assigned To", "text"),
        f("progress", "Progress (%)", "number"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "not_started", label: "Not Started" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "on_hold", label: "On Hold" },
          ],
        }),
      ];

    case "career":
      return [
        f("name", "Job Title", "text", { required: true }),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("location", "Location", "text"),
        f("jobType", "Job Type", "select", {
          options: [
            { value: "full_time", label: "Full-time" },
            { value: "part_time", label: "Part-time" },
            { value: "contract", label: "Contract" },
            { value: "internship", label: "Internship" },
          ],
        }),
        f("salaryRange", "Salary Range", "text"),
        f("vacancies", "Vacancies", "number"),
        f("description", "Job Description", "textarea", { list: false }),
        f("requirements", "Requirements", "textarea", { list: false }),
        f("benefits", "Benefits & Perks", "textarea", { list: false }),
        f("requiredSkills", "Required Skills", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "published", label: "Published" },
            { value: "closed", label: "Closed" },
            { value: "draft", label: "Draft" },
          ],
        }),
      ];

    // ---------------- Talent — Employee Lifecycle ----------------
    case "awards":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("awardType", "Award Type", "text", { required: true }),
        f("name", "Award Title", "text", { required: true }),
        f("awardDate", "Award Date", "date", { required: true }),
        f("reason", "Reason / Contribution", "textarea", { list: false }),
        f("certificate", "Certificate", "text", { list: false, placeholder: "Filename" }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "promotions":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("previousDesignation", "Previous Designation", "text"),
        f("newDesignation", "New Designation", "text", { required: true }),
        f("promotionDate", "Promotion Date", "date", { required: true }),
        f("effectiveDate", "Effective Date", "date", { required: true }),
        f("currentSalary", "Current Salary", "number", { list: false }),
        f("newSalary", "New Salary", "number", { list: false }),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ],
        }),
      ];

    case "transfers":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("fromBranch", "From Branch", "text"),
        f("toBranch", "To Branch", "text"),
        f("fromDepartment", "From Department", "text"),
        f("toDepartment", "To Department", "text"),
        f("fromDesignation", "From Designation", "text"),
        f("toDesignation", "To Designation", "text"),
        f("transferDate", "Transfer Date", "date", { required: true }),
        f("effectiveDate", "Effective Date", "date", { required: true }),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ],
        }),
      ];

    case "warnings":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("subject", "Subject", "text", { required: true }),
        f("type", "Type", "select", {
          required: true,
          options: [
            { value: "performance", label: "performance" },
            { value: "attendance", label: "attendance" },
            { value: "conduct", label: "conduct" },
          ],
        }),
        f("severity", "Severity", "select", {
          required: true,
          options: [
            { value: "verbal", label: "Verbal" },
            { value: "written", label: "Written" },
            { value: "final", label: "Final" },
          ],
        }),
        f("date", "Date", "date", { required: true }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "issued", label: "Issued" },
          ],
        }),
        f("improvementPlan", "Improvement Plan", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false }),
      ];

    case "resignations":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("resignationDate", "Resignation Date", "date", { required: true }),
        f("lastWorkingDay", "Last Working Day", "date", { required: true }),
        f("noticePeriod", "Notice Period", "text", { required: true }),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "rejected", label: "Rejected" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    case "terminations":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("type", "Type", "select", {
          required: true,
          options: [
            { value: "retirement", label: "retirement" },
            { value: "voluntary", label: "voluntary" },
            { value: "involuntary", label: "involuntary" },
            { value: "layoff", label: "layoff" },
            { value: "contract_end", label: "contract end" },
          ],
        }),
        f("terminationDate", "Termination Date", "date", { required: true }),
        f("noticeDate", "Notice Date", "date", { required: true }),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false }),
        f("finalSettlement", "Final Settlement", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    case "trips":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("purpose", "Purpose", "text", { required: true }),
        f("destination", "Destination", "text", { required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date", { required: true }),
        f("advanceAmount", "Advance Amount", "number"),
        f("advanceStatus", "Advance Status", "select", {
          options: [
            { value: "none", label: "—" },
            { value: "requested", label: "Requested" },
            { value: "approved", label: "Approved" },
            { value: "paid", label: "Paid" },
            { value: "reconciled", label: "Reconciled" },
          ],
        }),
        f("totalExpenses", "Total Expenses", "number"),
        f("expenseStatus", "Expense Status", "select", {
          options: [
            { value: "none", label: "—" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "paid", label: "Paid" },
          ],
        }),
        f("description", "Description", "textarea", { list: false }),
        f("expectedOutcomes", "Expected Outcomes", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "planned", label: "Planned" },
            { value: "ongoing", label: "Ongoing" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ],
        }),
      ];

    case "complaints":
      return [
        f("complainantName", "Complainant", "text", { required: true }),
        f("againstName", "Against", "text"),
        f("type", "Type", "select", {
          required: true,
          options: [
            { value: "discrimination", label: "Discrimination" },
            { value: "harassment", label: "Harassment" },
            { value: "management", label: "Management Issues" },
            { value: "workplace", label: "Workplace Conditions" },
            { value: "other", label: "Other" },
          ],
        }),
        f("date", "Date", "date", { required: true }),
        f("assignedTo", "Assigned To", "text"),
        f("document", "Document", "text"),
        f("description", "Description", "textarea", { list: false, required: true }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "submitted", label: "Submitted" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
          ],
        }),
      ];

    // ---------------- Talent — Performance Management ----------------
    case "indicator-categories":
      return [
        f("name", "Category Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("weight", "Weight", "number"),
        f("createdAt", "Created At", "date"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "indicators":
      return [
        f("name", "Indicator Name", "text", { required: true }),
        f("category", "Category", "text", { required: true }),
        f("measurementUnit", "Measurement Unit", "select", {
          options: [
            { value: "rating", label: "Rating" },
            { value: "percentage", label: "Percentage" },
            { value: "hours", label: "Hours" },
            { value: "count", label: "Count" },
            { value: "currency", label: "Currency" },
          ],
        }),
        f("targetValue", "Target Value", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("createdAt", "Created At", "date"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "goal-types":
      return [
        f("name", "Goal Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("frequency", "Frequency", "select", {
          options: [
            { value: "annual", label: "Annual" },
            { value: "quarterly", label: "Quarterly" },
            { value: "monthly", label: "Monthly" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "employee-goals":
      return [
        f("title", "Title", "text", { required: true }),
        f("employeeName", "Employee", "text", { required: true }),
        f("goalType", "Goal Type", "text", { required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date", { required: true }),
        f("progress", "Progress", "number"),
        f("description", "Description", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "not_started", label: "Not Started" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    case "review-cycles":
      return [
        f("name", "Review Cycle Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("frequency", "Frequency", "select", {
          required: true,
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "semi_annual", label: "Semi-Annual" },
            { value: "annual", label: "Annual" },
          ],
        }),
        f("startDate", "Start Date", "date"),
        f("endDate", "End Date", "date"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "draft", label: "Draft" },
          ],
        }),
      ];

    case "employee-reviews":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("reviewerName", "Reviewer", "text", { required: true }),
        f("reviewCycle", "Review Cycle", "text", { required: true }),
        f("reviewDate", "Review Date", "date", { required: true }),
        f("rating", "Rating", "number"),
        f("comments", "Comments", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    // ---------------- Training & Development ----------------
    case "employee-trainings":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("employeeCode", "Employee ID", "text"),
        f("trainingProgram", "Training Program", "text", { required: true }),
        f("programCategory", "Category", "text"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "assigned", label: "Assigned" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
          ],
        }),
        f("assignedDate", "Assigned Date", "date", { required: true }),
        f("completionDate", "Completion Date", "date"),
        f("score", "Score", "number"),
        f("result", "Result", "select", {
          options: [
            { value: "passed", label: "Passed" },
            { value: "failed", label: "Failed" },
          ],
        }),
        f("assessments", "Assessments", "number"),
        f("hasCertificate", "Certificate", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
      ];

    case "training-sessions":
      return [
        f("sessionName", "Session Name", "text", { required: true }),
        f("programName", "Training Program", "text", { required: true }),
        f("startAt", "Start", "text", { required: true, placeholder: "YYYY-MM-DD HH:mm" }),
        f("endAt", "End", "text", { required: true, placeholder: "YYYY-MM-DD HH:mm" }),
        f("location", "Location", "text", { required: true }),
        f("mode", "Mode", "select", {
          options: [
            { value: "virtual", label: "Virtual" },
            { value: "physical", label: "Physical" },
          ],
        }),
        f("trainers", "Trainers", "text"),
        f("attendance", "Attendance", "number"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    case "training-programs":
      return [
        f("name", "Program Name", "text", { required: true }),
        f("category", "Category", "text", { required: true }),
        f("durationHours", "Duration (hours)", "number"),
        f("cost", "Cost", "number"),
        f("capacity", "Capacity", "number"),
        f("enrollmentType", "Flags", "select", {
          options: [
            { value: "mandatory", label: "Mandatory" },
            { value: "self_enrollment", label: "Self-Enrollment" },
          ],
        }),
        f("sessions", "Sessions", "number", { list: true }),
        f("employeesEnrolled", "Employees", "number", { list: true }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
          ],
        }),
      ];

    case "training-assessments":
      return [
        f("name", "Assessment Name", "text", { required: true }),
        f("programName", "Training Program", "text", { required: true }),
        f("assessmentType", "Type", "select", {
          required: true,
          options: [
            { value: "quiz", label: "Quiz" },
            { value: "practical", label: "Practical" },
            { value: "presentation", label: "Presentation" },
          ],
        }),
        f("passingScore", "Passing Score (%)", "number", { required: true }),
        f("results", "Results", "number", { list: true }),
      ];

    case "training-types":
      return [
        f("name", "Training Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("departments", "Departments", "text", { required: true }),
        f("programs", "Programs", "number", { list: true }),
      ];

    // ---------------- Finance — Payroll Management ----------------
    case "payslips":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("employeeCode", "Employee ID", "text"),
        f("designation", "Designation", "text"),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("payPeriod", "Pay Period", "text", {
          required: true,
          placeholder: "2026-07 (Jul 2026)",
        }),
        f("periodStart", "Period Start", "date", { list: false }),
        f("periodEnd", "Period End", "date", { list: false }),
        f("payDate", "Pay Date", "date", { required: true }),
        f("basicSalary", "Basic Salary", "number"),
        f("componentEarnings", "Component Earnings", "number"),
        f("overtimeAmount", "Overtime Amount", "number"),
        f("grossPay", "Gross Pay", "number"),
        f("taxDeductions", "Tax Deductions", "number", { list: false }),
        f("pfDeductions", "PF / ESI Deductions", "number", { list: false }),
        f("otherDeductions", "Other Deductions", "number", { list: false }),
        f("unpaidLeaveDeductions", "Unpaid Leave Deductions", "number", { list: false }),
        f("totalDeductions", "Total Deductions", "number"),
        f("workingDays", "Working Days", "number", { list: false }),
        f("presentDays", "Present Days", "number", { list: false }),
        f("leaveDays", "Leave Days", "number", { list: false }),
        f("overtimeHours", "Overtime Hours", "number", { list: false }),
        f("attendancePercentage", "Attendance %", "number", { list: false }),
        f("netPay", "Net Pay", "number", { required: true }),
        f("generatedOn", "Generated On", "date"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "generated", label: "Generated" },
            { value: "sent", label: "Sent" },
            { value: "downloaded", label: "Downloaded" },
          ],
        }),
      ];

    case "payroll-runs":
      return [
        f("name", "Title", "text", { required: true }),
        f("frequency", "Payroll Frequency", "select", {
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "weekly", label: "Weekly" },
            { value: "biweekly", label: "Bi-weekly" },
          ],
        }),
        f("periodStart", "Pay Period Start", "date", { required: true }),
        f("periodEnd", "Pay Period End", "date", { required: true }),
        f("payDate", "Pay Date", "date", { required: true }),
        f("employeeCount", "Employee Count", "number"),
        f("grossPay", "Total Gross Pay", "number"),
        f("totalDeductions", "Total Deductions", "number"),
        f("netPay", "Total Net Pay", "number"),
        f("notes", "Notes", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "completed", label: "Completed" },
            { value: "approved", label: "Approved" },
          ],
        }),
      ];

    case "employee-salaries":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("employeeCode", "Employee ID", "text"),
        f("department", "Department", "select", {
          options: DEPTS.map((d) => ({ value: d, label: d })),
        }),
        f("designation", "Designation", "text"),
        f("basicSalary", "Basic Salary", "number", { required: true }),
        f("allowances", "Allowances Total", "number"),
        f("deductions", "Deductions Total", "number"),
        f("netSalary", "Net Salary", "number"),
        f("effectiveDate", "Effective Date", "date"),
        f("createdAt", "Created At", "date", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        }),
      ];

    case "salary-components":
      return [
        f("name", "Component Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("componentType", "Type", "select", {
          required: true,
          options: [
            { value: "earning", label: "Earning" },
            { value: "deduction", label: "Deduction" },
          ],
        }),
        f("calculationType", "Calculation Type", "select", {
          required: true,
          options: [
            { value: "fixed", label: "Fixed Amount" },
            { value: "percentage", label: "Percentage of Basic" },
          ],
        }),
        f("defaultAmount", "Default Amount", "number"),
        f("percentageOfBasic", "Percentage of Basic", "number"),
        f("isTaxable", "Is Taxable", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("isMandatory", "Is Mandatory", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    // ---------------- Finance — Asset Management ----------------
    case "assets-dashboard":
      return [
        f("name", "Summary / Category", "text", { required: true }),
        f("totalAssets", "Total Assets", "number"),
        f("available", "Available", "number"),
        f("assigned", "Assigned", "number"),
        f("underMaintenance", "Under Maintenance", "number"),
        f("disposed", "Disposed", "number"),
        f("totalValue", "Total Value", "number"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "assets":
      return [
        f("name", "Asset Name", "text", { required: true }),
        f("assetType", "Asset Type", "text", { required: true }),
        f("serialNumber", "Serial Number", "text"),
        f("assetCode", "Asset Code", "text", { required: true }),
        f("purchaseDate", "Purchase Date", "date"),
        f("purchaseCost", "Purchase Cost", "number"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "available", label: "Available" },
            { value: "assigned", label: "Assigned" },
            { value: "under_maintenance", label: "Under Maintenance" },
            { value: "disposed", label: "Disposed" },
          ],
        }),
        f("condition", "Condition", "select", {
          options: [
            { value: "new", label: "New" },
            { value: "good", label: "Good" },
            { value: "fair", label: "Fair" },
            { value: "poor", label: "Poor" },
          ],
        }),
        f("description", "Description", "textarea", { list: false }),
        f("location", "Location", "text"),
        f("supplier", "Supplier", "text", { list: false }),
        f("warrantyInfo", "Warranty Info", "text", { list: false }),
        f("warrantyExpiry", "Warranty Expiry", "date", { list: false }),
        f("assignedTo", "Assigned To", "text"),
        f("checkoutDate", "Checkout Date", "date", { list: false }),
        f("expectedReturnDate", "Expected Return Date", "date", { list: false }),
      ];

    case "depreciation":
      return [
        f("name", "Asset", "text", { required: true }),
        f("method", "Method", "select", {
          options: [
            { value: "straight_line", label: "Straight Line" },
            { value: "reducing_balance", label: "Reducing Balance" },
          ],
        }),
        f("usefulLifeYears", "Useful Life (Years)", "number"),
        f("salvageValue", "Salvage Value", "number"),
        f("purchaseValue", "Purchase Value", "number"),
        f("rate", "Rate (%)", "number"),
        f("currentValue", "Current Value", "number"),
        f("depreciationAmount", "Depreciation Amount", "number"),
        f("lastCalculatedDate", "Last Calculated Date", "date"),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "asset-types":
      return [
        f("name", "Asset Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("depreciationRate", "Depreciation Rate (%)", "number"),
        f("assetsCount", "Assets", "number", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    // ---------------- Communication — Meetings ----------------
    case "meeting-types":
      return [
        f("name", "Meeting Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("color", "Color", "text", { placeholder: "#22c55e", required: true }),
        f("defaultDuration", "Default Duration (min)", "number", { required: true }),
        f("meetingsCount", "Meetings", "number", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "meeting-rooms":
      return [
        f("name", "Room Name", "text", { required: true }),
        f("kind", "Type", "select", {
          required: true,
          options: [
            { value: "physical", label: "Physical" },
            { value: "virtual", label: "Virtual" },
          ],
        }),
        f("location", "Location", "text"),
        f("joinLink", "Join Link", "text", { list: false }),
        f("capacity", "Capacity", "number", { required: true }),
        f("equipment", "Equipment", "textarea", { list: false }),
        f("meetingsCount", "Meetings", "number", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "meetings":
      return [
        f("name", "Title", "text", { required: true }),
        f("meetingType", "Meeting Type", "text"),
        f("meetingDate", "Date", "date", { required: true }),
        f("startTime", "Start Time", "text", { required: true }),
        f("endTime", "End Time", "text", { required: true }),
        f("location", "Location / Room", "text"),
        f("description", "Agenda / Description", "textarea", { list: false }),
        f("organizer", "Organizer", "text"),
        f("recurrence", "Recurring", "select", {
          options: [
            { value: "none", label: "None" },
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
          ],
        }),
        f("videoLink", "Video Link", "text", { list: false }),
        f("reminder", "Reminder (min before)", "number", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ],
        }),
      ];

    case "meeting-attendees":
      return [
        f("meeting", "Meeting", "text", { required: true }),
        f("employeeName", "Employee", "text"),
        f("externalName", "External Participant", "text", { list: false }),
        f("role", "Role", "select", {
          options: [
            { value: "organizer", label: "Organizer" },
            { value: "presenter", label: "Presenter" },
            { value: "attendee", label: "Attendee" },
          ],
        }),
        f("status", "Invitation Status", "status", {
          required: true,
          options: [
            { value: "invited", label: "Invited" },
            { value: "accepted", label: "Accepted" },
            { value: "declined", label: "Declined" },
            { value: "tentative", label: "Tentative" },
          ],
        }),
        f("attendance", "Attendance", "select", {
          options: [
            { value: "attended", label: "Attended" },
            { value: "not_attended", label: "Not Attended" },
            { value: "pending", label: "Pending" },
          ],
        }),
        f("rsvpDate", "RSVP Date", "date", { list: false }),
        f("declineReason", "Decline Reason", "textarea", { list: false }),
      ];

    case "meeting-minutes":
      return [
        f("meetingTitle", "Meeting", "text", { required: true }),
        f("meetingDate", "Meeting Date", "date", { required: true }),
        f("topic", "Topic", "text", { required: true }),
        f("minuteType", "Type", "select", {
          required: true,
          options: [
            { value: "note", label: "Note" },
            { value: "action_item", label: "Action Item" },
            { value: "decision", label: "Decision" },
            { value: "discussion", label: "Discussion" },
          ],
        }),
        f("content", "Content", "textarea", { list: false }),
        f("recordedByName", "Recorded By", "text"),
        f("recordedAt", "Recorded At", "date"),
      ];

    case "action-items":
      return [
        f("title", "Action Item", "text", { required: true }),
        f("meetingTitle", "Meeting", "text"),
        f("assigneeName", "Assigned To", "text", { required: true }),
        f("dueDate", "Due Date", "date", { required: true }),
        f("priority", "Priority", "select", {
          options: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ],
        }),
        f("progress", "Progress (%)", "number"),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "overdue", label: "Overdue" },
          ],
        }),
        f("notes", "Notes", "textarea", { list: false }),
      ];

    // ---------------- Communication — Documents & Contracts ----------------
    case "contract-types":
      return [
        f("name", "Contract Type Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("durationMonths", "Duration (Months)", "number", { list: true }),
        f("probationMonths", "Probation (Months)", "number"),
        f("noticeDays", "Notice Period (Days)", "number"),
        f("contractsCount", "Contracts", "number", { list: true }),
        f("createdAt", "Created At", "date", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "employee-contracts":
      return [
        f("contractNumber", "Contract Number", "text", { required: true }),
        f("contractName", "Contract Name", "text", { required: true }),
        f("employeeName", "Assigned to", "text", { required: true }),
        f("startDate", "Start Date", "date", { required: true }),
        f("endDate", "End Date", "date", { required: true }),
        f("amount", "Contract Amount", "number", { required: true }),
        f("notes", "Notes", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "terminated", label: "Terminated" },
          ],
        }),
      ];

    case "contract-templates":
      return [
        f("name", "Template Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("contractType", "Contract Type", "text", { required: true }),
        f("content", "Template Content", "textarea", {
          list: false,
          placeholder: "Use {{variable_name}} placeholders",
        }),
        f("variables", "Variables", "textarea", { list: false }),
        f("clauses", "Clauses", "textarea", { list: false }),
        f("isDefault", "Is Default", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("createdAt", "Created", "date", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "document-categories":
      return [
        f("name", "Category Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("color", "Color", "text", { placeholder: "#3b82f6", required: true }),
        f("icon", "Icon", "text", { required: true }),
        f("isMandatory", "Is Mandatory", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("documentsCount", "Documents", "number", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    case "hr-documents":
      return [
        f("name", "Title", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("category", "Category", "text", { required: true }),
        f("fileName", "File Name", "text"),
        f("fileType", "File Type", "text"),
        f("fileSize", "File Size", "text"),
        f("version", "Version", "text", { placeholder: "1.0" }),
        f("effectiveDate", "Effective Date", "date"),
        f("expiryDate", "Expiry Date", "date"),
        f("requiresAcknowledgment", "Requires Acknowledgment", "select", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        f("uploadedBy", "Uploaded By", "text"),
        f("approvedAt", "Approved At", "date", { list: false }),
        f("downloadCount", "Downloads", "number", { list: true }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "draft", label: "Draft" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ],
        }),
      ];

    case "acknowledgements":
      return [
        f("employeeName", "Employee", "text", { required: true }),
        f("documentTitle", "Document", "text", { required: true }),
        f("dueDate", "Due Date", "date", { required: true }),
        f("acknowledgedAt", "Acknowledged", "date"),
        f("assignedBy", "Assigned By", "text"),
        f("assignedAt", "Assigned At", "date", { list: false }),
        f("note", "Note", "textarea", { list: false }),
        f("status", "Status", "status", {
          required: true,
          options: [
            { value: "pending", label: "Pending" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "overdue", label: "Overdue" },
          ],
        }),
      ];

    case "document-templates":
      return [
        f("name", "Template Name", "text", { required: true }),
        f("description", "Description", "textarea", { list: false }),
        f("category", "Category", "text", { required: true }),
        f("content", "Template Content", "textarea", {
          list: false,
          placeholder: "Use {{placeholder_name}}",
        }),
        f("placeholders", "Placeholders", "textarea", { list: false }),
        f("isDefault", "Is Default", "select", {
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        }),
        f("fileFormat", "File Format", "select", {
          options: [
            { value: "PDF", label: "PDF" },
            { value: "DOC", label: "DOC" },
            { value: "DOCX", label: "DOCX" },
          ],
        }),
        f("createdAt", "Created", "date", { list: true }),
        f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      ];

    default:
      return null;
  }
}

function fieldsFor(id: string, title: string): HrmFieldDef[] {
  const exact = idSpecificFields(id);
  if (exact) return exact;

  const t = `${id} ${title}`.toLowerCase();

  if (t.includes("type") || t.includes("categor") || t.includes("source") || t.includes("template") || t.includes("policy") || t.includes("round") || t.includes("question") || t.includes("component") || t.includes("room")) {
    return baseMasterFields();
  }

  if (t.includes("branch")) {
    return [
      f("code", "Code", "text", { required: true }),
      f("name", "Branch name", "text", { required: true }),
      f("city", "City", "text"),
      f("address", "Address", "textarea", { list: false }),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("department")) {
    return [
      f("code", "Code", "text", { required: true }),
      f("name", "Department", "text", { required: true }),
      f("branch", "Branch", "select", { options: BRANCHES.map((b) => ({ value: b, label: b })) }),
      f("head", "Department head", "text"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("designation")) {
    return [
      f("code", "Code", "text", { required: true }),
      f("name", "Designation", "text", { required: true }),
      f("department", "Department", "select", { options: DEPTS.map((d) => ({ value: d, label: d })) }),
      f("level", "Level", "text"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("holiday")) {
    return [
      f("name", "Holiday name", "text", { required: true }),
      f("startDate", "Start date", "date", { required: true }),
      f("endDate", "End date", "date"),
      f("holidayType", "Type", "select", {
        options: [
          { value: "public", label: "Public" },
          { value: "optional", label: "Optional" },
          { value: "company", label: "Company" },
        ],
      }),
      f("paid", "Paid", "select", {
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      }),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("announcement")) {
    return [
      f("name", "Title", "text", { required: true }),
      f("priority", "Priority", "select", {
        options: [
          { value: "low", label: "Low" },
          { value: "normal", label: "Normal" },
          { value: "high", label: "High" },
        ],
      }),
      f("startDate", "Start date", "date"),
      f("endDate", "End date", "date"),
      f("department", "Department", "select", { options: DEPTS.map((d) => ({ value: d, label: d })) }),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
      f("description", "Body", "textarea", { list: false }),
    ];
  }

  if (t.includes("attendance") && t.includes("record")) {
    return employeeRecordFields([
      f("date", "Date", "date", { required: true }),
      f("clockIn", "Clock in", "text"),
      f("clockOut", "Clock out", "text"),
      f("totalHours", "Total hours", "number", { list: true }),
    ]);
  }

  if (t.includes("timesheet")) {
    return employeeRecordFields([
      f("date", "Date", "date", { required: true }),
      f("project", "Project", "text"),
      f("hours", "Hours", "number", { required: true }),
    ]);
  }

  if (t.includes("biometric")) {
    return employeeRecordFields([
      f("date", "Date", "date", { required: true }),
      f("device", "Device", "text"),
      f("punchTime", "Punch time", "text"),
      f("punchType", "Punch type", "select", {
        options: [
          { value: "in", label: "In" },
          { value: "out", label: "Out" },
        ],
      }),
    ]);
  }

  if (t.includes("regularization")) {
    return employeeRecordFields([
      f("date", "Date", "date", { required: true }),
      f("reason", "Reason", "textarea", { list: false, required: true }),
    ]);
  }

  if (t.includes("shift")) {
    return [
      f("code", "Code", "text", { required: true }),
      f("name", "Shift name", "text", { required: true }),
      f("startTime", "Start time", "text", { required: true }),
      f("endTime", "End time", "text", { required: true }),
      f("nightShift", "Night shift", "select", {
        options: [
          { value: "no", label: "No" },
          { value: "yes", label: "Yes" },
        ],
      }),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("leave") && t.includes("application")) {
    return employeeRecordFields([
      f("leaveType", "Leave type", "select", {
        options: [
          { value: "annual", label: "Annual" },
          { value: "sick", label: "Sick" },
          { value: "casual", label: "Casual" },
        ],
      }),
      f("fromDate", "From", "date", { required: true }),
      f("toDate", "To", "date", { required: true }),
      f("days", "Days", "number"),
    ]);
  }

  if (t.includes("leave") && t.includes("balance")) {
    return [
      f("name", "Employee", "text", { required: true }),
      f("leaveType", "Leave type", "text", { required: true }),
      f("entitled", "Entitled", "number"),
      f("used", "Used", "number"),
      f("remaining", "Remaining", "number"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("job posting") || id === "job-postings") {
    return [
      f("code", "Code", "text", { required: true }),
      f("name", "Job title", "text", { required: true }),
      f("department", "Department", "select", { options: DEPTS.map((d) => ({ value: d, label: d })) }),
      f("location", "Location", "text"),
      f("salaryRange", "Salary range", "text", { list: false }),
      f("deadline", "Deadline", "date"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
      f("description", "Description", "textarea", { list: false }),
    ];
  }

  if (t.includes("candidate") && !t.includes("source") && !t.includes("assessment") && !t.includes("onboarding")) {
    return [
      f("name", "Candidate", "text", { required: true }),
      f("email", "Email", "text", { required: true }),
      f("phone", "Phone", "text"),
      f("jobTitle", "Applied for", "text"),
      f("source", "Source", "text"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    ];
  }

  if (t.includes("interview") && !t.includes("type") && !t.includes("round") && !t.includes("feedback")) {
    return employeeRecordFields([
      f("candidate", "Candidate", "text", { required: true }),
      f("interviewDate", "Date", "date", { required: true }),
      f("interviewType", "Type", "text"),
      f("interviewer", "Interviewer", "text"),
    ]);
  }

  if (t.includes("payroll") && t.includes("run")) {
    return [
      f("name", "Title", "text", { required: true }),
      f("frequency", "Frequency", "select", {
        options: [
          { value: "monthly", label: "Monthly" },
          { value: "weekly", label: "Weekly" },
          { value: "biweekly", label: "Bi-weekly" },
        ],
      }),
      f("periodStart", "Period start", "date"),
      f("periodEnd", "Period end", "date"),
      f("payDate", "Pay date", "date"),
      f("employeeCount", "Employees", "number"),
      f("netPay", "Net pay", "number"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    ];
  }

  if (t.includes("payslip")) {
    return employeeRecordFields([
      f("period", "Period", "text", { required: true }),
      f("gross", "Gross", "number"),
      f("deductions", "Deductions", "number"),
      f("net", "Net pay", "number"),
    ]);
  }

  if (t.includes("salary") && !t.includes("component")) {
    return [
      f("name", "Employee", "text", { required: true }),
      f("department", "Department", "select", { options: DEPTS.map((d) => ({ value: d, label: d })) }),
      f("designation", "Designation", "text"),
      f("basicSalary", "Basic salary", "number", { required: true }),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("asset") && !t.includes("type") && !t.includes("dashboard") && !t.includes("depreciation")) {
    return [
      f("code", "Asset code", "text", { required: true }),
      f("name", "Asset name", "text", { required: true }),
      f("assetType", "Type", "text"),
      f("assignedTo", "Assigned to", "text"),
      f("purchaseDate", "Purchase date", "date"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    ];
  }

  if (t.includes("meeting") && !t.includes("type") && !t.includes("room") && !t.includes("attendee") && !t.includes("minute") && !t.includes("action")) {
    return [
      f("name", "Meeting title", "text", { required: true }),
      f("meetingDate", "Date", "date", { required: true }),
      f("startTime", "Start", "text"),
      f("endTime", "End", "text"),
      f("room", "Room", "text"),
      f("organizer", "Organizer", "text"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    ];
  }

  if (t.includes("calendar")) {
    return [
      f("name", "Event", "text", { required: true }),
      f("eventType", "Type", "select", {
        options: [
          { value: "holiday", label: "Holiday" },
          { value: "meeting", label: "Meeting" },
          { value: "training", label: "Training" },
          { value: "other", label: "Other" },
        ],
      }),
      f("startDate", "Start", "date", { required: true }),
      f("endDate", "End", "date"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
      f("description", "Description", "textarea", { list: false }),
    ];
  }

  if (t.includes("media")) {
    return [
      f("name", "File name", "text", { required: true }),
      f("fileType", "Type", "text"),
      f("size", "Size", "text"),
      f("uploadedBy", "Uploaded by", "text"),
      f("uploadedAt", "Uploaded", "date"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  if (t.includes("org-chart") || t.includes("organization chart")) {
    return [
      f("name", "Role / person", "text", { required: true }),
      f("employeeName", "Employee", "text"),
      f("department", "Department", "select", { options: DEPTS.map((d) => ({ value: d, label: d })) }),
      f("reportsTo", "Reports to", "text"),
      f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS.slice(0, 2) }),
    ];
  }

  // Default generic record
  return [
    f("code", "Code", "text"),
    f("name", "Name", "text", { required: true }),
    f("owner", "Owner / owner ref", "text"),
    f("date", "Date", "date"),
    f("status", "Status", "status", { required: true, options: HRM_STATUS_OPTIONS }),
    f("description", "Description", "textarea", { list: false }),
  ];
}

function seedRows(defId: string, title: string, fields: HrmFieldDef[], count = 6): HrmEntityRow[] {
  const rows: HrmEntityRow[] = [];
  for (let i = 1; i <= count; i++) {
    const row: HrmEntityRow = {
      id: `${defId}_${String(i).padStart(3, "0")}`,
      name: `${title} ${i}`,
      status: i % 5 === 0 ? "inactive" : i % 4 === 0 ? "pending" : "active",
    };
    for (const field of fields) {
      if (field.key === "name") continue;
      if (field.key === "status") {
        // Respect the field's own domain-specific options (e.g. Assigned/In
        // Progress/Completed) instead of the generic active/inactive rotation.
        const opts = field.options ?? HRM_STATUS_OPTIONS;
        row.status = opts[(i - 1) % opts.length]?.value ?? row.status;
        continue;
      }
      if (field.type === "date") {
        row[field.key] = `2026-0${(i % 6) + 1}-${String(10 + i).padStart(2, "0")}`;
      } else if (field.type === "number") {
        const k = field.key.toLowerCase();
        if (
          k.includes("salary") ||
          k.includes("pay") ||
          k.includes("gross") ||
          k.includes("net") ||
          k.includes("cost") ||
          k.includes("amount") ||
          k.includes("value") ||
          k.includes("price")
        ) {
          row[field.key] = 25000 + i * 3500;
        } else if (k.includes("hour")) {
          row[field.key] = 7 + (i % 3);
        } else if (k.includes("score") || k.includes("rate") || k.includes("progress")) {
          row[field.key] = 60 + i * 5;
        } else {
          row[field.key] = i * 2;
        }
      } else if (field.type === "select") {
        const opts = field.options ?? HRM_STATUS_OPTIONS;
        row[field.key] = opts[(i - 1) % opts.length]?.value ?? "active";
      } else if (field.key === "employeeName" || field.key === "name" && title.toLowerCase().includes("employee")) {
        row[field.key] = NAMES[(i - 1) % NAMES.length];
      } else if (field.key === "employeeName" || field.key === "candidate" || field.key === "assignedTo" || field.key === "organizer" || field.key === "uploadedBy" || field.key === "interviewer" || field.key === "head" || field.key === "recordedBy" || field.key === "assignedBy" || field.key === "trainers" || field.key === "complainant" || field.key === "against" || field.key === "responsible" || field.key === "approvedBy") {
        row[field.key] = NAMES[(i - 1) % NAMES.length];
      } else if (field.key === "time") {
        row[field.key] = "10:30";
      } else if (field.key === "progress") {
        row[field.key] = 20 + i * 10;
      } else if (field.key === "department") {
        row[field.key] = DEPTS[(i - 1) % DEPTS.length];
      } else if (field.key === "branch") {
        row[field.key] = BRANCHES[(i - 1) % BRANCHES.length];
      } else if (field.key === "email") {
        row[field.key] = `user${i}@againerp.local`;
      } else if (field.key === "phone") {
        row[field.key] = `+8801711001${String(i).padStart(3, "0")}`;
      } else if (field.key === "code") {
        row[field.key] = `${defId.slice(0, 3).toUpperCase()}-${1000 + i}`;
      } else if (field.key === "clockIn" || field.key === "requestedClockIn" || field.key === "originalClockIn") {
        row[field.key] = "09:05";
      } else if (field.key === "clockOut" || field.key === "requestedClockOut" || field.key === "originalClockOut") {
        row[field.key] = "18:02";
      } else if (field.key === "startTime" || field.key === "breakStartTime") {
        row[field.key] = "09:00";
      } else if (field.key === "endTime" || field.key === "breakEndTime") {
        row[field.key] = field.key === "breakEndTime" ? "13:00" : "18:00";
      } else if (field.key === "year") {
        row[field.key] = 2026;
      } else if (field.type === "textarea") {
        row[field.key] = `Sample notes for ${title} #${i}`;
      } else {
        row[field.key] = `${field.label} ${i}`;
      }
    }
    // Prefer employee name as display name when present
    if (typeof row.employeeName === "string" && row.employeeName && fields.some((x) => x.key === "employeeName")) {
      if (fields.find((x) => x.key === "name")?.label === "Title" || fields.find((x) => x.key === "name")?.label === "Employee") {
        // keep title; ok
      }
    }
    if (fields.some((x) => x.key === "name" && x.label === "Employee")) {
      row.name = NAMES[(i - 1) % NAMES.length];
      row.employeeName = row.name;
    }
    if (typeof row.employeeName === "string" && row.employeeName && !fields.some((x) => x.key === "name")) {
      row.name = row.employeeName;
    }
    rows.push(row);
  }
  return rows;
}

function singularize(label: string): string {
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("ses") || label.endsWith("xes")) return label.slice(0, -2);
  if (label.endsWith("s") && !label.endsWith("ss")) return label.slice(0, -1);
  return label;
}

function buildRegistry(): Record<string, HrmEntityDef> {
  const map: Record<string, HrmEntityDef> = {};
  for (const menu of HRM_NAV_MENUS) {
    if (menu.direct && menu.href && !HRM_DEDICATED_CRUD_HREFS.has(menu.href)) {
      const id = menu.id;
      const fields = fieldsFor(id, menu.label);
      map[menu.href] = {
        id,
        title: menu.label,
        singular: singularize(menu.label),
        href: menu.href,
        description: `${menu.label} records (mock CRUD).`,
        fields,
        seed: seedRows(id, menu.label, fields),
      };
    }
    for (const entry of menu.children) {
      if (entry.kind !== "item") continue;
      if (HRM_DEDICATED_CRUD_HREFS.has(entry.href)) continue;
      if (SKIP_HREFS.has(entry.href) && entry.href === "/hrm/dashboard") continue;
      const fields = fieldsFor(entry.id, entry.label);
      map[entry.href] = {
        id: entry.id,
        title: entry.label,
        singular: singularize(entry.label),
        href: entry.href,
        description: entry.description ?? `${entry.label} (mock CRUD).`,
        fields,
        seed: seedRows(entry.id, entry.label, fields),
      };
    }
  }

  // Configuration settings — simple list of setting keys
  if (!map["/hrm/settings"]) {
    const fields = baseMasterFields();
    map["/hrm/settings"] = {
      id: "settings",
      title: "Configuration",
      singular: "Setting",
      href: "/hrm/settings",
      description: "HRM configuration entries (mock).",
      fields,
      seed: seedRows("settings", "Setting", fields, 5),
    };
  }

  // Realistic Workdo-aligned department master data
  if (map["/hrm/departments"]) {
    map["/hrm/departments"].seed = DEPARTMENTS_SEED.map((r) => ({ ...r }));
    map["/hrm/departments"].description =
      "Organize workforce by branch — Name, Branch, Description, Status (Workdo fields).";
  }

  // Realistic Workdo-aligned designation master data
  if (map["/hrm/designations"]) {
    map["/hrm/designations"].seed = DESIGNATIONS_SEED.map((r) => ({ ...r }));
    map["/hrm/designations"].description =
      "Job titles by department — Name, Department, Description, Status (Workdo fields).";
  }

  // Realistic Workdo-aligned attendance records
  if (map["/hrm/attendance/records"]) {
    map["/hrm/attendance/records"].seed = ATTENDANCE_RECORDS_SEED.map((r) => ({ ...r }));
    map["/hrm/attendance/records"].description =
      "Daily clock-in/out log — Employee, Shift, Policy, hours, late/absent flags, Status (Workdo fields).";
  }

  return map;
}

export const HRM_ENTITY_BY_HREF = buildRegistry();

export function getHrmEntityByHref(href: string): HrmEntityDef | null {
  return HRM_ENTITY_BY_HREF[href] ?? null;
}

export function emptyRowFromEntity(entity: HrmEntityDef): HrmEntityRow {
  const row: HrmEntityRow = {
    id: "",
    name: "",
    status: "active",
  };
  for (const field of entity.fields) {
    if (field.key === "name" || field.key === "status") continue;
    if (field.type === "number") row[field.key] = 0;
    else if (field.type === "date") row[field.key] = new Date().toISOString().slice(0, 10);
    else if (field.type === "select" || field.type === "status") {
      row[field.key] = field.options?.[0]?.value ?? "active";
    } else row[field.key] = "";
  }
  return row;
}
