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
  /** Money may not go out beyond the balance. */
  check_balance?: boolean;
  bank_branch_id?: string | null;
  /** "Bank · Branch" */
  bank_label?: string | null;
  account_number?: string | null;
  account_title?: string | null;
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
  /** false = a group: no postings, its children take them */
  is_postable?: boolean;
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

export type FinancePeriodTotals = {
  money_in: number;
  money_out: number;
  net_cash: number;
  payment_count: number;
  invoiced: number;
  invoice_count: number;
  billed: number;
  bill_count: number;
  expenses: number;
  expense_count: number;
};

export type FinanceDashboardPeriod = {
  date_from: string | null;
  date_to: string | null;
  snapshot: {
    receivable_balance: number;
    receivable_count: number;
    payable_balance: number;
    payable_count: number;
    cash_total: number;
    net_tax_payable: number;
    overdue_receivable: number;
    overdue_receivable_count: number;
    overdue_payable: number;
    overdue_payable_count: number;
  };
  attention: {
    unposted_receivables: number;
    unposted_payables: number;
    failed_postings: number;
    cheques_moving: number;
    expenses_to_approve: number;
    overdue_receivables: number;
  };
  cash_accounts: { id: string; name: string; kind: string; balance: number }[];
  top_receivables: { party_id: string; name: string; balance: number; count: number }[];
  top_payables: { party_id: string; name: string; balance: number; count: number }[];
  current: FinancePeriodTotals;
  previous: FinancePeriodTotals | null;
  series: { date: string; label: string; money_in: number; money_out: number }[];
  by_month: boolean;
  by_method: { method: string; amount: number; count: number }[];
  expenses_by_category: { name: string; total: number; count: number }[];
  recent_payments: {
    id: string;
    date: string | null;
    payment_number: string;
    direction: "inbound" | "outbound";
    amount: number;
    method: string;
    account: string | null;
    party: string | null;
    reference: string | null;
  }[];
};

/** The Finance landing dashboard: balances right now and money in / out over the chosen period. */
export async function fetchFinanceDashboardPeriod(dateFrom?: string, dateTo?: string): Promise<FinanceDashboardPeriod> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const q = params.toString();
  const res = await apiFetch<{ data: FinanceDashboardPeriod }>(`${BASE}/dashboard/period${q ? `?${q}` : ""}`);
  return res.data;
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
  is_postable?: boolean;
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
    is_postable?: boolean;
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
  check_balance?: boolean;
  bank_branch_id?: string | null;
  account_number?: string | null;
  account_title?: string | null;
}) {
  return apiFetch<{ data: ApiFinancePaymentAccount }>(`${BASE}/payment-accounts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePaymentAccount(
  id: string,
  input: {
    name?: string;
    is_active?: boolean;
    is_default?: boolean;
    check_balance?: boolean;
    bank_branch_id?: string | null;
    account_number?: string | null;
    account_title?: string | null;
  },
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

// ── Cheques ──────────────────────────────────────────────────────────────

export type ChequeDirection = "received" | "issued";
export type ChequeStatus = "received" | "issued" | "deposited" | "presented" | "cleared" | "bounced" | "cancelled";
export type ChequeAction = "deposit" | "present" | "clear" | "bounce" | "cancel";

export type ApiFinanceCheque = {
  id: string;
  company_id: string;
  direction: ChequeDirection;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: string;
  status: ChequeStatus;
  party_type: "customer" | "supplier";
  party_id: string;
  party_name: string | null;
  receivable_id: string | null;
  payable_id: string | null;
  document_number: string | null;
  payment_account_id: string | null;
  payment_account_name: string | null;
  bank_charge: string;
  notes: string | null;
  available_actions: ChequeAction[];
  created_at: string;
  updated_at: string;
};

export type ApiFinanceChequeEvent = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string;
  event_date: string;
  journal_entry_id: string | null;
  actor: string | null;
  note: string | null;
  created_at: string;
};

export type ApiFinanceChequeDetail = ApiFinanceCheque & {
  events: ApiFinanceChequeEvent[];
  journal_entries: ApiFinanceJournalEntry[];
};

export async function fetchFinanceCheques(params?: { direction?: string; status?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.direction && params.direction !== "all") q.set("direction", params.direction);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<{ data: ApiFinanceCheque[]; meta: ApiListMeta }>(`${BASE}/cheques${s ? `?${s}` : ""}`);
}

export async function fetchFinanceCheque(id: string) {
  return apiFetch<{ data: ApiFinanceChequeDetail }>(`${BASE}/cheques/${id}`);
}

export async function createFinanceCheque(input: {
  direction: ChequeDirection;
  party_id: string;
  bank_name: string;
  cheque_number: string;
  /** An issued cheque taken from a cheque book leaf: the leaf gives the number and the book's bank. */
  cheque_leaf_id?: string;
  cheque_date: string;
  amount: string;
  receivable_id?: string;
  payable_id?: string;
  notes?: string;
}) {
  return apiFetch<{ data: ApiFinanceChequeDetail }>(`${BASE}/cheques`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function applyFinanceChequeAction(
  id: string,
  input: {
    action: ChequeAction;
    action_date?: string;
    payment_account_id?: string;
    bank_charge?: string;
    note?: string;
  },
) {
  return apiFetch<{ data: ApiFinanceChequeDetail }>(`${BASE}/cheques/${id}/actions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchFinancePayablesForSupplier(supplierId: string) {
  return apiFetch<{ data: ApiFinancePayable[]; meta: ApiListMeta }>(
    `${BASE}/payables?supplier_id=${encodeURIComponent(supplierId)}&limit=200`,
  );
}

export async function updateFinanceCheque(
  id: string,
  input: { bank_name?: string; cheque_number?: string; cheque_date?: string; notes?: string },
) {
  return apiFetch<{ data: ApiFinanceChequeDetail }>(`${BASE}/cheques/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ── Cheque books ─────────────────────────────────────────────────────────

export type ChequeBookState = "draft" | "active" | "closed";
export type ChequeLeafDisplayStatus = "unused" | "void" | "not_treated" | "cleared" | "bounced" | "cancelled";

export type ApiChequeLeaf = {
  id: string;
  book_id: string;
  cheque_number: string;
  status: "unused" | "issued" | "void";
  display_status: ChequeLeafDisplayStatus;
  cheque_id: string | null;
  issue_date: string | null;
  party_name: string | null;
  payment_number: string | null;
  amount: string;
  cheque_type: string;
  remarks: string | null;
};

export type ApiChequeBook = {
  id: string;
  company_id: string;
  book_number: string;
  payment_account_id: string;
  payment_account_name: string | null;
  bank_name: string;
  branch_name: string | null;
  routing_number: string | null;
  cheque_prefix: string;
  number_from: number;
  number_to: number;
  state: ChequeBookState;
  remarks: string | null;
  leaf_count: number;
  unused_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiChequeBookDetail = ApiChequeBook & { leaves: ApiChequeLeaf[] };

export type ApiAvailableChequeLeaf = {
  leaf_id: string;
  cheque_number: string;
  book_id: string;
  book_number: string;
  bank_name: string;
  payment_account_id: string;
};

export type ChequeBookInput = {
  payment_account_id: string;
  bank_name: string;
  branch_name?: string | null;
  routing_number?: string | null;
  cheque_prefix: string;
  number_from: number;
  number_to: number;
  remarks?: string | null;
};

export async function fetchChequeBooks(params?: { state?: string; payment_account_id?: string }) {
  const q = new URLSearchParams();
  if (params?.state) q.set("state", params.state);
  if (params?.payment_account_id) q.set("payment_account_id", params.payment_account_id);
  const s = q.toString();
  return apiFetch<{ data: ApiChequeBook[] }>(`${BASE}/cheque-books${s ? `?${s}` : ""}`, { cache: "no-store" });
}

export async function fetchChequeBook(id: string) {
  return apiFetch<{ data: ApiChequeBookDetail }>(`${BASE}/cheque-books/${id}`, { cache: "no-store" });
}

export async function fetchAvailableChequeLeaves(paymentAccountId?: string) {
  const s = paymentAccountId ? `?payment_account_id=${encodeURIComponent(paymentAccountId)}` : "";
  return apiFetch<{ data: ApiAvailableChequeLeaf[] }>(`${BASE}/cheque-books/available-leaves${s}`, { cache: "no-store" });
}

export async function createChequeBook(input: ChequeBookInput) {
  return apiFetch<{ data: ApiChequeBookDetail }>(`${BASE}/cheque-books`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateChequeBook(id: string, input: Partial<ChequeBookInput>) {
  return apiFetch<{ data: ApiChequeBookDetail }>(`${BASE}/cheque-books/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteChequeBook(id: string) {
  return apiFetch<void>(`${BASE}/cheque-books/${id}`, { method: "DELETE" });
}

export async function generateChequeBookLeaves(id: string) {
  return apiFetch<{ data: ApiChequeBookDetail; count: number }>(`${BASE}/cheque-books/${id}/generate`, { method: "POST" });
}

export async function deleteUnusedChequeBookLeaves(id: string) {
  return apiFetch<{ data: ApiChequeBookDetail; count: number }>(`${BASE}/cheque-books/${id}/delete-unused`, { method: "POST" });
}

export async function setChequeBookState(id: string, state: ChequeBookState) {
  return apiFetch<{ data: ApiChequeBookDetail }>(`${BASE}/cheque-books/${id}/state`, {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export async function voidChequeLeaf(leafId: string, voided: boolean) {
  return apiFetch<{ data: ApiChequeBookDetail }>(`${BASE}/cheque-books/leaves/${leafId}/void`, {
    method: "POST",
    body: JSON.stringify({ void: voided }),
  });
}
