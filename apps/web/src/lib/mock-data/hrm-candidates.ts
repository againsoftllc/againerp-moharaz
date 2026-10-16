import { JOB_POSTINGS_SEED } from "@/lib/mock-data/hrm-job-postings";

export type CandidateStatus =
  | "new"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export type CandidateGender = "male" | "female" | "other";

export type CandidateDocument = {
  name: string;
  type: string;
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: CandidateGender;
  dateOfBirth: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  jobId: string;
  jobCode: string;
  jobTitle: string;
  office: string;
  jobLocation: string;
  jobType: string;
  department: string;
  source: string;
  currentCompany: string;
  currentPosition: string;
  totalExperience: number;
  currentSalary: number;
  expectedSalary: number;
  noticePeriod: string;
  resume: string;
  coverLetter: string;
  documents: CandidateDocument[];
  status: CandidateStatus;
  employeeConverted: boolean;
  appliedOn: string;
};

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  new: "New",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const CANDIDATE_GENDER_LABEL: Record<CandidateGender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const CANDIDATE_STATUS_OPTIONS = (
  Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[]
).map((k) => ({ value: k, label: CANDIDATE_STATUS_LABEL[k] }));

export const CANDIDATE_SOURCES = [
  "Walk-in Interview",
  "LinkedIn",
  "Company Website",
  "Naukri.com",
  "Recruitment Agency",
  "Referral",
] as const;

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSalary(n: number) {
  return money(n);
}

/** Format YYYY-MM-DD → M/D/YYYY (Workdo-style). */
export function formatAppliedOn(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd || "—";
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

/** Format YYYY-MM-DD → M/D/YYYY for DOB display. */
export function formatDisplayDate(ymd: string) {
  return formatAppliedOn(ymd);
}

function jobByCode(code: string) {
  return JOB_POSTINGS_SEED.find((j) => j.code === code) ?? JOB_POSTINGS_SEED[0]!;
}

export function createCandidateId(existing: Candidate[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `cand_${String(max + 1).padStart(2, "0")}`;
}

function docs(...files: string[]): CandidateDocument[] {
  return files.filter(Boolean).map((name) => ({
    name,
    type: name.toLowerCase().includes("cover") ? "Cover Letter" : "Resume",
  }));
}

/** Workdo-style demo candidates (details match demo candidate profile). */
export const CANDIDATES_SEED: Candidate[] = [
  {
    id: "cand_01",
    name: "Geeta Devi",
    email: "geeta.devi@email.com",
    phone: "+91-9876543240",
    gender: "female",
    dateOfBirth: "1991-02-28",
    address: "654 Education Road",
    city: "Patna",
    state: "Bihar",
    country: "India",
    zipCode: "800001",
    jobId: "job_extra_1",
    jobCode: "JOB-1-00001",
    jobTitle: "Senior Software Engineer",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Full-time",
    department: "Human Resources",
    source: "Walk-in Interview",
    currentCompany: "Education Hub",
    currentPosition: "Teacher",
    totalExperience: 3,
    currentSalary: 35000,
    expectedSalary: 45000,
    noticePeriod: "1 month",
    resume: "geeta-devi-cv.pdf",
    coverLetter: "Interested in backend-heavy ERP roles.",
    documents: docs("geeta-devi-cv.pdf", "geeta-devi-cover.pdf"),
    status: "offer",
    employeeConverted: false,
    appliedOn: "2025-12-23",
  },
  {
    id: "cand_02",
    name: "Nisha Agarwal",
    email: "nisha.agarwal@email.com",
    phone: "+91-9876543241",
    gender: "female",
    dateOfBirth: "1996-07-21",
    address: "12 Media Lane",
    city: "Delhi",
    state: "Delhi",
    country: "India",
    zipCode: "110001",
    jobId: jobByCode("JOB-1-00012").id,
    jobCode: "JOB-1-00012",
    jobTitle: "Content Writer",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Full-time",
    department: "Marketing",
    source: "LinkedIn",
    currentCompany: "MediaCraft",
    currentPosition: "Junior Writer",
    totalExperience: 3,
    currentSalary: 50000,
    expectedSalary: 65000,
    noticePeriod: "30 days",
    resume: "nisha-agarwal-cv.pdf",
    coverLetter: "",
    documents: docs("nisha-agarwal-cv.pdf"),
    status: "interview",
    employeeConverted: false,
    appliedOn: "2025-12-27",
  },
  {
    id: "cand_03",
    name: "Ramesh Babu",
    email: "ramesh.babu@email.com",
    phone: "+91-9876543242",
    gender: "male",
    dateOfBirth: "1990-11-05",
    address: "88 Network Street",
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    zipCode: "500001",
    jobId: jobByCode("JOB-1-00013").id,
    jobCode: "JOB-1-00013",
    jobTitle: "Network Administrator",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Full-time",
    department: "IT",
    source: "Company Website",
    currentCompany: "NetSecure",
    currentPosition: "SysAdmin",
    totalExperience: 5,
    currentSalary: 65000,
    expectedSalary: 75000,
    noticePeriod: "2 months",
    resume: "ramesh-babu-cv.pdf",
    coverLetter: "CCNA certified; open to onsite roles.",
    documents: docs("ramesh-babu-cv.pdf", "ramesh-babu-cover.pdf"),
    status: "screening",
    employeeConverted: false,
    appliedOn: "2025-12-26",
  },
  {
    id: "cand_04",
    name: "Tarun Malhotra",
    email: "tarun.malhotra@email.com",
    phone: "+91-9876543243",
    gender: "male",
    dateOfBirth: "1992-01-18",
    address: "45 Support Avenue",
    city: "Chandigarh",
    state: "Punjab",
    country: "India",
    zipCode: "160001",
    jobId: jobByCode("JOB-1-00015").id,
    jobCode: "JOB-1-00015",
    jobTitle: "Customer Support Representative",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Full-time",
    department: "Customer Support",
    source: "Naukri.com",
    currentCompany: "HelpDesk Pro",
    currentPosition: "Support Lead",
    totalExperience: 4,
    currentSalary: 90000,
    expectedSalary: 105000,
    noticePeriod: "45 days",
    resume: "tarun-malhotra-cv.pdf",
    coverLetter: "",
    documents: docs("tarun-malhotra-cv.pdf"),
    status: "offer",
    employeeConverted: false,
    appliedOn: "2025-12-24",
  },
  {
    id: "cand_05",
    name: "Shweta Mishra",
    email: "shweta.mishra@email.com",
    phone: "+91-9876543244",
    gender: "female",
    dateOfBirth: "1997-09-09",
    address: "21 Finance Park",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    zipCode: "411001",
    jobId: jobByCode("JOB-1-00014").id,
    jobCode: "JOB-1-00014",
    jobTitle: "Financial Analyst",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Internship",
    department: "Finance",
    source: "Recruitment Agency",
    currentCompany: "FinEdge",
    currentPosition: "Analyst Intern",
    totalExperience: 2,
    currentSalary: 45000,
    expectedSalary: 60000,
    noticePeriod: "15 days",
    resume: "shweta-mishra-cv.pdf",
    coverLetter: "",
    documents: docs("shweta-mishra-cv.pdf"),
    status: "screening",
    employeeConverted: false,
    appliedOn: "2025-12-25",
  },
  {
    id: "cand_06",
    name: "Divya Menon",
    email: "divya.menon@email.com",
    phone: "+91-9876543245",
    gender: "female",
    dateOfBirth: "1993-05-30",
    address: "9 Agile Towers",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    zipCode: "560001",
    jobId: "job_extra_6",
    jobCode: "JOB-1-00006",
    jobTitle: "Project Manager",
    office: "Main Office",
    jobLocation: "Head Office - Mumbai",
    jobType: "Full-time",
    department: "Operations",
    source: "LinkedIn",
    currentCompany: "AgileWorks",
    currentPosition: "Scrum Master",
    totalExperience: 3,
    currentSalary: 70000,
    expectedSalary: 75000,
    noticePeriod: "1 month",
    resume: "divya-menon-cv.pdf",
    coverLetter: "PMP in progress.",
    documents: docs("divya-menon-cv.pdf", "divya-menon-cover.pdf"),
    status: "new",
    employeeConverted: false,
    appliedOn: "2026-01-02",
  },
];
