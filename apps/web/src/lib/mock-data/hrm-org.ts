/** HRM organization reference data (Workdo-style Branch → Department → Designation). */

export type HrmBranch = {
  id: string;
  name: string;
};

export type HrmDepartment = {
  id: string;
  name: string;
  branchId: string;
};

export type HrmDesignation = {
  id: string;
  name: string;
  departmentId: string;
};

export const HRM_BRANCHES: HrmBranch[] = [
  { id: "br_dhaka", name: "Dhaka HQ" },
  { id: "br_gazipur", name: "Gazipur DC" },
  { id: "br_ctg", name: "Chittagong" },
];

export const HRM_DEPARTMENTS: HrmDepartment[] = [
  { id: "dept_ops", name: "Operations", branchId: "br_dhaka" },
  { id: "dept_sales", name: "Sales", branchId: "br_dhaka" },
  { id: "dept_finance", name: "Finance", branchId: "br_dhaka" },
  { id: "dept_hr", name: "Human Resources", branchId: "br_dhaka" },
  { id: "dept_tech", name: "Technology", branchId: "br_dhaka" },
  { id: "dept_support", name: "Customer Support", branchId: "br_dhaka" },
  { id: "dept_mkt", name: "Marketing", branchId: "br_dhaka" },
  { id: "dept_wh", name: "Warehouse & Fulfillment", branchId: "br_gazipur" },
  { id: "dept_proc", name: "Procurement", branchId: "br_gazipur" },
  { id: "dept_sales_ctg", name: "Sales", branchId: "br_ctg" },
  { id: "dept_logistics", name: "Logistics", branchId: "br_ctg" },
];

export const HRM_DESIGNATIONS: HrmDesignation[] = [
  { id: "des_ops_mgr", name: "Operations Manager", departmentId: "dept_ops" },
  { id: "des_coord", name: "Operations Coordinator", departmentId: "dept_ops" },
  { id: "des_admin", name: "Admin Assistant", departmentId: "dept_ops" },
  { id: "des_sales_exec", name: "Sales Executive", departmentId: "dept_sales" },
  { id: "des_kam", name: "Key Account Manager", departmentId: "dept_sales" },
  { id: "des_inside", name: "Inside Sales Representative", departmentId: "dept_sales" },
  { id: "des_acct", name: "Accountant", departmentId: "dept_finance" },
  { id: "des_payroll", name: "Payroll Officer", departmentId: "dept_finance" },
  { id: "des_fin_ctrl", name: "Finance Controller", departmentId: "dept_finance" },
  { id: "des_hr_off", name: "HR Officer", departmentId: "dept_hr" },
  { id: "des_recruit", name: "Recruitment Specialist", departmentId: "dept_hr" },
  { id: "des_hrbp", name: "HR Business Partner", departmentId: "dept_hr" },
  { id: "des_eng", name: "Software Engineer", departmentId: "dept_tech" },
  { id: "des_qa", name: "QA Analyst", departmentId: "dept_tech" },
  { id: "des_devops", name: "DevOps Engineer", departmentId: "dept_tech" },
  { id: "des_support", name: "Support Agent", departmentId: "dept_support" },
  { id: "des_support_lead", name: "Support Team Lead", departmentId: "dept_support" },
  { id: "des_mkt_exec", name: "Marketing Executive", departmentId: "dept_mkt" },
  { id: "des_content", name: "Content Specialist", departmentId: "dept_mkt" },
  { id: "des_wh_sup", name: "Warehouse Supervisor", departmentId: "dept_wh" },
  { id: "des_picker", name: "Picker", departmentId: "dept_wh" },
  { id: "des_packer", name: "Packer", departmentId: "dept_wh" },
  { id: "des_proc", name: "Procurement Officer", departmentId: "dept_proc" },
  { id: "des_logistics", name: "Logistics Coordinator", departmentId: "dept_logistics" },
  { id: "des_sales_ctg", name: "Regional Sales Executive", departmentId: "dept_sales_ctg" },
];

export const HRM_SHIFTS = ["General", "Morning", "Evening", "Night"] as const;

export type LeaveApplicationStatus = "pending" | "approved" | "rejected";

export type LeaveApplication = {
  id: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: LeaveApplicationStatus;
  appliedAt: string;
};

export const LEAVE_APPLICATIONS_SEED: LeaveApplication[] = [
  {
    id: "leave_001",
    employeeName: "Sumaiya Akter",
    leaveType: "Annual",
    fromDate: "2026-07-18",
    toDate: "2026-07-22",
    days: 5,
    status: "pending",
    appliedAt: "2026-07-10",
  },
  {
    id: "leave_002",
    employeeName: "Ruma Begum",
    leaveType: "Sick",
    fromDate: "2026-07-20",
    toDate: "2026-07-21",
    days: 2,
    status: "pending",
    appliedAt: "2026-07-19",
  },
  {
    id: "leave_003",
    employeeName: "Sadia Rahman",
    leaveType: "Casual",
    fromDate: "2026-07-15",
    toDate: "2026-07-15",
    days: 1,
    status: "approved",
    appliedAt: "2026-07-12",
  },
  {
    id: "leave_004",
    employeeName: "Imran Hossain",
    leaveType: "Annual",
    fromDate: "2026-08-01",
    toDate: "2026-08-05",
    days: 5,
    status: "pending",
    appliedAt: "2026-07-16",
  },
  {
    id: "leave_005",
    employeeName: "Nusrat Jahan",
    leaveType: "Annual",
    fromDate: "2026-07-28",
    toDate: "2026-07-30",
    days: 3,
    status: "approved",
    appliedAt: "2026-07-20",
  },
  {
    id: "leave_006",
    employeeName: "Tanvir Hasan",
    leaveType: "Sick",
    fromDate: "2026-07-23",
    toDate: "2026-07-23",
    days: 1,
    status: "approved",
    appliedAt: "2026-07-22",
  },
];

export type HrmHoliday = {
  id: string;
  name: string;
  category: "National" | "Religious" | "Company";
  startDate: string;
  endDate: string;
  isPaid: boolean;
  isHalfDay?: boolean;
  branches: string;
  description?: string;
};

export const HRM_HOLIDAYS_SEED: HrmHoliday[] = [
  {
    id: "hol_001",
    name: "Ashura",
    category: "Religious",
    startDate: "2026-07-27",
    endDate: "2026-07-27",
    isPaid: true,
    branches: "All branches",
    description: "Religious observance — office closed.",
  },
  {
    id: "hol_002",
    name: "National Mourning Day",
    category: "National",
    startDate: "2026-08-15",
    endDate: "2026-08-15",
    isPaid: true,
    branches: "All branches",
  },
  {
    id: "hol_003",
    name: "Eid-e-Miladunnabi",
    category: "Religious",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    isPaid: true,
    branches: "All branches",
  },
  {
    id: "hol_004",
    name: "Company Foundation Day",
    category: "Company",
    startDate: "2026-07-25",
    endDate: "2026-07-25",
    isPaid: true,
    isHalfDay: true,
    branches: "Dhaka HQ",
    description: "Half-day celebration at Dhaka HQ.",
  },
  {
    id: "hol_005",
    name: "Team Offsite (Gazipur)",
    category: "Company",
    startDate: "2026-07-31",
    endDate: "2026-07-31",
    isPaid: true,
    branches: "Gazipur DC",
  },
];

/** @deprecated use HRM_HOLIDAYS_SEED — kept for dashboard snapshot links */
export const HRM_HOLIDAYS_UPCOMING = HRM_HOLIDAYS_SEED.map((h) => ({
  id: h.id,
  name: h.name,
  date: h.startDate,
}));

export type HrmMeeting = {
  id: string;
  title: string;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  attendees: number;
  organizer?: string;
  status?: "scheduled" | "completed" | "cancelled";
  description?: string;
};

export const HRM_MEETINGS_SEED: HrmMeeting[] = [
  {
    id: "mtg_001",
    title: "Weekly Ops Sync",
    type: "Team Meeting",
    date: "2026-07-22",
    startTime: "10:00",
    endTime: "11:00",
    room: "Conference A",
    attendees: 8,
    organizer: "Karim Ahmed",
    status: "scheduled",
    description: "Operations standup — weekly KPIs and blockers.",
  },
  {
    id: "mtg_002",
    title: "Interview — Backend Engineer",
    type: "Interview",
    date: "2026-07-22",
    startTime: "14:30",
    endTime: "15:30",
    room: "Meeting Room 2",
    attendees: 3,
    organizer: "Nusrat Jahan",
    status: "scheduled",
  },
  {
    id: "mtg_003",
    title: "Payroll Cut-off Review",
    type: "One-on-One",
    date: "2026-07-23",
    startTime: "11:00",
    endTime: "11:45",
    room: "Finance Cabin",
    attendees: 2,
    organizer: "Farzana Islam",
    status: "scheduled",
  },
  {
    id: "mtg_004",
    title: "Safety Training Kickoff",
    type: "Training",
    date: "2026-07-24",
    startTime: "09:00",
    endTime: "12:00",
    room: "Hall B",
    attendees: 24,
    organizer: "Rafiq Ahmed",
    status: "scheduled",
  },
  {
    id: "mtg_005",
    title: "HR Policy Q&A",
    type: "Team Meeting",
    date: "2026-07-29",
    startTime: "15:00",
    endTime: "16:00",
    room: "Conference A",
    attendees: 12,
    organizer: "Nusrat Jahan",
    status: "scheduled",
  },
];

/** Dashboard “Recent meetings” list — derived from seed. */
export const HRM_RECENT_MEETINGS = HRM_MEETINGS_SEED.slice(0, 4).map((m) => ({
  id: m.id,
  title: m.title,
  type: m.type,
  when: `${m.date} · ${m.startTime}`,
  room: m.room,
  attendees: m.attendees,
}));

export type HrmCalendarEventKind = "meeting" | "holiday" | "leave";

export type HrmCalendarEvent = {
  id: string;
  kind: HrmCalendarEventKind;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  subtitle?: string;
  meta?: Record<string, string>;
};

/** Workdo calendar colors: Meetings blue · Holidays red · Leaves green */
export const HRM_CALENDAR_COLORS: Record<HrmCalendarEventKind, string> = {
  meeting: "#3b82f6",
  holiday: "#ef4444",
  leave: "#22c55e",
};

export function getHrmCalendarEvents(): HrmCalendarEvent[] {
  const meetings: HrmCalendarEvent[] = HRM_MEETINGS_SEED.map((m) => ({
    id: m.id,
    kind: "meeting",
    title: m.title,
    startDate: m.date,
    endDate: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    allDay: false,
    subtitle: `${m.type} · ${m.room}`,
    meta: {
      Type: m.type,
      Time: `${m.startTime} – ${m.endTime}`,
      Location: m.room,
      Attendees: String(m.attendees),
      Organizer: m.organizer ?? "—",
      Status: m.status ?? "scheduled",
      Description: m.description ?? "—",
    },
  }));

  const holidays: HrmCalendarEvent[] = HRM_HOLIDAYS_SEED.map((h) => ({
    id: h.id,
    kind: "holiday",
    title: h.name,
    startDate: h.startDate,
    endDate: h.endDate,
    allDay: true,
    subtitle: `${h.category}${h.isHalfDay ? " · Half day" : ""}`,
    meta: {
      Category: h.category,
      Dates: h.startDate === h.endDate ? h.startDate : `${h.startDate} → ${h.endDate}`,
      Branches: h.branches,
      Paid: h.isPaid ? "Paid" : "Unpaid",
      "Half day": h.isHalfDay ? "Yes" : "No",
      Description: h.description ?? "—",
    },
  }));

  const leaves: HrmCalendarEvent[] = LEAVE_APPLICATIONS_SEED.filter((l) => l.status === "approved").map(
    (l) => ({
      id: l.id,
      kind: "leave" as const,
      title: `${l.employeeName} — ${l.leaveType}`,
      startDate: l.fromDate,
      endDate: l.toDate,
      allDay: true,
      subtitle: `${l.days} day(s) · Approved`,
      meta: {
        Employee: l.employeeName,
        "Leave type": l.leaveType,
        From: l.fromDate,
        To: l.toDate,
        Days: String(l.days),
        Status: "Approved",
      },
    }),
  );

  return [...meetings, ...holidays, ...leaves];
}
export const HRM_HIRING_TREND = [
  { month: "Feb", joined: 2, left: 0 },
  { month: "Mar", joined: 3, left: 1 },
  { month: "Apr", joined: 1, left: 0 },
  { month: "May", joined: 4, left: 1 },
  { month: "Jun", joined: 2, left: 2 },
  { month: "Jul", joined: 3, left: 0 },
] as const;

export const HRM_LEAVE_TYPE_BREAKDOWN = [
  { name: "Annual", value: 12, color: "#00a09d" },
  { name: "Sick", value: 7, color: "#714B67" },
  { name: "Casual", value: 5, color: "#F0AD4E" },
  { name: "Unpaid", value: 2, color: "#94a3b8" },
] as const;

export const HRM_CANDIDATE_PIPELINE = [
  { stage: "Applied", count: 18 },
  { stage: "Screening", count: 9 },
  { stage: "Interview", count: 5 },
  { stage: "Offer", count: 2 },
  { stage: "Hired", count: 1 },
] as const;

export type HrmAnnouncement = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  department: string;
  startDate: string;
  endDate: string;
};

export const HRM_ANNOUNCEMENTS_SEED: HrmAnnouncement[] = [
  {
    id: "ann_001",
    title: "Eid holiday calendar published",
    priority: "high",
    department: "All",
    startDate: "2026-07-15",
    endDate: "2026-07-31",
  },
  {
    id: "ann_002",
    title: "New attendance biometric devices at Gazipur DC",
    priority: "medium",
    department: "Warehouse",
    startDate: "2026-07-18",
    endDate: "2026-08-18",
  },
  {
    id: "ann_003",
    title: "Q3 performance review cycle opens",
    priority: "medium",
    department: "All",
    startDate: "2026-07-20",
    endDate: "2026-08-05",
  },
];

export type HrmCandidate = {
  id: string;
  name: string;
  job: string;
  stage: string;
  appliedAt: string;
};

export const HRM_RECENT_CANDIDATES: HrmCandidate[] = [
  {
    id: "cand_001",
    name: "Nadia Islam",
    job: "Software Engineer",
    stage: "Interview",
    appliedAt: "2026-07-19",
  },
  {
    id: "cand_002",
    name: "Karim Uddin",
    job: "Warehouse Supervisor",
    stage: "Screening",
    appliedAt: "2026-07-18",
  },
  {
    id: "cand_003",
    name: "Farhana Akter",
    job: "HR Officer",
    stage: "Applied",
    appliedAt: "2026-07-17",
  },
];

export type HrmActivity = {
  id: string;
  text: string;
  at: string;
  kind: "employee" | "leave" | "recruitment" | "payroll" | "meeting";
};

export const HRM_RECENT_ACTIVITIES: HrmActivity[] = [
  {
    id: "act_001",
    text: "Leave approved for Sadia Rahman (Casual · 1 day)",
    at: "2h ago",
    kind: "leave",
  },
  {
    id: "act_002",
    text: "New candidate Nadia Islam applied for Software Engineer",
    at: "5h ago",
    kind: "recruitment",
  },
  {
    id: "act_003",
    text: "Meeting scheduled: Weekly Ops Sync",
    at: "Yesterday",
    kind: "meeting",
  },
  {
    id: "act_004",
    text: "Payslip draft generated for July 2026 run",
    at: "Yesterday",
    kind: "payroll",
  },
  {
    id: "act_005",
    text: "Employee profile updated — Imran Hossain",
    at: "2d ago",
    kind: "employee",
  },
];

export function getHrmDashboardStats(employeeCount: number) {
  const pendingLeaves = LEAVE_APPLICATIONS_SEED.filter((l) => l.status === "pending").length;
  return {
    totalEmployees: employeeCount,
    totalBranches: HRM_BRANCHES.length,
    monthAttendancePct: 94,
    pendingLeaves,
    activeJobs: 3,
    totalCandidates: HRM_RECENT_CANDIDATES.length + 9,
    totalDepartments: new Set(HRM_DEPARTMENTS.map((d) => d.name)).size,
  };
}
