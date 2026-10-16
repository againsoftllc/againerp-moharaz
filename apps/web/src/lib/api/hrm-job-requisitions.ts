import { apiFetch } from "@/lib/api/client";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { jobCategoriesApi } from "@/lib/api/hrm-recruitment-masters";
import type {
  JobRequisition,
  JobRequisitionPriority,
  JobRequisitionStatus,
} from "@/lib/mock-data/hrm-job-requisitions";

type ApiListResponse = {
  data: ApiJobRequisition[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiJobRequisition;
  errors: string[];
};

type ApiJobRequisition = {
  id: string;
  company_id: string;
  requisition_code: string | null;
  title: string;
  job_category_id: string | null;
  department_id: string | null;
  positions_count: number;
  budget_min: string | number | null;
  budget_max: string | number | null;
  skills_required: string | null;
  education_required: string | null;
  experience_required: string | null;
  description: string | null;
  responsibilities: string | null;
  status: string;
  approved_by: string | null;
  approval_date: string | null;
  priority: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type RequisitionLookups = {
  categories: Map<string, string>;
  departments: Map<string, string>;
  categoryRows: { id: string; name?: string }[];
  departmentRows: { id: string; name?: string }[];
};

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

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function idByName(rows: { id: string; name?: string }[], name: string): string | undefined {
  const target = name.trim().toLowerCase();
  const hit = rows.find((r) => String(r.name ?? "").trim().toLowerCase() === target);
  return hit?.id;
}

function mapStatus(raw: string): JobRequisitionStatus {
  if (
    raw === "draft" ||
    raw === "pending_approval" ||
    raw === "approved" ||
    raw === "on_hold" ||
    raw === "closed"
  ) {
    return raw;
  }
  return "draft";
}

function mapPriority(raw: string): JobRequisitionPriority {
  if (raw === "low" || raw === "high") return raw;
  return "medium";
}

async function buildLookups(): Promise<RequisitionLookups> {
  const [categoryRows, departmentRows] = await Promise.all([
    jobCategoriesApi.list(),
    listHrmDepartments({ status: "active" }),
  ]);
  const categories = new Map(categoryRows.map((r) => [String(r.id), String(r.name ?? "")]));
  const departments = new Map(departmentRows.map((r) => [String(r.id), String(r.name ?? "")]));
  return {
    categories,
    departments,
    categoryRows: categoryRows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })),
    departmentRows: departmentRows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })),
  };
}

function mapRequisition(row: ApiJobRequisition, lookups: RequisitionLookups): JobRequisition {
  return {
    id: row.id,
    code: row.requisition_code ?? row.id,
    title: row.title,
    categoryId: row.job_category_id ?? "",
    category: row.job_category_id
      ? lookups.categories.get(row.job_category_id) ?? "—"
      : "—",
    departmentId: row.department_id ?? "",
    department: row.department_id
      ? lookups.departments.get(row.department_id) ?? "—"
      : "—",
    positionsCount: row.positions_count ?? 1,
    budgetMin: asNumber(row.budget_min),
    budgetMax: asNumber(row.budget_max),
    skillsRequired: row.skills_required ?? "",
    educationRequired: row.education_required ?? "",
    experienceRequired: row.experience_required ?? "",
    description: row.description ?? "",
    responsibilities: row.responsibilities ?? "",
    priority: mapPriority(row.priority),
    status: mapStatus(row.status),
    approvedBy: row.approved_by ?? "",
    approvalDate: ymd(row.approval_date),
    createdAt: ymd(row.created_at),
  };
}

export async function listJobRequisitionsView(params?: {
  status?: JobRequisitionStatus;
  q?: string;
}): Promise<JobRequisition[]> {
  const lookups = await buildLookups();
  const qs = new URLSearchParams({ company_id: "default", page: "1", per_page: "200" });
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(`/api/v1/hrm/job-requisitions?${qs.toString()}`, {
    cache: "no-store",
  });
  return (res.data ?? []).map((row) => mapRequisition(row, lookups));
}

export async function createJobRequisitionView(payload: {
  title: string;
  category: string;
  department: string;
  positionsCount: number;
  budgetMin: number;
  budgetMax: number;
  skillsRequired: string;
  educationRequired: string;
  experienceRequired: string;
  description: string;
  responsibilities: string;
  priority: JobRequisitionPriority;
}): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const body = {
    company_id: "default",
    title: payload.title.trim(),
    job_category_id: idByName(lookups.categoryRows, payload.category),
    department_id: idByName(lookups.departmentRows, payload.department),
    positions_count: payload.positionsCount,
    budget_min: payload.budgetMin > 0 ? payload.budgetMin : undefined,
    budget_max: payload.budgetMax > 0 ? payload.budgetMax : undefined,
    skills_required: blankToUndef(payload.skillsRequired),
    education_required: blankToUndef(payload.educationRequired),
    experience_required: blankToUndef(payload.experienceRequired),
    description: blankToUndef(payload.description),
    responsibilities: blankToUndef(payload.responsibilities),
    priority: payload.priority,
  };
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/job-requisitions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapRequisition(res.data, lookups);
}

export async function updateJobRequisitionView(
  id: string,
  payload: Parameters<typeof createJobRequisitionView>[0] & { status?: JobRequisitionStatus },
): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const body: Record<string, unknown> = {
    title: payload.title.trim(),
    job_category_id: idByName(lookups.categoryRows, payload.category),
    department_id: idByName(lookups.departmentRows, payload.department),
    positions_count: payload.positionsCount,
    budget_min: payload.budgetMin > 0 ? payload.budgetMin : undefined,
    budget_max: payload.budgetMax > 0 ? payload.budgetMax : undefined,
    skills_required: blankToUndef(payload.skillsRequired),
    education_required: blankToUndef(payload.educationRequired),
    experience_required: blankToUndef(payload.experienceRequired),
    description: blankToUndef(payload.description),
    responsibilities: blankToUndef(payload.responsibilities),
    priority: payload.priority,
  };
  if (payload.status) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return mapRequisition(res.data, lookups);
}

export async function submitJobRequisitionView(id: string): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}/submit?company_id=default`,
    { method: "POST" },
  );
  return mapRequisition(res.data, lookups);
}

export async function approveJobRequisitionView(id: string): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}/approve?company_id=default`,
    { method: "POST" },
  );
  return mapRequisition(res.data, lookups);
}

export async function holdJobRequisitionView(id: string): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}/hold?company_id=default`,
    { method: "POST" },
  );
  return mapRequisition(res.data, lookups);
}

export async function closeJobRequisitionView(id: string): Promise<JobRequisition> {
  const lookups = await buildLookups();
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}/close?company_id=default`,
    { method: "POST" },
  );
  return mapRequisition(res.data, lookups);
}

export async function deleteJobRequisitionView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/job-requisitions/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export async function listJobRequisitionCategoryOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await jobCategoriesApi.list();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}

export async function listJobRequisitionDepartmentOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await listHrmDepartments({ status: "active" });
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })).filter((r) => r.name);
}
