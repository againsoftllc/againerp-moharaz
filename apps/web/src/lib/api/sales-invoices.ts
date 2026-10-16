import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/sales/invoices";

export type ApiSalesInvoiceLine = {
  id: string;
  item_id: string | null;
  sort_order: number;
  name: string;
  description: string | null;
  quantity: string;
  unit_type: string;
  rate: string;
  taxable: boolean;
  line_total: string;
};

export type ApiSalesInvoice = {
  id: string;
  company_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string | null;
  project_id: string | null;
  project_name: string | null;
  status: string;
  bill_date: string;
  due_date: string | null;
  tax_rate: string;
  second_tax_rate: string;
  tds_rate: string;
  is_recurring: boolean;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  tds_total: string;
  total: string;
  amount_paid: string;
  balance: string;
  last_email_sent_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ApiSalesInvoiceLine[];
};

export type ApiSalesInvoiceLineInput = {
  item_id?: string | null;
  name: string;
  description?: string | null;
  quantity: string;
  unit_type: string;
  rate: string;
  taxable: boolean;
};

export type ApiSalesInvoiceCreate = {
  customer_id: string;
  project_id?: string | null;
  bill_date: string;
  due_date?: string | null;
  tax_rate?: string;
  second_tax_rate?: string;
  tds_rate?: string;
  is_recurring?: boolean;
  notes?: string | null;
  lines: ApiSalesInvoiceLineInput[];
};

export type ApiListMeta = { count: number; page: number; per_page: number };

export async function fetchSalesInvoices(params?: {
  status?: string;
  customer_id?: string;
  project_id?: string;
  search?: string;
  page?: number;
  per_page?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.customer_id) q.set("customer_id", params.customer_id);
  if (params?.project_id) q.set("project_id", params.project_id);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  const s = q.toString();
  return apiFetch<{ data: ApiSalesInvoice[]; meta: ApiListMeta }>(`${BASE}${s ? `?${s}` : ""}`);
}

export async function fetchSalesInvoice(id: string) {
  return apiFetch<{ data: ApiSalesInvoice }>(`${BASE}/${id}`);
}

export async function createSalesInvoice(input: ApiSalesInvoiceCreate) {
  return apiFetch<{ data: ApiSalesInvoice }>(BASE, { method: "POST", body: JSON.stringify(input) });
}

export async function updateSalesInvoice(id: string, input: Partial<ApiSalesInvoiceCreate> & { status?: string }) {
  return apiFetch<{ data: ApiSalesInvoice }>(`${BASE}/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteSalesInvoice(id: string) {
  await apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}

export async function addSalesInvoiceLine(invoiceId: string, input: ApiSalesInvoiceLineInput) {
  return apiFetch<ApiSalesInvoiceLine>(`${BASE}/${invoiceId}/lines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSalesInvoiceLine(invoiceId: string, lineId: string, input: ApiSalesInvoiceLineInput) {
  return apiFetch<ApiSalesInvoiceLine>(`${BASE}/${invoiceId}/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSalesInvoiceLine(invoiceId: string, lineId: string) {
  await apiFetch<void>(`${BASE}/${invoiceId}/lines/${lineId}`, { method: "DELETE" });
}

export type ApiSalesInvoicePayment = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export async function fetchSalesInvoicePayments(invoiceId: string) {
  return apiFetch<{ data: ApiSalesInvoicePayment[] }>(`${BASE}/${invoiceId}/payments`);
}

export async function addSalesInvoicePayment(
  invoiceId: string,
  input: { amount: string; payment_account_id?: string; payment_date?: string; reference?: string; notes?: string },
) {
  return apiFetch<ApiSalesInvoicePayment>(`${BASE}/${invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
