export type JobPostingStatus = "draft" | "published" | "closed" | "on_hold";

export type JobTypeKey =
  | "remote"
  | "internship"
  | "freelance"
  | "temporary"
  | "contract"
  | "full_time"
  | "part_time";

export type JobPosting = {
  id: string;
  code: string;
  title: string;
  jobType: JobTypeKey;
  location: string;
  branch: string;
  department: string;
  priority: "low" | "normal" | "high" | "urgent";
  requiredSkills: string;
  startDate: string;
  deadline: string;
  minExperience: number;
  maxExperience: number;
  minSalary: number;
  maxSalary: number;
  description: string;
  requirements: string;
  benefits: string;
  numberOfPositions: number;
  applications: number;
  isPublished: boolean;
  isFeatured: boolean;
  status: JobPostingStatus;
  publishDate: string;
};

export const JOB_TYPE_LABEL: Record<JobTypeKey, string> = {
  remote: "Remote",
  internship: "Internship",
  freelance: "Freelance",
  temporary: "Temporary",
  contract: "Contract",
  full_time: "Full-time",
  part_time: "Part-time",
};

export const JOB_TYPE_OPTIONS = (Object.keys(JOB_TYPE_LABEL) as JobTypeKey[]).map((k) => ({
  value: k,
  label: JOB_TYPE_LABEL[k],
}));

export const JOB_STATUS_LABEL: Record<JobPostingStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  on_hold: "On Hold",
};

export const JOB_STATUS_OPTIONS = (Object.keys(JOB_STATUS_LABEL) as JobPostingStatus[]).map(
  (k) => ({ value: k, label: JOB_STATUS_LABEL[k] }),
);

export const JOB_LOCATIONS = [
  "Remote Work - Bangladesh",
  "Dhaka HQ",
  "Gazipur DC",
  "Chittagong Office",
  "Service Center - Dhaka",
] as const;

export const JOB_DEPARTMENTS = [
  "Operations",
  "Sales",
  "Finance",
  "Human Resources",
  "Technology",
  "Customer Support",
] as const;

export const JOB_BRANCHES = ["Dhaka HQ", "Gazipur DC", "Chittagong"] as const;

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSalaryRange(min: number, max: number) {
  return `${money(min)} - ${money(max)}`;
}

export function createJobCode(existing: JobPosting[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.code.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `JOB-1-${String(max + 1).padStart(5, "0")}`;
}

export function createJobId(existing: JobPosting[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `job_${String(max + 1).padStart(2, "0")}`;
}

/** Workdo-style demo postings. */
export const JOB_POSTINGS_SEED: JobPosting[] = [
  {
    id: "job_15",
    code: "JOB-1-00015",
    title: "Customer Support Representative",
    jobType: "remote",
    location: "Remote Work - Bangladesh",
    branch: "Dhaka HQ",
    department: "Customer Support",
    priority: "normal",
    requiredSkills: "CRM, Bangla/English communication, ticketing tools",
    startDate: "2026-01-15",
    deadline: "2026-02-22",
    minExperience: 1,
    maxExperience: 3,
    minSalary: 25000,
    maxSalary: 35000,
    description: "Handle inbound customer queries and escalate product issues.",
    requirements: "1+ years support experience; strong written communication.",
    benefits: "Remote allowance, health coverage, learning budget.",
    numberOfPositions: 2,
    applications: 2,
    isPublished: true,
    isFeatured: true,
    status: "published",
    publishDate: "2026-01-16",
  },
  {
    id: "job_14",
    code: "JOB-1-00014",
    title: "Financial Analyst",
    jobType: "internship",
    location: "Dhaka HQ",
    branch: "Dhaka HQ",
    department: "Finance",
    priority: "normal",
    requiredSkills: "Excel, financial modeling, reporting",
    startDate: "2026-02-01",
    deadline: "2026-03-04",
    minExperience: 0,
    maxExperience: 1,
    minSalary: 35000,
    maxSalary: 45000,
    description: "Support FP&A with monthly variance and cash forecasts.",
    requirements: "Finance/Accounting student or recent graduate.",
    benefits: "Mentorship, stipend, conversion opportunity.",
    numberOfPositions: 1,
    applications: 2,
    isPublished: false,
    isFeatured: false,
    status: "draft",
    publishDate: "",
  },
  {
    id: "job_13",
    code: "JOB-1-00013",
    title: "Sales Development Representative",
    jobType: "freelance",
    location: "Chittagong Office",
    branch: "Chittagong",
    department: "Sales",
    priority: "high",
    requiredSkills: "Outbound calling, CRM, negotiation",
    startDate: "2026-01-20",
    deadline: "2026-02-22",
    minExperience: 1,
    maxExperience: 4,
    minSalary: 30000,
    maxSalary: 50000,
    description: "Generate qualified leads for regional sales team.",
    requirements: "Proven outbound experience preferred.",
    benefits: "Commission upside, flexible hours.",
    numberOfPositions: 3,
    applications: 2,
    isPublished: true,
    isFeatured: false,
    status: "published",
    publishDate: "2026-01-21",
  },
  {
    id: "job_12",
    code: "JOB-1-00012",
    title: "Warehouse Operations Associate",
    jobType: "temporary",
    location: "Gazipur DC",
    branch: "Gazipur DC",
    department: "Operations",
    priority: "urgent",
    requiredSkills: "WMS, picking/packing, shift flexibility",
    startDate: "2026-02-10",
    deadline: "2026-03-04",
    minExperience: 0,
    maxExperience: 2,
    minSalary: 22000,
    maxSalary: 30000,
    description: "Seasonal fulfillment support for peak volume.",
    requirements: "Ability to work standing shifts; OT readiness.",
    benefits: "Overtime pay, transport support.",
    numberOfPositions: 8,
    applications: 2,
    isPublished: true,
    isFeatured: false,
    status: "published",
    publishDate: "2026-02-11",
  },
  {
    id: "job_11",
    code: "JOB-1-00011",
    title: "Business Analyst",
    jobType: "contract",
    location: "Service Center - Dhaka",
    branch: "Dhaka HQ",
    department: "Technology",
    priority: "high",
    requiredSkills: "Requirements gathering, SQL, process mapping",
    startDate: "2026-03-01",
    deadline: "2026-03-04",
    minExperience: 2,
    maxExperience: 5,
    minSalary: 55000,
    maxSalary: 75000,
    description: "Bridge business stakeholders and product engineering.",
    requirements: "2+ years BA experience in SaaS/ERP preferred.",
    benefits: "Contract extension path, hybrid work.",
    numberOfPositions: 1,
    applications: 2,
    isPublished: false,
    isFeatured: false,
    status: "draft",
    publishDate: "",
  },
  {
    id: "job_10",
    code: "JOB-1-00010",
    title: "HR Officer",
    jobType: "full_time",
    location: "Dhaka HQ",
    branch: "Dhaka HQ",
    department: "Human Resources",
    priority: "normal",
    requiredSkills: "Leave & attendance, payroll coordination, onboarding",
    startDate: "2026-01-05",
    deadline: "2026-02-15",
    minExperience: 2,
    maxExperience: 5,
    minSalary: 40000,
    maxSalary: 55000,
    description: "Own day-to-day HR operations for HQ workforce.",
    requirements: "HR diploma/degree; ERP familiarity a plus.",
    benefits: "PF, medical, annual leave.",
    numberOfPositions: 1,
    applications: 5,
    isPublished: true,
    isFeatured: true,
    status: "published",
    publishDate: "2026-01-06",
  },
];
