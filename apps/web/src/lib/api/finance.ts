import { apiFetch } from "@/lib/api/client";

export type ApiFinancePaymentAccount = {
  id: string;
  company_id: string;
  name: string;
  kind: "cash" | "bank" | "mobile_wallet" | "card" | "other";
  gl_account_id: string;
  gl_account_code: string | null;
  gl_account_name: string | null;
  opening_balance: string;
  balance: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

export type ApiFinanceAccount = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  account_type: string;
  parent_id: string | null;
  parent_code?: string | null;
  is_system: boolean;
  is_active: boolean;
  nature?: "debit" | "credit" | string;
  debit?: string;
  credit?: string;
  balance?: string;
  balance_side?: "debit" | "credit" | string;
  depth?: number;
};

export type ApiFinanceJournalLine = {
  id: string;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  debit: string;
  credit: string;
  description: string | null;
  party_type: string | null;
  party_id: string | null;
  tax_amount: string;
  cost_center_id?: string | null;
  cost_center_code?: string | null;
  cost_center_name?: string | null;
};

export type ApiFinanceJournalEntry = {
  id: string;
  company_id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id: string;
  status: string;
  created_at: string;
  lines: ApiFinanceJournalLine[];
  debit_total?: string;
  credit_total?: string;
};

export type ApiFinancePayment = {
  id: string;
  company_id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  payment_account_id: string | null;
  payment_account_name: string | null;
  direction: "inbound" | "outbound";
  source_type: string;
  source_id: string;
  party_type: string | null;
  party_id: string | null;
  party_name?: string | null;
  reference: string | null;
  project_id?: string | null;
  created_at: string;
};

export type ApiFinanceReceivable = {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string | null;
  source_type: string;
  source_id: string;
  invoice_number: string;
  amount: string;
  amount_paid: string;
  balance: string;
  tax_amount: string;
  due_date: string | null;
  status: string;
  journal_entry_id?: string | null;
  posting_status?: string | null;
  posting_error?: string | null;
  project_id?: string | null;
  created_at: string;
};

export type ApiFinancePayable = {
  id: string;
  company_id: string;
  supplier_id: string;
  supplier_name: string | null;
  source_type: string;
  source_id: string;
  reference_number: string;
  amount: string;
  amount_paid: string;
  balance: string;
  tax_amount: string;
  due_date: string | null;
  status: string;
  journal_entry_id?: string | null;
  posting_status?: string | null;
  posting_error?: string | null;
  created_at: string;
};

export type ApiFinanceTaxSummary = {
  output_tax_total: string;
  input_tax_total: string;
  net_tax_payable: string;
};

export type ApiFinanceDashboard = {
  receivable_balance: string;
  payable_balance: string;
  payments_inbound_total: string;
  journal_entry_count: number;
  account_count: number;
  unposted_receivable_count?: number;
  failed_posting_count?: number;
  unposted_payable_count?: number;
  tax_summary: ApiFinanceTaxSummary;
  payment_accounts: ApiFinancePaymentAccount[];
  recent_receivables: ApiFinanceReceivable[];
  recent_payables: ApiFinancePayable[];
  recent_payments: ApiFinancePayment[];
};

export type ApiFinanceSourceType = { value: string; label: string };

export type ApiFinanceReport = {
  filters: Record<string, string | null>;
  period: { from: string; to: string };
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  meta: { company_id: string; generated_at: string };
  integrity?: { ok: boolean; warning: string | null };
};

export type ApiFinancePostingHealth = {
  unposted_receivable_count: number;
  failed_posting_count: number;
  unposted_payable_count: number;
  items: Array<{
    id: string;
    source_type: string;
    source_id: string;
    invoice_number: string;
    posting_status: string | null;
    posting_error: string | null;
    journal_entry_id: string | null;
  }>;
};

export type ApiListMeta = { total: number; limit: number; offset: number };

const BASE = "/api/v1/finance";

export async function fetchFinanceDashboard() {
  return apiFetch<{ data: ApiFinanceDashboard }>(`${BASE}/dashboard`);
}

export async function fetchFinanceTaxSummary() {
  return apiFetch<{ data: ApiFinanceTaxSummary }>(`${BASE}/tax-summary`);
}

export async function fetchFinanceAccounts(includeInactive = false) {
  const q = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<{ data: ApiFinanceAccount[] }>(`${BASE}/accounts${q}`);
}

export async function createFinanceAccount(input: {
  code: string;
  name: string;
  account_type: string;
  parent_id?: string | null;
}) {
  return apiFetch<{ data: ApiFinanceAccount }>(`${BASE}/accounts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFinanceAccount(
  id: string,
  input: {
    name?: string;
    account_type?: string;
    parent_id?: string | null;
    is_active?: boolean;
  },
) {
  return apiFetch<{ data: ApiFinanceAccount }>(`${BASE}/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchFinanceJournal(params?: { source_type?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.source_type && params.source_type !== "all") q.set("source_type", params.source_type);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<{ data: ApiFinanceJournalEntry[]; meta: ApiListMeta }>(`${BASE}/journal${s ? `?${s}` : ""}`);
}

export async function fetchFinanceJournalEntry(id: string) {
  return apiFetch<{ data: ApiFinanceJournalEntry }>(`${BASE}/journal/${id}`);
}

export async function fetchFinancePayments(params?: { project_id?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.project_id) q.set("project_id", params.project_id);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<{ data: ApiFinancePayment[]; meta: ApiListMeta }>(`${BASE}/payments${s ? `?${s}` : ""}`);
}

export async function fetchFinanceReceivables(params?: {
  status?: string;
  project_id?: string;
  customer_id?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.project_id) q.set("project_id", params.project_id);
  if (params?.customer_id) q.set("customer_id", params.customer_id);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<{ data: ApiFinanceReceivable[]; meta: ApiListMeta }>(`${BASE}/receivables${s ? `?${s}` : ""}`);
}

export async function fetchFinancePayables(params?: { status?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<{ data: ApiFinancePayable[]; meta: ApiListMeta }>(`${BASE}/payables${s ? `?${s}` : ""}`);
}

export async function fetchPaymentAccounts() {
  return apiFetch<{ data: ApiFinancePaymentAccount[] }>(`${BASE}/payment-accounts`);
}

export async function createPaymentAccount(input: {
  name: string;
  kind: string;
  opening_balance?: string;
  is_default?: boolean;
}) {
  return apiFetch<{ data: ApiFinancePaymentAccount }>(`${BASE}/payment-accounts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePaymentAccount(
  id: string,
  input: { name?: string; is_active?: boolean; is_default?: boolean },
) {
  return apiFetch<{ data: ApiFinancePaymentAccount }>(`${BASE}/payment-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transferPaymentAccounts(input: {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  payment_date?: string;
  reference?: string;
  notes?: string;
}) {
  return apiFetch<{ data: ApiFinancePayment[] }>(`${BASE}/payment-accounts/transfer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function settleReceivable(
  id: string,
  input: { amount: string; payment_account_id: string; payment_date?: string; reference?: string; notes?: string },
) {
  return apiFetch<{ data: ApiFinanceReceivable[] }>(`${BASE}/receivables/${id}/settle`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function settlePayable(
  id: string,
  input: { amount: string; payment_account_id: string; payment_date?: string; reference?: string; notes?: string },
) {
  return apiFetch<{ data: ApiFinancePayable[] }>(`${BASE}/payables/${id}/settle`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createPayableFromPurchase(input: {
  supplier_id: string;
  reference_number: string;
  amount: string;
  tax_amount?: string;
  due_date?: string;
  source_type: "vendor_bill" | "purchase_return";
  source_id: string;
  description?: string;
  credit?: boolean;
}) {
  const res = await apiFetch<{ data: ApiFinancePayable }>(`${BASE}/payables/from-purchase`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function fetchFinanceJournalSourceTypes() {
  return apiFetch<{ data: ApiFinanceSourceType[] }>(`${BASE}/journal/source-types`);
}

export async function fetchFinancePostingHealth() {
  return apiFetch<{ data: ApiFinancePostingHealth }>(`${BASE}/postings/health`);
}

export async function retryFinancePosting(input: { source_type: string; source_id: string }) {
  return apiFetch<{ ok: boolean }>(`${BASE}/postings/retry`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchFinanceReport(
  slug: string,
  params?: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) q.set(key, value);
    }
  }
  const s = q.toString();
  return apiFetch<ApiFinanceReport>(`${BASE}/reports/${slug}${s ? `?${s}` : ""}`);
}
