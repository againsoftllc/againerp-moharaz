import type { OrderpointTrigger, StockOrderpoint } from "@/lib/stock/stock-orderpoint";
import { apiFetch } from "@/lib/api/client";
import { orderpointWithLabels } from "@/lib/stock/stock-orderpoint";

export type ApiOrderpoint = {
  id: string;
  company_id: string;
  product_id?: string | null;
  product_name: string;
  qty_on_hand: number | string;
  qty_forecast: number | string;
  route_name: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  trigger: OrderpointTrigger;
  product_min_qty: number | string;
  product_max_qty: number | string;
  qty_multiple: number | string;
  qty_to_order: number | string;
  deadline?: string | null;
  snoozed: boolean;
  deadline_label?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiOrderpointListResponse = {
  data: ApiOrderpoint[];
  meta: { count: number };
};

export type ApiOrderpointResponse = {
  data: ApiOrderpoint;
};

export type ReplenishmentListParams = {
  search?: string;
  to_reorder?: boolean;
  not_snoozed?: boolean;
};

export type UpdateOrderpointInput = {
  vendor_id?: string | null;
  vendor_name?: string | null;
  trigger?: OrderpointTrigger;
  product_min_qty?: number;
  product_max_qty?: number;
  qty_multiple?: number;
  qty_to_order?: number;
  deadline?: string | null;
  snoozed?: boolean;
};

function num(v: number | string): number {
  return Number(v);
}

export function apiOrderpointToOrderpoint(row: ApiOrderpoint): StockOrderpoint {
  return orderpointWithLabels({
    id: row.id,
    company_id: row.company_id,
    product_id: row.product_id ?? null,
    product_name: row.product_name,
    qty_on_hand: num(row.qty_on_hand),
    qty_forecast: num(row.qty_forecast),
    route_name: row.route_name,
    vendor_id: row.vendor_id ?? null,
    vendor_name: row.vendor_name ?? "",
    trigger: row.trigger,
    product_min_qty: num(row.product_min_qty),
    product_max_qty: num(row.product_max_qty),
    qty_multiple: num(row.qty_multiple),
    qty_to_order: num(row.qty_to_order),
    deadline: row.deadline ?? null,
    snoozed: row.snoozed,
    deadline_label: row.deadline_label,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function buildReplenishmentQuery(params?: ReplenishmentListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.to_reorder) q.set("to_reorder", "true");
  if (params.not_snoozed) q.set("not_snoozed", "true");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchReplenishment(
  params?: ReplenishmentListParams,
): Promise<StockOrderpoint[]> {
  const res = await apiFetch<ApiOrderpointListResponse>(
    `/api/v1/inventory/replenishment${buildReplenishmentQuery(params)}`,
  );
  return res.data.map(apiOrderpointToOrderpoint);
}

export async function patchOrderpoint(
  id: string,
  input: UpdateOrderpointInput,
): Promise<StockOrderpoint> {
  const res = await apiFetch<ApiOrderpointResponse>(`/api/v1/inventory/replenishment/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return apiOrderpointToOrderpoint(res.data);
}
