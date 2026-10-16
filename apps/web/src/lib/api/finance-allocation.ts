import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/finance";

export type ApiCostCenter = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  kind: string;
  branch_id: string | null;
  department_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiAllocationRuleLine = {
  id: string;
  cost_center_id: string;
  cost_center_code: string | null;
  cost_center_name: string | null;
  basis_value: string;
  percentage: string;
  fixed_amount: string;
};

export type ApiAllocationRule = {
  id: string;
  company_id: string;
  name: string;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  method: "percentage" | "fixed" | "quantity" | "equal";
  unit_label: string;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiAllocationRuleLine[];
};

export type ApiAllocationPreviewLine = {
  cost_center_id: string;
  code: string;
  name: string;
  basis_value: string;
  percentage: string;
  amount: string;
};

export type ApiAllocationPreview = {
  rule_id: string | null;
  rule_name: string | null;
  method: string;
  unit_label: string;
  amount: string;
  overridden: boolean;
  lines: ApiAllocationPreviewLine[];
};

export type CostCenterCreateInput = {
  code: string;
  name: string;
  kind?: string;
};

export type AllocationRuleLineInput = {
  cost_center_id: string;
  basis_value?: number;
  percentage?: number;
  fixed_amount?: number;
};

export type AllocationRuleCreateInput = {
  name: string;
  account_id?: string | null;
  method: ApiAllocationRule["method"];
  unit_label?: string;
  is_active?: boolean;
  notes?: string;
  lines: AllocationRuleLineInput[];
};

export async function fetchCostCenters(includeInactive = false) {
  const q = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ data: ApiCostCenter[] }>(`${BASE}/cost-centers${q}`);
}

export async function fetchCostCenterAccounts(
  idOrCode: string,
  params?: { date_from?: string; date_to?: string },
) {
  const q = new URLSearchParams();
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  const s = q.toString();
  return apiFetch<{
    filters: Record<string, unknown>;
    period: { from: string; to: string };
    rows: Array<{
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: string;
      parent_id?: string | null;
      debit: string;
      credit: string;
      net: string;
    }>;
    totals: { total_debit: string; total_credit: string; net: string };
    meta: { company_id: string; generated_at: string };
  }>(`${BASE}/cost-centers/${encodeURIComponent(idOrCode)}/accounts${s ? `?${s}` : ""}`);
}

export async function createCostCenter(input: CostCenterCreateInput) {
  const res = await apiFetch<{ data: ApiCostCenter }>(`${BASE}/cost-centers`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateCostCenter(id: string, patch: Partial<{ name: string; is_active: boolean; kind: string }>) {
  const res = await apiFetch<{ data: ApiCostCenter }>(`${BASE}/cost-centers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function fetchAllocationRules(includeInactive = false) {
  const q = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ data: ApiAllocationRule[] }>(`${BASE}/allocation-rules${q}`);
}

export async function createAllocationRule(input: AllocationRuleCreateInput) {
  const res = await apiFetch<{ data: ApiAllocationRule }>(`${BASE}/allocation-rules`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateAllocationRule(id: string, patch: Partial<AllocationRuleCreateInput>) {
  const res = await apiFetch<{ data: ApiAllocationRule }>(`${BASE}/allocation-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteAllocationRule(id: string) {
  await apiFetch<void>(`${BASE}/allocation-rules/${id}`, { method: "DELETE" });
}

export async function previewAllocationRule(
  id: string,
  amount: number,
  overrideLines?: { cost_center_id: string; amount: number; basis_value?: number }[],
) {
  const res = await apiFetch<{ data: ApiAllocationPreview }>(`${BASE}/allocation-rules/${id}/preview`, {
    method: "POST",
    body: JSON.stringify({
      amount,
      override_lines: overrideLines,
    }),
  });
  return res.data;
}
