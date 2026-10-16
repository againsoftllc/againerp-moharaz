import type { StockQuant } from "@/lib/stock/stock-quant";
import { apiFetch } from "@/lib/api/client";
import { quantWithLabels } from "@/lib/stock/stock-quant";

export type ApiStockQuant = {
  id: string;
  company_id: string;
  product_id?: string | null;
  product_name: string;
  product_categ_id?: string | null;
  product_categ_name?: string | null;
  lot_id?: string | null;
  lot_name?: string | null;
  location_id?: string | null;
  quantity: number | string;
  inventory_quantity?: number | string | null;
  inventory_diff_quantity?: number | string | null;
  inventory_date?: string | null;
  scheduled_date?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  accounting_date?: string | null;
  inventory_date_label?: string | null;
  scheduled_date_label?: string | null;
  accounting_date_label?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiStockQuantListResponse = {
  data: ApiStockQuant[];
  meta: { count: number };
};

export type ApiStockQuantResponse = {
  data: ApiStockQuant;
};

export type ApiStockQuantApplyAllResponse = {
  applied: number;
};

export type StockQuantListParams = {
  search?: string;
};

export type UpdateStockQuantInput = {
  inventory_quantity?: number | null;
  user_id?: string | null;
  user_name?: string | null;
  scheduled_date?: string | null;
  accounting_date?: string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  return Number(v);
}

export function apiQuantToQuant(row: ApiStockQuant): StockQuant {
  return quantWithLabels({
    id: row.id,
    company_id: row.company_id,
    product_id: row.product_id ?? null,
    product_name: row.product_name,
    product_categ_id: row.product_categ_id ?? null,
    product_categ_name: row.product_categ_name ?? "",
    lot_id: row.lot_id ?? null,
    lot_name: row.lot_name ?? "",
    location_id: row.location_id ?? null,
    quantity: Number(row.quantity),
    inventory_quantity: num(row.inventory_quantity),
    inventory_diff_quantity: num(row.inventory_diff_quantity),
    inventory_date: row.inventory_date ?? null,
    scheduled_date: row.scheduled_date ?? null,
    user_id: row.user_id ?? null,
    user_name: row.user_name ?? "",
    accounting_date: row.accounting_date ?? null,
    inventory_date_label: row.inventory_date_label,
    scheduled_date_label: row.scheduled_date_label,
    accounting_date_label: row.accounting_date_label,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function buildStockQuantQuery(params?: StockQuantListParams): string {
  if (!params?.search) return "";
  return `?search=${encodeURIComponent(params.search)}`;
}

export async function fetchStockQuants(params?: StockQuantListParams): Promise<StockQuant[]> {
  const res = await apiFetch<ApiStockQuantListResponse>(
    `/api/v1/inventory/quants${buildStockQuantQuery(params)}`,
  );
  return res.data.map(apiQuantToQuant);
}

export async function patchStockQuant(
  id: string,
  input: UpdateStockQuantInput,
): Promise<StockQuant> {
  const res = await apiFetch<ApiStockQuantResponse>(`/api/v1/inventory/quants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return apiQuantToQuant(res.data);
}

export async function applyAllStockQuants(): Promise<number> {
  const res = await apiFetch<ApiStockQuantApplyAllResponse>("/api/v1/inventory/quants/apply-all", {
    method: "POST",
  });
  return res.applied;
}
