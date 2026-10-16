import { apiFetch } from "@/lib/api/client";

export type ExpenseStatus = "draft" | "approved" | "paid" | "rejected";

export type ApiExpenseCategory = {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type ApiExpense = {
  id: string;
  company_id: string;
  expense_number: string;
  category_id: string;
  category_name: string | null;
  payee: string;
  description: string;
  expense_date: string;
  amount: string;
  tax_amount: string;
  total: string;
  payment_method: string;
  payment_account_id: string | null;
  payment_account_name: string | null;
  status: ExpenseStatus;
  reference: string | null;
  notes: string | null;
  journal_entry_id: string | null;
  payment_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  allocation_rule_id: string | null;
  allocation_rule_name: string | null;
  allocation_method: string | null;
  allocation_json: {
    rule_id?: string | null;
    rule_name?: string | null;
    method?: string;
    unit_label?: string;
    amount?: string;
    overridden?: boolean;
    lines?: Array<{
      cost_center_id: string;
      code: string;
      name: string;
      basis_value: string;
      percentage: string;
      amount: string;
    }>;
  } | null;
  allocation_overridden: boolean;
  project_id: string | null;
  party_id: string | null;
  party_name: string | null;
};

export type ApiExpenseListMeta = { total: number; limit: number; offset: number };
export type ApiExpenseListResponse = { data: ApiExpense[]; meta: ApiExpenseListMeta };
export type ApiExpenseResponse = { data: ApiExpense };
export type ApiExpenseCategoryListResponse = { data: ApiExpenseCategory[] };

export type ApiExpenseCategoryTotal = { category_id: string; category_name: string; total: string };
export type ApiExpenseSummary = {
  month_total: string;
  month_paid_total: string;
  pending_count: number;
  pending_amount: string;
  by_category: ApiExpenseCategoryTotal[];
};
export type ApiExpenseSummaryResponse = { data: ApiExpenseSummary };

export type ExpenseListParams = {
  status?: ExpenseStatus | "all";
  category_id?: string;
  project_id?: string;
  party_id?: string;
  search?: string;
  limit?: number;
};

export type ExpenseCreateInput = {
  category_id: string;
  payee: string;
  description?: string;
  expense_date: string;
  amount: number;
  tax_amount?: number;
  payment_method?: string;
  payment_account_id?: string;
  reference?: string;
  notes?: string;
  account_id?: string;
  allocation_rule_id?: string | null;
  override_lines?: { cost_center_id: string; amount: number; basis_value?: number }[];
  party_id?: string | null;
};

export type ExpenseUpdateInput = Partial<ExpenseCreateInput>;

export type ExpensePayInput = {
  payment_method?: string;
  payment_account_id?: string;
  payment_date?: string;
  reference?: string;
};

const BASE = "/api/v1/finance";

function buildQuery(params?: ExpenseListParams): string {
  const q = new URLSearchParams();
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.category_id && params.category_id !== "all") q.set("category_id", params.category_id);
  if (params?.project_id) q.set("project_id", params.project_id);
  if (params?.party_id) q.set("party_id", params.party_id);
  if (params?.search) q.set("search", params.search);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchExpenseCategories(includeInactive = false) {
  const q = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<ApiExpenseCategoryListResponse>(`${BASE}/expense-categories${q}`);
}

export async function createExpenseCategory(name: string) {
  return apiFetch<ApiExpenseCategoryListResponse>(`${BASE}/expense-categories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateExpenseCategory(id: string, patch: { name?: string; is_active?: boolean }) {
  return apiFetch<ApiExpenseCategoryListResponse>(`${BASE}/expense-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deactivateExpenseCategory(id: string) {
  return apiFetch<ApiExpenseCategoryListResponse>(`${BASE}/expense-categories/${id}`, { method: "DELETE" });
}

export async function fetchExpenses(params?: ExpenseListParams) {
  return apiFetch<ApiExpenseListResponse>(`${BASE}/expenses${buildQuery(params)}`);
}

export async function fetchExpenseSummary() {
  return apiFetch<ApiExpenseSummaryResponse>(`${BASE}/expenses/summary`);
}

export async function createExpense(input: ExpenseCreateInput) {
  const res = await apiFetch<ApiExpenseResponse>(`${BASE}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateExpense(id: string, patch: ExpenseUpdateInput) {
  const res = await apiFetch<ApiExpenseResponse>(`${BASE}/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function approveExpense(id: string) {
  const res = await apiFetch<ApiExpenseResponse>(`${BASE}/expenses/${id}/approve`, { method: "POST" });
  return res.data;
}

export async function rejectExpense(id: string, note?: string) {
  const res = await apiFetch<ApiExpenseResponse>(`${BASE}/expenses/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return res.data;
}

export async function payExpense(id: string, input: ExpensePayInput) {
  const res = await apiFetch<ApiExpenseResponse>(`${BASE}/expenses/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteExpense(id: string) {
  await apiFetch<void>(`${BASE}/expenses/${id}`, { method: "DELETE" });
}
