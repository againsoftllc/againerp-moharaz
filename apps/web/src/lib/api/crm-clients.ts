import { apiFetch } from "@/lib/api/client";

const BASE = "/api/v1/commerce/customers";

export type ApiClient = {
  id: string;
  customer_code: string;
  name: string;
  email: string;
  phone: string;
  group: string;
  status: string;
  city: string;
  created_at: string;
};

export async function fetchClients(params?: { search?: string; group?: string }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.group && params.group !== "all") q.set("group", params.group);
  const s = q.toString();
  return apiFetch<{ data: ApiClient[]; meta: { count: number } }>(`${BASE}${s ? `?${s}` : ""}`);
}

export async function fetchClient(id: string) {
  return apiFetch<{ data: ApiClient }>(`${BASE}/${id}`);
}

export type ApiClientCrmSummary = {
  customer_id: string;
  primary_contact_name: string | null;
  contact_count: number;
  project_count: number;
  label_names: string[];
  total_invoiced: string;
  payment_received: string;
  due: string;
};

export async function fetchClientsCrmSummary() {
  return apiFetch<{ data: ApiClientCrmSummary[] }>(`${BASE}/crm-summary`);
}

export type ApiClientContact = {
  id: string;
  company_id: string;
  customer_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchClientContacts(customerId: string) {
  return apiFetch<{ data: ApiClientContact[] }>(`${BASE}/${customerId}/contacts`);
}

export async function createClientContact(
  customerId: string,
  input: { name: string; title?: string; email?: string; phone?: string; is_primary?: boolean },
) {
  return apiFetch<{ data: ApiClientContact }>(`${BASE}/${customerId}/contacts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateClientContact(
  customerId: string,
  contactId: string,
  input: Partial<{ name: string; title: string; email: string; phone: string; is_primary: boolean }>,
) {
  return apiFetch<{ data: ApiClientContact }>(`${BASE}/${customerId}/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteClientContact(customerId: string, contactId: string) {
  await apiFetch<void>(`${BASE}/${customerId}/contacts/${contactId}`, { method: "DELETE" });
}

export type ApiClientEstimate = {
  id: string;
  quotation_number: string;
  status: string;
  quote_date: string;
  valid_until: string | null;
  total: string;
};

export async function fetchClientEstimates(customerId: string) {
  return apiFetch<{ data: ApiClientEstimate[]; meta: { count: number } }>(
    `/api/v1/sales/quotations?customer_id=${customerId}`,
  );
}

export type ApiClientOrder = {
  id: string;
  order_number: string;
  date: string;
  product_label: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  payment_status: string;
  source: string;
};

export async function fetchClientOrders(customerId: string) {
  return apiFetch<{ data: ApiClientOrder[] }>(`${BASE}/${customerId}/orders`);
}
