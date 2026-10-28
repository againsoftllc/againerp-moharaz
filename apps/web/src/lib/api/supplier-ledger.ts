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

/** One line of the supplier statement. Cr raises what we owe (bills), Dr lowers it (payments). */
export type ApiSupplierStatementLine = {
  id: string;
  date: string;
  transaction_type: string;
  particular: string;
  transaction_no: string | null;
  debit: string;
  credit: string;
  /** Cr − Dr after this line: positive means we owe the supplier. */
  balance: string;
  source_type: string | null;
  source_id: string | null;
  journal_entry_id: string | null;
  status: string | null;
  due_date: string | null;
};

export type ApiSupplierStatement = {
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    country: string | null;
    currency: string | null;
    payment_terms: string | null;
  };
  date_from: string;
  date_to: string;
  opening_balance: string;
  lines: ApiSupplierStatementLine[];
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  transaction_summary: Array<{ transaction_type: string; count: number; debit: string; credit: string }>;
  credit_summary: {
    /** The statement's closing balance (Cr-positive: positive = we owe). */
    ledger_balance: string;
    /** Issued cheques already on the ledger as paid but not honoured: not treated + presented. */
    adv_cheque_issued: string;
    not_treated: string;
    presented: string;
    /** Dishonoured cheques still open — already back on the ledger, so not deducted again. */
    dishonoured: string;
    net_outstanding: string;
    unsettled_order_balance: string;
    net_outstanding_with_orders: string;
    credit_limit: string;
    available_credit: string | null;
    credit_allowed_days: number | null;
    open_orders: Array<{ id: string; po_number: string; order_date: string; status: string; total: string; unreceived: string }>;
  };
  /** Issued cheques not honoured on the statement's last day (not treated, presented or dishonoured). */
  pending_cheques: Array<{
    id: string;
    cheque_number: string;
    cheque_date: string;
    bank_name: string;
    amount: string;
    status: "issued" | "presented" | "bounced";
    status_date: string;
    document_number: string | null;
  }>;
};

/** Supplier statement for a period (OnerERP Reports › Ledger › Supplier): opening, lines, total, credit summary. */
export async function fetchSupplierStatement(
  supplierId: string,
  params: { date_from: string; date_to: string },
): Promise<ApiSupplierStatement> {
  const q = new URLSearchParams(params);
  const res = await apiFetch<{ data: ApiSupplierStatement }>(
    `/api/v1/commerce/suppliers/${encodeURIComponent(supplierId)}/statement?${q.toString()}`,
  );
  return res.data;
}

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
