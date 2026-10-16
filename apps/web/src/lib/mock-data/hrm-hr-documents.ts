/** Workdo HR Documents: card library with categories, versions, acknowledgments. */

export type HrDocumentStatus = "draft" | "published" | "archived";

export type HrDocumentCategory =
  | "Personal Documents"
  | "Legal Documents"
  | "Financial Documents"
  | "Employment Document"
  | "Company Policies"
  | "HR Forms";

export type HrDocument = {
  id: string;
  title: string;
  description: string;
  category: HrDocumentCategory;
  version: string;
  lastUpdate: string;
  status: HrDocumentStatus;
  requiresAcknowledgment: boolean;
  uploadedBy: string;
  downloadCount: number;
  fileName: string;
  fileType: string;
  fileSize: string;
  effectiveDate: string;
  expiryDate: string;
  accentColor: string;
};

export const HR_DOCUMENT_STATUS_LABEL: Record<HrDocumentStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const HR_DOCUMENT_STATUS_OPTIONS = (
  Object.keys(HR_DOCUMENT_STATUS_LABEL) as HrDocumentStatus[]
).map((k) => ({ value: k, label: HR_DOCUMENT_STATUS_LABEL[k] }));

export const HR_DOCUMENT_CATEGORIES: HrDocumentCategory[] = [
  "Personal Documents",
  "Legal Documents",
  "Financial Documents",
  "Employment Document",
  "Company Policies",
  "HR Forms",
];

export const CATEGORY_ACCENT: Record<HrDocumentCategory, string> = {
  "Personal Documents": "#f97316",
  "Legal Documents": "#3b82f6",
  "Financial Documents": "#ef4444",
  "Employment Document": "#eab308",
  "Company Policies": "#8b5cf6",
  "HR Forms": "#22c55e",
};

export const CATEGORY_BADGE_CLASS: Record<HrDocumentCategory, string> = {
  "Personal Documents":
    "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  "Legal Documents": "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300",
  "Financial Documents": "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
  "Employment Document":
    "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "Company Policies":
    "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300",
  "HR Forms": "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export const HR_DOCUMENTS_SEED: HrDocument[] = [
  {
    id: "hd_1",
    title: "Emergency Contact Form",
    description: "Employee emergency contacts and next-of-kin details.",
    category: "Personal Documents",
    version: "1.1",
    lastUpdate: "2024-01-01",
    status: "published",
    requiresAcknowledgment: false,
    uploadedBy: "Company",
    downloadCount: 90,
    fileName: "emergency-contact-form.pdf",
    fileType: "PDF",
    fileSize: "245 KB",
    effectiveDate: "2024-01-01",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Personal Documents"],
  },
  {
    id: "hd_2",
    title: "Data Privacy and Security Policy",
    description: "Company data handling, privacy, and security requirements.",
    category: "Legal Documents",
    version: "2.3",
    lastUpdate: "2024-01-01",
    status: "published",
    requiresAcknowledgment: true,
    uploadedBy: "Company",
    downloadCount: 56,
    fileName: "data-privacy-security-policy.pdf",
    fileType: "PDF",
    fileSize: "512 KB",
    effectiveDate: "2024-01-01",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Legal Documents"],
  },
  {
    id: "hd_3",
    title: "Expense Reimbursement Policy",
    description: "Rules for submitting and approving expense claims.",
    category: "Financial Documents",
    version: "1.6",
    lastUpdate: "2024-01-01",
    status: "published",
    requiresAcknowledgment: false,
    uploadedBy: "Company",
    downloadCount: 41,
    fileName: "expense-reimbursement-policy.pdf",
    fileType: "PDF",
    fileSize: "318 KB",
    effectiveDate: "2024-01-01",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Financial Documents"],
  },
  {
    id: "hd_4",
    title: "Remote Work Policy",
    description: "Guidelines for hybrid and remote work arrangements.",
    category: "Employment Document",
    version: "1.4",
    lastUpdate: "2024-01-01",
    status: "published",
    requiresAcknowledgment: true,
    uploadedBy: "Company",
    downloadCount: 78,
    fileName: "remote-work-policy.pdf",
    fileType: "PDF",
    fileSize: "290 KB",
    effectiveDate: "2024-01-01",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Employment Document"],
  },
  {
    id: "hd_5",
    title: "Code of Conduct",
    description: "Expected workplace behavior and ethics standards.",
    category: "Company Policies",
    version: "3.0",
    lastUpdate: "2024-02-15",
    status: "published",
    requiresAcknowledgment: true,
    uploadedBy: "Company",
    downloadCount: 112,
    fileName: "code-of-conduct.pdf",
    fileType: "PDF",
    fileSize: "420 KB",
    effectiveDate: "2024-02-15",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Company Policies"],
  },
  {
    id: "hd_6",
    title: "Leave Application Form",
    description: "Standard leave request template for employees.",
    category: "HR Forms",
    version: "1.0",
    lastUpdate: "2024-03-01",
    status: "published",
    requiresAcknowledgment: false,
    uploadedBy: "Company",
    downloadCount: 65,
    fileName: "leave-application-form.docx",
    fileType: "DOCX",
    fileSize: "88 KB",
    effectiveDate: "2024-03-01",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["HR Forms"],
  },
  {
    id: "hd_7",
    title: "Anti-Harassment Policy",
    description: "Zero-tolerance policy and reporting procedures.",
    category: "Legal Documents",
    version: "2.0",
    lastUpdate: "2024-01-10",
    status: "published",
    requiresAcknowledgment: true,
    uploadedBy: "Company",
    downloadCount: 48,
    fileName: "anti-harassment-policy.pdf",
    fileType: "PDF",
    fileSize: "360 KB",
    effectiveDate: "2024-01-10",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Legal Documents"],
  },
  {
    id: "hd_8",
    title: "Employee Handbook (Draft)",
    description: "Draft revision of the full employee handbook.",
    category: "Employment Document",
    version: "4.0",
    lastUpdate: "2024-06-01",
    status: "draft",
    requiresAcknowledgment: true,
    uploadedBy: "HR",
    downloadCount: 3,
    fileName: "employee-handbook-draft.pdf",
    fileType: "PDF",
    fileSize: "1.2 MB",
    effectiveDate: "",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Employment Document"],
  },
  {
    id: "hd_9",
    title: "Payroll Deduction Authorization",
    description: "Authorization form for voluntary payroll deductions.",
    category: "Financial Documents",
    version: "1.2",
    lastUpdate: "2023-11-20",
    status: "draft",
    requiresAcknowledgment: false,
    uploadedBy: "Finance",
    downloadCount: 12,
    fileName: "payroll-deduction-auth.pdf",
    fileType: "PDF",
    fileSize: "150 KB",
    effectiveDate: "2023-11-20",
    expiryDate: "",
    accentColor: CATEGORY_ACCENT["Financial Documents"],
  },
  {
    id: "hd_10",
    title: "NDA Template (Archived)",
    description: "Superseded non-disclosure agreement template.",
    category: "Legal Documents",
    version: "1.0",
    lastUpdate: "2022-05-01",
    status: "archived",
    requiresAcknowledgment: true,
    uploadedBy: "Legal",
    downloadCount: 200,
    fileName: "nda-template-v1.pdf",
    fileType: "PDF",
    fileSize: "180 KB",
    effectiveDate: "2022-05-01",
    expiryDate: "2024-01-01",
    accentColor: CATEGORY_ACCENT["Legal Documents"],
  },
];

export function createHrDocumentId(existing: HrDocument[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^hd_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `hd_${n + 1}`;
}

export function isExpiringSoon(doc: HrDocument, withinDays = 30): boolean {
  if (!doc.expiryDate) return false;
  const exp = new Date(doc.expiryDate + "T00:00:00");
  if (Number.isNaN(exp.getTime())) return false;
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  return exp >= now && exp <= end;
}

export function pctOfTotal(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
