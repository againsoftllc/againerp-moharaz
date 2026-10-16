import { apiFetch } from "@/lib/api/client";
import type {
  CalculationType,
  ComponentStatus,
  ComponentType,
  SalaryComponent,
} from "@/lib/mock-data/hrm-salary-components";

export type ApiHrmSalaryComponent = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  type: string;
  calculation_type: string;
  default_amount: string | number;
  percentage_of_basic: string | number | null;
  is_taxable: boolean;
  is_mandatory: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmSalaryComponent[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmSalaryComponent;
  errors: string[];
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function apiSalaryComponentToUi(row: ApiHrmSalaryComponent): SalaryComponent {
  const calc = (row.calculation_type === "percentage" ? "percentage" : "fixed") as CalculationType;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    componentType: (row.type === "deduction" ? "deduction" : "earning") as ComponentType,
    calculationType: calc,
    value: calc === "percentage" ? num(row.percentage_of_basic) : num(row.default_amount),
    status: (row.status === "inactive" ? "inactive" : "active") as ComponentStatus,
    locked: Boolean(row.is_mandatory),
    isTaxable: Boolean(row.is_taxable),
    isMandatory: Boolean(row.is_mandatory),
  };
}

export function salaryComponentToWrite(row: Omit<SalaryComponent, "id">) {
  const isPct = row.calculationType === "percentage";
  return {
    company_id: "default",
    name: row.name.trim(),
    description: blankToUndef(row.description),
    type: row.componentType,
    calculation_type: row.calculationType,
    default_amount: isPct ? 0 : Number(row.value) || 0,
    percentage_of_basic: isPct ? Number(row.value) || 0 : undefined,
    is_taxable: row.isTaxable ?? true,
    is_mandatory: row.isMandatory ?? row.locked ?? false,
    status: row.status,
  };
}

export async function listHrmSalaryComponents(params?: {
  status?: string;
  type?: string;
  q?: string;
}): Promise<SalaryComponent[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/salary-components?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiSalaryComponentToUi);
}

export async function createHrmSalaryComponent(
  payload: Omit<SalaryComponent, "id">,
): Promise<SalaryComponent> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/salary-components", {
    method: "POST",
    body: JSON.stringify(salaryComponentToWrite(payload)),
  });
  return apiSalaryComponentToUi(res.data);
}

export async function updateHrmSalaryComponent(
  id: string,
  payload: Omit<SalaryComponent, "id">,
): Promise<SalaryComponent> {
  const { company_id: _c, ...patch } = salaryComponentToWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/salary-components/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiSalaryComponentToUi(res.data);
}

export async function deleteHrmSalaryComponent(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/salary-components/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
