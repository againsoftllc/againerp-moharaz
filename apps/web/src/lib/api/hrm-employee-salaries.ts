import { apiFetch } from "@/lib/api/client";
import type {
  EmployeeSalary,
  SalaryComponentChip,
  SalaryStatus,
} from "@/lib/mock-data/hrm-employee-salaries";

export type ApiEmployeeSalaryComponent = {
  id: string;
  salary_component_id: string;
  amount_override: string | number | null;
  is_enabled: boolean;
  component_name: string | null;
  component_type: string | null;
  calculation_type: string | null;
  default_amount: string | number | null;
  percentage_of_basic: string | number | null;
};

export type ApiHrmEmployeeSalary = {
  id: string;
  company_id: string;
  employee_id: string | null;
  basic_salary: string | number | null;
  is_active: boolean;
  calculation_status: string;
  notes: string | null;
  components: ApiEmployeeSalaryComponent[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmEmployeeSalary[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmEmployeeSalary;
  errors: string[];
};

export type EmployeeSalaryLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeCode: (id: string | null | undefined) => string;
  department: (id: string | null | undefined) => string;
  designation: (id: string | null | undefined) => string;
};

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function componentAmount(basic: number, c: ApiEmployeeSalaryComponent): number {
  if (!c.is_enabled) return 0;
  if (c.amount_override != null && c.amount_override !== "") return num(c.amount_override);
  if (c.calculation_type === "percentage") {
    return Math.round(((basic * num(c.percentage_of_basic)) / 100) * 100) / 100;
  }
  return num(c.default_amount);
}

export function apiEmployeeSalaryToUi(
  row: ApiHrmEmployeeSalary,
  lookups: EmployeeSalaryLookups,
): EmployeeSalary {
  const basic = num(row.basic_salary);
  const comps = row.components ?? [];
  let allowances = 0;
  let deductions = 0;
  const chips: SalaryComponentChip[] = [];
  const assignments: EmployeeSalary["componentAssignments"] = [];

  for (const c of comps) {
    const amt = componentAmount(basic, c);
    const kind = c.component_type === "deduction" ? "deduction" : "earning";
    if (c.is_enabled) {
      if (kind === "deduction") deductions += amt;
      else allowances += amt;
      chips.push({ name: c.component_name ?? c.salary_component_id, kind });
    }
    assignments.push({
      salaryComponentId: c.salary_component_id,
      amountOverride: c.amount_override == null ? null : num(c.amount_override),
      isEnabled: c.is_enabled,
      name: c.component_name ?? "",
      kind,
    });
  }

  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    employeeCode: lookups.employeeCode(row.employee_id),
    department: lookups.department(row.employee_id),
    designation: lookups.designation(row.employee_id),
    basicSalary: basic,
    allowances: Math.round(allowances * 100) / 100,
    deductions: Math.round(deductions * 100) / 100,
    netSalary: Math.round((basic + allowances - deductions) * 100) / 100,
    effectiveDate: ymd(row.created_at),
    createdAt: ymd(row.created_at),
    status: (row.is_active ? "active" : "inactive") as SalaryStatus,
    locked: false,
    components: chips,
    componentAssignments: assignments,
    notes: row.notes ?? "",
  };
}

export async function listHrmEmployeeSalaries(params?: {
  page?: number;
  per_page?: number;
  employee_id?: string;
  is_active?: boolean;
}): Promise<{ rows: ApiHrmEmployeeSalary[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.is_active != null) qs.set("is_active", String(params.is_active));
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/employee-salaries?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmEmployeeSalary(input: {
  employeeId: string;
  basicSalary: number;
  isActive?: boolean;
  notes?: string;
  components?: {
    salaryComponentId: string;
    amountOverride?: number | null;
    isEnabled?: boolean;
  }[];
}): Promise<ApiHrmEmployeeSalary> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/employee-salaries", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      employee_id: input.employeeId,
      basic_salary: input.basicSalary,
      is_active: input.isActive ?? true,
      notes: blankToUndef(input.notes),
      components: (input.components ?? []).map((c) => ({
        salary_component_id: c.salaryComponentId,
        amount_override: c.amountOverride ?? undefined,
        is_enabled: c.isEnabled ?? true,
      })),
    }),
  });
  return res.data;
}

export async function updateHrmEmployeeSalary(
  id: string,
  input: {
    basicSalary?: number;
    isActive?: boolean;
    notes?: string;
    components?: {
      salaryComponentId: string;
      amountOverride?: number | null;
      isEnabled?: boolean;
    }[];
  },
): Promise<ApiHrmEmployeeSalary> {
  const body: Record<string, unknown> = {};
  if (input.basicSalary != null) body.basic_salary = input.basicSalary;
  if (input.isActive != null) body.is_active = input.isActive;
  if (input.notes != null) body.notes = blankToUndef(input.notes);
  if (input.components) {
    body.components = input.components.map((c) => ({
      salary_component_id: c.salaryComponentId,
      amount_override: c.amountOverride ?? undefined,
      is_enabled: c.isEnabled ?? true,
    }));
  }
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/employee-salaries/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmEmployeeSalary(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employee-salaries/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
