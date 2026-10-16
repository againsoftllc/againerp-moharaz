/** Workdo demo: Name+category, Status, Duration, Cost, Capacity, Flags, Sessions, Employees. */

export type ProgramStatus = "draft" | "active" | "completed";
export type EnrollmentFlag = "self_enrollment" | "mandatory";

export type TrainingProgram = {
  id: string;
  name: string;
  category: string;
  status: ProgramStatus;
  durationHours: number;
  cost: number;
  capacity: number;
  enrollmentType: EnrollmentFlag;
  sessions: number;
  employeesEnrolled: number;
};

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

export const ENROLLMENT_FLAG_LABEL: Record<EnrollmentFlag, string> = {
  self_enrollment: "Self-Enrollment",
  mandatory: "Mandatory",
};

export const PROGRAM_STATUS_OPTIONS = (
  Object.keys(PROGRAM_STATUS_LABEL) as ProgramStatus[]
).map((k) => ({ value: k, label: PROGRAM_STATUS_LABEL[k] }));

export const ENROLLMENT_FLAG_OPTIONS = (
  Object.keys(ENROLLMENT_FLAG_LABEL) as EnrollmentFlag[]
).map((k) => ({ value: k, label: ENROLLMENT_FLAG_LABEL[k] }));

export const PROGRAM_CATEGORIES = [
  "Customer Service Excellence",
  "Safety and Compliance",
  "Leadership Development",
  "Technical Skills",
  "Onboarding",
  "Soft Skills",
] as const;

export const TRAINING_PROGRAMS_SEED: TrainingProgram[] = [
  {
    id: "tp_1",
    name: "Digital Customer Support",
    category: "Customer Service Excellence",
    status: "draft",
    durationHours: 12,
    cost: 4500,
    capacity: 15,
    enrollmentType: "self_enrollment",
    sessions: 0,
    employeesEnrolled: 0,
  },
  {
    id: "tp_2",
    name: "Workplace Safety Orientation",
    category: "Safety and Compliance",
    status: "draft",
    durationHours: 6,
    cost: 800,
    capacity: 40,
    enrollmentType: "mandatory",
    sessions: 0,
    employeesEnrolled: 0,
  },
  {
    id: "tp_3",
    name: "Data Privacy and Security Training",
    category: "Safety and Compliance",
    status: "active",
    durationHours: 4,
    cost: 1000,
    capacity: 100,
    enrollmentType: "mandatory",
    sessions: 2,
    employeesEnrolled: 18,
  },
  {
    id: "tp_4",
    name: "Advanced Software Development",
    category: "Technical Skills",
    status: "active",
    durationHours: 24,
    cost: 6500,
    capacity: 20,
    enrollmentType: "self_enrollment",
    sessions: 3,
    employeesEnrolled: 12,
  },
  {
    id: "tp_5",
    name: "Executive Leadership Program",
    category: "Leadership Development",
    status: "active",
    durationHours: 20,
    cost: 12000,
    capacity: 10,
    enrollmentType: "mandatory",
    sessions: 4,
    employeesEnrolled: 8,
  },
  {
    id: "tp_6",
    name: "New Hire Onboarding Bootcamp",
    category: "Onboarding",
    status: "draft",
    durationHours: 8,
    cost: 1500,
    capacity: 30,
    enrollmentType: "mandatory",
    sessions: 0,
    employeesEnrolled: 0,
  },
  {
    id: "tp_7",
    name: "Team Leadership Fundamentals",
    category: "Leadership Development",
    status: "completed",
    durationHours: 16,
    cost: 8000,
    capacity: 15,
    enrollmentType: "mandatory",
    sessions: 5,
    employeesEnrolled: 15,
  },
  {
    id: "tp_8",
    name: "Communication & Soft Skills",
    category: "Soft Skills",
    status: "completed",
    durationHours: 10,
    cost: 2200,
    capacity: 25,
    enrollmentType: "self_enrollment",
    sessions: 2,
    employeesEnrolled: 22,
  },
];

export function createTrainingProgramId(existing: TrainingProgram[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^tp_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `tp_${n + 1}`;
}

export function formatProgramDuration(hours: number): string {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function formatProgramCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
