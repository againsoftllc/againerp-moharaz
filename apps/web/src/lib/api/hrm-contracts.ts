import { apiFetch } from "@/lib/api/client";
import type {
  ContractTemplate,
  ContractTemplateStatus,
} from "@/lib/mock-data/hrm-contract-templates";
import { parseList } from "@/lib/mock-data/hrm-contract-templates";
import type {
  ContractType,
  ContractTypeStatus,
} from "@/lib/mock-data/hrm-contract-types";
import type {
  EmployeeContract,
  EmployeeContractStatus,
} from "@/lib/mock-data/hrm-employee-contracts";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

export type ApiContractType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  default_duration_months: number | null;
  probation_period_months: number;
  notice_period_days: number;
  is_renewable: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiContractTemplate = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  contract_type_id: string | null;
  template_content: string | null;
  variables: string | null;
  clauses: string | null;
  is_default: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiEmployeeContract = {
  id: string;
  company_id: string;
  contract_number: string | null;
  employee_id: string | null;
  contract_type_id: string | null;
  start_date: string | null;
  end_date: string | null;
  basic_salary: string | number;
  allowances: string | null;
  benefits: string | null;
  terms_conditions: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractLookups = {
  typeName: (id: string | null | undefined) => string;
  employeeName: (id: string | null | undefined) => string;
};

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function parseStoredList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* comma / newline separated */
  }
  return parseList(raw);
}

function toDecimal(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function apiContractTypeToView(
  row: ApiContractType,
  contractsCount = 0,
): ContractType {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    durationMonths: row.default_duration_months,
    probationMonths: row.probation_period_months ?? 0,
    noticeDays: row.notice_period_days ?? 0,
    contractsCount,
    locked: false,
    status: (row.status === "inactive" ? "inactive" : "active") as ContractTypeStatus,
    createdAt: ymd(row.created_at),
  };
}

export function apiContractTemplateToView(
  row: ApiContractTemplate,
  lookups: Pick<ContractLookups, "typeName">,
): ContractTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    contractType: lookups.typeName(row.contract_type_id),
    variables: parseStoredList(row.variables),
    clauses: parseStoredList(row.clauses),
    content: row.template_content ?? "",
    isDefault: row.is_default,
    locked: false,
    status: (row.status === "inactive" ? "inactive" : "active") as ContractTemplateStatus,
    createdAt: ymd(row.created_at),
  };
}

export function apiEmployeeContractToView(
  row: ApiEmployeeContract,
  lookups: ContractLookups,
): EmployeeContract {
  return {
    id: row.id,
    contractNumber: row.contract_number ?? "",
    contractName: lookups.typeName(row.contract_type_id),
    employeeName: lookups.employeeName(row.employee_id),
    startDate: ymd(row.start_date),
    endDate: ymd(row.end_date),
    amount: toDecimal(row.basic_salary),
    status: (row.status as EmployeeContractStatus) || "draft",
    notes: row.terms_conditions ?? "",
  };
}

export type ContractTemplateApiExtras = {
  contractTypeId: string;
};

export type EmployeeContractApiExtras = {
  employeeId: string;
  contractTypeId: string;
};

export function buildContractLookups(opts: {
  types: ApiContractType[];
  employees?: { id: string; name: string }[];
}): ContractLookups {
  const typeById = new Map(opts.types.map((t) => [t.id, t]));
  const empById = new Map((opts.employees ?? []).map((e) => [e.id, e.name]));
  return {
    typeName: (id) => (id ? typeById.get(id)?.name ?? "—" : "—"),
    employeeName: (id) => (id ? empById.get(id) ?? "—" : "—"),
  };
}

// --- contract types ---

export async function listHrmContractTypes(params?: {
  status?: string;
  q?: string;
}): Promise<ApiContractType[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiContractType>>(
    `/api/v1/hrm/contract-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmContractType(payload: {
  name: string;
  description?: string;
  durationMonths?: number | null;
  probationMonths?: number;
  noticeDays?: number;
  isRenewable?: boolean;
  status?: string;
}): Promise<ApiContractType> {
  const res = await apiFetch<ApiItemResponse<ApiContractType>>(
    "/api/v1/hrm/contract-types",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name.trim(),
        description: blankToNull(payload.description),
        default_duration_months: payload.durationMonths ?? null,
        probation_period_months: payload.probationMonths ?? 0,
        notice_period_days: payload.noticeDays ?? 0,
        is_renewable: payload.isRenewable ?? true,
        status: payload.status || "active",
      }),
    },
  );
  return res.data;
}

export async function updateHrmContractType(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    durationMonths?: number | null;
    probationMonths?: number;
    noticeDays?: number;
    isRenewable?: boolean;
    status?: string;
  },
): Promise<ApiContractType> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name.trim();
  if (payload.description !== undefined)
    body.description = blankToNull(payload.description);
  if (payload.durationMonths !== undefined)
    body.default_duration_months = payload.durationMonths;
  if (payload.probationMonths !== undefined)
    body.probation_period_months = payload.probationMonths;
  if (payload.noticeDays !== undefined) body.notice_period_days = payload.noticeDays;
  if (payload.isRenewable !== undefined) body.is_renewable = payload.isRenewable;
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiContractType>>(
    `/api/v1/hrm/contract-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmContractType(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/contract-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- contract templates ---

export async function listHrmContractTemplates(params?: {
  contract_type_id?: string;
  status?: string;
  q?: string;
}): Promise<ApiContractTemplate[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.contract_type_id) qs.set("contract_type_id", params.contract_type_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiContractTemplate>>(
    `/api/v1/hrm/contract-templates?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmContractTemplate(payload: {
  name: string;
  description?: string;
  contractTypeId?: string | null;
  content?: string;
  variables?: string[];
  clauses?: string[];
  isDefault?: boolean;
  status?: string;
}): Promise<ApiContractTemplate> {
  const res = await apiFetch<ApiItemResponse<ApiContractTemplate>>(
    "/api/v1/hrm/contract-templates",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name.trim(),
        description: blankToNull(payload.description),
        contract_type_id: blankToNull(payload.contractTypeId),
        template_content: blankToNull(payload.content),
        variables: payload.variables?.length
          ? JSON.stringify(payload.variables)
          : null,
        clauses: payload.clauses?.length ? JSON.stringify(payload.clauses) : null,
        is_default: Boolean(payload.isDefault),
        status: payload.status || "active",
      }),
    },
  );
  return res.data;
}

export async function updateHrmContractTemplate(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    contractTypeId?: string | null;
    content?: string | null;
    variables?: string[];
    clauses?: string[];
    isDefault?: boolean;
    status?: string;
  },
): Promise<ApiContractTemplate> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name.trim();
  if (payload.description !== undefined)
    body.description = blankToNull(payload.description);
  if (payload.contractTypeId !== undefined)
    body.contract_type_id = blankToNull(payload.contractTypeId);
  if (payload.content !== undefined) body.template_content = blankToNull(payload.content);
  if (payload.variables !== undefined)
    body.variables = payload.variables.length
      ? JSON.stringify(payload.variables)
      : null;
  if (payload.clauses !== undefined)
    body.clauses = payload.clauses.length ? JSON.stringify(payload.clauses) : null;
  if (payload.isDefault !== undefined) body.is_default = payload.isDefault;
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiContractTemplate>>(
    `/api/v1/hrm/contract-templates/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function deleteHrmContractTemplate(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/contract-templates/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- employee contracts ---

export async function listHrmEmployeeContracts(params?: {
  employee_id?: string;
  contract_type_id?: string;
  status?: string;
  q?: string;
}): Promise<ApiEmployeeContract[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.contract_type_id) qs.set("contract_type_id", params.contract_type_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiEmployeeContract>>(
    `/api/v1/hrm/employee-contracts?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmEmployeeContract(payload: {
  contractNumber?: string;
  employeeId?: string | null;
  contractTypeId?: string | null;
  startDate?: string;
  endDate?: string;
  basicSalary?: number;
  allowances?: string;
  benefits?: string;
  termsConditions?: string;
}): Promise<ApiEmployeeContract> {
  const res = await apiFetch<ApiItemResponse<ApiEmployeeContract>>(
    "/api/v1/hrm/employee-contracts",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        contract_number: blankToNull(payload.contractNumber),
        employee_id: blankToNull(payload.employeeId),
        contract_type_id: blankToNull(payload.contractTypeId),
        start_date: blankToNull(payload.startDate),
        end_date: blankToNull(payload.endDate),
        basic_salary: payload.basicSalary ?? 0,
        allowances: blankToNull(payload.allowances),
        benefits: blankToNull(payload.benefits),
        terms_conditions: blankToNull(payload.termsConditions),
      }),
    },
  );
  return res.data;
}

export async function updateHrmEmployeeContract(
  id: string,
  payload: {
    contractNumber?: string | null;
    employeeId?: string | null;
    contractTypeId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    basicSalary?: number;
    allowances?: string | null;
    benefits?: string | null;
    termsConditions?: string | null;
    status?: string;
  },
): Promise<ApiEmployeeContract> {
  const body: Record<string, unknown> = {};
  if (payload.contractNumber !== undefined)
    body.contract_number = blankToNull(payload.contractNumber);
  if (payload.employeeId !== undefined) body.employee_id = blankToNull(payload.employeeId);
  if (payload.contractTypeId !== undefined)
    body.contract_type_id = blankToNull(payload.contractTypeId);
  if (payload.startDate !== undefined) body.start_date = blankToNull(payload.startDate);
  if (payload.endDate !== undefined) body.end_date = blankToNull(payload.endDate);
  if (payload.basicSalary !== undefined) body.basic_salary = payload.basicSalary;
  if (payload.allowances !== undefined) body.allowances = blankToNull(payload.allowances);
  if (payload.benefits !== undefined) body.benefits = blankToNull(payload.benefits);
  if (payload.termsConditions !== undefined)
    body.terms_conditions = blankToNull(payload.termsConditions);
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiEmployeeContract>>(
    `/api/v1/hrm/employee-contracts/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function activateHrmEmployeeContract(
  id: string,
): Promise<ApiEmployeeContract> {
  const res = await apiFetch<ApiItemResponse<ApiEmployeeContract>>(
    `/api/v1/hrm/employee-contracts/${encodeURIComponent(id)}/activate?company_id=default`,
    { method: "POST" },
  );
  return res.data;
}

export async function deleteHrmEmployeeContract(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employee-contracts/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export function nextContractNumber(
  existing: Pick<EmployeeContract, "contractNumber">[],
): string {
  const year = new Date().getFullYear();
  const seq = existing.reduce((max, r) => {
    const m = /EMP\s*-\s*(\d{4})\s*-\s*(\d+)/i.exec(r.contractNumber);
    if (!m) return max;
    if (Number(m[1]) !== year) return max;
    return Math.max(max, Number(m[2]));
  }, 0);
  return `EMP - ${year} - ${String(seq + 1).padStart(4, "0")}`;
}

// --- contract renewals ---

export type ApiContractRenewal = {
  id: string;
  company_id: string;
  contract_id: string | null;
  renewal_number: string | null;
  current_end_date: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  new_basic_salary: string | number;
  new_allowances: string | null;
  new_benefits: string | null;
  new_terms_conditions: string | null;
  changes_summary: string | null;
  reason: string | null;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractRenewalStatus = "pending" | "approved" | "rejected";

export type ContractRenewalView = {
  id: string;
  contractId: string;
  contractNumber: string;
  renewalNumber: string;
  currentEndDate: string;
  newStartDate: string;
  newEndDate: string;
  newBasicSalary: number;
  changesSummary: string;
  reason: string;
  status: ContractRenewalStatus;
  approvalNotes: string;
};

export function apiContractRenewalToView(
  row: ApiContractRenewal,
  contractNumber: (id: string | null | undefined) => string,
): ContractRenewalView {
  return {
    id: row.id,
    contractId: row.contract_id ?? "",
    contractNumber: contractNumber(row.contract_id),
    renewalNumber: row.renewal_number ?? "",
    currentEndDate: ymd(row.current_end_date),
    newStartDate: ymd(row.new_start_date),
    newEndDate: ymd(row.new_end_date),
    newBasicSalary: toDecimal(row.new_basic_salary),
    changesSummary: row.changes_summary ?? "",
    reason: row.reason ?? "",
    status: (row.status as ContractRenewalStatus) || "pending",
    approvalNotes: row.approval_notes ?? "",
  };
}

export async function listHrmContractRenewals(params?: {
  contract_id?: string;
  status?: string;
  q?: string;
}): Promise<ApiContractRenewal[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.contract_id) qs.set("contract_id", params.contract_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiContractRenewal>>(
    `/api/v1/hrm/contract-renewals?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmContractRenewal(payload: {
  contractId?: string | null;
  renewalNumber?: string;
  currentEndDate?: string;
  newStartDate?: string;
  newEndDate?: string;
  newBasicSalary?: number;
  newAllowances?: string;
  newBenefits?: string;
  newTermsConditions?: string;
  changesSummary?: string;
  reason?: string;
}): Promise<ApiContractRenewal> {
  const res = await apiFetch<ApiItemResponse<ApiContractRenewal>>(
    "/api/v1/hrm/contract-renewals",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        contract_id: blankToNull(payload.contractId),
        renewal_number: blankToNull(payload.renewalNumber),
        current_end_date: blankToNull(payload.currentEndDate),
        new_start_date: blankToNull(payload.newStartDate),
        new_end_date: blankToNull(payload.newEndDate),
        new_basic_salary: payload.newBasicSalary ?? 0,
        new_allowances: blankToNull(payload.newAllowances),
        new_benefits: blankToNull(payload.newBenefits),
        new_terms_conditions: blankToNull(payload.newTermsConditions),
        changes_summary: blankToNull(payload.changesSummary),
        reason: blankToNull(payload.reason),
      }),
    },
  );
  return res.data;
}

export async function updateHrmContractRenewal(
  id: string,
  payload: {
    contractId?: string | null;
    renewalNumber?: string | null;
    currentEndDate?: string | null;
    newStartDate?: string | null;
    newEndDate?: string | null;
    newBasicSalary?: number;
    newAllowances?: string | null;
    newBenefits?: string | null;
    newTermsConditions?: string | null;
    changesSummary?: string | null;
    reason?: string | null;
    status?: string;
  },
): Promise<ApiContractRenewal> {
  const body: Record<string, unknown> = {};
  if (payload.contractId !== undefined) body.contract_id = blankToNull(payload.contractId);
  if (payload.renewalNumber !== undefined)
    body.renewal_number = blankToNull(payload.renewalNumber);
  if (payload.currentEndDate !== undefined)
    body.current_end_date = blankToNull(payload.currentEndDate);
  if (payload.newStartDate !== undefined)
    body.new_start_date = blankToNull(payload.newStartDate);
  if (payload.newEndDate !== undefined) body.new_end_date = blankToNull(payload.newEndDate);
  if (payload.newBasicSalary !== undefined) body.new_basic_salary = payload.newBasicSalary;
  if (payload.newAllowances !== undefined)
    body.new_allowances = blankToNull(payload.newAllowances);
  if (payload.newBenefits !== undefined) body.new_benefits = blankToNull(payload.newBenefits);
  if (payload.newTermsConditions !== undefined)
    body.new_terms_conditions = blankToNull(payload.newTermsConditions);
  if (payload.changesSummary !== undefined)
    body.changes_summary = blankToNull(payload.changesSummary);
  if (payload.reason !== undefined) body.reason = blankToNull(payload.reason);
  if (payload.status !== undefined) body.status = payload.status;
  const res = await apiFetch<ApiItemResponse<ApiContractRenewal>>(
    `/api/v1/hrm/contract-renewals/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return res.data;
}

export async function decideHrmContractRenewal(
  id: string,
  payload: { decision: "approved" | "rejected"; approvalNotes?: string },
): Promise<ApiContractRenewal> {
  const res = await apiFetch<ApiItemResponse<ApiContractRenewal>>(
    `/api/v1/hrm/contract-renewals/${encodeURIComponent(id)}/approve?company_id=default`,
    {
      method: "POST",
      body: JSON.stringify({
        decision: payload.decision,
        approval_notes: blankToNull(payload.approvalNotes),
      }),
    },
  );
  return res.data;
}

export async function deleteHrmContractRenewal(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/contract-renewals/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export function nextRenewalNumber(
  existing: Pick<ContractRenewalView, "renewalNumber">[],
): string {
  const year = new Date().getFullYear();
  const seq = existing.reduce((max, r) => {
    const m = /REN\s*-\s*(\d{4})\s*-\s*(\d+)/i.exec(r.renewalNumber);
    if (!m) return max;
    if (Number(m[1]) !== year) return max;
    return Math.max(max, Number(m[2]));
  }, 0);
  return `REN - ${year} - ${String(seq + 1).padStart(4, "0")}`;
}
