/** Workdo Document Acknowledgments: assign docs, track ack / overdue. */

export type AcknowledgementStatus = "pending" | "acknowledged" | "overdue";

export type DocumentAcknowledgement = {
  id: string;
  employeeName: string;
  documentTitle: string;
  dueDate: string;
  acknowledgedAt: string;
  assignedBy: string;
  assignedAt: string;
  note: string;
  /** Stored status; overdue is also derived from dueDate when not acknowledged. */
  status: AcknowledgementStatus;
};

export const ACK_STATUS_LABEL: Record<AcknowledgementStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  overdue: "Overdue",
};

export const ACK_STATUS_OPTIONS = (Object.keys(ACK_STATUS_LABEL) as AcknowledgementStatus[]).map(
  (k) => ({ value: k, label: ACK_STATUS_LABEL[k] }),
);

export const ACK_DOCUMENT_OPTIONS = [
  "Data Privacy and Security Policy",
  "Code of Conduct",
  "Remote Work Policy",
  "Anti-Harassment Policy",
  "Employee Handbook",
  "Expense Reimbursement Policy",
] as const;

export const ACK_EMPLOYEE_OPTIONS = [
  "Prof. Tommie Howell",
  "Warren Jones",
  "Karim Ahmed",
  "Sadia Rahman",
  "Nusrat Jahan",
  "Tanvir Hasan",
  "Farzana Islam",
  "Imran Hossain",
  "Ayesha Khan",
  "Ashlee Bernhard",
] as const;

export const ACK_ASSIGNED_BY_OPTIONS = ["Manager", "HR", "Admin", "Company"] as const;

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysOverdue(dueDate: string, now = new Date()): number {
  const due = parseYmd(dueDate);
  if (!due) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = today.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Resolve display status from row fields. */
export function resolveAckStatus(
  row: Pick<DocumentAcknowledgement, "acknowledgedAt" | "dueDate" | "status">,
  now = new Date(),
): AcknowledgementStatus {
  if (row.acknowledgedAt || row.status === "acknowledged") return "acknowledged";
  if (daysOverdue(row.dueDate, now) > 0) return "overdue";
  return "pending";
}

export const ACKNOWLEDGEMENTS_SEED: DocumentAcknowledgement[] = [
  {
    id: "ack_1",
    employeeName: "Prof. Tommie Howell",
    documentTitle: "Data Privacy and Security Policy",
    dueDate: "2025-09-13",
    acknowledgedAt: "2025-09-14",
    assignedBy: "Manager",
    assignedAt: "2025-09-01",
    note: "",
    status: "acknowledged",
  },
  {
    id: "ack_2",
    employeeName: "Warren Jones",
    documentTitle: "Data Privacy and Security Policy",
    dueDate: "2025-09-14",
    acknowledgedAt: "",
    assignedBy: "Manager",
    assignedAt: "2025-09-01",
    note: "Reminder sent",
    status: "overdue",
  },
  {
    id: "ack_3",
    employeeName: "Karim Ahmed",
    documentTitle: "Code of Conduct",
    dueDate: "2026-08-15",
    acknowledgedAt: "",
    assignedBy: "HR",
    assignedAt: "2026-07-01",
    note: "",
    status: "pending",
  },
  {
    id: "ack_4",
    employeeName: "Sadia Rahman",
    documentTitle: "Remote Work Policy",
    dueDate: "2026-06-01",
    acknowledgedAt: "",
    assignedBy: "HR",
    assignedAt: "2026-05-01",
    note: "",
    status: "overdue",
  },
  {
    id: "ack_5",
    employeeName: "Nusrat Jahan",
    documentTitle: "Anti-Harassment Policy",
    dueDate: "2026-07-10",
    acknowledgedAt: "2026-07-08",
    assignedBy: "Admin",
    assignedAt: "2026-06-20",
    note: "",
    status: "acknowledged",
  },
  {
    id: "ack_6",
    employeeName: "Tanvir Hasan",
    documentTitle: "Employee Handbook",
    dueDate: "2026-08-01",
    acknowledgedAt: "",
    assignedBy: "Company",
    assignedAt: "2026-07-15",
    note: "",
    status: "pending",
  },
  {
    id: "ack_7",
    employeeName: "Farzana Islam",
    documentTitle: "Expense Reimbursement Policy",
    dueDate: "2026-05-20",
    acknowledgedAt: "",
    assignedBy: "Manager",
    assignedAt: "2026-04-20",
    note: "",
    status: "overdue",
  },
  {
    id: "ack_8",
    employeeName: "Imran Hossain",
    documentTitle: "Code of Conduct",
    dueDate: "2026-07-01",
    acknowledgedAt: "2026-06-28",
    assignedBy: "HR",
    assignedAt: "2026-06-01",
    note: "",
    status: "acknowledged",
  },
  {
    id: "ack_9",
    employeeName: "Ayesha Khan",
    documentTitle: "Remote Work Policy",
    dueDate: "2026-09-01",
    acknowledgedAt: "",
    assignedBy: "Manager",
    assignedAt: "2026-07-20",
    note: "",
    status: "pending",
  },
  {
    id: "ack_10",
    employeeName: "Ashlee Bernhard",
    documentTitle: "Data Privacy and Security Policy",
    dueDate: "2026-04-01",
    acknowledgedAt: "2026-03-28",
    assignedBy: "Admin",
    assignedAt: "2026-03-01",
    note: "",
    status: "acknowledged",
  },
];

export function createAckId(existing: DocumentAcknowledgement[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ack_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ack_${n + 1}`;
}

export function todayYmd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
