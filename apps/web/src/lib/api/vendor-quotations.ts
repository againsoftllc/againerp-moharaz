import { apiFetch } from "@/lib/api/client";

export type VendorQuotationItem = {
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

export type VendorQuotation = {
  id: string;
  quotation_number: string;
  order_request_id: string;
  vendor_id: string;
  vendor_name: string | null;
  status: string;
  revision_number: number;
  previous_quotation_id: string | null;
  superseded_by_id: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_amount: string;
  grand_total: string;
  payment_terms: string;
  delivery_terms: string;
  valid_until: string | null;
  notes: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  items: VendorQuotationItem[];
};

export async function fetchQuotations(params?: { vendor_id?: string; status?: string }): Promise<VendorQuotation[]> {
  const search = new URLSearchParams();
  if (params?.vendor_id) search.set("vendor_id", params.vendor_id);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  const res = await apiFetch<{ data: VendorQuotation[]; total: number }>(
    `/api/v1/vendors/quotations${qs ? `?${qs}` : ""}`,
  );
  return res.data;
}

export async function fetchQuotation(id: string): Promise<VendorQuotation> {
  const res = await apiFetch<{ data: VendorQuotation }>(`/api/v1/vendors/quotations/${id}`);
  return res.data;
}

export async function transitionQuotation(id: string, status: string): Promise<VendorQuotation> {
  const res = await apiFetch<{ data: VendorQuotation }>(`/api/v1/vendors/quotations/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  return res.data;
}

export async function convertQuotationToOrder(id: string): Promise<{ id: string; order_number: string }> {
  const res = await apiFetch<{ data: { id: string; order_number: string } }>(
    `/api/v1/vendors/quotations/${id}/convert-to-order`,
    { method: "POST" },
  );
  return res.data;
}

export type VendorNegotiation = {
  id: string;
  quotation_id: string;
  vendor_id: string;
  request_type: string;
  message: string;
  requested_price: string | null;
  requested_quantity: number | null;
  requested_delivery_date: string | null;
  requested_payment_terms: string | null;
  status: string;
  admin_response: string | null;
  resulting_quotation_id: string | null;
  created_at: string;
};

export async function fetchNegotiations(quotationId: string): Promise<VendorNegotiation[]> {
  const res = await apiFetch<{ data: VendorNegotiation[] }>(`/api/v1/vendors/quotations/${quotationId}/negotiations`);
  return res.data;
}

export async function declineNegotiation(negotiationId: string, adminResponse: string): Promise<VendorNegotiation> {
  const res = await apiFetch<{ data: VendorNegotiation }>(`/api/v1/vendors/negotiations/${negotiationId}/decline`, {
    method: "POST",
    body: JSON.stringify({ admin_response: adminResponse }),
  });
  return res.data;
}

export async function reviseQuotation(
  id: string,
  payload: {
    negotiation_id?: string;
    items?: {
      item_id: string;
      sku_snapshot: string;
      name_snapshot: string;
      unit_price: number;
      quantity: number;
    }[];
  },
): Promise<VendorQuotation> {
  const res = await apiFetch<{ data: VendorQuotation }>(`/api/v1/vendors/quotations/${id}/revise`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}
