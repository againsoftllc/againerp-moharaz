/** Workdo Contract Templates: name, type, variables/clauses counts, content length. */

export type ContractTemplateStatus = "active" | "inactive";

export type ContractTemplate = {
  id: string;
  name: string;
  description: string;
  contractType: string;
  variables: string[];
  clauses: string[];
  content: string;
  isDefault: boolean;
  locked: boolean;
  status: ContractTemplateStatus;
  createdAt: string;
};

export const CONTRACT_TEMPLATE_STATUS_LABEL: Record<ContractTemplateStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const CONTRACT_TEMPLATE_STATUS_OPTIONS = (
  Object.keys(CONTRACT_TEMPLATE_STATUS_LABEL) as ContractTemplateStatus[]
).map((k) => ({ value: k, label: CONTRACT_TEMPLATE_STATUS_LABEL[k] }));

export const CONTRACT_TYPE_OPTIONS = [
  "Permanent Full-time",
  "Part-time Contract",
  "Fixed-term Contract",
  "Internship Contract",
  "Consultant Agreement",
  "Probationary Contract",
] as const;

const PERM_CONTENT = `This Employment Contract is entered into between {{company_name}} ("Employer") and {{employee_name}} ("Employee") effective {{start_date}}.

1. Position. Employee shall serve as {{job_title}} in the {{department}} department.
2. Compensation. Employer shall pay {{salary_amount}} {{salary_currency}} per {{pay_frequency}}.
3. Working Hours. Standard hours are {{work_hours}} per week at {{work_location}}.
4. Probation. A probation period of {{probation_months}} months applies from the start date.
5. Termination. Either party may terminate with {{notice_period}} notice in writing.

Additional terms: {{benefits}}, {{leave_entitlement}}, {{confidentiality}}, {{non_compete}}, {{governing_law}}.`;

const INTERN_CONTENT = `Internship Agreement between {{company_name}} and {{intern_name}} commencing {{start_date}} ending {{end_date}}.

1. Program. Intern will participate in {{program_name}} under mentor {{mentor_name}}.
2. Stipend. Intern receives {{stipend_amount}} {{currency}} {{pay_frequency}}.
3. Hours. Expected commitment is {{weekly_hours}} hours per week.
4. Learning Goals. {{learning_objectives}}.
5. Confidentiality. Intern agrees to {{confidentiality_clause}}.

Placeholders: {{university}}, {{student_id}}, {{supervisor}}, {{evaluation_date}}, {{certificate_on_completion}}, {{work_location}}, {{department}}, {{emergency_contact}}, {{nda_required}}, {{remote_allowed}}.`;

function vars(...names: string[]) {
  return names;
}

export const CONTRACT_TEMPLATES_SEED: ContractTemplate[] = [
  {
    id: "ct_1",
    name: "Standard Permanent Employment Contract",
    description:
      "Standard template for permanent full-time employees with comprehensive terms and conditions",
    contractType: "Permanent Full-time",
    variables: vars(
      "company_name",
      "employee_name",
      "start_date",
      "job_title",
      "department",
      "salary_amount",
      "salary_currency",
      "pay_frequency",
      "work_hours",
      "work_location",
      "probation_months",
      "notice_period",
      "benefits",
      "leave_entitlement",
      "governing_law",
    ),
    clauses: [
      "Position & Duties",
      "Compensation",
      "Working Hours",
      "Probation",
      "Termination",
    ],
    content: PERM_CONTENT,
    isDefault: true,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ct_2",
    name: "Internship Agreement Template",
    description: "Agreement template for internship programs and student placements",
    contractType: "Internship Contract",
    variables: vars(
      "company_name",
      "intern_name",
      "start_date",
      "end_date",
      "program_name",
      "mentor_name",
      "stipend_amount",
      "currency",
      "pay_frequency",
      "weekly_hours",
      "learning_objectives",
      "confidentiality_clause",
      "university",
      "student_id",
      "supervisor",
      "evaluation_date",
    ),
    clauses: [
      "Program Scope",
      "Stipend",
      "Hours",
      "Learning Goals",
      "Confidentiality",
    ],
    content: INTERN_CONTENT,
    isDefault: false,
    locked: false,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "ct_3",
    name: "Fixed-Term Employment Contract",
    description: "Template for time-bound employment with clear end date and renewal terms",
    contractType: "Fixed-term Contract",
    variables: vars(
      "company_name",
      "employee_name",
      "start_date",
      "end_date",
      "job_title",
      "salary_amount",
      "notice_period",
      "renewal_option",
      "work_location",
      "department",
      "project_name",
      "governing_law",
    ),
    clauses: ["Term", "Role", "Pay", "Renewal", "Termination"],
    content:
      "Fixed-term contract for {{employee_name}} from {{start_date}} to {{end_date}} as {{job_title}}. Salary {{salary_amount}}. Renewal: {{renewal_option}}. Location {{work_location}}, Dept {{department}}. Project {{project_name}}. Notice {{notice_period}}. Law {{governing_law}}. Employer {{company_name}}.",
    isDefault: false,
    locked: false,
    status: "active",
    createdAt: "2025-10-02",
  },
  {
    id: "ct_4",
    name: "Part-time Employment Contract",
    description: "Contract template for part-time staff with prorated benefits",
    contractType: "Part-time Contract",
    variables: vars(
      "employee_name",
      "weekly_hours",
      "hourly_rate",
      "start_date",
      "work_days",
      "benefits_proration",
      "company_name",
      "job_title",
      "supervisor",
      "notice_period",
    ),
    clauses: ["Hours", "Pay Rate", "Benefits", "Schedule"],
    content:
      "Part-time agreement: {{employee_name}} works {{weekly_hours}} hrs/week at {{hourly_rate}} starting {{start_date}}. Days: {{work_days}}. Benefits: {{benefits_proration}}. Title {{job_title}}, Supervisor {{supervisor}}. Notice {{notice_period}}. {{company_name}}.",
    isDefault: false,
    locked: false,
    status: "active",
    createdAt: "2025-10-15",
  },
  {
    id: "ct_5",
    name: "Consultant Service Agreement",
    description: "Independent contractor / consultant engagement template",
    contractType: "Consultant Agreement",
    variables: vars(
      "consultant_name",
      "company_name",
      "scope_of_work",
      "fee_amount",
      "payment_terms",
      "start_date",
      "end_date",
      "deliverables",
      "ip_ownership",
      "confidentiality",
      "invoice_cycle",
      "termination_clause",
      "governing_law",
    ),
    clauses: ["Scope", "Fees", "IP", "Confidentiality", "Termination", "Law"],
    content:
      "Consultant Agreement with {{consultant_name}} for {{company_name}}. Scope: {{scope_of_work}}. Fee {{fee_amount}}, terms {{payment_terms}}, cycle {{invoice_cycle}}. Period {{start_date}}–{{end_date}}. Deliverables {{deliverables}}. IP {{ip_ownership}}. Confidentiality {{confidentiality}}. Termination {{termination_clause}}. Law {{governing_law}}.",
    isDefault: false,
    locked: true,
    status: "inactive",
    createdAt: "2025-11-01",
  },
  {
    id: "ct_6",
    name: "Probationary Employment Contract",
    description: "Short-form contract covering probation period before confirmation",
    contractType: "Probationary Contract",
    variables: vars(
      "employee_name",
      "probation_months",
      "start_date",
      "job_title",
      "salary_amount",
      "review_date",
      "company_name",
      "manager_name",
      "confirmation_criteria",
    ),
    clauses: ["Probation Term", "Role", "Review", "Confirmation"],
    content:
      "Probationary contract for {{employee_name}} as {{job_title}} at {{company_name}} from {{start_date}} for {{probation_months}} months. Salary {{salary_amount}}. Review on {{review_date}} by {{manager_name}}. Criteria: {{confirmation_criteria}}.",
    isDefault: false,
    locked: false,
    status: "active",
    createdAt: "2025-12-08",
  },
];

export function createContractTemplateId(existing: ContractTemplate[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ct_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ct_${n + 1}`;
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
