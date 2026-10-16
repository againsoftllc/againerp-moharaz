import { apiFetch } from "@/lib/api/client";

export type ElimPlatform = "taobao" | "alibaba";

export type ElimSearchItem = {
  id: string;
  title: string;
  title_zh?: string;
  price?: number | string;
  image?: string;
  sales_volume?: number | string;
  seller_name?: string;
  link?: string;
  platform: string;
};

export type ElimSearchResponse = {
  success: boolean;
  items: ElimSearchItem[];
  page: number;
  size: number;
  total: number;
  raw_message?: string | null;
};

export type ElimPricing = {
  exchange_rate: number;
  markup_percent: number;
  profit_bdt: number;
  server_charge_bdt: number;
};

export type ElimImportResponse = {
  created: boolean;
  product_id: string;
  sku: string;
  name: string;
  slug: string;
  price: string;
  currency?: string;
  thumbnail?: string | null;
  source_url?: string | null;
  pricing?: Record<string, number | string | null>;
};

export type ElimBulkImportResponse = {
  imported: ElimImportResponse[];
  skipped: ElimImportResponse[];
  errors: { elim_id: string; error: string }[];
};

export async function fetchElimStatus() {
  return apiFetch<{
    configured: boolean;
    base_url: string;
    key_name_hint?: string | null;
    pricing_defaults?: ElimPricing;
    pricing_formula?: string;
  }>("/api/v1/catalog/elim/status");
}

export async function saveElimPricingDefaults(pricing: ElimPricing) {
  return apiFetch<{
    success: boolean;
    pricing_defaults: ElimPricing;
    message?: string;
  }>("/api/v1/catalog/elim/pricing-defaults", {
    method: "PUT",
    body: JSON.stringify(pricing),
  });
}

export async function searchElimProducts(params: {
  q: string;
  platform: ElimPlatform;
  page?: number;
  size?: number;
}) {
  const sp = new URLSearchParams({
    q: params.q,
    platform: params.platform,
    page: String(params.page ?? 1),
    size: String(params.size ?? 12),
    lang: "en",
  });
  return apiFetch<ElimSearchResponse>(`/api/v1/catalog/elim/search?${sp}`);
}

export async function importElimProduct(input: {
  elim_id: string;
  platform: ElimPlatform;
  status?: "draft" | "published";
} & Partial<ElimPricing>) {
  return apiFetch<ElimImportResponse>("/api/v1/catalog/elim/import", {
    method: "POST",
    body: JSON.stringify({
      elim_id: input.elim_id,
      platform: input.platform,
      lang: "en",
      status: input.status ?? "draft",
      exchange_rate: input.exchange_rate,
      markup_percent: input.markup_percent,
      profit_bdt: input.profit_bdt,
      server_charge_bdt: input.server_charge_bdt,
    }),
  });
}

export async function bulkImportElimProducts(input: {
  elim_ids: string[];
  platform: ElimPlatform;
  status?: "draft" | "published";
} & Partial<ElimPricing>) {
  return apiFetch<ElimBulkImportResponse>("/api/v1/catalog/elim/import/bulk", {
    method: "POST",
    body: JSON.stringify({
      elim_ids: input.elim_ids,
      platform: input.platform,
      lang: "en",
      status: input.status ?? "draft",
      exchange_rate: input.exchange_rate,
      markup_percent: input.markup_percent,
      profit_bdt: input.profit_bdt,
      server_charge_bdt: input.server_charge_bdt,
    }),
  });
}

/** Client-side BDT preview: cost × rate × (1 + markup%/100) + profit + fee */
export function previewSellBdt(
  costCny: number,
  pricing: ElimPricing,
): { cost_bdt: number; markup_bdt: number; sell_bdt: number } {
  const cost_bdt = Math.round(costCny * pricing.exchange_rate * 100) / 100;
  const markup_bdt =
    Math.round(cost_bdt * ((pricing.markup_percent || 0) / 100) * 100) / 100;
  const sell_bdt =
    Math.round(
      (cost_bdt + markup_bdt + (pricing.profit_bdt || 0) + (pricing.server_charge_bdt || 0)) * 100,
    ) / 100;
  return { cost_bdt, markup_bdt, sell_bdt };
}
