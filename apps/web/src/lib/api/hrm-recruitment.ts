import { apiFetch } from "@/lib/api/client";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import {
  candidateSourcesApi,
  checklistItemsApi,
  interviewRoundsApi,
  interviewTypesApi,
  jobLocationsApi,
  jobTypesApi,
  onboardingChecklistsApi,
} from "@/lib/api/hrm-recruitment-masters";
import type {
  AssessmentStatus,
  AssessmentType,
  CandidateAssessment,
} from "@/lib/mock-data/hrm-candidate-assessments";
import type { CandidateOnboarding, OnboardingStatus } from "@/lib/mock-data/hrm-candidate-onboarding";
import type {
  Candidate,
  CandidateGender,
  CandidateStatus,
} from "@/lib/mock-data/hrm-candidates";
import type {
  FeedbackRecommendation,
  InterviewFeedbackRow,
} from "@/lib/mock-data/hrm-interview-feedback";
import type {
  Interview,
  InterviewFeedbackStatus,
  InterviewStatus,
} from "@/lib/mock-data/hrm-interviews";
import type {
  JobPosting,
  JobPostingStatus,
  JobTypeKey,
} from "@/lib/mock-data/hrm-job-postings";
import type { Offer, OfferStatus } from "@/lib/mock-data/hrm-offers";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number; page?: number; per_page?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

/* ── API row types ─────────────────────────────────────────────── */

type ApiCandidate = {
  id: string;
  job_id: string | null;
  source_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  current_company: string | null;
  current_position: string | null;
  experience_years: number;
  current_salary: string | number | null;
  expected_salary: string | number | null;
  notice_period: string | null;
  resume_path: string | null;
  cover_letter_path: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  branch_id: string | null;
  department_id: string | null;
  status: CandidateStatus;
  is_employee: boolean;
  application_date: string | null;
};

type ApiJobPosting = {
  id: string;
  job_code: string | null;
  code: string | null;
  title: string;
  job_type_id: string | null;
  location_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  min_experience: string | number | null;
  max_experience: string | number | null;
  min_salary: string | number | null;
  max_salary: string | number | null;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  application_deadline: string | null;
  start_date: string | null;
  positions: number;
  priority: string;
  skills: string[] | null;
  is_published: boolean;
  publish_date: string | null;
  is_featured: boolean;
  status: string;
};

type ApiInterview = {
  id: string;
  candidate_id: string | null;
  job_id: string | null;
  round_id: string | null;
  interview_type_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration: number;
  location: string | null;
  meeting_link: string | null;
  interviewers: string[];
  status: string;
  feedback_submitted: boolean;
  created_at: string;
};

type ApiOffer = {
  id: string;
  candidate_id: string | null;
  job_id: string | null;
  offer_date: string | null;
  position: string | null;
  department_id: string | null;
  salary: string | number;
  bonus: string | number | null;
  benefits: string | null;
  start_date: string | null;
  expiration_date: string | null;
  status: string;
  approved_by: string | null;
  decline_reason: string | null;
};

type ApiAssessment = {
  id: string;
  candidate_id: string | null;
  assessment_name: string | null;
  score: number | null;
  max_score: number | null;
  pass_fail_status: string;
  comments: string | null;
  conducted_by: string | null;
  assessment_date: string | null;
};

type ApiFeedback = {
  id: string;
  interview_id: string | null;
  interviewer_id: string | null;
  technical_rating: number | null;
  communication_rating: number | null;
  cultural_fit_rating: number | null;
  overall_rating: number | null;
  strengths: string | null;
  weaknesses: string | null;
  comments: string | null;
  recommendation: string | null;
  created_at: string;
};

type ApiOnboarding = {
  id: string;
  candidate_id: string | null;
  employee_id: string | null;
  checklist_id: string | null;
  start_date: string | null;
  buddy_employee_id: string | null;
  status: string;
  created_at: string;
};

/* ── Shared helpers ────────────────────────────────────────────── */

function blankToUndef(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

function asNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ymdFromDatetime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function splitName(full: string): { first: string; last?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Candidate" };
  if (parts.length === 1) return { first: parts[0]! };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function joinName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function idByName(rows: { id: string; name?: string }[], name: string): string | undefined {
  const target = name.trim().toLowerCase();
  const hit = rows.find((r) => String(r.name ?? "").trim().toLowerCase() === target);
  return hit?.id;
}

function jobTypeNameToKey(name: string): JobTypeKey {
  const lower = name.toLowerCase();
  if (lower.includes("remote")) return "remote";
  if (lower.includes("intern")) return "internship";
  if (lower.includes("freelance")) return "freelance";
  if (lower.includes("temporary") || lower.includes("temp")) return "temporary";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("part")) return "part_time";
  return "full_time";
}

function jobTypeKeyToName(key: JobTypeKey, jobTypes: { id: string; name?: string }[]): string | undefined {
  const label = key.replace(/_/g, " ").toLowerCase();
  const hit = jobTypes.find((t) => {
    const n = String(t.name ?? "").toLowerCase();
    return n.includes(label) || label.includes(n);
  });
  return hit?.name;
}

function mapPriorityFromApi(value: string): JobPosting["priority"] {
  if (value === "low") return "low";
  if (value === "high") return "high";
  if (value === "medium") return "normal";
  return "normal";
}

function mapPriorityToApi(value: JobPosting["priority"]): string {
  if (value === "low") return "low";
  if (value === "high" || value === "urgent") return "high";
  return "medium";
}

function mapJobStatusFromApi(status: string, isPublished: boolean): JobPostingStatus {
  if (status === "published" || isPublished) return "published";
  if (status === "closed") return "closed";
  if (status === "on_hold") return "on_hold";
  return "draft";
}

function mapJobStatusToApi(status: JobPostingStatus): string {
  if (status === "published") return "published";
  if (status === "closed" || status === "on_hold") return "closed";
  return "draft";
}

function mapOfferStatusFromApi(status: string): OfferStatus {
  if (status === "negotiating") return "negotiation";
  if (
    status === "draft" ||
    status === "sent" ||
    status === "accepted" ||
    status === "declined" ||
    status === "expired"
  ) {
    return status;
  }
  return "draft";
}

function mapOfferStatusToApi(status: OfferStatus): string {
  if (status === "negotiation") return "negotiating";
  return status;
}

function mapInterviewStatusFromApi(status: string): InterviewStatus {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "no_show") return "cancelled";
  return "scheduled";
}

function mapInterviewStatusToApi(status: InterviewStatus): string {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "rescheduled") return "scheduled";
  return "scheduled";
}

function mapAssessmentStatusFromApi(passFail: string): AssessmentStatus {
  if (passFail === "pass" || passFail === "fail") return "completed";
  return "scheduled";
}

function mapAssessmentStatusToApi(status: AssessmentStatus): string {
  if (status === "cancelled") return "fail";
  if (status === "completed") return "pass";
  return "pending";
}

function inferAssessmentType(name: string): AssessmentType {
  const lower = name.toLowerCase();
  if (lower.includes("behavior")) return "behavioral";
  if (lower.includes("aptitude")) return "aptitude";
  if (lower.includes("personality")) return "personality";
  return "technical";
}

function mapRecommendationFromApi(value: string | null): FeedbackRecommendation {
  if (value === "reject") return "no_hire";
  if (
    value === "strong_hire" ||
    value === "hire" ||
    value === "maybe" ||
    value === "strong_reject"
  ) {
    return value;
  }
  return "maybe";
}

function mapRecommendationToApi(value: FeedbackRecommendation): string {
  if (value === "no_hire") return "reject";
  return value;
}

function mapOnboardingStatusFromApi(status: string): OnboardingStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  return "not_started";
}

function mapOnboardingStatusToApi(status: OnboardingStatus): string {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "on_hold") return "pending";
  return "pending";
}

type RecruitmentLookups = {
  jobs: Map<string, ApiJobPosting>;
  jobLite: Map<string, { id: string; code: string; title: string; departmentId?: string }>;
  sources: Map<string, string>;
  sourceNameToId: Map<string, string>;
  jobTypes: Map<string, string>;
  jobTypeRows: { id: string; name?: string }[];
  locations: Map<string, string>;
  locationRows: { id: string; name?: string }[];
  branches: Map<string, string>;
  branchRows: { id: string; name?: string }[];
  departments: Map<string, string>;
  departmentRows: { id: string; name?: string }[];
  employees: Map<string, string>;
  employeeRows: { id: string; name: string }[];
  rounds: Map<string, string>;
  roundRows: { id: string; name?: string }[];
  types: Map<string, string>;
  typeRows: { id: string; name?: string }[];
  checklists: Map<string, string>;
  checklistRows: { id: string; name?: string }[];
};

async function buildLookups(): Promise<RecruitmentLookups> {
  const [
    jobsRes,
    sources,
    jobTypeRows,
    locationRows,
    branchRows,
    departmentRows,
    employeesRes,
    roundRows,
    typeRows,
    checklistRows,
  ] = await Promise.all([
    apiFetch<ApiListResponse<ApiJobPosting>>(
      `/api/v1/hrm/job-postings?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
      { cache: "no-store" },
    ),
    candidateSourcesApi.list(),
    jobTypesApi.list(),
    jobLocationsApi.list(),
    listHrmBranches({ status: "active" }),
    listHrmDepartments({ status: "active" }),
    listHrmEmployees({ per_page: 200 }),
    interviewRoundsApi.list(),
    interviewTypesApi.list(),
    onboardingChecklistsApi.list(),
  ]);

  const jobs = new Map<string, ApiJobPosting>();
  const jobLite = new Map<string, { id: string; code: string; title: string; departmentId?: string }>();
  for (const job of jobsRes.data ?? []) {
    jobs.set(job.id, job);
    jobLite.set(job.id, {
      id: job.id,
      code: job.job_code ?? job.code ?? job.id,
      title: job.title,
      departmentId: job.department_id ?? undefined,
    });
  }

  const sourcesMap = new Map<string, string>();
  const sourceNameToId = new Map<string, string>();
  for (const row of sources) {
    sourcesMap.set(String(row.id), String(row.name ?? ""));
    sourceNameToId.set(String(row.name ?? "").toLowerCase(), String(row.id));
  }

  const jobTypes = new Map<string, string>();
  for (const row of jobTypeRows) jobTypes.set(String(row.id), String(row.name ?? ""));

  const locations = new Map<string, string>();
  for (const row of locationRows) locations.set(String(row.id), String(row.name ?? ""));

  const branches = new Map<string, string>();
  for (const row of branchRows) branches.set(String(row.id), String(row.name ?? ""));

  const departments = new Map<string, string>();
  for (const row of departmentRows) departments.set(String(row.id), String(row.name ?? ""));

  const employees = new Map<string, string>();
  const employeeRows = (employeesRes.rows ?? []).map((row) => {
    employees.set(row.id, row.name);
    return { id: row.id, name: row.name };
  });

  const rounds = new Map<string, string>();
  for (const row of roundRows) rounds.set(String(row.id), String(row.name ?? ""));

  const types = new Map<string, string>();
  for (const row of typeRows) types.set(String(row.id), String(row.name ?? ""));

  const checklists = new Map<string, string>();
  for (const row of checklistRows) checklists.set(String(row.id), String(row.name ?? ""));

  return {
    jobs,
    jobLite,
    sources: sourcesMap,
    sourceNameToId,
    jobTypes,
    jobTypeRows,
    locations,
    locationRows,
    branches,
    branchRows,
    departments,
    departmentRows,
    employees,
    employeeRows,
    rounds,
    roundRows,
    types,
    typeRows,
    checklists,
    checklistRows,
  };
}

function jobCodeTitle(lookups: RecruitmentLookups, jobId: string | null | undefined) {
  const job = jobId ? lookups.jobs.get(jobId) : undefined;
  return {
    code: job ? job.job_code ?? job.code ?? job.id : "",
    title: job?.title ?? "",
    department: job?.department_id ? lookups.departments.get(job.department_id) ?? "" : "",
  };
}

function mapCandidate(row: ApiCandidate, lookups: RecruitmentLookups): Candidate {
  const job = jobCodeTitle(lookups, row.job_id);
  const docs = [
    row.resume_path ? { name: row.resume_path, type: "Resume" } : null,
    row.cover_letter_path ? { name: row.cover_letter_path, type: "Cover Letter" } : null,
  ].filter(Boolean) as Candidate["documents"];

  return {
    id: row.id,
    name: joinName(row.first_name, row.last_name),
    email: row.email ?? "",
    phone: row.phone ?? "",
    gender: (row.gender as CandidateGender | null) ?? "other",
    dateOfBirth: row.date_of_birth ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
    zipCode: row.zip_code ?? "",
    jobId: row.job_id ?? "",
    jobCode: job.code,
    jobTitle: job.title,
    office: row.branch_id ? lookups.branches.get(row.branch_id) ?? "" : "",
    jobLocation: row.job_id
      ? lookups.locations.get(lookups.jobs.get(row.job_id)?.location_id ?? "") ?? ""
      : "",
    jobType: row.job_id
      ? jobTypeNameToKey(
          lookups.jobTypes.get(lookups.jobs.get(row.job_id)?.job_type_id ?? "") ?? "",
        )
      : "full_time",
    department: row.department_id
      ? lookups.departments.get(row.department_id) ?? job.department
      : job.department,
    source: row.source_id ? lookups.sources.get(row.source_id) ?? "" : "",
    currentCompany: row.current_company ?? "",
    currentPosition: row.current_position ?? "",
    totalExperience: row.experience_years ?? 0,
    currentSalary: asNumber(row.current_salary),
    expectedSalary: asNumber(row.expected_salary),
    noticePeriod: row.notice_period ?? "",
    resume: row.resume_path ?? "",
    coverLetter: row.cover_letter_path ?? "",
    documents: docs,
    status: row.status,
    employeeConverted: row.is_employee,
    appliedOn: row.application_date ?? "",
  };
}

function mapJobPosting(row: ApiJobPosting, lookups: RecruitmentLookups): JobPosting {
  const typeName = row.job_type_id ? lookups.jobTypes.get(row.job_type_id) ?? "" : "";
  return {
    id: row.id,
    code: row.job_code ?? row.code ?? row.id,
    title: row.title,
    jobType: jobTypeNameToKey(typeName),
    location: row.location_id ? lookups.locations.get(row.location_id) ?? "" : "",
    branch: row.branch_id ? lookups.branches.get(row.branch_id) ?? "" : "",
    department: row.department_id ? lookups.departments.get(row.department_id) ?? "" : "",
    priority: mapPriorityFromApi(row.priority),
    requiredSkills: (row.skills ?? []).join(", "),
    startDate: row.start_date ?? "",
    deadline: row.application_deadline ?? "",
    minExperience: asNumber(row.min_experience),
    maxExperience: asNumber(row.max_experience),
    minSalary: asNumber(row.min_salary),
    maxSalary: asNumber(row.max_salary),
    description: row.description ?? "",
    requirements: row.requirements ?? "",
    benefits: row.benefits ?? "",
    numberOfPositions: row.positions ?? 1,
    applications: 0,
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    status: mapJobStatusFromApi(row.status, row.is_published),
    publishDate: ymdFromDatetime(row.publish_date),
  };
}

function mapInterview(row: ApiInterview, lookups: RecruitmentLookups): Interview {
  const job = jobCodeTitle(lookups, row.job_id);
  const interviewerId = row.interviewers[0];
  return {
    id: row.id,
    candidateId: row.candidate_id ?? "",
    candidateName: "",
    jobTitle: job.title,
    jobCode: job.code,
    round: row.round_id ? lookups.rounds.get(row.round_id) ?? "" : "",
    type: row.interview_type_id ? lookups.types.get(row.interview_type_id) ?? "" : "",
    date: row.scheduled_date ?? "",
    time: row.scheduled_time ?? "",
    durationMin: row.duration ?? 60,
    location: row.location ?? "",
    meetingLink: row.meeting_link ?? "",
    interviewer: interviewerId ? lookups.employees.get(interviewerId) ?? interviewerId : "",
    notes: "",
    status: mapInterviewStatusFromApi(row.status),
    feedback: row.feedback_submitted ? "submitted" : "pending",
    feedbackNotes: "",
  };
}

function enrichInterview(row: Interview, candidates: Map<string, Candidate>): Interview {
  const cand = candidates.get(row.candidateId);
  if (!cand) return row;
  return {
    ...row,
    candidateName: cand.name,
    jobTitle: cand.jobTitle || row.jobTitle,
    jobCode: cand.jobCode || row.jobCode,
  };
}

function mapOffer(row: ApiOffer, lookups: RecruitmentLookups, candidates: Map<string, Candidate>): Offer {
  const cand = row.candidate_id ? candidates.get(row.candidate_id) : undefined;
  const job = jobCodeTitle(lookups, row.job_id ?? cand?.jobId);
  const approvedName = row.approved_by ? lookups.employees.get(row.approved_by) ?? row.approved_by : "";
  return {
    id: row.id,
    candidateId: row.candidate_id ?? "",
    candidateName: cand?.name ?? "",
    jobTitle: cand?.jobTitle || job.title,
    jobCode: cand?.jobCode || job.code,
    department: row.department_id
      ? lookups.departments.get(row.department_id) ?? cand?.department ?? ""
      : cand?.department ?? "",
    salary: asNumber(row.salary),
    startDate: row.start_date ?? "",
    expiresOn: row.expiration_date ?? "",
    offerDate: row.offer_date ?? "",
    approvedBy: approvedName,
    benefits: row.benefits ?? "",
    notes: row.decline_reason ?? "",
    status: mapOfferStatusFromApi(row.status),
    employeeConverted: cand?.employeeConverted ?? false,
  };
}

function mapAssessment(
  row: ApiAssessment,
  lookups: RecruitmentLookups,
  candidates: Map<string, Candidate>,
): CandidateAssessment {
  const cand = row.candidate_id ? candidates.get(row.candidate_id) : undefined;
  const title = row.assessment_name ?? "";
  return {
    id: row.id,
    candidateId: row.candidate_id ?? "",
    candidateName: cand?.name ?? "",
    jobTitle: cand?.jobTitle ?? "",
    jobCode: cand?.jobCode ?? "",
    title,
    assessmentType: inferAssessmentType(title),
    assessmentDate: row.assessment_date ?? "",
    score: row.score ?? 0,
    maxScore: row.max_score ?? 100,
    durationMin: 60,
    conductedBy: row.conducted_by ? lookups.employees.get(row.conducted_by) ?? row.conducted_by : "",
    notes: row.comments ?? "",
    status: mapAssessmentStatusFromApi(row.pass_fail_status),
  };
}

async function mapFeedback(
  row: ApiFeedback,
  lookups: RecruitmentLookups,
  interviews: Map<string, Interview>,
  candidates: Map<string, Candidate>,
): Promise<InterviewFeedbackRow> {
  const interview = row.interview_id ? interviews.get(row.interview_id) : undefined;
  const candId = interview?.candidateId ?? "";
  const cand = candId ? candidates.get(candId) : undefined;
  return {
    id: row.id,
    interviewId: row.interview_id ?? "",
    candidateId: candId,
    candidateName: cand?.name ?? interview?.candidateName ?? "",
    jobTitle: cand?.jobTitle ?? interview?.jobTitle ?? "",
    jobCode: cand?.jobCode ?? interview?.jobCode ?? "",
    round: interview?.round ?? "",
    interviewer: row.interviewer_id
      ? lookups.employees.get(row.interviewer_id) ?? row.interviewer_id
      : "",
    overallRating: row.overall_rating ?? 0,
    technicalSkills: row.technical_rating ?? 0,
    communication: row.communication_rating ?? 0,
    culturalFit: row.cultural_fit_rating ?? 0,
    recommendation: mapRecommendationFromApi(row.recommendation),
    comments: [row.strengths, row.weaknesses, row.comments].filter(Boolean).join("\n\n"),
    nextSteps: "",
    submittedOn: ymdFromDatetime(row.created_at),
  };
}

async function mapOnboarding(
  row: ApiOnboarding,
  lookups: RecruitmentLookups,
  candidates: Map<string, Candidate>,
): Promise<CandidateOnboarding> {
  const cand = row.candidate_id ? candidates.get(row.candidate_id) : undefined;
  const checklistName = row.checklist_id ? lookups.checklists.get(row.checklist_id) ?? "" : "";
  let tasks: CandidateOnboarding["tasks"] = [];
  if (row.checklist_id) {
    const items = await checklistItemsApi.list();
    tasks = items
      .filter((item) => String(item.checklist_id ?? "") === row.checklist_id)
      .map((item, idx) => ({
        id: `${row.id}_task_${idx + 1}`,
        title: String(item.name ?? ""),
        category: String(item.category ?? "other"),
        dueDay: Number(item.due_day ?? 1),
        done: row.status === "completed",
      }));
  }
  const progress = tasks.length ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100) : 0;
  return {
    id: row.id,
    candidateId: row.candidate_id ?? "",
    candidateName: cand?.name ?? "",
    jobTitle: cand?.jobTitle ?? "",
    jobCode: cand?.jobCode ?? "",
    checklistId: row.checklist_id ?? "",
    checklistName,
    startDate: row.start_date ?? "",
    expectedCompletion: row.start_date ?? "",
    buddyName: row.buddy_employee_id
      ? lookups.employees.get(row.buddy_employee_id) ?? row.buddy_employee_id
      : "",
    assignedTo: "",
    progress,
    status: mapOnboardingStatusFromApi(row.status),
    createdOn: ymdFromDatetime(row.created_at),
    notes: "",
    tasks,
  };
}

async function loadCandidatesMap(lookups: RecruitmentLookups): Promise<Map<string, Candidate>> {
  const res = await apiFetch<ApiListResponse<ApiCandidate>>(
    `/api/v1/hrm/candidates?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  const map = new Map<string, Candidate>();
  for (const row of res.data ?? []) {
    const view = mapCandidate(row, lookups);
    map.set(view.id, view);
  }
  return map;
}

/* ── Option loaders ────────────────────────────────────────────── */

export type JobPostingOption = { id: string; code: string; title: string };
export type CandidateOption = {
  id: string;
  name: string;
  jobTitle: string;
  jobCode: string;
  jobId: string;
  department: string;
  employeeConverted: boolean;
  status: CandidateStatus;
};
export type NamedOption = { id: string; name: string };
export type InterviewOption = { id: string; label: string; candidateId: string };

export async function listJobPostingOptions(): Promise<JobPostingOption[]> {
  const lookups = await buildLookups();
  return [...lookups.jobLite.values()].map((j) => ({
    id: j.id,
    code: j.code,
    title: j.title,
  }));
}

export async function listCandidateOptions(status?: CandidateStatus): Promise<CandidateOption[]> {
  const lookups = await buildLookups();
  const qs = new URLSearchParams({ company_id: "default", page: "1", per_page: "200" });
  if (status) qs.set("status", status);
  const res = await apiFetch<ApiListResponse<ApiCandidate>>(`/api/v1/hrm/candidates?${qs}`, {
    cache: "no-store",
  });
  return (res.data ?? []).map((row) => {
    const view = mapCandidate(row, lookups);
    return {
      id: view.id,
      name: view.name,
      jobTitle: view.jobTitle,
      jobCode: view.jobCode,
      jobId: view.jobId,
      department: view.department,
      employeeConverted: view.employeeConverted,
      status: view.status,
    };
  });
}

export async function listRecruitmentSourceOptions(): Promise<string[]> {
  const rows = await candidateSourcesApi.list();
  return rows.map((r) => String(r.name ?? "")).filter(Boolean);
}

export async function listRecruitmentBranchOptions(): Promise<NamedOption[]> {
  const rows = await listHrmBranches({ status: "active" });
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentDepartmentOptions(): Promise<NamedOption[]> {
  const rows = await listHrmDepartments({ status: "active" });
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentLocationOptions(): Promise<NamedOption[]> {
  const rows = await jobLocationsApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentJobTypeOptions(): Promise<NamedOption[]> {
  const rows = await jobTypesApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentInterviewRoundOptions(): Promise<NamedOption[]> {
  const rows = await interviewRoundsApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentInterviewTypeOptions(): Promise<NamedOption[]> {
  const rows = await interviewTypesApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentChecklistOptions(): Promise<NamedOption[]> {
  const rows = await onboardingChecklistsApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listRecruitmentEmployeeOptions(): Promise<NamedOption[]> {
  const { rows } = await listHrmEmployees({ per_page: 200 });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function listInterviewOptions(): Promise<InterviewOption[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiListResponse<ApiInterview>>(
    `/api/v1/hrm/interviews?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => {
    const view = enrichInterview(mapInterview(row, lookups), candidates);
    return {
      id: row.id,
      candidateId: view.candidateId,
      label: `${view.candidateName} — ${view.round || "Interview"} (${view.date})`,
    };
  });
}

/* ── Candidates ────────────────────────────────────────────────── */

export async function listCandidatesView(): Promise<Candidate[]> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiListResponse<ApiCandidate>>(
    `/api/v1/hrm/candidates?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => mapCandidate(row, lookups));
}

export async function createCandidateView(payload: {
  name: string;
  email: string;
  phone: string;
  jobId: string;
  source: string;
  totalExperience: number;
  expectedSalary: number;
  currentCompany: string;
  currentPosition: string;
  resume: string;
  coverLetter: string;
  status: CandidateStatus;
  appliedOn?: string;
}): Promise<Candidate> {
  const lookups = await buildLookups();
  const { first, last } = splitName(payload.name);
  const body = {
    company_id: "default",
    job_id: blankToUndef(payload.jobId),
    source_id: lookups.sourceNameToId.get(payload.source.trim().toLowerCase()),
    first_name: first,
    last_name: last,
    email: payload.email.trim(),
    phone: blankToUndef(payload.phone),
    current_company: blankToUndef(payload.currentCompany),
    current_position: blankToUndef(payload.currentPosition),
    experience_years: payload.totalExperience,
    expected_salary: payload.expectedSalary,
    resume_path: blankToUndef(payload.resume),
    cover_letter_path: blankToUndef(payload.coverLetter),
    status: payload.status,
    application_date: blankToUndef(payload.appliedOn),
  };
  const res = await apiFetch<ApiItemResponse<ApiCandidate>>("/api/v1/hrm/candidates", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapCandidate(res.data, lookups);
}

export async function updateCandidateView(
  id: string,
  payload: Parameters<typeof createCandidateView>[0],
): Promise<Candidate> {
  const lookups = await buildLookups();
  const { first, last } = splitName(payload.name);
  const body = {
    job_id: blankToUndef(payload.jobId),
    source_id: lookups.sourceNameToId.get(payload.source.trim().toLowerCase()),
    first_name: first,
    last_name: last,
    email: payload.email.trim(),
    phone: blankToUndef(payload.phone),
    current_company: blankToUndef(payload.currentCompany),
    current_position: blankToUndef(payload.currentPosition),
    experience_years: payload.totalExperience,
    expected_salary: payload.expectedSalary,
    resume_path: blankToUndef(payload.resume),
    cover_letter_path: blankToUndef(payload.coverLetter),
    status: payload.status,
    application_date: blankToUndef(payload.appliedOn),
  };
  const res = await apiFetch<ApiItemResponse<ApiCandidate>>(
    `/api/v1/hrm/candidates/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapCandidate(res.data, lookups);
}

export async function patchCandidateStatusView(
  id: string,
  status: CandidateStatus,
): Promise<Candidate> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiItemResponse<ApiCandidate>>(
    `/api/v1/hrm/candidates/${encodeURIComponent(id)}/status?company_id=default`,
    { method: "POST", body: JSON.stringify({ status }) },
  );
  return mapCandidate(res.data, lookups);
}

export async function deleteCandidateView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/candidates/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

/* ── Job postings ──────────────────────────────────────────────── */

export async function listJobPostingsView(): Promise<JobPosting[]> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiListResponse<ApiJobPosting>>(
    `/api/v1/hrm/job-postings?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => mapJobPosting(row, lookups));
}

export async function createJobPostingView(payload: Omit<JobPosting, "id" | "applications">): Promise<JobPosting> {
  const lookups = await buildLookups();
  const body = {
    company_id: "default",
    title: payload.title.trim(),
    job_type_id: idByName(
      lookups.jobTypeRows,
      jobTypeKeyToName(payload.jobType, lookups.jobTypeRows) ?? payload.jobType,
    ),
    location_id: idByName(lookups.locationRows, payload.location),
    branch_id: idByName(lookups.branchRows, payload.branch),
    department_id: idByName(lookups.departmentRows, payload.department),
    min_experience: payload.minExperience,
    max_experience: payload.maxExperience,
    min_salary: payload.minSalary,
    max_salary: payload.maxSalary,
    description: blankToUndef(payload.description),
    requirements: blankToUndef(payload.requirements),
    benefits: blankToUndef(payload.benefits),
    application_deadline: blankToUndef(payload.deadline),
    start_date: blankToUndef(payload.startDate),
    positions: payload.numberOfPositions,
    priority: mapPriorityToApi(payload.priority),
    skills: payload.requiredSkills
      ? payload.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    is_featured: payload.isFeatured,
  };
  const res = await apiFetch<ApiItemResponse<ApiJobPosting>>("/api/v1/hrm/job-postings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  let row = res.data;
  if (payload.status === "published") {
    const pub = await apiFetch<ApiItemResponse<ApiJobPosting>>(
      `/api/v1/hrm/job-postings/${encodeURIComponent(row.id)}/publish?company_id=default`,
      { method: "POST" },
    );
    row = pub.data;
  } else if (payload.status === "closed" || payload.status === "on_hold") {
    const closed = await apiFetch<ApiItemResponse<ApiJobPosting>>(
      `/api/v1/hrm/job-postings/${encodeURIComponent(row.id)}/close?company_id=default`,
      { method: "POST" },
    );
    row = closed.data;
  }
  return mapJobPosting(row, lookups);
}

export async function updateJobPostingView(
  id: string,
  payload: Omit<JobPosting, "id" | "applications">,
): Promise<JobPosting> {
  const lookups = await buildLookups();
  const body = {
    title: payload.title.trim(),
    job_type_id: idByName(
      lookups.jobTypeRows,
      jobTypeKeyToName(payload.jobType, lookups.jobTypeRows) ?? payload.jobType,
    ),
    location_id: idByName(lookups.locationRows, payload.location),
    branch_id: idByName(lookups.branchRows, payload.branch),
    department_id: idByName(lookups.departmentRows, payload.department),
    min_experience: payload.minExperience,
    max_experience: payload.maxExperience,
    min_salary: payload.minSalary,
    max_salary: payload.maxSalary,
    description: blankToUndef(payload.description),
    requirements: blankToUndef(payload.requirements),
    benefits: blankToUndef(payload.benefits),
    application_deadline: blankToUndef(payload.deadline),
    start_date: blankToUndef(payload.startDate),
    positions: payload.numberOfPositions,
    priority: mapPriorityToApi(payload.priority),
    skills: payload.requiredSkills
      ? payload.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    is_featured: payload.isFeatured,
  };
  const res = await apiFetch<ApiItemResponse<ApiJobPosting>>(
    `/api/v1/hrm/job-postings/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  let row = res.data;
  const wantPublished = payload.status === "published";
  if (wantPublished && !row.is_published) {
    const pub = await apiFetch<ApiItemResponse<ApiJobPosting>>(
      `/api/v1/hrm/job-postings/${encodeURIComponent(id)}/publish?company_id=default`,
      { method: "POST" },
    );
    row = pub.data;
  } else if (!wantPublished && row.is_published) {
    const patch = await apiFetch<ApiItemResponse<ApiJobPosting>>(
      `/api/v1/hrm/job-postings/${encodeURIComponent(id)}?company_id=default`,
      { method: "PATCH", body: JSON.stringify({ status: mapJobStatusToApi(payload.status) }) },
    );
    row = patch.data;
  }
  return mapJobPosting(row, lookups);
}

export async function toggleJobPostingPublishView(row: JobPosting): Promise<JobPosting> {
  const lookups = await buildLookups();
  const path = row.isPublished ? "close" : "publish";
  const res = await apiFetch<ApiItemResponse<ApiJobPosting>>(
    `/api/v1/hrm/job-postings/${encodeURIComponent(row.id)}/${path}?company_id=default`,
    { method: "POST" },
  );
  return mapJobPosting(res.data, lookups);
}

export async function deleteJobPostingView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/job-postings/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

/* ── Interviews ────────────────────────────────────────────────── */

export async function listInterviewsView(): Promise<Interview[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiListResponse<ApiInterview>>(
    `/api/v1/hrm/interviews?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) =>
    enrichInterview(mapInterview(row, lookups), candidates),
  );
}

export async function createInterviewView(payload: {
  candidateId: string;
  jobId?: string;
  round: string;
  type: string;
  date: string;
  time: string;
  durationMin: number;
  location: string;
  meetingLink: string;
  interviewerId: string;
  status: InterviewStatus;
}): Promise<Interview> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const cand = candidates.get(payload.candidateId);
  const body = {
    company_id: "default",
    candidate_id: payload.candidateId,
    job_id: blankToUndef(payload.jobId ?? cand?.jobId),
    round_id: idByName(lookups.roundRows, payload.round),
    interview_type_id: idByName(lookups.typeRows, payload.type),
    scheduled_date: blankToUndef(payload.date),
    scheduled_time: blankToUndef(payload.time),
    duration: payload.durationMin,
    location: blankToUndef(payload.location),
    meeting_link: blankToUndef(payload.meetingLink),
    interviewers: payload.interviewerId ? [payload.interviewerId] : [],
  };
  const res = await apiFetch<ApiItemResponse<ApiInterview>>("/api/v1/hrm/interviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return enrichInterview(mapInterview(res.data, lookups), candidates);
}

export async function updateInterviewView(
  id: string,
  payload: Parameters<typeof createInterviewView>[0],
): Promise<Interview> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const body = {
    round_id: idByName(lookups.roundRows, payload.round),
    interview_type_id: idByName(lookups.typeRows, payload.type),
    scheduled_date: blankToUndef(payload.date),
    scheduled_time: blankToUndef(payload.time),
    duration: payload.durationMin,
    location: blankToUndef(payload.location),
    meeting_link: blankToUndef(payload.meetingLink),
    interviewers: payload.interviewerId ? [payload.interviewerId] : [],
  };
  const res = await apiFetch<ApiItemResponse<ApiInterview>>(
    `/api/v1/hrm/interviews/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  let row = res.data;
  const apiStatus = mapInterviewStatusToApi(payload.status);
  if (apiStatus === "completed" && row.status !== "completed") {
    const done = await apiFetch<ApiItemResponse<ApiInterview>>(
      `/api/v1/hrm/interviews/${encodeURIComponent(id)}/complete?company_id=default`,
      { method: "POST" },
    );
    row = done.data;
  } else if (apiStatus === "cancelled" && row.status !== "cancelled") {
    const cancelled = await apiFetch<ApiItemResponse<ApiInterview>>(
      `/api/v1/hrm/interviews/${encodeURIComponent(id)}/cancel?company_id=default`,
      { method: "POST" },
    );
    row = cancelled.data;
  }
  return enrichInterview(mapInterview(row, lookups), candidates);
}

export async function deleteInterviewView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/interviews/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

/* ── Offers ────────────────────────────────────────────────────── */

export async function listOffersView(): Promise<Offer[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiListResponse<ApiOffer>>(
    `/api/v1/hrm/offers?${new URLSearchParams({ company_id: "default", page: "1", per_page: "200" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => mapOffer(row, lookups, candidates));
}

export async function createOfferView(payload: {
  candidateId: string;
  salary: number;
  startDate: string;
  expiresOn: string;
  offerDate: string;
  benefits: string;
  notes: string;
  status: OfferStatus;
  department?: string;
}): Promise<Offer> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const cand = candidates.get(payload.candidateId);
  const body = {
    company_id: "default",
    candidate_id: payload.candidateId,
    job_id: blankToUndef(cand?.jobId),
    offer_date: blankToUndef(payload.offerDate),
    department_id: idByName(lookups.departmentRows, payload.department ?? cand?.department ?? ""),
    salary: payload.salary,
    benefits: blankToUndef(payload.benefits),
    start_date: blankToUndef(payload.startDate),
    expiration_date: blankToUndef(payload.expiresOn),
  };
  const res = await apiFetch<ApiItemResponse<ApiOffer>>("/api/v1/hrm/offers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapOffer(res.data, lookups, candidates);
}

export async function updateOfferView(
  id: string,
  payload: Parameters<typeof createOfferView>[0],
): Promise<Offer> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const cand = candidates.get(payload.candidateId);
  const body = {
    salary: payload.salary,
    benefits: blankToUndef(payload.benefits),
    start_date: blankToUndef(payload.startDate),
    expiration_date: blankToUndef(payload.expiresOn),
    department_id: idByName(lookups.departmentRows, payload.department ?? cand?.department ?? ""),
  };
  const res = await apiFetch<ApiItemResponse<ApiOffer>>(
    `/api/v1/hrm/offers/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapOffer(res.data, lookups, candidates);
}

export async function sendOfferView(id: string): Promise<Offer> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiItemResponse<ApiOffer>>(
    `/api/v1/hrm/offers/${encodeURIComponent(id)}/send?company_id=default`,
    { method: "POST" },
  );
  return mapOffer(res.data, lookups, candidates);
}

export async function deleteOfferView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/offers/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

/* ── Candidate assessments ─────────────────────────────────────── */

export async function listCandidateAssessmentsView(): Promise<CandidateAssessment[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiListResponse<ApiAssessment>>(
    `/api/v1/hrm/candidate-assessments?${new URLSearchParams({ company_id: "default" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => mapAssessment(row, lookups, candidates));
}

export async function createCandidateAssessmentView(payload: {
  candidateId: string;
  title: string;
  assessmentDate: string;
  score: number;
  maxScore: number;
  conductedById: string;
  notes: string;
  status: AssessmentStatus;
}): Promise<CandidateAssessment> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const body = {
    company_id: "default",
    candidate_id: payload.candidateId,
    assessment_name: payload.title.trim(),
    score: payload.score,
    max_score: payload.maxScore,
    pass_fail_status: mapAssessmentStatusToApi(payload.status),
    comments: blankToUndef(payload.notes),
    assessment_date: blankToUndef(payload.assessmentDate),
  };
  const res = await apiFetch<ApiItemResponse<ApiAssessment>>("/api/v1/hrm/candidate-assessments", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapAssessment(res.data, lookups, candidates);
}

export async function updateCandidateAssessmentView(
  id: string,
  payload: Parameters<typeof createCandidateAssessmentView>[0],
): Promise<CandidateAssessment> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const body = {
    assessment_name: payload.title.trim(),
    score: payload.score,
    max_score: payload.maxScore,
    pass_fail_status: mapAssessmentStatusToApi(payload.status),
    comments: blankToUndef(payload.notes),
    assessment_date: blankToUndef(payload.assessmentDate),
  };
  const res = await apiFetch<ApiItemResponse<ApiAssessment>>(
    `/api/v1/hrm/candidate-assessments/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapAssessment(res.data, lookups, candidates);
}

export async function deleteCandidateAssessmentView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/candidate-assessments/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

/* ── Interview feedback ────────────────────────────────────────── */

export async function listInterviewFeedbackView(): Promise<InterviewFeedbackRow[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const interviewsList = await listInterviewsView();
  const interviews = new Map(interviewsList.map((row) => [row.id, row]));
  const res = await apiFetch<ApiListResponse<ApiFeedback>>(
    `/api/v1/hrm/interview-feedback?${new URLSearchParams({ company_id: "default" })}`,
    { cache: "no-store" },
  );
  const rows = await Promise.all(
    (res.data ?? []).map((row) => mapFeedback(row, lookups, interviews, candidates)),
  );
  return rows;
}

export async function createInterviewFeedbackView(payload: {
  interviewId: string;
  interviewerId: string;
  overallRating: number;
  technicalSkills: number;
  communication: number;
  culturalFit: number;
  recommendation: FeedbackRecommendation;
  comments: string;
}): Promise<InterviewFeedbackRow> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const interviewsList = await listInterviewsView();
  const interviews = new Map(interviewsList.map((row) => [row.id, row]));
  const body = {
    company_id: "default",
    interview_id: payload.interviewId,
    interviewer_id: blankToUndef(payload.interviewerId),
    technical_rating: Math.round(payload.technicalSkills),
    communication_rating: Math.round(payload.communication),
    cultural_fit_rating: Math.round(payload.culturalFit),
    overall_rating: Math.round(payload.overallRating),
    comments: blankToUndef(payload.comments),
    recommendation: mapRecommendationToApi(payload.recommendation),
  };
  const res = await apiFetch<ApiItemResponse<ApiFeedback>>("/api/v1/hrm/interview-feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapFeedback(res.data, lookups, interviews, candidates);
}

export async function updateInterviewFeedbackView(
  id: string,
  payload: Parameters<typeof createInterviewFeedbackView>[0],
): Promise<InterviewFeedbackRow> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const interviewsList = await listInterviewsView();
  const interviews = new Map(interviewsList.map((row) => [row.id, row]));
  const body = {
    interviewer_id: blankToUndef(payload.interviewerId),
    technical_rating: Math.round(payload.technicalSkills),
    communication_rating: Math.round(payload.communication),
    cultural_fit_rating: Math.round(payload.culturalFit),
    overall_rating: Math.round(payload.overallRating),
    comments: blankToUndef(payload.comments),
    recommendation: mapRecommendationToApi(payload.recommendation),
  };
  const res = await apiFetch<ApiItemResponse<ApiFeedback>>(
    `/api/v1/hrm/interview-feedback/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapFeedback(res.data, lookups, interviews, candidates);
}

export async function deleteInterviewFeedbackView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/interview-feedback/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

/* ── Candidate onboarding ──────────────────────────────────────── */

export async function listCandidateOnboardingView(): Promise<CandidateOnboarding[]> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const res = await apiFetch<ApiListResponse<ApiOnboarding>>(
    `/api/v1/hrm/candidate-onboarding?${new URLSearchParams({ company_id: "default" })}`,
    { cache: "no-store" },
  );
  return Promise.all((res.data ?? []).map((row) => mapOnboarding(row, lookups, candidates)));
}

export async function createCandidateOnboardingView(payload: {
  candidateId: string;
  checklistId: string;
  startDate: string;
  buddyEmployeeId: string;
  status: OnboardingStatus;
}): Promise<CandidateOnboarding> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const body = {
    company_id: "default",
    candidate_id: payload.candidateId,
    checklist_id: payload.checklistId,
    start_date: blankToUndef(payload.startDate),
    buddy_employee_id: blankToUndef(payload.buddyEmployeeId),
  };
  const res = await apiFetch<ApiItemResponse<ApiOnboarding>>("/api/v1/hrm/candidate-onboarding", {
    method: "POST",
    body: JSON.stringify(body),
  });
  let row = res.data;
  if (payload.status === "in_progress") {
    const started = await apiFetch<ApiItemResponse<ApiOnboarding>>(
      `/api/v1/hrm/candidate-onboarding/${encodeURIComponent(row.id)}/start?company_id=default`,
      { method: "POST" },
    );
    row = started.data;
  } else if (payload.status === "completed") {
    const done = await apiFetch<ApiItemResponse<ApiOnboarding>>(
      `/api/v1/hrm/candidate-onboarding/${encodeURIComponent(row.id)}/complete?company_id=default`,
      { method: "POST" },
    );
    row = done.data;
  }
  return mapOnboarding(row, lookups, candidates);
}

export async function updateCandidateOnboardingView(
  id: string,
  payload: Parameters<typeof createCandidateOnboardingView>[0],
): Promise<CandidateOnboarding> {
  const lookups = await buildLookups();
  const candidates = await loadCandidatesMap(lookups);
  const body = {
    checklist_id: payload.checklistId,
    start_date: blankToUndef(payload.startDate),
    buddy_employee_id: blankToUndef(payload.buddyEmployeeId),
    status: mapOnboardingStatusToApi(payload.status),
  };
  const res = await apiFetch<ApiItemResponse<ApiOnboarding>>(
    `/api/v1/hrm/candidate-onboarding/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapOnboarding(res.data, lookups, candidates);
}

export async function deleteCandidateOnboardingView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/candidate-onboarding/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
