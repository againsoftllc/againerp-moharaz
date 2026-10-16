import { apiFetch } from "@/lib/api/client";

export type AmazonSearchItem = {
  asin: string;
  title: string;
  brand?: string | null;
  image?: string | null;
  marketplace_id?: string;
};

export type AmazonPricing = {
  exchange_rate: number;
  profit_bdt: number;
  server_charge_bdt: number;
  default_cost_usd?: number;
};

export type AmazonImportResponse = {
  created: boolean;
  product_id: string;
  sku: string;
  name: string;
  slug: string;
  price: string;
  currency?: string;
  thumbnail?: string | null;
  source_url?: string | null;
  live_amazon_data?: boolean;
  sandbox_stub?: boolean;
  pricing?: Record<string, number | string | null>;
};

export type AmazonBulkImportResponse = {
  imported: AmazonImportResponse[];
  skipped: AmazonImportResponse[];
  errors: { asin: string; error: string }[];
};

export async function fetchAmazonImportStatus() {
  return apiFetch<{
    configured: boolean;
    app_name?: string;
    env: string;
    region: string;
    base_url?: string | null;
    marketplace_id: string;
    pricing_defaults?: AmazonPricing;
    note?: string;
  }>("/api/v1/catalog/amazon/status");
}

export async function searchAmazonImportProducts(params: {
  q: string;
  marketplace_id?: string;
  size?: number;
}) {
  const sp = new URLSearchParams({
    q: params.q,
    size: String(params.size ?? 12),
  });
  if (params.marketplace_id) sp.set("marketplace_id", params.marketplace_id);
  return apiFetch<{
    success: boolean;
    items: AmazonSearchItem[];
    total: number;
    message?: string | null;
  }>(`/api/v1/catalog/amazon/search?${sp}`);
}

export async function importAmazonProduct(input: {
  asin: string;
  marketplace_id?: string;
  status?: "draft" | "published";
  cost_usd?: number;
  exchange_rate?: number;
  profit_bdt?: number;
  server_charge_bdt?: number;
  title?: string;
  allow_sandbox_stub?: boolean;
}) {
  return apiFetch<AmazonImportResponse>("/api/v1/catalog/amazon/import", {
    method: "POST",
    body: JSON.stringify({
      asin: input.asin,
      marketplace_id: input.marketplace_id,
      status: input.status ?? "published",
      cost_usd: input.cost_usd,
      exchange_rate: input.exchange_rate,
      profit_bdt: input.profit_bdt,
      server_charge_bdt: input.server_charge_bdt,
      title: input.title,
      allow_sandbox_stub: input.allow_sandbox_stub ?? true,
    }),
  });
}

export async function bulkImportAmazonProducts(input: {
  asins: string[];
  marketplace_id?: string;
  status?: "draft" | "published";
  cost_usd?: number;
  exchange_rate?: number;
  profit_bdt?: number;
  server_charge_bdt?: number;
}) {
  return apiFetch<AmazonBulkImportResponse>("/api/v1/catalog/amazon/import/bulk", {
    method: "POST",
    body: JSON.stringify({
      asins: input.asins,
      marketplace_id: input.marketplace_id,
      status: input.status ?? "published",
      cost_usd: input.cost_usd,
      exchange_rate: input.exchange_rate,
      profit_bdt: input.profit_bdt,
      server_charge_bdt: input.server_charge_bdt,
      allow_sandbox_stub: true,
    }),
  });
}
