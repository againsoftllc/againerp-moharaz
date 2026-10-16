/**
 * Workdo-aligned recruitment setup masters (System Setup + Career).
 * @see https://demo.workdo.io/hrm/hr/recruitment/candidate-onboarding
 * @see https://workdo.io/documents/recruitment-integration-in-dash-saas/
 */

export type MasterFieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "date";

export type MasterFieldDef = {
  key: string;
  label: string;
  type: MasterFieldType;
  required?: boolean;
  /** Show in table (default: true except textarea/checkbox details) */
  list?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Unit shown after values in list/view and beside number inputs (e.g. "days") */
  suffix?: string;
};

export type MasterRow = Record<string, string | number | boolean> & { id: string };

export type MasterEntityConfig = {
  title: string;
  addLabel: string;
  idPrefix: string;
  sheetHint: string;
  fields: MasterFieldDef[];
  seed: MasterRow[];
};

/** Optional real-API backend for HrmMasterCrud (G1+). */
export type MasterSelectOption = { value: string; label: string };

export type MasterCrudApi = {
  list: () => Promise<MasterRow[]>;
  create: (payload: Omit<MasterRow, "id">) => Promise<MasterRow>;
  update: (id: string, payload: Omit<MasterRow, "id">) => Promise<MasterRow>;
  remove: (id: string) => Promise<void>;
  /** Load select options by field key (e.g. branch_id → branches). */
  optionLoaders?: Record<string, () => Promise<MasterSelectOption[]>>;
};

const ACTIVE_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const JOB_TYPE_OPTS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const DEPT_OPTS = [
  "Human Resources",
  "Technology",
  "Finance",
  "Operations",
  "Customer Support",
  "Marketing",
  "Sales",
].map((d) => ({ value: d, label: d }));

export function createMasterId(prefix: string, existing: MasterRow[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(String(r.id).replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `${prefix}_${String(max + 1).padStart(2, "0")}`;
}

export function emptyMasterForm(fields: MasterFieldDef[]): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "checkbox") form[f.key] = "false";
    else if (f.type === "number") form[f.key] = "0";
    else if (f.type === "select" && f.options?.[0]) form[f.key] = f.options[0].value;
    else form[f.key] = "";
  }
  return form;
}

export function formFromMasterRow(
  fields: MasterFieldDef[],
  row: MasterRow,
): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    const v = row[f.key];
    if (f.type === "checkbox") form[f.key] = v === true || v === "true" || v === "yes" ? "true" : "false";
    else form[f.key] = v == null ? "" : String(v);
  }
  return form;
}

export function payloadFromMasterForm(
  fields: MasterFieldDef[],
  form: Record<string, string>,
): Omit<MasterRow, "id"> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const raw = form[f.key] ?? "";
    if (f.type === "number") out[f.key] = Number(raw) || 0;
    else if (f.type === "checkbox") out[f.key] = raw === "true";
    else out[f.key] = raw.trim();
  }
  return out as Omit<MasterRow, "id">;
}

/** Shared checklist names for items ↔ checklists. */
export const SETUP_CHECKLIST_NAMES = [
  "Standard Onboarding",
  "IT Department Onboarding",
  "Customer Support Onboarding",
] as const;

export const ONBOARDING_CHECKLISTS_CONFIG: MasterEntityConfig = {
  title: "Onboarding Checklists",
  addLabel: "Add Checklist",
  idPrefix: "ocl",
  sheetHint: "Workdo — name, description, default flag, status.",
  fields: [
    { key: "name", label: "Checklist Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "isDefault", label: "Is Default", type: "checkbox", list: true },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const CHECKLIST_ITEMS_CONFIG: MasterEntityConfig = {
  title: "Checklist Items",
  addLabel: "Add Checklist Item",
  idPrefix: "oci",
  sheetHint: "Workdo — checklist, task, category, role, due day, required.",
  fields: [
    {
      key: "checklist_id",
      label: "Checklist",
      type: "select",
      required: true,
      options: [],
    },
    { key: "name", label: "Task", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "documentation", label: "Documentation" },
        { value: "it_setup", label: "IT Setup" },
        { value: "training", label: "Training" },
        { value: "hr", label: "HR" },
        { value: "facilities", label: "Facilities" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "assigned_to_role",
      label: "Assigned To Role",
      type: "select",
      options: [
        { value: "HR", label: "HR" },
        { value: "IT", label: "IT" },
        { value: "Manager", label: "Manager" },
        { value: "Buddy", label: "Buddy" },
        { value: "Facilities", label: "Facilities" },
      ],
    },
    { key: "due_day", label: "Due Day", type: "number" },
    { key: "is_required", label: "Required", type: "checkbox", list: true },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const CAREER_CONFIG: MasterEntityConfig = {
  title: "Career",
  addLabel: "Add Career Job",
  idPrefix: "car",
  sheetHint: "Workdo career board — published jobs candidates can browse.",
  fields: [
    { key: "name", label: "Job Title", type: "text", required: true },
    { key: "department", label: "Department", type: "select", options: DEPT_OPTS },
    { key: "location", label: "Location", type: "text", required: true },
    { key: "jobType", label: "Job Type", type: "select", options: JOB_TYPE_OPTS },
    { key: "salaryRange", label: "Salary Range", type: "text" },
    { key: "vacancies", label: "Vacancies", type: "number" },
    { key: "description", label: "Job Description", type: "textarea", list: false },
    { key: "requirements", label: "Requirements", type: "textarea", list: false },
    { key: "benefits", label: "Benefits & Perks", type: "textarea", list: false },
    {
      key: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { value: "published", label: "Published" },
        { value: "draft", label: "Draft" },
        { value: "closed", label: "Closed" },
      ],
    },
  ],
  seed: [
    {
      id: "car_01",
      name: "Senior Software Engineer",
      department: "Technology",
      location: "Head Office - Mumbai",
      jobType: "full_time",
      salaryRange: "$40,000 – $55,000",
      vacancies: 2,
      description: "Build ERP features across web and API.",
      requirements: "3+ years backend experience.",
      benefits: "Health, PF, learning budget.",
      status: "published",
    },
    {
      id: "car_02",
      name: "Content Writer",
      department: "Marketing",
      location: "Remote Work - Bangladesh",
      jobType: "full_time",
      salaryRange: "$50,000 – $65,000",
      vacancies: 1,
      description: "Product and career-page content.",
      requirements: "Portfolio of B2B writing.",
      benefits: "Remote allowance.",
      status: "published",
    },
    {
      id: "car_03",
      name: "Financial Analyst Intern",
      department: "Finance",
      location: "Dhaka HQ",
      jobType: "internship",
      salaryRange: "$35,000 – $45,000",
      vacancies: 1,
      description: "Support FP&A variance analysis.",
      requirements: "Finance student or graduate.",
      benefits: "Mentorship, conversion path.",
      status: "draft",
    },
  ],
};

export const JOB_CATEGORIES_CONFIG: MasterEntityConfig = {
  title: "Job Categories",
  addLabel: "Add Job Category",
  idPrefix: "jcat",
  sheetHint: "Workdo — category name, description, status.",
  fields: [
    { key: "name", label: "Category Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const JOB_TYPES_CONFIG: MasterEntityConfig = {
  title: "Job Types",
  addLabel: "Add Job Type",
  idPrefix: "jtyp",
  sheetHint: "Workdo — Full-Time, Part-Time, Contract, Internship.",
  fields: [
    { key: "name", label: "Job Type Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const JOB_LOCATIONS_CONFIG: MasterEntityConfig = {
  title: "Job Locations",
  addLabel: "Add Job Location",
  idPrefix: "jloc",
  sheetHint: "Workdo — name, remote flag, address, city/state/country.",
  fields: [
    { key: "name", label: "Location Name", type: "text", required: true },
    { key: "isRemote", label: "Remote Work", type: "checkbox", list: true },
    { key: "address", label: "Address", type: "textarea", list: false },
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "postalCode", label: "Postal Code", type: "text", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const CANDIDATE_SOURCES_CONFIG: MasterEntityConfig = {
  title: "Candidate Sources",
  addLabel: "Add Candidate Source",
  idPrefix: "csrc",
  sheetHint: "Workdo — LinkedIn, Referral, Agency, Walk-in, etc.",
  fields: [
    { key: "name", label: "Source Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const INTERVIEW_TYPES_CONFIG: MasterEntityConfig = {
  title: "Interview Types",
  addLabel: "Add Interview Type",
  idPrefix: "ityp",
  sheetHint: "Workdo — Phone, Video, In-Person, Panel, duration.",
  fields: [
    { key: "name", label: "Interview Type Name", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const INTERVIEW_ROUNDS_CONFIG: MasterEntityConfig = {
  title: "Interview Rounds",
  addLabel: "Add Interview Round",
  idPrefix: "irnd",
  sheetHint: "Workdo — job posting, round name, type, sequence.",
  fields: [
    { key: "job_id", label: "Job Posting", type: "select", required: true, options: [] },
    { key: "name", label: "Round Name", type: "text", required: true },
    { key: "sequence", label: "Sequence", type: "number" },
    { key: "description", label: "Description", type: "textarea", list: false },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const OFFER_TEMPLATES_CONFIG: MasterEntityConfig = {
  title: "Offer Templates",
  addLabel: "Create Offer Template",
  idPrefix: "otpl",
  sheetHint: "Workdo — template name, job type, letter content placeholders.",
  fields: [
    { key: "name", label: "Template Name", type: "text", required: true },
    {
      key: "content",
      label: "Content",
      type: "textarea",
      list: false,
      placeholder: "Use {{candidate_name}}, {{salary}}, {{position}}",
    },
    { key: "status", label: "Status", type: "select", required: true, options: ACTIVE_OPTS },
  ],
  seed: [],
};

export const CUSTOM_QUESTIONS_CONFIG: MasterEntityConfig = {
  title: "Custom Questions",
  addLabel: "Add Custom Question",
  idPrefix: "cq",
  sheetHint: "Workdo — question text, type, options, required.",
  fields: [
    { key: "name", label: "Question", type: "text", required: true },
    { key: "required", label: "Required", type: "checkbox", list: true },
  ],
  seed: [],
};
