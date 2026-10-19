import { apiFetch } from "@/lib/api/client";

export type BillType = "subscription" | "module" | "plugin";
export type BillStatus = "unpaid" | "paid" | "cancelled";

export type ErpBill = {
  id: string;
  bill_number: string;
  bill_type: BillType;
  title: string;
  description: string | null;
  reference: string | null;
  period_label: string | null;
  amount: string;
  currency: string;
  status: BillStatus;
  is_overdue: boolean;
  due_date: string | null;
  issued_at: string | null;
  paid_at: string | null;
  paid_method: string | null;
  paid_ref: string | null;
  pay_token: string;
};

export type BillingSummary = {
  unpaid_count: number;
  unpaid_total: string;
  overdue_count: number;
  overdue_total: string;
  paid_count: number;
  paid_total: string;
  currency: string;
};

export type BillingGatewaySettings = {
  gateway: "sslcommerz";
  store_id: string;
  store_password_set: boolean;
  environment: "sandbox" | "production";
  ready: boolean;
};

export type BillInput = {
  bill_type: BillType;
  title: string;
  description?: string;
  reference?: string;
  period_label?: string;
  amount: number;
  currency?: string;
  due_date?: string | null;
};

const BASE = "/api/v1/billing";

export const BILL_TYPE_LABEL: Record<BillType, string> = {
  subscription: "Subscription",
  module: "Module",
  plugin: "Plugin",
};

/** The link a customer opens to pay one bill (served by this admin app). */
export function billPayUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/pay/${token}`;
}

export async function fetchBills(params: { type?: BillType; status?: string; q?: string } = {}): Promise<ErpBill[]> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("bill_type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  const res = await apiFetch<{ data: ErpBill[] }>(`${BASE}/bills${qs.size ? `?${qs}` : ""}`, { cache: "no-store" });
  return res.data;
}

export async function fetchBillingSummary(): Promise<BillingSummary> {
  const res = await apiFetch<{ data: BillingSummary }>(`${BASE}/summary`, { cache: "no-store" });
  return res.data;
}

export async function createBill(input: BillInput): Promise<ErpBill> {
  const res = await apiFetch<{ data: ErpBill }>(`${BASE}/bills`, { method: "POST", body: JSON.stringify(input) });
  return res.data;
}

export async function updateBill(id: string, input: Partial<Omit<BillInput, "bill_type" | "currency">>): Promise<ErpBill> {
  const res = await apiFetch<{ data: ErpBill }>(`${BASE}/bills/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  return res.data;
}

export async function cancelBill(id: string): Promise<ErpBill> {
  const res = await apiFetch<{ data: ErpBill }>(`${BASE}/bills/${id}/cancel`, { method: "POST" });
  return res.data;
}

export async function markBillPaid(id: string, input: { method: string; reference?: string }): Promise<ErpBill> {
  const res = await apiFetch<{ data: ErpBill }>(`${BASE}/bills/${id}/mark-paid`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function regeneratePayLink(id: string): Promise<ErpBill> {
  const res = await apiFetch<{ data: ErpBill }>(`${BASE}/bills/${id}/new-link`, { method: "POST" });
  return res.data;
}

export async function fetchGatewaySettings(): Promise<BillingGatewaySettings> {
  const res = await apiFetch<{ data: BillingGatewaySettings }>(`${BASE}/settings`, { cache: "no-store" });
  return res.data;
}

export async function saveGatewaySettings(input: {
  store_id?: string;
  store_password?: string;
  environment?: "sandbox" | "production";
}): Promise<BillingGatewaySettings> {
  const res = await apiFetch<{ data: BillingGatewaySettings }>(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function verifyGateway(): Promise<{ status: string; message: string }> {
  const res = await apiFetch<{ data: { status: string; message: string } }>(`${BASE}/settings/verify`, {
    method: "POST",
  });
  return res.data;
}

/* ------------------------------------------------------------------ public pay link (no sign-in) */

export type PublicBill = Omit<ErpBill, "pay_token"> & { company_name: string; gateway_ready: boolean };

export async function fetchPublicBill(token: string): Promise<PublicBill | null> {
  const res = await fetch(`/api/v1/public/billing/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { data: PublicBill }).data;
}

export async function startPublicPayment(token: string): Promise<string> {
  const res = await fetch(`/api/v1/public/billing/${encodeURIComponent(token)}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ return_origin: window.location.origin }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { gateway_url?: string }; detail?: string };
  if (!res.ok || !body.data?.gateway_url) throw new Error(body.detail || "Could not start the payment");
  return body.data.gateway_url;
}
