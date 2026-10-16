/** Parsed `catalog_products.dropship_meta_json` for admin product view. */

import { formatGroupedNumber } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";

export type DropshipPriceTier = {
  min_qty?: number | null;
  cost_cny?: number | null;
  price_bdt?: number | null;
  [key: string]: unknown;
};

export type DropshipShippingSku = {
  sku_id?: string | null;
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  [key: string]: unknown;
};

export type DropshipMeta = {
  source?: string | null;
  dropship?: boolean;
  elim_id?: string | null;
  platform?: string | null;
  asin?: string | null;
  marketplace_id?: string | null;
  currency_source?: string | null;
  currency_sell?: string | null;
  cost_cny?: number | null;
  cost_usd?: number | null;
  cost_bdt?: number | null;
  exchange_rate?: number | null;
  markup_percent?: number | null;
  markup_bdt?: number | null;
  profit_bdt?: number | null;
  server_charge_bdt?: number | null;
  sell_price_bdt?: number | null;
  shop_name?: string | null;
  shop_id?: string | null;
  category_name?: string | null;
  mapped_category_id?: string | null;
  mapped_category_slug?: string | null;
  supplier_link?: string | null;
  title_zh?: string | null;
  cached_from?: string | null;
  image_count?: number | null;
  video_count?: number | null;
  variant_count?: number | null;
  sales_volume?: number | string | null;
  moq?: number | string | null;
  price_tiers?: DropshipPriceTier[] | null;
  shipping_by_sku?: DropshipShippingSku[] | Record<string, unknown> | null;
  weight_kg?: number | null;
  brand?: string | null;
  live_amazon_data?: boolean | null;
  sandbox_stub?: boolean | null;
  stub_reason?: string | null;
  /** Full Elim / Amazon API body */
  source_payload?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export function parseDropshipMeta(raw: string | null | undefined): DropshipMeta | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as DropshipMeta;
  } catch {
    return null;
  }
}

export function isDropshipProduct(meta: DropshipMeta | null | undefined): boolean {
  if (!meta) return false;
  return meta.dropship === true || Boolean(meta.source) || Boolean(meta.elim_id) || Boolean(meta.asin);
}

export function dropshipSourceLabel(meta: DropshipMeta): string {
  const source = (meta.source || "").toLowerCase();
  if (source === "amazon") return "Amazon";
  if (source === "elim") {
    const platform = (meta.platform || "").toLowerCase();
    if (platform.includes("1688")) return "AgainAPI · 1688";
    if (platform.includes("taobao")) return "AgainAPI · Taobao";
    if (platform) return `AgainAPI · ${meta.platform}`;
    return "AgainAPI";
  }
  if (source === "manual") return "Manual dropship";
  if (source === "legacy") return "Dropship";
  return source ? source : "Dropship";
}

export function dropshipSourceLinkLabel(meta: DropshipMeta): string {
  const source = (meta.source || "").toLowerCase();
  if (source === "amazon") return "Open on Amazon";
  if (source === "elim") {
    const platform = (meta.platform || "").toLowerCase();
    if (platform.includes("1688")) return "Open on 1688";
    if (platform.includes("taobao")) return "Open on Taobao";
    return "Open supplier page";
  }
  return "Open source";
}

/** Meta minus bulky payload — for compact JSON preview. */
export function dropshipMetaWithoutPayload(meta: DropshipMeta): Record<string, unknown> {
  const { source_payload: _payload, ...rest } = meta;
  return rest;
}

export function formatMetaNumber(value: unknown, digits = 2): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  // Company digit grouping, but keep this helper's own max-decimals contract.
  const fmt = getCompanyFormat();
  return formatGroupedNumber(n, { ...fmt, decimalPlaces: digits })
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function flattenPayloadEntries(
  payload: Record<string, unknown> | null | undefined,
  skipKeys: Set<string> = new Set(["description", "img_urls", "images", "video_urls", "videos", "skus", "attributes", "shipping_info"]),
): { key: string; value: string }[] {
  if (!payload) return [];
  const rows: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (skipKeys.has(key)) continue;
    if (value == null) continue;
    if (typeof value === "object") {
      rows.push({ key, value: Array.isArray(value) ? `[${value.length} items]` : "{…}" });
      continue;
    }
    const text = String(value).trim();
    if (!text) continue;
    rows.push({ key, value: text.length > 160 ? `${text.slice(0, 160)}…` : text });
  }
  return rows;
}
