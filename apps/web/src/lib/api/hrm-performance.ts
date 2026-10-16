import { apiFetch } from "@/lib/api/client";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import type {
  Indicator,
  IndicatorStatus,
  MeasurementUnit,
} from "@/lib/mock-data/hrm-indicators";
import type {
  IndicatorCategory,
  IndicatorCategoryStatus,
} from "@/lib/mock-data/hrm-indicator-categories";
import type {
  EmployeeGoal,
  GoalStatus,
} from "@/lib/mock-data/hrm-employee-goals";
import type {
  GoalType,
  GoalTypeFrequency,
  GoalTypeStatus,
} from "@/lib/mock-data/hrm-goal-types";
import type {
  EmployeeReview,
  ReviewStatus,
} from "@/lib/mock-data/hrm-employee-reviews";
import type {
  ReviewCycle,
  ReviewCycleFrequency,
  ReviewCycleStatus,
} from "@/lib/mock-data/hrm-review-cycles";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function asNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapMeasurementUnit(value: string | null | undefined): MeasurementUnit {
  const allowed: MeasurementUnit[] = ["rating", "percentage", "hours", "count", "currency"];
  if (value && (allowed as string[]).includes(value)) return value as MeasurementUnit;
  return "rating";
}

function mapReviewCycleStatusFromApi(status: string): ReviewCycleStatus {
  return status === "active" ? "active" : "draft";
}

function mapReviewCycleStatusToApi(status: ReviewCycleStatus): "active" | "inactive" {
  return status === "active" ? "active" : "inactive";
}

function mapReviewStatusFromApi(status: string): ReviewStatus {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "scheduled";
}

function mapReviewStatusToApi(status: ReviewStatus): "draft" | "in_progress" | "completed" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  return "draft";
}

// --- indicator categories ---

type ApiIndicatorCategory = {
  id: string;
  name: string;
  description: string | null;
  status: IndicatorCategoryStatus;
  created_at: string;
};

export async function listIndicatorCategoriesView(): Promise<IndicatorCategory[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiIndicatorCategory>>(
    `/api/v1/hrm/performance-indicator-categories?${qs}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    weight: 0,
    status: row.status,
    createdAt: ymd(row.created_at),
  }));
}

export async function createIndicatorCategoryView(
  payload: Omit<IndicatorCategory, "id" | "createdAt">,
): Promise<IndicatorCategory> {
  const created = await apiFetch<ApiItemResponse<ApiIndicatorCategory>>(
    "/api/v1/hrm/performance-indicator-categories",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name,
        description: payload.description || undefined,
        status: payload.status,
      }),
    },
  );
  const rows = await listIndicatorCategoriesView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created category could not be reloaded");
  return row;
}

export async function updateIndicatorCategoryView(
  id: string,
  payload: Omit<IndicatorCategory, "id" | "createdAt">,
): Promise<IndicatorCategory> {
  await apiFetch<ApiItemResponse<ApiIndicatorCategory>>(
    `/api/v1/hrm/performance-indicator-categories/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || undefined,
        status: payload.status,
      }),
    },
  );
  const rows = await listIndicatorCategoriesView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated category could not be reloaded");
  return row;
}

export async function deleteIndicatorCategoryView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/performance-indicator-categories/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- indicators ---

type ApiIndicator = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  measurement_unit: string | null;
  target_value: string | null;
  status: IndicatorStatus;
  created_at: string;
};

export type IndicatorWritePayload = Omit<Indicator, "id" | "createdAt"> & {
  categoryId: string;
};

export async function listIndicatorsView(): Promise<(Indicator & { categoryId?: string })[]> {
  const [rows, categories] = await Promise.all([
    apiFetch<ApiListResponse<ApiIndicator>>(
      `/api/v1/hrm/performance-indicators?${new URLSearchParams({ company_id: "default" })}`,
      { cache: "no-store" },
    ).then((res) => res.data ?? []),
    listIndicatorCategoriesView(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category_id ? categoryById.get(row.category_id) ?? "" : "",
    categoryId: row.category_id ?? "",
    measurementUnit: mapMeasurementUnit(row.measurement_unit),
    targetValue: row.target_value ?? "",
    status: row.status,
    createdAt: ymd(row.created_at),
    description: row.description ?? "",
  }));
}

export async function createIndicatorView(payload: IndicatorWritePayload): Promise<Indicator> {
  const created = await apiFetch<ApiItemResponse<ApiIndicator>>(
    "/api/v1/hrm/performance-indicators",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        category_id: payload.categoryId || undefined,
        name: payload.name,
        description: payload.description || undefined,
        measurement_unit: payload.measurementUnit,
        target_value: payload.targetValue || undefined,
        status: payload.status,
      }),
    },
  );
  const rows = await listIndicatorsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created indicator could not be reloaded");
  return row;
}

export async function updateIndicatorView(
  id: string,
  payload: IndicatorWritePayload,
): Promise<Indicator> {
  await apiFetch<ApiItemResponse<ApiIndicator>>(
    `/api/v1/hrm/performance-indicators/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        category_id: payload.categoryId || undefined,
        name: payload.name,
        description: payload.description || undefined,
        measurement_unit: payload.measurementUnit,
        target_value: payload.targetValue || undefined,
        status: payload.status,
      }),
    },
  );
  const rows = await listIndicatorsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated indicator could not be reloaded");
  return row;
}

export async function deleteIndicatorView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/performance-indicators/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- goal types ---

type ApiGoalType = {
  id: string;
  name: string;
  description: string | null;
  status: GoalTypeStatus;
};

export async function listGoalTypesView(): Promise<GoalType[]> {
  const res = await apiFetch<ApiListResponse<ApiGoalType>>(
    `/api/v1/hrm/goal-types?${new URLSearchParams({ company_id: "default" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    frequency: "quarterly" as GoalTypeFrequency,
    status: row.status,
  }));
}

export async function createGoalTypeView(
  payload: Omit<GoalType, "id">,
): Promise<GoalType> {
  const created = await apiFetch<ApiItemResponse<ApiGoalType>>("/api/v1/hrm/goal-types", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name,
      description: payload.description || undefined,
      status: payload.status,
    }),
  });
  const rows = await listGoalTypesView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created goal type could not be reloaded");
  return { ...row, frequency: payload.frequency };
}

export async function updateGoalTypeView(
  id: string,
  payload: Omit<GoalType, "id">,
): Promise<GoalType> {
  await apiFetch<ApiItemResponse<ApiGoalType>>(
    `/api/v1/hrm/goal-types/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || undefined,
        status: payload.status,
      }),
    },
  );
  const rows = await listGoalTypesView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated goal type could not be reloaded");
  return { ...row, frequency: payload.frequency };
}

export async function deleteGoalTypeView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/goal-types/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

// --- review cycles ---

type ApiReviewCycle = {
  id: string;
  name: string;
  frequency: ReviewCycleFrequency | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listReviewCyclesView(): Promise<ReviewCycle[]> {
  const res = await apiFetch<ApiListResponse<ApiReviewCycle>>(
    `/api/v1/hrm/review-cycles?${new URLSearchParams({ company_id: "default" })}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    frequency: (row.frequency ?? "annual") as ReviewCycleFrequency,
    status: mapReviewCycleStatusFromApi(row.status),
    startDate: ymd(row.created_at),
    endDate: ymd(row.updated_at),
  }));
}

export async function createReviewCycleView(
  payload: Omit<ReviewCycle, "id">,
): Promise<ReviewCycle> {
  const created = await apiFetch<ApiItemResponse<ApiReviewCycle>>("/api/v1/hrm/review-cycles", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name,
      frequency: payload.frequency,
      description: payload.description || undefined,
      status: mapReviewCycleStatusToApi(payload.status),
    }),
  });
  const rows = await listReviewCyclesView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created review cycle could not be reloaded");
  return { ...row, startDate: payload.startDate, endDate: payload.endDate };
}

export async function updateReviewCycleView(
  id: string,
  payload: Omit<ReviewCycle, "id">,
): Promise<ReviewCycle> {
  await apiFetch<ApiItemResponse<ApiReviewCycle>>(
    `/api/v1/hrm/review-cycles/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        frequency: payload.frequency,
        description: payload.description || undefined,
        status: mapReviewCycleStatusToApi(payload.status),
      }),
    },
  );
  const rows = await listReviewCyclesView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated review cycle could not be reloaded");
  return { ...row, startDate: payload.startDate, endDate: payload.endDate };
}

export async function deleteReviewCycleView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/review-cycles/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

// --- employee goals ---

type ApiEmployeeGoal = {
  id: string;
  employee_id: string | null;
  goal_type_id: string | null;
  title: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  target: string | null;
  progress: number;
  status: GoalStatus;
};

export type EmployeeGoalWritePayload = Omit<EmployeeGoal, "id" | "employeeName"> & {
  goalTypeId: string;
};

async function listEmployeeOptions() {
  const { rows } = await listHrmEmployees({ per_page: 200 });
  return rows.map((row) => ({ id: row.id, name: row.name, email: row.email ?? "" }));
}

export async function listEmployeeGoalsView(): Promise<EmployeeGoal[]> {
  const [rows, employees, goalTypes] = await Promise.all([
    apiFetch<ApiListResponse<ApiEmployeeGoal>>(
      `/api/v1/hrm/employee-goals?${new URLSearchParams({ company_id: "default" })}`,
      { cache: "no-store" },
    ).then((res) => res.data ?? []),
    listEmployeeOptions(),
    listGoalTypesView(),
  ]);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const goalTypeById = new Map(goalTypes.map((g) => [g.id, g.name]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      title: row.title ?? "",
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      goalType: row.goal_type_id ? goalTypeById.get(row.goal_type_id) ?? "" : "",
      goalTypeId: row.goal_type_id ?? "",
      startDate: ymd(row.start_date),
      endDate: ymd(row.end_date),
      progress: row.progress ?? 0,
      status: row.status,
      description: row.description ?? "",
    } as EmployeeGoal & { goalTypeId?: string };
  });
}

export async function createEmployeeGoalView(
  payload: EmployeeGoalWritePayload,
): Promise<EmployeeGoal> {
  const created = await apiFetch<ApiItemResponse<ApiEmployeeGoal>>("/api/v1/hrm/employee-goals", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      goal_type_id: payload.goalTypeId || undefined,
      title: payload.title,
      description: payload.description || undefined,
      start_date: payload.startDate || undefined,
      end_date: payload.endDate || undefined,
      target: payload.target || undefined,
      progress: payload.progress,
    }),
  });

  if (payload.status !== "not_started") {
    await apiFetch<ApiItemResponse<ApiEmployeeGoal>>(
      `/api/v1/hrm/employee-goals/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: payload.status, progress: payload.progress }),
      },
    );
  }

  const rows = await listEmployeeGoalsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created goal could not be reloaded");
  return row;
}

export async function updateEmployeeGoalView(
  id: string,
  payload: EmployeeGoalWritePayload,
): Promise<EmployeeGoal> {
  await apiFetch<ApiItemResponse<ApiEmployeeGoal>>(
    `/api/v1/hrm/employee-goals/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        goal_type_id: payload.goalTypeId || undefined,
        title: payload.title,
        description: payload.description || undefined,
        start_date: payload.startDate || undefined,
        end_date: payload.endDate || undefined,
        target: payload.target || undefined,
        progress: payload.progress,
        status: payload.status,
      }),
    },
  );
  const rows = await listEmployeeGoalsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated goal could not be reloaded");
  return row;
}

export async function deleteEmployeeGoalView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/employee-goals/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

// --- employee reviews ---

type ApiEmployeeReview = {
  id: string;
  employee_id: string | null;
  reviewer_id: string | null;
  review_cycle_id: string | null;
  review_date: string | null;
  overall_rating: string | number | null;
  comments: string | null;
  status: string;
};

export type EmployeeReviewWritePayload = Omit<
  EmployeeReview,
  "id" | "employeeName" | "employeeEmail" | "reviewerName" | "reviewerEmail" | "reviewCycle" | "rating"
> & {
  reviewCycleId: string;
  rating: number | null;
};

export async function listEmployeeReviewsView(): Promise<
  (EmployeeReview & { reviewCycleId?: string })[]
> {
  const [rows, employees, cycles, users] = await Promise.all([
    apiFetch<ApiListResponse<ApiEmployeeReview>>(
      `/api/v1/hrm/employee-reviews?${new URLSearchParams({ company_id: "default" })}`,
      { cache: "no-store" },
    ).then((res) => res.data ?? []),
    listEmployeeOptions(),
    listReviewCyclesView(),
    fetchAuthUsers(),
  ]);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const cycleById = new Map(cycles.map((c) => [c.id, c.name]));
  const userById = new Map(users.map((u) => [u.id, u]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    const reviewer = row.reviewer_id ? userById.get(row.reviewer_id) : undefined;
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      reviewerId: row.reviewer_id ?? "",
      reviewerName: reviewer?.name ?? reviewer?.email ?? "—",
      reviewerEmail: reviewer?.email ?? "",
      reviewCycle: row.review_cycle_id ? cycleById.get(row.review_cycle_id) ?? "" : "",
      reviewCycleId: row.review_cycle_id ?? "",
      reviewDate: ymd(row.review_date),
      rating: row.overall_rating != null ? asNumber(row.overall_rating) : null,
      comments: row.comments ?? "",
      status: mapReviewStatusFromApi(row.status),
    };
  });
}

export async function createEmployeeReviewView(
  payload: EmployeeReviewWritePayload,
): Promise<EmployeeReview> {
  const created = await apiFetch<ApiItemResponse<ApiEmployeeReview>>(
    "/api/v1/hrm/employee-reviews",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        employee_id: payload.employeeId,
        review_cycle_id: payload.reviewCycleId,
        reviewer_id: payload.reviewerId || undefined,
        review_date: payload.reviewDate || undefined,
        comments: payload.comments || undefined,
      }),
    },
  );

  const apiStatus = mapReviewStatusToApi(payload.status);
  if (apiStatus === "completed") {
    await apiFetch<ApiItemResponse<ApiEmployeeReview>>(
      `/api/v1/hrm/employee-reviews/${encodeURIComponent(created.data.id)}/complete?company_id=default`,
      { method: "POST" },
    );
  } else if (apiStatus === "in_progress") {
    await apiFetch<ApiItemResponse<ApiEmployeeReview>>(
      `/api/v1/hrm/employee-reviews/${encodeURIComponent(created.data.id)}?company_id=default`,
      { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) },
    );
  }

  const rows = await listEmployeeReviewsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created review could not be reloaded");
  return row;
}

export async function updateEmployeeReviewView(
  id: string,
  payload: EmployeeReviewWritePayload,
): Promise<EmployeeReview> {
  await apiFetch<ApiItemResponse<ApiEmployeeReview>>(
    `/api/v1/hrm/employee-reviews/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        review_date: payload.reviewDate || undefined,
        comments: payload.comments || undefined,
        status: mapReviewStatusToApi(payload.status),
      }),
    },
  );

  if (payload.status === "completed") {
    try {
      await apiFetch<ApiItemResponse<ApiEmployeeReview>>(
        `/api/v1/hrm/employee-reviews/${encodeURIComponent(id)}/complete?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // already completed
    }
  }

  const rows = await listEmployeeReviewsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated review could not be reloaded");
  return row;
}

export async function deleteEmployeeReviewView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/employee-reviews/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export { listEmployeeOptions as listPerformanceEmployeeOptions };

export async function listPerformanceReviewerOptions() {
  const users = await fetchAuthUsers();
  return users.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email ?? "" }));
}
