/** Workdo Document Categories: split Add form + list with color/icon, mandatory flag. */

export type DocumentCategoryStatus = "active" | "inactive";

export type DocumentCategoryIcon =
  | "folder"
  | "shield"
  | "user"
  | "file"
  | "briefcase"
  | "scale"
  | "wallet"
  | "book";

export type DocumentCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: DocumentCategoryIcon;
  isMandatory: boolean;
  documentsCount: number;
  status: DocumentCategoryStatus;
  locked: boolean;
};

export const DOC_CATEGORY_STATUS_LABEL: Record<DocumentCategoryStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const DOC_CATEGORY_STATUS_OPTIONS = (
  Object.keys(DOC_CATEGORY_STATUS_LABEL) as DocumentCategoryStatus[]
).map((k) => ({ value: k, label: DOC_CATEGORY_STATUS_LABEL[k] }));

export const DOC_CATEGORY_ICON_OPTIONS: {
  value: DocumentCategoryIcon;
  label: string;
}[] = [
  { value: "folder", label: "Folder" },
  { value: "shield", label: "Shield" },
  { value: "user", label: "User" },
  { value: "file", label: "File" },
  { value: "briefcase", label: "Briefcase" },
  { value: "scale", label: "Scale" },
  { value: "wallet", label: "Wallet" },
  { value: "book", label: "Book" },
];

export const DOCUMENT_CATEGORIES_SEED: DocumentCategory[] = [
  {
    id: "dcat_1",
    name: "Compliance Documents",
    description: "Compliance Records",
    color: "#ef4444",
    icon: "shield",
    isMandatory: true,
    documentsCount: 2,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_2",
    name: "Personal Documents",
    description:
      "Contains personal details, emergency contacts, identification, and other employee personal records.",
    color: "#f97316",
    icon: "user",
    isMandatory: true,
    documentsCount: 1,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_3",
    name: "Legal Documents",
    description: "Contracts, NDAs, and legal agreements.",
    color: "#3b82f6",
    icon: "scale",
    isMandatory: true,
    documentsCount: 4,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_4",
    name: "Financial Documents",
    description: "Payroll, reimbursement, and financial certifications.",
    color: "#ef4444",
    icon: "wallet",
    isMandatory: false,
    documentsCount: 3,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_5",
    name: "Employment Documents",
    description: "Offer letters, experience certificates, and employment forms.",
    color: "#eab308",
    icon: "briefcase",
    isMandatory: false,
    documentsCount: 5,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_6",
    name: "Company Policies",
    description: "Internal policies and handbooks.",
    color: "#8b5cf6",
    icon: "book",
    isMandatory: false,
    documentsCount: 6,
    status: "active",
    locked: false,
  },
  {
    id: "dcat_7",
    name: "HR Forms",
    description: "Reusable HR form templates and requests.",
    color: "#22c55e",
    icon: "file",
    isMandatory: false,
    documentsCount: 2,
    status: "inactive",
    locked: true,
  },
];

export function createDocumentCategoryId(existing: DocumentCategory[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^dcat_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `dcat_${n + 1}`;
}
