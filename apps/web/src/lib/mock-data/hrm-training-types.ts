/** Workdo demo: Name, Departments (dept + branch badges), Programs count. */

export type TrainingTypeDepartment = {
  name: string;
  branch: string;
};

export type TrainingType = {
  id: string;
  name: string;
  description: string;
  departments: TrainingTypeDepartment[];
  programs: number;
};

export const TRAINING_TYPE_DEPT_POOL: TrainingTypeDepartment[] = [
  { name: "Human Resources", branch: "North Branch" },
  { name: "Human Resources", branch: "West Branch" },
  { name: "Information Technology", branch: "West Branch" },
  { name: "Information Technology", branch: "North Branch" },
  { name: "Finance & Accounting", branch: "West Branch" },
  { name: "Finance & Accounting", branch: "South Branch" },
  { name: "Operations", branch: "East Branch" },
  { name: "Sales & Marketing", branch: "North Branch" },
];

export const TRAINING_TYPES_SEED: TrainingType[] = [
  {
    id: "tt_1",
    name: "Professional Certification",
    description: "Industry certifications and exam prep.",
    departments: [{ name: "Human Resources", branch: "North Branch" }],
    programs: 0,
  },
  {
    id: "tt_2",
    name: "Soft Skills Development",
    description: "Communication, teamwork, and interpersonal skills.",
    departments: [{ name: "Sales & Marketing", branch: "North Branch" }],
    programs: 1,
  },
  {
    id: "tt_3",
    name: "Technical Skills Training",
    description: "Hands-on technical upskilling.",
    departments: [{ name: "Information Technology", branch: "North Branch" }],
    programs: 3,
  },
  {
    id: "tt_4",
    name: "Compliance & Safety",
    description: "Regulatory and workplace safety programs.",
    departments: [{ name: "Operations", branch: "East Branch" }],
    programs: 2,
  },
  {
    id: "tt_5",
    name: "Leadership Development",
    description: "Manager and executive leadership tracks.",
    departments: [{ name: "Human Resources", branch: "West Branch" }],
    programs: 4,
  },
  {
    id: "tt_6",
    name: "Onboarding Programs",
    description: "New-hire orientation and culture fit.",
    departments: [{ name: "Finance & Accounting", branch: "South Branch" }],
    programs: 1,
  },
  {
    id: "tt_7",
    name: "Customer Service Excellence",
    description: "Service quality and customer experience.",
    departments: [
      { name: "Human Resources", branch: "West Branch" },
      { name: "Information Technology", branch: "West Branch" },
      { name: "Finance & Accounting", branch: "West Branch" },
    ],
    programs: 2,
  },
];

export function createTrainingTypeId(existing: TrainingType[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^tt_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `tt_${n + 1}`;
}

export function deptKey(d: TrainingTypeDepartment): string {
  return `${d.name}||${d.branch}`;
}

export function parseDeptKey(key: string): TrainingTypeDepartment {
  const [name, branch] = key.split("||");
  return { name: name ?? "", branch: branch ?? "" };
}
