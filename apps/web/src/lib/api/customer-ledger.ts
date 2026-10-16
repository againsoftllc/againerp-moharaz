import { apiFetch } from "@/lib/api/client";

export type CustomerLedgerEntryKind = "receivable" | "payment";

export type ApiCustomerLedgerEntry = {
  id: string;
  kind: CustomerLedgerEntryKind;
  entry_date: string | null;
  reference: string;
  source_type: string | null;
  source_id: string | null;
  debit: string;
  credit: string;
  balance: string;
  due?: string;
  status: string | null;
  due_date: string | null;
  notes: string | null;
  payment_method: string | null;
  location: string | null;
  created_at: string;
};

export type ApiCustomerLedgerSummary = {
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

export type CustomerLedger = {
  entries: ApiCustomerLedgerEntry[];
  summary: ApiCustomerLedgerSummary;
};

export async function fetchCustomerLedger(customerId: string): Promise<CustomerLedger> {
  const res = await apiFetch<{ data: ApiCustomerLedgerEntry[]; meta: ApiCustomerLedgerSummary }>(
    `/api/v1/commerce/customers/${encodeURIComponent(customerId)}/ledger`,
  );
  return { entries: res.data, summary: res.meta };
}

export type RecordCustomerPaymentInput = {
  amount: number;
  paymentDate?: string;
  paymentMethod?: string;
  paymentAccountId?: string;
  reference?: string;
  notes?: string;
  receivableId?: string;
  /** Invoices to settle, in this order; leftover goes to other open invoices
   * oldest-first, then stays as customer advance. */
  receivableIds?: string[];
  writeOffAmount?: number;
  writeOffReason?: string;
};

export type ApiCustomerPaymentAllocation = {
  receivable_id: string;
  invoice_number: string;
  order_id: string | null;
  amount: string;
};

export type ApiCustomerLedgerPayment = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  applied_to: string[];
  write_off_amount: string | null;
  created_at: string;
  allocations: ApiCustomerPaymentAllocation[];
};

export async function recordCustomerLedgerPayment(
  customerId: string,
  input: RecordCustomerPaymentInput,
): Promise<ApiCustomerLedgerPayment> {
  const res = await apiFetch<{ data: ApiCustomerLedgerPayment }>(
    `/api/v1/commerce/customers/${encodeURIComponent(customerId)}/ledger/payments`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        payment_date: input.paymentDate || undefined,
        payment_method: input.paymentMethod || "bank",
        payment_account_id: input.paymentAccountId || undefined,
        reference: input.reference || undefined,
        notes: input.notes || undefined,
        receivable_id: input.receivableId || undefined,
        receivable_ids: input.receivableIds?.length ? input.receivableIds : undefined,
        write_off_amount: input.writeOffAmount || undefined,
        write_off_reason: input.writeOffReason || undefined,
      }),
    },
  );
  return res.data;
}

export type RaiseCustomerInvoiceInput = {
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  reference?: string;
  notes?: string;
};

export type ApiCustomerInvoice = {
  id: string;
  invoice_number: string;
  amount: string;
  due_date: string | null;
  status: string;
  created_at: string;
};

export async function raiseCustomerInvoice(
  customerId: string,
  input: RaiseCustomerInvoiceInput,
): Promise<ApiCustomerInvoice> {
  const res = await apiFetch<{ data: ApiCustomerInvoice }>(
    `/api/v1/commerce/customers/${encodeURIComponent(customerId)}/ledger/invoices`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        invoice_date: input.invoiceDate || undefined,
        due_date: input.dueDate || undefined,
        reference: input.reference || undefined,
        notes: input.notes || undefined,
      }),
    },
  );
  return res.data;
}
