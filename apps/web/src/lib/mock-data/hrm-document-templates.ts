/** Workdo Document Templates: category, placeholders, format, content length. */

export type DocumentTemplateStatus = "active" | "inactive";
export type DocumentTemplateFormat = "PDF" | "DOC" | "DOCX";

export type DocumentTemplateCategory =
  | "Employment Documents"
  | "Financial Documents"
  | "Legal Documents"
  | "HR Forms"
  | "Company Policies";

export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  category: DocumentTemplateCategory;
  placeholders: string[];
  content: string;
  fileFormat: DocumentTemplateFormat;
  isDefault: boolean;
  status: DocumentTemplateStatus;
  createdAt: string;
  accentColor: string;
};

export const DOC_TEMPLATE_STATUS_LABEL: Record<DocumentTemplateStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const DOC_TEMPLATE_STATUS_OPTIONS = (
  Object.keys(DOC_TEMPLATE_STATUS_LABEL) as DocumentTemplateStatus[]
).map((k) => ({ value: k, label: DOC_TEMPLATE_STATUS_LABEL[k] }));

export const DOC_TEMPLATE_FORMAT_OPTIONS: DocumentTemplateFormat[] = ["PDF", "DOC", "DOCX"];

export const DOC_TEMPLATE_CATEGORIES: DocumentTemplateCategory[] = [
  "Employment Documents",
  "Financial Documents",
  "Legal Documents",
  "HR Forms",
  "Company Policies",
];

export const CATEGORY_ACCENT: Record<DocumentTemplateCategory, string> = {
  "Employment Documents": "#f97316",
  "Financial Documents": "#ef4444",
  "Legal Documents": "#3b82f6",
  "HR Forms": "#22c55e",
  "Company Policies": "#8b5cf6",
};

function ph(...names: string[]) {
  return names;
}

const OFFER_CONTENT = `Dear {{candidate_name}},

We are pleased to offer you the position of {{job_title}} in the {{department}} department at {{company_name}}.

Start Date: {{start_date}}
Reporting Manager: {{manager_name}}
Work Location: {{work_location}}
Employment Type: {{employment_type}}

Compensation:
- Basic Salary: {{basic_salary}} {{currency}}
- Allowances: {{allowances}}
- Benefits: {{benefits_summary}}

Please confirm acceptance by {{offer_expiry_date}}.

Sincerely,
{{hr_name}}
{{company_name}}`;

const EXP_CONTENT = `TO WHOM IT MAY CONCERN

This is to certify that {{employee_name}} (Employee ID: {{employee_id}}) was employed with {{company_name}} as {{job_title}} in {{department}} from {{join_date}} to {{last_working_date}}.

During this period, {{employee_name}} performed duties with {{performance_summary}}.

Designation at exit: {{exit_designation}}
Reason for leaving: {{leaving_reason}}

We wish {{employee_name}} success in future endeavors.

{{authorized_signatory}}
{{company_name}}
{{issue_date}}
{{company_address}}
{{contact_email}}
{{contact_phone}}
{{letter_ref}}`;

const SALARY_CONTENT = `SALARY CERTIFICATE

This is to certify that {{employee_name}} ({{employee_id}}) is employed with {{company_name}} as {{job_title}}.

Current monthly compensation:
- Basic: {{basic_salary}} {{currency}}
- Housing: {{housing_allowance}}
- Transport: {{transport_allowance}}
- Other: {{other_allowances}}
- Gross: {{gross_salary}}

Purpose: {{certificate_purpose}}
Issued on: {{issue_date}}
Valid until: {{valid_until}}

Authorized by {{hr_name}}
{{company_name}}
{{company_address}}`;

export const DOCUMENT_TEMPLATES_SEED: DocumentTemplate[] = [
  {
    id: "dt_1",
    name: "Employment Offer Letter",
    description:
      "Standard template for employment offer letters with position details and compensation",
    category: "Employment Documents",
    placeholders: ph(
      "candidate_name",
      "job_title",
      "department",
      "company_name",
      "start_date",
      "manager_name",
      "work_location",
      "employment_type",
      "basic_salary",
      "currency",
      "allowances",
      "benefits_summary",
      "offer_expiry_date",
      "hr_name",
    ),
    content: OFFER_CONTENT,
    fileFormat: "PDF",
    isDefault: true,
    status: "active",
    createdAt: "2025-09-19",
    accentColor: CATEGORY_ACCENT["Employment Documents"],
  },
  {
    id: "dt_2",
    name: "Experience Certificate",
    description:
      "Template for employee experience certificates upon resignation or completion of service",
    category: "Employment Documents",
    placeholders: ph(
      "employee_name",
      "employee_id",
      "company_name",
      "job_title",
      "department",
      "join_date",
      "last_working_date",
      "performance_summary",
      "exit_designation",
      "leaving_reason",
      "authorized_signatory",
      "issue_date",
      "company_address",
      "contact_email",
      "contact_phone",
      "letter_ref",
    ),
    content: EXP_CONTENT,
    fileFormat: "PDF",
    isDefault: false,
    status: "active",
    createdAt: "2025-09-19",
    accentColor: CATEGORY_ACCENT["Employment Documents"],
  },
  {
    id: "dt_3",
    name: "Salary Certificate",
    description:
      "Template for salary certificates required for loan applications and official purposes",
    category: "Financial Documents",
    placeholders: ph(
      "employee_name",
      "employee_id",
      "company_name",
      "job_title",
      "basic_salary",
      "currency",
      "housing_allowance",
      "transport_allowance",
      "other_allowances",
      "gross_salary",
      "certificate_purpose",
      "issue_date",
      "valid_until",
      "hr_name",
      "company_address",
    ),
    content: SALARY_CONTENT,
    fileFormat: "PDF",
    isDefault: false,
    status: "active",
    createdAt: "2025-09-19",
    accentColor: CATEGORY_ACCENT["Financial Documents"],
  },
  {
    id: "dt_4",
    name: "Warning Letter",
    description: "Formal warning letter template for disciplinary actions",
    category: "Legal Documents",
    placeholders: ph(
      "employee_name",
      "employee_id",
      "incident_date",
      "violation_summary",
      "policy_reference",
      "manager_name",
      "hr_name",
      "company_name",
      "issue_date",
      "response_deadline",
    ),
    content:
      "Warning Letter to {{employee_name}} ({{employee_id}}) regarding incident on {{incident_date}}: {{violation_summary}}. Policy: {{policy_reference}}. Issued {{issue_date}} by {{manager_name}} / {{hr_name}}, {{company_name}}. Respond by {{response_deadline}}.",
    fileFormat: "DOCX",
    isDefault: false,
    status: "active",
    createdAt: "2025-10-05",
    accentColor: CATEGORY_ACCENT["Legal Documents"],
  },
  {
    id: "dt_5",
    name: "Leave Approval Memo",
    description: "Internal memo confirming approved leave dates and coverage",
    category: "HR Forms",
    placeholders: ph(
      "employee_name",
      "leave_type",
      "from_date",
      "to_date",
      "total_days",
      "covering_employee",
      "approver_name",
      "company_name",
    ),
    content:
      "Leave Approval: {{employee_name}} — {{leave_type}} from {{from_date}} to {{to_date}} ({{total_days}} days). Coverage: {{covering_employee}}. Approved by {{approver_name}}, {{company_name}}.",
    fileFormat: "DOC",
    isDefault: false,
    status: "active",
    createdAt: "2025-11-12",
    accentColor: CATEGORY_ACCENT["HR Forms"],
  },
  {
    id: "dt_6",
    name: "Policy Acknowledgment Form",
    description: "Generic acknowledgment form for company policy updates",
    category: "Company Policies",
    placeholders: ph(
      "employee_name",
      "policy_name",
      "policy_version",
      "effective_date",
      "acknowledgment_date",
      "company_name",
      "hr_name",
    ),
    content:
      "I, {{employee_name}}, acknowledge receipt and understanding of {{policy_name}} (v{{policy_version}}) effective {{effective_date}}. Signed {{acknowledgment_date}}. {{company_name}} / {{hr_name}}.",
    fileFormat: "PDF",
    isDefault: false,
    status: "inactive",
    createdAt: "2025-12-01",
    accentColor: CATEGORY_ACCENT["Company Policies"],
  },
];

export function createDocumentTemplateId(existing: DocumentTemplate[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^dt_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `dt_${n + 1}`;
}

export function parseList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function todayYmd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
