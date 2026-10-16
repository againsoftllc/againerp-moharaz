import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type ReviewStatus = "scheduled" | "in_progress" | "completed";

/** Workdo demo: Employee, Reviewer, Review Cycle, Review Date, Rating, Status. */
export type EmployeeReview = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewCycle: string;
  reviewDate: string;
  rating: number | null;
  comments: string;
  status: ReviewStatus;
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

export const REVIEW_STATUS_OPTIONS = (Object.keys(REVIEW_STATUS_LABEL) as ReviewStatus[]).map(
  (k) => ({ value: k, label: REVIEW_STATUS_LABEL[k] }),
);

export const REVIEW_CYCLES = [
  "Monthly Performance Review",
  "Quarterly Business Review",
  "Annual Appraisal",
  "Probation Review",
  "Mid-Year Review",
] as const;

export const REVIEW_EMPLOYEES = [
  {
    id: "emp_01",
    name: "Karim Ahmed",
    email: "karim.ahmed@example.com",
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    email: "sadia.rahman@example.com",
  },
  {
    id: "emp_03",
    name: "Tanvir Hasan",
    email: "tanvir.hasan@example.com",
  },
  {
    id: "emp_04",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    email: "farzana.islam@example.com",
  },
  {
    id: "emp_06",
    name: "Imran Hossain",
    email: "imran.hossain@example.com",
  },
] as const;

export const REVIEW_REVIEWERS = [
  {
    id: "mgr_01",
    name: "Manager",
    email: "manager@example.com",
  },
  {
    id: "emp_05",
    name: "Farzana Islam",
    email: "farzana.islam@example.com",
  },
  {
    id: "emp_02",
    name: "Sadia Rahman",
    email: "sadia.rahman@example.com",
  },
] as const;

export function reviewAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function formatRating(rating: number | null) {
  if (rating == null) return "—";
  return rating.toFixed(1);
}

export function createReviewId(existing: EmployeeReview[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `erv_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Employee Reviews list. */
export const REVIEWS_SEED: EmployeeReview[] = [
  {
    id: "erv_01",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    employeeEmail: "karim.ahmed@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Monthly Performance Review",
    reviewDate: "2026-03-01",
    rating: 3.5,
    comments: "Solid sales quarter; improve CRM hygiene.",
    status: "completed",
  },
  {
    id: "erv_02",
    employeeId: "emp_02",
    employeeName: "Sadia Rahman",
    employeeEmail: "sadia.rahman@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Quarterly Business Review",
    reviewDate: "2026-03-01",
    rating: 4.0,
    comments: "Strong process ownership on payroll close.",
    status: "completed",
  },
  {
    id: "erv_03",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    employeeEmail: "tanvir.hasan@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Monthly Performance Review",
    reviewDate: "2026-03-01",
    rating: 4.2,
    comments: "Excellent delivery on ERP modules.",
    status: "completed",
  },
  {
    id: "erv_04",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    employeeEmail: "nusrat.jahan@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Quarterly Business Review",
    reviewDate: "2026-03-01",
    rating: 3.8,
    comments: "Good mentoring; expand design system ownership.",
    status: "completed",
  },
  {
    id: "erv_05",
    employeeId: "emp_05",
    employeeName: "Farzana Islam",
    employeeEmail: "farzana.islam@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Monthly Performance Review",
    reviewDate: "2026-03-01",
    rating: null,
    comments: "",
    status: "in_progress",
  },
  {
    id: "erv_06",
    employeeId: "emp_06",
    employeeName: "Imran Hossain",
    employeeEmail: "imran.hossain@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Monthly Performance Review",
    reviewDate: "2026-03-01",
    rating: null,
    comments: "",
    status: "in_progress",
  },
  {
    id: "erv_07",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    employeeEmail: "karim.ahmed@example.com",
    reviewerId: "mgr_01",
    reviewerName: "Manager",
    reviewerEmail: "manager@example.com",
    reviewCycle: "Quarterly Business Review",
    reviewDate: "2026-04-01",
    rating: null,
    comments: "",
    status: "scheduled",
  },
];
