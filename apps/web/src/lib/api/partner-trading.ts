import { apiFetch } from "@/lib/api/client";

export type ApiPartnerTrading = {
  purchase_total: string | number;
  sales_total: string | number;
  purchase_profit: string | number;
  sales_profit: string | number;
};

export async function fetchPartnerTrading(params: {
  customerId?: string;
  supplierId?: string;
}): Promise<ApiPartnerTrading> {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set("customer_id", params.customerId);
  if (params.supplierId) qs.set("supplier_id", params.supplierId);
  const query = qs.toString();
  const res = await apiFetch<{ data: ApiPartnerTrading }>(
    `/api/v1/finance/partner-trading${query ? `?${query}` : ""}`,
  );
  return res.data;
}
