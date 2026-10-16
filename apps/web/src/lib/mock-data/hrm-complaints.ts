import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type ComplaintStatus = "submitted" | "resolved" | "dismissed";
export type ComplaintType =
  | "discrimination"
  | "harassment"
  | "management"
  | "workplace"
  | "other";

/** Workdo demo: Complainant, Against, Type, Date, Status, Assigned To, Documents. */
export type Complaint = {
  id: string;
  anonymous: boolean;
  complainantId: string | null;
  complainantName: string;
  complainantEmail: string;
  againstId: string | null;
  againstName: string;
  againstEmail: string;
  type: ComplaintType;
  date: string;
  status: ComplaintStatus;
  assignedTo: string;
  description: string;
  document: string;
};

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const COMPLAINT_TYPE_LABEL: Record<ComplaintType, string> = {
  discrimination: "Discrimination",
  harassment: "Harassment",
  management: "Management Issues",
  workplace: "Workplace Conditions",
  other: "Other",
};

export const COMPLAINT_STATUS_OPTIONS = (
  Object.keys(COMPLAINT_STATUS_LABEL) as ComplaintStatus[]
).map((k) => ({ value: k, label: COMPLAINT_STATUS_LABEL[k] }));

export const COMPLAINT_TYPE_OPTIONS = (Object.keys(COMPLAINT_TYPE_LABEL) as ComplaintType[]).map(
  (k) => ({ value: k, label: COMPLAINT_TYPE_LABEL[k] }),
);

export const COMPLAINT_ASSIGNEES = ["HR", "Farzana Islam", "Sadia Rahman", "Karim Ahmed"] as const;

export const COMPLAINT_PEOPLE = [
  {
    id: "emp_08",
    name: "Sumaiya Akter",
    email: "sumaiya.akter@example.com",
  },
  {
    id: "emp_14",
    name: "Mahbub Alam",
    email: "mahbub.alam@example.com",
  },
  {
    id: "emp_13",
    name: "Priya Das",
    email: "priya.das@example.com",
  },
  {
    id: "emp_12",
    name: "Jahidul Islam",
    email: "jahidul.islam@example.com",
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
] as const;

export function complaintAvatar(employeeId: string | null) {
  if (!employeeId) return employeeAvatarUrl("anonymous");
  return employeeAvatarUrl(employeeId);
}

export function createComplaintId(existing: Complaint[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `cmp_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Complaints list. */
export const COMPLAINTS_SEED: Complaint[] = [
  {
    id: "cmp_01",
    anonymous: false,
    complainantId: "emp_08",
    complainantName: "Sumaiya Akter",
    complainantEmail: "sumaiya.akter@example.com",
    againstId: "emp_14",
    againstName: "Mahbub Alam",
    againstEmail: "mahbub.alam@example.com",
    type: "discrimination",
    date: "2026-01-08",
    status: "submitted",
    assignedTo: "Farzana Islam",
    description: "Unequal task allocation during shift handover.",
    document: "sumaiya-complaint.pdf",
  },
  {
    id: "cmp_02",
    anonymous: false,
    complainantId: "emp_13",
    complainantName: "Priya Das",
    complainantEmail: "priya.das@example.com",
    againstId: null,
    againstName: "",
    againstEmail: "",
    type: "harassment",
    date: "2025-12-28",
    status: "resolved",
    assignedTo: "HR",
    description: "Verbal harassment reported; mediation completed.",
    document: "priya-complaint.pdf",
  },
  {
    id: "cmp_03",
    anonymous: true,
    complainantId: null,
    complainantName: "Anonymous",
    complainantEmail: "",
    againstId: null,
    againstName: "",
    againstEmail: "",
    type: "management",
    date: "2025-11-15",
    status: "dismissed",
    assignedTo: "Farzana Islam",
    description: "Anonymous tip on management issues — insufficient evidence.",
    document: "",
  },
  {
    id: "cmp_04",
    anonymous: false,
    complainantId: "emp_05",
    complainantName: "Farzana Islam",
    complainantEmail: "farzana.islam@example.com",
    againstId: "emp_06",
    againstName: "Imran Hossain",
    againstEmail: "imran.hossain@example.com",
    type: "workplace",
    date: "2026-02-01",
    status: "submitted",
    assignedTo: "Sadia Rahman",
    description: "Unsafe desk layout and blocked emergency aisle.",
    document: "farzana-complaint.pdf",
  },
  {
    id: "cmp_05",
    anonymous: false,
    complainantId: "emp_01",
    complainantName: "Karim Ahmed",
    complainantEmail: "karim.ahmed@example.com",
    againstId: "emp_12",
    againstName: "Jahidul Islam",
    againstEmail: "jahidul.islam@example.com",
    type: "other",
    date: "2026-01-20",
    status: "resolved",
    assignedTo: "HR",
    description: "Dispute over shared CRM leads — resolved with process update.",
    document: "",
  },
];
