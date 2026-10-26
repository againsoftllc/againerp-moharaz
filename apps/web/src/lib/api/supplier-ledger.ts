import { apiFetch } from "@/lib/api/client";

export type LedgerEntryKind = "payable" | "payment";

export type ApiLedgerEntry = {
  id: string;
  kind: LedgerEntryKind;
  entry_date: string | null;
  reference: string;
  source_type: string | null;
  source_id: string | null;
  debit: string;
  credit: string;
  balance: string;
  /** Still unpaid on this bill. Zero on payment rows. */
  due?: string;
  status: string | null;
  due_date: string | null;
  notes: string | null;
  payment_method: string | null;
  location: string | null;
  created_at: string;
};

export type ApiLedgerSummary = {
  opening_balance?: string;
  billed_total: string;
  paid_total: string;
  outstanding: string;
  advance?: string;
  overdue: string;
  open_bill_count: number;
  ageing: {
    current: string;
    days_30: string;
    days_60: string;
    days_90_plus: string;
  };
};

export type SupplierLedger = {
  entries: ApiLedgerEntry[];
  summary: ApiLedgerSummary;
};

export async function fetchSupplierLedger(supplierId: string): Promise<SupplierLedger> {
  const res = await apiFetch<{ data: ApiLedgerEntry[]; meta: ApiLedgerSummary }>(
    `/api/v1/commerce/suppliers/${encodeURIComponent(supplierId)}/ledger`,
  );
  return { entries: res.data, summary: res.meta };
}

export type RecordPaymentInput = {
  amount: number;
  paymentDate?: string;
  paymentMethod?: string;
  paymentAccountId?: string;
  reference?: string;
  notes?: string;
  payableId?: string;
  writeOffAmount?: number;
  writeOffReason?: string;
  /** "inbound" = a refund received from the supplier (the return due); default is a payment to the supplier. */
  direction?: "outbound" | "inbound";
};

export type ApiSupplierPayment = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  applied_to: string[];
  write_off_amount: string | null;
  direction?: "outbound" | "inbound" | string;
  created_at: string;
};

export async function fetchSupplierPayments(
  supplierId: string,
  options: { reference?: string } = {},
): Promise<ApiSupplierPayment[]> {
  const params = new URLSearchParams();
  if (options.reference) params.set("reference", options.reference);
  const qs = params.toString();
  const res = await apiFetch<{ data: ApiSupplierPayment[] }>(
    `/api/v1/commerce/suppliers/${encodeURIComponent(supplierId)}/payments${qs ? `?${qs}` : ""}`,
  );
  return res.data;
}

export async function deleteSupplierPayment(supplierId: string, paymentId: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/commerce/suppliers/${encodeURIComponent(supplierId)}/payments/${encodeURIComponent(paymentId)}`,
    { method: "DELETE" },
  );
}

export async function recordSupplierPayment(
  supplierId: string,
  input: RecordPaymentInput,
): Promise<ApiSupplierPayment> {
  const res = await apiFetch<{ data: ApiSupplierPayment }>(
    `/api/v1/commerce/suppliers/${encodeURIComponent(supplierId)}/payments`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        payment_date: input.paymentDate || undefined,
        payment_method: input.paymentMethod || "bank",
        payment_account_id: input.paymentAccountId || undefined,
        reference: input.reference || undefined,
        notes: input.notes || undefined,
        payable_id: input.payableId || undefined,
        write_off_amount: input.writeOffAmount || undefined,
        write_off_reason: input.writeOffReason || undefined,
        direction: input.direction || undefined,
      }),
    },
  );
  return res.data;
}
