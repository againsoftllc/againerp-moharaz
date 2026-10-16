import { apiFetch } from "@/lib/api/client";

// ------------------------------------------------------------ order requests

export type VendorOrderRequestItem = {
  id: string;
  item_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  unit_price: string;
  quantity: number;
  discount_amount: string;
  tax_amount: string;
  line_total: string;
};

export type VendorOrderRequestAdmin = {
  id: string;
  order_request_number: string;
  vendor_id: string;
  vendor_name: string | null;
  status: string;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  payment_terms: string;
  requested_delivery_date: string | null;
  delivery_address: string | null;
  vendor_note: string | null;
  internal_note: string | null;
  requires_credit_approval: boolean;
  created_at: string;
  updated_at: string;
  items: VendorOrderRequestItem[];
};

export async function fetchOrderRequests(params?: {
  vendor_id?: string;
  status?: string;
}): Promise<VendorOrderRequestAdmin[]> {
  const search = new URLSearchParams();
  if (params?.vendor_id) search.set("vendor_id", params.vendor_id);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  const res = await apiFetch<{ data: VendorOrderRequestAdmin[]; total: number }>(
    `/api/v1/vendors/order-requests${qs ? `?${qs}` : ""}`,
  );
  return res.data;
}

export async function fetchOrderRequest(id: string): Promise<VendorOrderRequestAdmin> {
  const res = await apiFetch<{ data: VendorOrderRequestAdmin }>(`/api/v1/vendors/order-requests/${id}`);
  return res.data;
}

export async function updateOrderRequest(
  id: string,
  payload: { internal_note?: string; vendor_note?: string; shipping_amount?: number },
): Promise<VendorOrderRequestAdmin> {
  const res = await apiFetch<{ data: VendorOrderRequestAdmin }>(`/api/v1/vendors/order-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function transitionOrderRequest(
  id: string,
  status: string,
  note?: string,
): Promise<VendorOrderRequestAdmin> {
  const res = await apiFetch<{ data: VendorOrderRequestAdmin }>(`/api/v1/vendors/order-requests/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
  return res.data;
}

export async function createOrderRequestByAdmin(payload: {
  vendor_id: string;
  payment_terms?: string;
  requested_delivery_date?: string;
  delivery_address?: string;
  vendor_note?: string;
  internal_note?: string;
  items: {
    item_id: string;
    unit_price: number;
    quantity: number;
    discount_amount?: number;
    tax_amount?: number;
  }[];
}): Promise<VendorOrderRequestAdmin> {
  const res = await apiFetch<{ data: VendorOrderRequestAdmin }>(`/api/v1/vendors/order-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function createQuotationFromOrderRequest(
  orderRequestId: string,
  payload?: { delivery_terms?: string; valid_until?: string; notes?: string },
): Promise<{ id: string; quotation_number: string }> {
  const res = await apiFetch<{ data: { id: string; quotation_number: string } }>(
    `/api/v1/vendors/order-requests/${orderRequestId}/quotation`,
    { method: "POST", body: JSON.stringify(payload ?? {}) },
  );
  return res.data;
}

// ----------------------------------------------------------------- credit

export type VendorCreditSummary = {
  credit_limit: string;
  outstanding: string;
  overdue: string;
  available_credit: string;
  utilization_percent: string;
  exceeded: boolean;
};

export async function fetchVendorCredit(vendorId: string): Promise<VendorCreditSummary> {
  const res = await apiFetch<{ data: VendorCreditSummary }>(`/api/v1/vendors/${vendorId}/credit`);
  return res.data;
}

// -------------------------------------------------------------- analytics

export type VendorAnalyticsOverview = {
  total_vendors: number;
  active_vendors: number;
  new_vendors_30d: number;
  active_order_requests: number;
  total_revenue: string;
  average_order_value: string;
  order_count: number;
  cancellation_rate: string;
  total_outstanding: string;
  dormant_vendors: number;
};

export async function fetchAnalyticsOverview(days?: number): Promise<VendorAnalyticsOverview> {
  const qs = days ? `?days=${days}` : "";
  const res = await apiFetch<{ data: VendorAnalyticsOverview }>(`/api/v1/vendors/analytics/overview${qs}`);
  return res.data;
}

export type VendorRankRow = {
  vendor_id: string;
  vendor_name: string;
  revenue: string;
  order_count: number;
};

export async function fetchVendorRanking(days?: number): Promise<VendorRankRow[]> {
  const qs = days ? `?days=${days}` : "";
  const res = await apiFetch<{ data: VendorRankRow[] }>(`/api/v1/vendors/analytics/ranking${qs}`);
  return res.data;
}
