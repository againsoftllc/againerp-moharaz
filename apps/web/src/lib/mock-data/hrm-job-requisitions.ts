export type JobRequisitionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "on_hold"
  | "closed";

export type JobRequisitionPriority = "low" | "medium" | "high";

export type JobRequisition = {
  id: string;
  code: string;
  title: string;
  categoryId: string;
  category: string;
  departmentId: string;
  department: string;
  positionsCount: number;
  budgetMin: number;
  budgetMax: number;
  skillsRequired: string;
  educationRequired: string;
  experienceRequired: string;
  description: string;
  responsibilities: string;
  priority: JobRequisitionPriority;
  status: JobRequisitionStatus;
  approvedBy: string;
  approvalDate: string;
  createdAt: string;
};

export const REQUISITION_STATUS_LABEL: Record<JobRequisitionStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  on_hold: "On Hold",
  closed: "Closed",
};

export const REQUISITION_STATUS_OPTIONS = (
  Object.keys(REQUISITION_STATUS_LABEL) as JobRequisitionStatus[]
).map((k) => ({ value: k, label: REQUISITION_STATUS_LABEL[k] }));

export const REQUISITION_PRIORITY_LABEL: Record<JobRequisitionPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const REQUISITION_PRIORITY_OPTIONS = (
  Object.keys(REQUISITION_PRIORITY_LABEL) as JobRequisitionPriority[]
).map((k) => ({ value: k, label: REQUISITION_PRIORITY_LABEL[k] }));

export function formatBudgetRange(min: number, max: number): string {
  if (min <= 0 && max <= 0) return "—";
  if (min > 0 && max > 0) return `${min.toLocaleString()} – ${max.toLocaleString()}`;
  if (min > 0) return `${min.toLocaleString()}+`;
  return `Up to ${max.toLocaleString()}`;
}
