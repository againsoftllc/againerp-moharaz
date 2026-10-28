import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/finance";

export type ApiBankBranch = {
  id: string;
  bank_id: string;
  name: string;
  routing_number: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
};

export type ApiBank = {
  id: string;
  name: string;
  short_name: string | null;
  swift_code: string | null;
  is_active: boolean;
  branches: ApiBankBranch[];
  /** the company's own bank accounts at this bank */
  account_count: number;
};

export type BankInput = { name?: string; short_name?: string | null; swift_code?: string | null; is_active?: boolean };
export type BankBranchInput = { name?: string; routing_number?: string | null; address?: string | null; phone?: string | null; is_active?: boolean };

export async function fetchBanks() {
  return apiFetch<{ data: ApiBank[] }>(`${BASE}/banks`);
}

export async function createBank(input: BankInput) {
  return apiFetch<{ data: ApiBank }>(`${BASE}/banks`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateBank(id: string, input: BankInput) {
  return apiFetch<{ data: ApiBank }>(`${BASE}/banks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function createBankBranch(bankId: string, input: BankBranchInput) {
  return apiFetch<{ data: ApiBank }>(`${BASE}/banks/${encodeURIComponent(bankId)}/branches`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBankBranch(id: string, input: BankBranchInput) {
  return apiFetch<{ data: ApiBank }>(`${BASE}/bank-branches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type ApiOpeningLine = {
  id: string;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  debit: string;
  credit: string;
  cost_center_id: string | null;
  description: string | null;
};

export type ApiOpeningBatch = {
  id: string;
  as_of_date: string;
  note: string | null;
  status: "draft" | "finalized";
  total_debit: string;
  total_credit: string;
  /** debit − credit: posted to Opening Balance Equity on finalize */
  difference: string;
  journal_entry_id: string | null;
  journal_entry_number: string | null;
  created_by: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  lines: ApiOpeningLine[];
};

export type OpeningBatchInput = {
  as_of_date: string;
  note?: string | null;
  lines: { account_id: string; debit: string; credit: string; cost_center_id?: string | null; description?: string | null }[];
};

/** Batches, and the GL codes whose opening comes from somewhere else (code → where). */
export async function fetchOpeningBatches() {
  return apiFetch<{ data: ApiOpeningBatch[]; restricted: Record<string, string> }>(`${BASE}/opening-balances`);
}

export async function createOpeningBatch(input: OpeningBatchInput) {
  return apiFetch<{ data: ApiOpeningBatch }>(`${BASE}/opening-balances`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateOpeningBatch(id: string, input: OpeningBatchInput) {
  return apiFetch<{ data: ApiOpeningBatch }>(`${BASE}/opening-balances/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteOpeningBatch(id: string) {
  return apiFetch<void>(`${BASE}/opening-balances/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Post the batch (one journal; the difference to Opening Balance Equity) and lock it. */
export async function finalizeOpeningBatch(id: string) {
  return apiFetch<{ data: ApiOpeningBatch }>(`${BASE}/opening-balances/${encodeURIComponent(id)}/finalize`, { method: "POST" });
}
