import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type TrainingAssignStatus = "assigned" | "in_progress" | "completed";
export type TrainingResult = "passed" | "failed" | null;

/** Workdo demo: Employee, Program, Status, dates, Score, Result, Assessments, Certificate. */
export type EmployeeTraining = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  programName: string;
  programCategory: string;
  status: TrainingAssignStatus;
  assignedDate: string;
  completionDate: string | null;
  score: number | null;
  result: TrainingResult;
  assessments: number;
  hasCertificate: boolean;
};

export const TRAINING_STATUS_LABEL: Record<TrainingAssignStatus, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

export const TRAINING_RESULT_LABEL: Record<"passed" | "failed", string> = {
  passed: "Passed",
  failed: "Failed",
};

export const TRAINING_STATUS_OPTIONS = (
  Object.keys(TRAINING_STATUS_LABEL) as TrainingAssignStatus[]
).map((k) => ({ value: k, label: TRAINING_STATUS_LABEL[k] }));

export const TRAINING_PROGRAMS = [
  {
    name: "Executive Leadership Program",
    category: "Leadership Development",
  },
  {
    name: "Database Management Certification",
    category: "Technical Skills",
  },
  {
    name: "Advanced Software Development",
    category: "Technical Skills",
  },
  {
    name: "Department Integration Workshop",
    category: "Onboarding",
  },
  {
    name: "Customer Service Excellence",
    category: "Soft Skills",
  },
] as const;

export const TRAINING_EMPLOYEES = [
  {
    id: "emp_04",
    name: "Nusrat Jahan",
    code: "EMP1004",
  },
  {
    id: "emp_01",
    name: "Karim Ahmed",
    code: "EMP1001",
  },
  {
    id: "emp_03",
    name: "Tanvir Hasan",
    code: "EMP1003",
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    code: "EMP1005",
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    code: "EMP1002",
  },
] as const;

export function trainingAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatScore(score: number | null) {
  if (score == null) return "—";
  return `${score.toFixed(2)}%`;
}

export function createEmployeeTrainingId(existing: EmployeeTraining[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `etr_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Employee Trainings list. */
export const EMPLOYEE_TRAININGS_SEED: EmployeeTraining[] = [
  {
    id: "etr_01",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeCode: "EMP1004",
    programName: "Executive Leadership Program",
    programCategory: "Leadership Development",
    status: "in_progress",
    assignedDate: "2026-06-01",
    completionDate: null,
    score: null,
    result: null,
    assessments: 0,
    hasCertificate: false,
  },
  {
    id: "etr_02",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeCode: "EMP1004",
    programName: "Database Management Certification",
    programCategory: "Technical Skills",
    status: "assigned",
    assignedDate: "2026-05-01",
    completionDate: null,
    score: null,
    result: null,
    assessments: 0,
    hasCertificate: false,
  },
  {
    id: "etr_03",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeCode: "EMP1004",
    programName: "Advanced Software Development",
    programCategory: "Technical Skills",
    status: "completed",
    assignedDate: "2026-04-01",
    completionDate: "2026-05-01",
    score: 95.5,
    result: "passed",
    assessments: 2,
    hasCertificate: true,
  },
  {
    id: "etr_04",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeCode: "EMP1004",
    programName: "Department Integration Workshop",
    programCategory: "Onboarding",
    status: "completed",
    assignedDate: "2026-03-01",
    completionDate: "2026-03-31",
    score: 88,
    result: "passed",
    assessments: 0,
    hasCertificate: true,
  },
  {
    id: "etr_05",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    employeeCode: "EMP1001",
    programName: "Customer Service Excellence",
    programCategory: "Soft Skills",
    status: "in_progress",
    assignedDate: "2026-05-15",
    completionDate: null,
    score: null,
    result: null,
    assessments: 1,
    hasCertificate: false,
  },
  {
    id: "etr_06",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    employeeCode: "EMP1003",
    programName: "Advanced Software Development",
    programCategory: "Technical Skills",
    status: "assigned",
    assignedDate: "2026-06-10",
    completionDate: null,
    score: null,
    result: null,
    assessments: 0,
    hasCertificate: false,
  },
];
