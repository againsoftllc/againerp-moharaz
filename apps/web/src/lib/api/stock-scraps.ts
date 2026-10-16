import type { StockScrap, StockScrapState } from "@/lib/stock/stock-scrap";
import { apiFetch } from "@/lib/api/client";
import { scrapWithLabels } from "@/lib/stock/stock-scrap";

export type ApiStockScrap = {
  id: string;
  company_id: string;
  name: string;
  date: string;
  product_id?: string | null;
  product_name: string;
  scrap_qty: number | string;
  location_id?: string | null;
  state: StockScrapState;
  date_label?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiStockScrapListResponse = {
  data: ApiStockScrap[];
  meta: { count: number };
};

export type ApiStockScrapResponse = {
  data: ApiStockScrap;
};

export type StockScrapListParams = {
  search?: string;
};

export type UpdateStockScrapInput = {
  product_id?: string | null;
  product_name?: string | null;
  scrap_qty?: number;
  date?: string;
  location_id?: string | null;
  state?: StockScrapState;
};

export function apiScrapToScrap(row: ApiStockScrap): StockScrap {
  return scrapWithLabels({
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    date: row.date,
    product_id: row.product_id ?? null,
    product_name: row.product_name,
    scrap_qty: Number(row.scrap_qty),
    location_id: row.location_id ?? null,
    state: row.state,
    date_label: row.date_label,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function buildStockScrapQuery(params?: StockScrapListParams): string {
  if (!params?.search) return "";
  return `?search=${encodeURIComponent(params.search)}`;
}

export async function fetchStockScraps(params?: StockScrapListParams): Promise<StockScrap[]> {
  const res = await apiFetch<ApiStockScrapListResponse>(
    `/api/v1/inventory/scraps${buildStockScrapQuery(params)}`,
  );
  return res.data.map(apiScrapToScrap);
}

export async function patchStockScrap(
  id: string,
  input: UpdateStockScrapInput,
): Promise<StockScrap> {
  const res = await apiFetch<ApiStockScrapResponse>(`/api/v1/inventory/scraps/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return apiScrapToScrap(res.data);
}
