import { apiFetch } from "@/lib/api/client";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import type {
  Complaint,
  ComplaintStatus,
  ComplaintType,
} from "@/lib/mock-data/hrm-complaints";
import type { Promotion, PromotionStatus } from "@/lib/mock-data/hrm-promotions";
import type { Resignation, ResignationStatus } from "@/lib/mock-data/hrm-resignations";
import type {
  Termination,
  TerminationStatus,
  TerminationType,
} from "@/lib/mock-data/hrm-terminations";
import type { Transfer, TransferStatus } from "@/lib/mock-data/hrm-transfers";
import type {
  AdvanceStatus,
  ExpenseStatus,
  Trip,
  TripExpense,
  TripStatus,
} from "@/lib/mock-data/hrm-trips";
import type {
  Warning,
  WarningSeverity,
  WarningStatus,
  WarningType,
} from "@/lib/mock-data/hrm-warnings";
import { COMPLAINT_TYPE_LABEL } from "@/lib/mock-data/hrm-complaints";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

type ApiResignation = {
  id: string;
  company_id: string;
  employee_id: string | null;
  resignation_date: string | null;
  last_working_day: string | null;
  notice_period: string | null;
  reason: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  documents: string | null;
};

type ApiPromotion = {
  id: string;
  company_id: string;
  employee_id: string | null;
  previous_designation: string | null;
  designation_id: string | null;
  promotion_date: string | null;
  effective_date: string | null;
  salary_adjustment: string | number | null;
  reason: string | null;
  document: string | null;
  status: PromotionStatus;
};

export type LifecycleEmployeeOption = {
  id: string;
  name: string;
  email: string;
  branch: string;
  branchId: string;
  department: string;
  departmentId: string;
  designation: string;
  designationId: string;
  salary: number;
};

export type LifecycleDesignationOption = {
  id: string;
  name: string;
};

export type LifecycleBranchOption = {
  id: string;
  name: string;
};

export type LifecycleDepartmentOption = {
  id: string;
  name: string;
};

function asNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapResignationStatus(status: ApiResignation["status"]): ResignationStatus {
  if (status === "approved") return "completed";
  return status;
}

async function listApiResignations(): Promise<ApiResignation[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiResignation>>(
    `/api/v1/hrm/resignations?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiPromotions(): Promise<ApiPromotion[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiPromotion>>(
    `/api/v1/hrm/promotions?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listLifecycleEmployeeOptions(): Promise<LifecycleEmployeeOption[]> {
  const [{ rows }, branches, departments, designations] = await Promise.all([
    listHrmEmployees({ per_page: 200 }),
    listHrmBranches(),
    listHrmDepartments(),
    listHrmDesignations(),
  ]);
  const branchById = new Map(branches.map((row) => [row.id, String(row.name ?? "")]));
  const departmentById = new Map(departments.map((row) => [row.id, String(row.name ?? "")]));
  const designationById = new Map(designations.map((row) => [row.id, String(row.name ?? "")]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    branch: row.branch_id ? branchById.get(row.branch_id) ?? "" : "",
    branchId: row.branch_id ?? "",
    department: row.department_id ? departmentById.get(row.department_id) ?? "" : "",
    departmentId: row.department_id ?? "",
    designation: row.designation_id ? designationById.get(row.designation_id) ?? "" : "",
    designationId: row.designation_id ?? "",
    salary: asNumber(row.base_salary),
  }));
}

export async function listLifecycleDesignationOptions(): Promise<LifecycleDesignationOption[]> {
  const rows = await listHrmDesignations({ status: "active" });
  return rows.map((row) => ({ id: row.id, name: String(row.name ?? "") })).filter((row) => row.name);
}

export async function listLifecycleBranchOptions(): Promise<LifecycleBranchOption[]> {
  const rows = await listHrmBranches({ status: "active" });
  return rows.map((row) => ({ id: row.id, name: String(row.name ?? "") })).filter((row) => row.name);
}

export async function listLifecycleDepartmentOptions(): Promise<LifecycleDepartmentOption[]> {
  const rows = await listHrmDepartments({ status: "active" });
  return rows.map((row) => ({ id: row.id, name: String(row.name ?? "") })).filter((row) => row.name);
}

export async function listResignationsView(): Promise<Resignation[]> {
  const [rows, employees] = await Promise.all([listApiResignations(), listLifecycleEmployeeOptions()]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      resignationDate: row.resignation_date ?? "",
      lastWorkingDay: row.last_working_day ?? "",
      noticePeriod: row.notice_period ?? "",
      status: mapResignationStatus(row.status),
      description: row.description ?? row.reason ?? "",
      document: row.documents ?? "",
    };
  });
}

export async function createResignationView(payload: Omit<Resignation, "id">): Promise<Resignation> {
  const created = await apiFetch<ApiItemResponse<ApiResignation>>("/api/v1/hrm/resignations", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      resignation_date: payload.resignationDate || undefined,
      last_working_day: payload.lastWorkingDay || undefined,
      notice_period: payload.noticePeriod || undefined,
      description: payload.description || undefined,
      reason: payload.description || undefined,
      documents: payload.document || undefined,
    }),
  });

  if (payload.status !== "pending") {
    const action = payload.status === "completed" ? "approve" : "reject";
    await apiFetch<ApiItemResponse<ApiResignation>>(
      `/api/v1/hrm/resignations/${encodeURIComponent(created.data.id)}/${action}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listResignationsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created resignation could not be reloaded");
  return createdRow;
}

export async function updateResignationView(
  id: string,
  payload: Omit<Resignation, "id">,
): Promise<Resignation> {
  await apiFetch<ApiItemResponse<ApiResignation>>(
    `/api/v1/hrm/resignations/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        resignation_date: payload.resignationDate || undefined,
        last_working_day: payload.lastWorkingDay || undefined,
        notice_period: payload.noticePeriod || undefined,
        description: payload.description || undefined,
        reason: payload.description || undefined,
        documents: payload.document || undefined,
      }),
    },
  );

  if (payload.status !== "pending") {
    const action = payload.status === "completed" ? "approve" : "reject";
    await apiFetch<ApiItemResponse<ApiResignation>>(
      `/api/v1/hrm/resignations/${encodeURIComponent(id)}/${action}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listResignationsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated resignation could not be reloaded");
  return updated;
}

export async function deleteResignationView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/resignations/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listPromotionsView(): Promise<Promotion[]> {
  const [rows, employees, designations] = await Promise.all([
    listApiPromotions(),
    listLifecycleEmployeeOptions(),
    listLifecycleDesignationOptions(),
  ]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const designationById = new Map(designations.map((row) => [row.id, row.name]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    const newDesignation =
      (row.designation_id ? designationById.get(row.designation_id) : undefined) ??
      row.previous_designation ??
      "";
    const newSalary = asNumber(row.salary_adjustment);
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      department: employee?.department ?? "",
      previousDesignation: row.previous_designation ?? employee?.designation ?? "",
      newDesignation,
      designationId: row.designation_id ?? "",
      currentSalary: employee?.salary ?? 0,
      newSalary: newSalary || employee?.salary || 0,
      promotionDate: row.promotion_date ?? "",
      effectiveDate: row.effective_date ?? "",
      description: row.reason ?? "",
      document: row.document ?? "",
      status: row.status,
    };
  });
}

export async function createPromotionView(payload: Omit<Promotion, "id"> & { designationId: string }): Promise<Promotion> {
  const created = await apiFetch<ApiItemResponse<ApiPromotion>>("/api/v1/hrm/promotions", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      designation_id: payload.designationId,
      previous_designation: payload.previousDesignation || undefined,
      promotion_date: payload.promotionDate || undefined,
      effective_date: payload.effectiveDate || undefined,
      salary_adjustment: payload.newSalary || undefined,
      reason: payload.description || undefined,
      document: payload.document || undefined,
    }),
  });

  if (payload.status !== "pending") {
    const action = payload.status === "approved" ? "approve" : "reject";
    await apiFetch<ApiItemResponse<ApiPromotion>>(
      `/api/v1/hrm/promotions/${encodeURIComponent(created.data.id)}/${action}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listPromotionsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created promotion could not be reloaded");
  return createdRow;
}

export async function updatePromotionView(
  id: string,
  payload: Omit<Promotion, "id"> & { designationId: string },
): Promise<Promotion> {
  await apiFetch<ApiItemResponse<ApiPromotion>>(
    `/api/v1/hrm/promotions/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        designation_id: payload.designationId || undefined,
        previous_designation: payload.previousDesignation || undefined,
        promotion_date: payload.promotionDate || undefined,
        effective_date: payload.effectiveDate || undefined,
        salary_adjustment: payload.newSalary || undefined,
        reason: payload.description || undefined,
        document: payload.document || undefined,
      }),
    },
  );

  if (payload.status !== "pending") {
    const action = payload.status === "approved" ? "approve" : "reject";
    await apiFetch<ApiItemResponse<ApiPromotion>>(
      `/api/v1/hrm/promotions/${encodeURIComponent(id)}/${action}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listPromotionsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated promotion could not be reloaded");
  return updated;
}

export async function deletePromotionView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/promotions/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

type ApiTermination = {
  id: string;
  company_id: string;
  employee_id: string | null;
  termination_type: string | null;
  termination_date: string | null;
  notice_date: string | null;
  notice_period: string | null;
  reason: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  documents: string | null;
  exit_feedback: string | null;
};

function mapTerminationStatus(status: ApiTermination["status"]): TerminationStatus {
  if (status === "approved") return "completed";
  return "in_progress";
}

function mapTerminationType(value: string | null | undefined): TerminationType {
  const allowed: TerminationType[] = [
    "retirement",
    "voluntary",
    "involuntary",
    "layoff",
    "contract_end",
  ];
  if (value && (allowed as string[]).includes(value)) return value as TerminationType;
  return "voluntary";
}

async function listApiTerminations(): Promise<ApiTermination[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTermination>>(
    `/api/v1/hrm/terminations?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listTerminationsView(): Promise<Termination[]> {
  const [rows, employees] = await Promise.all([
    listApiTerminations(),
    listLifecycleEmployeeOptions(),
  ]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      type: mapTerminationType(row.termination_type),
      terminationDate: row.termination_date ?? "",
      noticeDate: row.notice_date ?? "",
      status: mapTerminationStatus(row.status),
      description: row.description ?? row.reason ?? "",
      finalSettlement: row.exit_feedback ?? "",
      document: row.documents ?? "",
    };
  });
}

export async function createTerminationView(payload: Omit<Termination, "id">): Promise<Termination> {
  const created = await apiFetch<ApiItemResponse<ApiTermination>>("/api/v1/hrm/terminations", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      termination_type: payload.type,
      termination_date: payload.terminationDate || undefined,
      notice_date: payload.noticeDate || undefined,
      description: payload.description || undefined,
      reason: payload.description || undefined,
      documents: payload.document || undefined,
    }),
  });

  if (payload.finalSettlement.trim()) {
    await apiFetch<ApiItemResponse<ApiTermination>>(
      `/api/v1/hrm/terminations/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({ exit_feedback: payload.finalSettlement }),
      },
    );
  }

  if (payload.status === "completed") {
    await apiFetch<ApiItemResponse<ApiTermination>>(
      `/api/v1/hrm/terminations/${encodeURIComponent(created.data.id)}/approve?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listTerminationsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created termination could not be reloaded");
  return createdRow;
}

export async function updateTerminationView(
  id: string,
  payload: Omit<Termination, "id">,
): Promise<Termination> {
  await apiFetch<ApiItemResponse<ApiTermination>>(
    `/api/v1/hrm/terminations/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        termination_type: payload.type,
        termination_date: payload.terminationDate || undefined,
        notice_date: payload.noticeDate || undefined,
        description: payload.description || undefined,
        reason: payload.description || undefined,
        documents: payload.document || undefined,
        exit_feedback: payload.finalSettlement || undefined,
      }),
    },
  );

  if (payload.status === "completed") {
    await apiFetch<ApiItemResponse<ApiTermination>>(
      `/api/v1/hrm/terminations/${encodeURIComponent(id)}/approve?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listTerminationsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated termination could not be reloaded");
  return updated;
}

export async function deleteTerminationView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/terminations/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

type ApiWarning = {
  id: string;
  company_id: string;
  employee_id: string | null;
  warning_type: string | null;
  subject: string | null;
  severity: string | null;
  warning_date: string | null;
  description: string | null;
  status: string;
  documents: string | null;
  has_improvement_plan: boolean;
  improvement_plan_goals: string | null;
};

function mapWarningSeverityToApi(severity: WarningSeverity): "low" | "medium" | "high" | "critical" {
  if (severity === "verbal") return "low";
  if (severity === "final") return "high";
  return "medium";
}

function mapWarningSeverityFromApi(severity: string | null | undefined): WarningSeverity {
  if (severity === "low") return "verbal";
  if (severity === "high" || severity === "critical") return "final";
  return "written";
}

function mapWarningType(value: string | null | undefined): WarningType {
  const allowed: WarningType[] = ["performance", "attendance", "conduct"];
  if (value && (allowed as string[]).includes(value)) return value as WarningType;
  return "conduct";
}

function mapWarningStatus(status: string): WarningStatus {
  return status === "draft" ? "draft" : "issued";
}

async function listApiWarnings(): Promise<ApiWarning[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiWarning>>(
    `/api/v1/hrm/warnings?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listWarningsView(): Promise<Warning[]> {
  const [rows, employees] = await Promise.all([listApiWarnings(), listLifecycleEmployeeOptions()]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      subject: row.subject ?? "",
      type: mapWarningType(row.warning_type),
      severity: mapWarningSeverityFromApi(row.severity),
      date: row.warning_date ?? "",
      status: mapWarningStatus(row.status),
      improvementPlan: Boolean(row.has_improvement_plan),
      improvementPlanNotes: row.improvement_plan_goals ?? "",
      description: row.description ?? "",
      document: row.documents ?? "",
    };
  });
}

export async function createWarningView(payload: Omit<Warning, "id">): Promise<Warning> {
  const created = await apiFetch<ApiItemResponse<ApiWarning>>("/api/v1/hrm/warnings", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      warning_type: payload.type,
      subject: payload.subject,
      severity: mapWarningSeverityToApi(payload.severity),
      warning_date: payload.date || undefined,
      description: payload.description || undefined,
      documents: payload.document || undefined,
      has_improvement_plan: payload.improvementPlan,
      improvement_plan_goals: payload.improvementPlanNotes || undefined,
    }),
  });

  if (payload.status === "issued") {
    await apiFetch<ApiItemResponse<ApiWarning>>(
      `/api/v1/hrm/warnings/${encodeURIComponent(created.data.id)}/issue?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listWarningsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created warning could not be reloaded");
  return createdRow;
}

export async function updateWarningView(
  id: string,
  payload: Omit<Warning, "id">,
): Promise<Warning> {
  await apiFetch<ApiItemResponse<ApiWarning>>(
    `/api/v1/hrm/warnings/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        warning_type: payload.type,
        subject: payload.subject,
        severity: mapWarningSeverityToApi(payload.severity),
        warning_date: payload.date || undefined,
        description: payload.description || undefined,
        documents: payload.document || undefined,
        has_improvement_plan: payload.improvementPlan,
        improvement_plan_goals: payload.improvementPlanNotes || undefined,
      }),
    },
  );

  if (payload.status === "issued") {
    try {
      await apiFetch<ApiItemResponse<ApiWarning>>(
        `/api/v1/hrm/warnings/${encodeURIComponent(id)}/issue?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // Already issued — ignore
    }
  }

  const rows = await listWarningsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated warning could not be reloaded");
  return updated;
}

export async function deleteWarningView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/warnings/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

type ApiComplaint = {
  id: string;
  company_id: string;
  employee_id: string | null;
  against_employee_id: string | null;
  complaint_type: string | null;
  subject: string | null;
  complaint_date: string | null;
  description: string | null;
  status: string;
  documents: string | null;
  is_anonymous: boolean;
  assigned_to: string | null;
};

function mapComplaintStatus(status: string): ComplaintStatus {
  if (status === "resolved") return "resolved";
  if (status === "closed") return "dismissed";
  return "submitted";
}

function mapComplaintType(value: string | null | undefined): ComplaintType {
  const allowed: ComplaintType[] = [
    "discrimination",
    "harassment",
    "management",
    "workplace",
    "other",
  ];
  if (value && (allowed as string[]).includes(value)) return value as ComplaintType;
  return "other";
}

async function listApiComplaints(): Promise<ApiComplaint[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiComplaint>>(
    `/api/v1/hrm/complaints?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listComplaintsView(): Promise<Complaint[]> {
  const [rows, employees] = await Promise.all([listApiComplaints(), listLifecycleEmployeeOptions()]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  return rows.map((row) => {
    const complainant = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    const against = row.against_employee_id
      ? employeeById.get(row.against_employee_id)
      : undefined;
    const assignee = row.assigned_to ? employeeById.get(row.assigned_to) : undefined;
    return {
      id: row.id,
      anonymous: Boolean(row.is_anonymous),
      complainantId: row.is_anonymous ? null : row.employee_id,
      complainantName: row.is_anonymous ? "Anonymous" : complainant?.name ?? "Unknown",
      complainantEmail: row.is_anonymous ? "" : complainant?.email ?? "",
      againstId: row.against_employee_id,
      againstName: against?.name ?? "",
      againstEmail: against?.email ?? "",
      type: mapComplaintType(row.complaint_type),
      date: row.complaint_date ?? "",
      status: mapComplaintStatus(row.status),
      assignedTo: assignee?.name ?? row.assigned_to ?? "",
      description: row.description ?? row.subject ?? "",
      document: row.documents ?? "",
    };
  });
}

async function applyComplaintStatus(id: string, status: ComplaintStatus): Promise<void> {
  if (status === "resolved") {
    await apiFetch<ApiItemResponse<ApiComplaint>>(
      `/api/v1/hrm/complaints/${encodeURIComponent(id)}/resolve?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (status === "dismissed") {
    await apiFetch<ApiItemResponse<ApiComplaint>>(
      `/api/v1/hrm/complaints/${encodeURIComponent(id)}/close?company_id=default`,
      { method: "POST" },
    );
  }
}

export async function createComplaintView(payload: Omit<Complaint, "id">): Promise<Complaint> {
  const created = await apiFetch<ApiItemResponse<ApiComplaint>>("/api/v1/hrm/complaints", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.anonymous ? undefined : payload.complainantId || undefined,
      against_employee_id: payload.againstId || undefined,
      complaint_type: payload.type,
      subject: COMPLAINT_TYPE_LABEL[payload.type],
      complaint_date: payload.date || undefined,
      description: payload.description || undefined,
      documents: payload.document || undefined,
      is_anonymous: payload.anonymous,
    }),
  });

  if (payload.assignedTo.trim()) {
    const employees = await listLifecycleEmployeeOptions();
    const assignee =
      employees.find((e) => e.name === payload.assignedTo) ??
      employees.find((e) => e.id === payload.assignedTo);
    await apiFetch<ApiItemResponse<ApiComplaint>>(
      `/api/v1/hrm/complaints/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          assigned_to: (assignee?.id ?? payload.assignedTo).slice(0, 36),
        }),
      },
    );
  }

  if (payload.status !== "submitted") {
    await applyComplaintStatus(created.data.id, payload.status);
  }

  const rows = await listComplaintsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created complaint could not be reloaded");
  return createdRow;
}

export async function updateComplaintView(
  id: string,
  payload: Omit<Complaint, "id">,
): Promise<Complaint> {
  const employees = await listLifecycleEmployeeOptions();
  const assignee =
    employees.find((e) => e.name === payload.assignedTo) ??
    employees.find((e) => e.id === payload.assignedTo);

  await apiFetch<ApiItemResponse<ApiComplaint>>(
    `/api/v1/hrm/complaints/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        against_employee_id: payload.againstId || undefined,
        complaint_type: payload.type,
        subject: COMPLAINT_TYPE_LABEL[payload.type],
        description: payload.description || undefined,
        documents: payload.document || undefined,
        assigned_to: payload.assignedTo
          ? (assignee?.id ?? payload.assignedTo).slice(0, 36)
          : undefined,
      }),
    },
  );

  if (payload.status !== "submitted") {
    try {
      await applyComplaintStatus(id, payload.status);
    } catch {
      // already resolved/closed
    }
  }

  const rows = await listComplaintsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated complaint could not be reloaded");
  return updated;
}

export async function deleteComplaintView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/complaints/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

type ApiTransfer = {
  id: string;
  company_id: string;
  employee_id: string | null;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_department_id: string | null;
  to_department_id: string | null;
  from_designation_id: string | null;
  to_designation_id: string | null;
  transfer_date: string | null;
  effective_date: string | null;
  reason: string | null;
  notes: string | null;
  status: TransferStatus;
  documents: string | null;
};

async function listApiTransfers(): Promise<ApiTransfer[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTransfer>>(
    `/api/v1/hrm/employee-transfers?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export type TransferWritePayload = Omit<Transfer, "id"> & {
  toBranchId: string;
  toDepartmentId: string;
  toDesignationId: string;
};

export async function listTransfersView(): Promise<Transfer[]> {
  const [rows, employees, branches, departments, designations] = await Promise.all([
    listApiTransfers(),
    listLifecycleEmployeeOptions(),
    listLifecycleBranchOptions(),
    listLifecycleDepartmentOptions(),
    listLifecycleDesignationOptions(),
  ]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const branchById = new Map(branches.map((row) => [row.id, row.name]));
  const departmentById = new Map(departments.map((row) => [row.id, row.name]));
  const designationById = new Map(designations.map((row) => [row.id, row.name]));
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      fromBranch: row.from_branch_id ? branchById.get(row.from_branch_id) ?? "" : "",
      toBranch: row.to_branch_id ? branchById.get(row.to_branch_id) ?? "" : "",
      fromDepartment: row.from_department_id
        ? departmentById.get(row.from_department_id) ?? ""
        : "",
      toDepartment: row.to_department_id
        ? departmentById.get(row.to_department_id) ?? ""
        : "",
      fromDesignation: row.from_designation_id
        ? designationById.get(row.from_designation_id) ?? ""
        : "",
      toDesignation: row.to_designation_id
        ? designationById.get(row.to_designation_id) ?? ""
        : "",
      transferDate: row.transfer_date ?? "",
      effectiveDate: row.effective_date ?? "",
      description: row.reason ?? row.notes ?? "",
      document: row.documents ?? "",
      status: row.status,
      toBranchId: row.to_branch_id ?? "",
      toDepartmentId: row.to_department_id ?? "",
      toDesignationId: row.to_designation_id ?? "",
    } as Transfer & {
      toBranchId?: string;
      toDepartmentId?: string;
      toDesignationId?: string;
    };
  });
}

export async function createTransferView(payload: TransferWritePayload): Promise<Transfer> {
  const created = await apiFetch<ApiItemResponse<ApiTransfer>>("/api/v1/hrm/employee-transfers", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      to_branch_id: payload.toBranchId || undefined,
      to_department_id: payload.toDepartmentId || undefined,
      to_designation_id: payload.toDesignationId || undefined,
      transfer_date: payload.transferDate || undefined,
      effective_date: payload.effectiveDate || undefined,
      reason: payload.description || undefined,
      notes: payload.description || undefined,
      documents: payload.document || undefined,
    }),
  });

  if (payload.status === "approved" || payload.status === "rejected") {
    await apiFetch<ApiItemResponse<ApiTransfer>>(
      `/api/v1/hrm/employee-transfers/${encodeURIComponent(created.data.id)}/${payload.status === "approved" ? "approve" : "reject"}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listTransfersView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created transfer could not be reloaded");
  return createdRow;
}

export async function updateTransferView(
  id: string,
  payload: TransferWritePayload,
): Promise<Transfer> {
  await apiFetch<ApiItemResponse<ApiTransfer>>(
    `/api/v1/hrm/employee-transfers/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        to_branch_id: payload.toBranchId || undefined,
        to_department_id: payload.toDepartmentId || undefined,
        to_designation_id: payload.toDesignationId || undefined,
        transfer_date: payload.transferDate || undefined,
        effective_date: payload.effectiveDate || undefined,
        reason: payload.description || undefined,
        notes: payload.description || undefined,
        documents: payload.document || undefined,
      }),
    },
  );

  if (payload.status === "approved" || payload.status === "rejected") {
    await apiFetch<ApiItemResponse<ApiTransfer>>(
      `/api/v1/hrm/employee-transfers/${encodeURIComponent(id)}/${payload.status === "approved" ? "approve" : "reject"}?company_id=default`,
      { method: "POST" },
    );
  }

  const rows = await listTransfersView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated transfer could not be reloaded");
  return updated;
}

export async function deleteTransferView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employee-transfers/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

type ApiTrip = {
  id: string;
  company_id: string;
  employee_id: string | null;
  purpose: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  expected_outcomes: string | null;
  status: string;
  documents: string | null;
  advance_amount: string | number | null;
  advance_status: string | null;
  total_expenses: string | number | null;
  reimbursement_status: string | null;
};

type ApiTripExpense = {
  id: string;
  trip_id: string;
  expense_type: string | null;
  expense_date: string | null;
  amount: string | number;
  description: string | null;
};

function mapTripStatus(status: string): TripStatus {
  if (status === "approved") return "ongoing";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "planned";
}

function mapAdvanceStatus(status: string | null | undefined, amount: number): AdvanceStatus {
  if (!amount) return "none";
  if (status === "paid") return "paid";
  if (status === "settled") return "reconciled";
  if (status === "pending") return "requested";
  return "requested";
}

function mapExpenseStatus(status: string | null | undefined, total: number): ExpenseStatus {
  if (!total) return "none";
  if (status === "approved" || status === "paid") return status;
  if (status === "submitted") return "pending";
  if (status === "pending") return "pending";
  return "pending";
}

function mapAdvanceStatusToApi(status: AdvanceStatus): "pending" | "paid" | "settled" | undefined {
  if (status === "none") return undefined;
  if (status === "paid") return "paid";
  if (status === "reconciled") return "settled";
  return "pending";
}

function mapExpenseStatusToApi(
  status: ExpenseStatus,
): "pending" | "submitted" | "approved" | "paid" | undefined {
  if (status === "none") return undefined;
  if (status === "pending") return "pending";
  return status;
}

async function listApiTrips(): Promise<ApiTrip[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTrip>>(`/api/v1/hrm/trips?${qs.toString()}`, {
    cache: "no-store",
  });
  return res.data ?? [];
}

async function listApiTripExpenses(tripId?: string): Promise<ApiTripExpense[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  if (tripId) qs.set("trip_id", tripId);
  const res = await apiFetch<ApiListResponse<ApiTripExpense>>(
    `/api/v1/hrm/trip-expenses?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function applyTripStatus(id: string, status: TripStatus): Promise<void> {
  if (status === "ongoing") {
    await apiFetch<ApiItemResponse<ApiTrip>>(
      `/api/v1/hrm/trips/${encodeURIComponent(id)}/approve?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (status === "completed") {
    try {
      await apiFetch<ApiItemResponse<ApiTrip>>(
        `/api/v1/hrm/trips/${encodeURIComponent(id)}/approve?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // already approved
    }
    await apiFetch<ApiItemResponse<ApiTrip>>(
      `/api/v1/hrm/trips/${encodeURIComponent(id)}/complete?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (status === "cancelled") {
    await apiFetch<ApiItemResponse<ApiTrip>>(
      `/api/v1/hrm/trips/${encodeURIComponent(id)}/cancel?company_id=default`,
      { method: "POST" },
    );
  }
}

export async function listTripsView(): Promise<Trip[]> {
  const [rows, employees, expenses] = await Promise.all([
    listApiTrips(),
    listLifecycleEmployeeOptions(),
    listApiTripExpenses(),
  ]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const expensesByTrip = new Map<string, TripExpense[]>();
  for (const expense of expenses) {
    const list = expensesByTrip.get(expense.trip_id) ?? [];
    list.push({
      id: expense.id,
      category: expense.expense_type ?? "Other",
      amount: asNumber(expense.amount),
      date: expense.expense_date ?? "",
      note: expense.description ?? "",
    });
    expensesByTrip.set(expense.trip_id, list);
  }
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    const advanceAmount = asNumber(row.advance_amount);
    const totalExpenses = asNumber(row.total_expenses);
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeEmail: employee?.email ?? "",
      purpose: row.purpose ?? "",
      destination: row.destination ?? "",
      startDate: row.start_date ?? "",
      endDate: row.end_date ?? "",
      description: row.description ?? "",
      expectedOutcomes: row.expected_outcomes ?? "",
      status: mapTripStatus(row.status),
      advanceAmount,
      advanceStatus: mapAdvanceStatus(row.advance_status, advanceAmount),
      totalExpenses,
      expenseStatus: mapExpenseStatus(row.reimbursement_status, totalExpenses),
      expenses: expensesByTrip.get(row.id) ?? [],
    };
  });
}

export async function createTripView(
  payload: Omit<Trip, "id" | "expenses">,
): Promise<Trip> {
  const created = await apiFetch<ApiItemResponse<ApiTrip>>("/api/v1/hrm/trips", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: payload.employeeId,
      purpose: payload.purpose || undefined,
      destination: payload.destination || undefined,
      start_date: payload.startDate,
      end_date: payload.endDate,
      description: payload.description || undefined,
      expected_outcomes: payload.expectedOutcomes || undefined,
      advance_amount: payload.advanceAmount || undefined,
    }),
  });

  if (payload.advanceStatus !== "none" || payload.expenseStatus !== "none") {
    await apiFetch<ApiItemResponse<ApiTrip>>(
      `/api/v1/hrm/trips/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          advance_status: mapAdvanceStatusToApi(payload.advanceStatus),
          reimbursement_status: mapExpenseStatusToApi(payload.expenseStatus),
        }),
      },
    );
  }

  if (payload.status !== "planned") {
    await applyTripStatus(created.data.id, payload.status);
  }

  const rows = await listTripsView();
  const createdRow = rows.find((row) => row.id === created.data.id);
  if (!createdRow) throw new Error("Created trip could not be reloaded");
  return createdRow;
}

export async function updateTripView(
  id: string,
  payload: Omit<Trip, "id" | "expenses">,
): Promise<Trip> {
  await apiFetch<ApiItemResponse<ApiTrip>>(
    `/api/v1/hrm/trips/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        purpose: payload.purpose || undefined,
        destination: payload.destination || undefined,
        start_date: payload.startDate || undefined,
        end_date: payload.endDate || undefined,
        description: payload.description || undefined,
        expected_outcomes: payload.expectedOutcomes || undefined,
        advance_amount: payload.advanceAmount || undefined,
        advance_status: mapAdvanceStatusToApi(payload.advanceStatus),
        reimbursement_status: mapExpenseStatusToApi(payload.expenseStatus),
      }),
    },
  );

  if (payload.status !== "planned") {
    try {
      await applyTripStatus(id, payload.status);
    } catch {
      // status already applied
    }
  }

  const rows = await listTripsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated trip could not be reloaded");
  return updated;
}

export async function deleteTripView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/trips/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function createTripExpenseView(
  tripId: string,
  expense: Omit<TripExpense, "id">,
): Promise<TripExpense> {
  const created = await apiFetch<ApiItemResponse<ApiTripExpense>>("/api/v1/hrm/trip-expenses", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      trip_id: tripId,
      expense_type: expense.category || undefined,
      expense_date: expense.date || undefined,
      amount: expense.amount,
      description: expense.note || undefined,
    }),
  });
  return {
    id: created.data.id,
    category: created.data.expense_type ?? expense.category,
    amount: asNumber(created.data.amount),
    date: created.data.expense_date ?? expense.date,
    note: created.data.description ?? expense.note,
  };
}

export async function deleteTripExpenseView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/trip-expenses/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}
