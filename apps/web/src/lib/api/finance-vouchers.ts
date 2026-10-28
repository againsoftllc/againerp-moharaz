import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/finance";

/** debit = paid out of cash / bank, credit = received into cash / bank, contra = cash <-> bank, journal = any heads. */
export type VoucherType = "debit" | "credit" | "contra" | "journal";
export type VoucherStatus = "draft" | "approved" | "cancelled";

export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  debit: "Debit / Payment",
  credit: "Credit / Receive",
  contra: "Contra",
  journal: "Journal",
};

export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  cancelled: "Cancelled",
};

export type ApiVoucherLine = {
  id: string;
  line_no: number;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  description: string | null;
  debit: string;
  credit: string;
  cost_center_id: string | null;
};

export type ApiVoucher = {
  id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  description: string;
  reference: string | null;
  payment_account_id: string | null;
  payment_account_name: string | null;
  to_payment_account_id: string | null;
  to_payment_account_name: string | null;
  amount: string;
  status: VoucherStatus;
  template_id: string | null;
  journal_entry_id: string | null;
  journal_entry_number: string | null;
  reversal_entry_id: string | null;
  reversal_entry_number: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  lines: ApiVoucherLine[];
};

export type VoucherLineInput = {
  account_id: string;
  description?: string | null;
  debit: string;
  credit: string;
  cost_center_id?: string | null;
};

export type VoucherInput = {
  voucher_type: VoucherType;
  voucher_date?: string;
  description?: string;
  reference?: string | null;
  payment_account_id?: string | null;
  to_payment_account_id?: string | null;
  amount?: string;
  template_id?: string | null;
  lines: VoucherLineInput[];
};

export type ApiVoucherTemplate = {
  id: string;
  name: string;
  voucher_type: VoucherType;
  description: string;
  payment_account_id: string | null;
  payment_account_name: string | null;
  to_payment_account_id: string | null;
  to_payment_account_name: string | null;
  amount: string;
  is_active: boolean;
  created_at: string;
  lines: ApiVoucherLine[];
};

export type VoucherTemplateInput = {
  name: string;
  voucher_type: VoucherType;
  description?: string;
  payment_account_id?: string | null;
  to_payment_account_id?: string | null;
  amount?: string;
  is_active?: boolean;
  lines: VoucherLineInput[];
};

export async function fetchVouchers(params: { voucher_type?: VoucherType; status?: VoucherStatus; limit?: number } = {}) {
  const q = new URLSearchParams();
  if (params.voucher_type) q.set("voucher_type", params.voucher_type);
  if (params.status) q.set("status", params.status);
  q.set("limit", String(params.limit ?? 500));
  return apiFetch<{ data: ApiVoucher[]; meta: { total: number } }>(`${BASE}/vouchers?${q.toString()}`);
}

export async function fetchVoucher(id: string) {
  return apiFetch<{ data: ApiVoucher }>(`${BASE}/vouchers/${encodeURIComponent(id)}`);
}

export async function createVoucher(input: VoucherInput) {
  return apiFetch<{ data: ApiVoucher }>(`${BASE}/vouchers`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateVoucher(id: string, input: Partial<Omit<VoucherInput, "voucher_type" | "template_id">>) {
  return apiFetch<{ data: ApiVoucher }>(`${BASE}/vouchers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteVoucher(id: string) {
  return apiFetch<void>(`${BASE}/vouchers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function approveVoucher(id: string) {
  return apiFetch<{ data: ApiVoucher }>(`${BASE}/vouchers/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export async function cancelVoucher(id: string, reason: string) {
  return apiFetch<{ data: ApiVoucher }>(`${BASE}/vouchers/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function fetchVoucherTemplates(params: { voucher_type?: VoucherType; activeOnly?: boolean } = {}) {
  const q = new URLSearchParams();
  if (params.voucher_type) q.set("voucher_type", params.voucher_type);
  if (params.activeOnly) q.set("include_inactive", "false");
  const s = q.toString();
  return apiFetch<{ data: ApiVoucherTemplate[] }>(`${BASE}/voucher-templates${s ? `?${s}` : ""}`);
}

export async function createVoucherTemplate(input: VoucherTemplateInput) {
  return apiFetch<{ data: ApiVoucherTemplate }>(`${BASE}/voucher-templates`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateVoucherTemplate(id: string, input: Partial<Omit<VoucherTemplateInput, "voucher_type">>) {
  return apiFetch<{ data: ApiVoucherTemplate }>(`${BASE}/voucher-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteVoucherTemplate(id: string) {
  return apiFetch<void>(`${BASE}/voucher-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
