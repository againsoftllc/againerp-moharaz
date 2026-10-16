import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type GoalStatus = "not_started" | "in_progress" | "completed";

/** Workdo demo: Title, Employee, Goal Type, Start/End, Progress, Status. */
export type EmployeeGoal = {
  id: string;
  title: string;
  employeeId: string;
  employeeName: string;
  goalType: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: GoalStatus;
  description: string;
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
};

export const GOAL_STATUS_OPTIONS = (Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]).map((k) => ({
  value: k,
  label: GOAL_STATUS_LABEL[k],
}));

export const GOAL_TYPES = [
  "Project Goals",
  "Quality Improvement Goals",
  "Sales and Revenue Goals",
  "Learning & Development",
  "Operational Excellence",
] as const;

export const GOAL_EMPLOYEES = [
  { id: "emp_01", name: "Karim Ahmed" },
  { id: "emp_02", name: "Sadia Rahman" },
  { id: "emp_03", name: "Tanvir Hasan" },
  { id: "emp_04", name: "Nusrat Jahan" },
  { id: "emp_05", name: "Farzana Islam" },
  { id: "emp_06", name: "Imran Hossain" },
] as const;

export function goalAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createGoalId(existing: EmployeeGoal[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `egl_${String(max + 1).padStart(2, "0")}`;
}

/** Derive status from progress when not explicitly set. */
export function statusFromProgress(progress: number): GoalStatus {
  if (progress >= 100) return "completed";
  if (progress <= 0) return "not_started";
  return "in_progress";
}

/** Seed aligned to Workdo Employee Goals list. */
export const GOALS_SEED: EmployeeGoal[] = [
  {
    id: "egl_01",
    title: "Implement Process Improvement",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    goalType: "Project Goals",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 55,
    status: "in_progress",
    description: "Streamline order-to-cash handoffs across Sales and Ops.",
  },
  {
    id: "egl_02",
    title: "Reduce Month-End Close Time",
    employeeId: "emp_02",
    employeeName: "Sadia Rahman",
    goalType: "Quality Improvement Goals",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 40,
    status: "in_progress",
    description: "Cut payroll close cycle from 5 days to 3.",
  },
  {
    id: "egl_03",
    title: "Increase Customer Retention",
    employeeId: "emp_06",
    employeeName: "Imran Hossain",
    goalType: "Sales and Revenue Goals",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 88,
    status: "in_progress",
    description: "Raise CSAT retention cohort by 10%.",
  },
  {
    id: "egl_04",
    title: "Ship ERP Modules On Time",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    goalType: "Project Goals",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 70,
    status: "in_progress",
    description: "Deliver HRM lifecycle screens without slip.",
  },
  {
    id: "egl_05",
    title: "Complete Leadership Course",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    goalType: "Learning & Development",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    progress: 25,
    status: "in_progress",
    description: "Finish internal tech-lead curriculum.",
  },
  {
    id: "egl_06",
    title: "Enhance Review Process",
    employeeId: "emp_05",
    employeeName: "Farzana Islam",
    goalType: "Quality Improvement Goals",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 100,
    status: "completed",
    description: "Standardize employee review templates and SLA.",
  },
  {
    id: "egl_07",
    title: "Improve Warehouse Throughput",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    goalType: "Operational Excellence",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    progress: 0,
    status: "not_started",
    description: "Kick off DC pick-rate initiative in Q2.",
  },
];
