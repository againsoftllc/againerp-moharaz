import { apiFetch } from "@/lib/api/client";

// Competitor ids are user-managed (add any website from the plugin's settings), not a fixed
// enum — "startech"/"ryans"/"techland" are just the three seeded by default.
export type PriceUpdateCompetitor = string;

export type PriceUpdateCompetitorSite = {
  id: string;
  label: string;
  domain: string;
  enabled: boolean;
  created_at: string;
};

export type PriceUpdatePluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  google_api_key_hint: string;
  google_api_key_configured: boolean;
  google_search_engine_id: string;
  use_site_search: boolean;
  use_sitemap_match: boolean;
  use_google_search: boolean;
  use_google_price: boolean;
  use_ai_pick: boolean;
  use_ai_price_read: boolean;
  use_ai_web_search: boolean;
  /** Server re-reads saved links every N hours (0 = off). Free. */
  auto_sync_hours: number;
  last_auto_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceUpdateSearchMethod =
  | "use_site_search"
  | "use_sitemap_match"
  | "use_google_search"
  | "use_google_price"
  | "use_ai_pick"
  | "use_ai_price_read"
  | "use_ai_web_search";

export type PriceUpdatePluginUpdateInput = Partial<
  {
    enabled: boolean;
    google_api_key: string;
    google_search_engine_id: string;
    auto_sync_hours: number;
  } & Record<PriceUpdateSearchMethod, boolean>
>;

export type PriceUpdateMatch = {
  id: string;
  product_id: string;
  competitor: PriceUpdateCompetitor;
  matched_url: string | null;
  matched_title: string | null;
  manual_url: boolean;
  price: string | null;
  regular_price: string | null;
  currency: string;
  in_stock: boolean | null;
  /** The shop's own wording: "In Stock", "Up Coming", "Call For Price", … */
  stock_label: string | null;
  status: "matched" | "not_found" | "no_price" | "error";
  status_message: string | null;
  last_checked_at: string | null;
  /** An admin opened the link and confirmed it's this product — never replaced automatically. */
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
};

const BASE = "/api/v1/plugins/price-update";

export async function fetchPriceUpdatePlugin(): Promise<PriceUpdatePluginRecord> {
  const res = await apiFetch<{ data: PriceUpdatePluginRecord }>(BASE);
  return res.data;
}

export async function installPriceUpdatePlugin(): Promise<PriceUpdatePluginRecord> {
  const res = await apiFetch<{ data: PriceUpdatePluginRecord }>(`${BASE}/install`, {
    method: "POST",
  });
  return res.data;
}

export async function uninstallPriceUpdatePlugin(): Promise<PriceUpdatePluginRecord> {
  const res = await apiFetch<{ data: PriceUpdatePluginRecord }>(`${BASE}/install`, {
    method: "DELETE",
  });
  return res.data;
}

export async function updatePriceUpdatePlugin(
  input: PriceUpdatePluginUpdateInput,
): Promise<PriceUpdatePluginRecord> {
  const res = await apiFetch<{ data: PriceUpdatePluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function fetchPriceUpdateCompetitors(): Promise<PriceUpdateCompetitorSite[]> {
  const res = await apiFetch<{ data: PriceUpdateCompetitorSite[] }>(`${BASE}/competitors`);
  return res.data;
}

export async function addPriceUpdateCompetitor(input: {
  domain: string;
  label: string;
}): Promise<PriceUpdateCompetitorSite> {
  return apiFetch<PriceUpdateCompetitorSite>(`${BASE}/competitors`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setPriceUpdateCompetitorEnabled(
  competitorId: string,
  enabled: boolean,
): Promise<PriceUpdateCompetitorSite> {
  return apiFetch<PriceUpdateCompetitorSite>(`${BASE}/competitors/${encodeURIComponent(competitorId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function removePriceUpdateCompetitor(competitorId: string): Promise<void> {
  await apiFetch<void>(`${BASE}/competitors/${encodeURIComponent(competitorId)}`, {
    method: "DELETE",
  });
}

/** Ids go in the URL, so a long list is asked for in chunks (one request of thousands of ids is refused by the proxy). */
const MATCH_IDS_PER_REQUEST = 150;

export async function fetchPriceUpdateMatches(productIds: string[]): Promise<PriceUpdateMatch[]> {
  if (!productIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += MATCH_IDS_PER_REQUEST) chunks.push(productIds.slice(i, i + MATCH_IDS_PER_REQUEST));
  const out: PriceUpdateMatch[] = [];
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      const res = await apiFetch<{ data: PriceUpdateMatch[] }>(`${BASE}/matches?product_ids=${encodeURIComponent(chunk.join(","))}`);
      out.push(...res.data);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker));
  return out;
}

/**
 * The saved competitor status of a whole list (all products of a status), page by page - for the Price Compare screens, so a
 * reload shows the last sync of every product without sending the product ids. `compact` skips rows nothing was ever read for.
 */
export async function fetchSavedPriceUpdateMatches(params: {
  status: string;
  channel?: string;
  compact?: boolean;
}): Promise<PriceUpdateMatch[]> {
  const PAGE = 5000;
  const out: PriceUpdateMatch[] = [];
  for (let offset = 0; offset < 500_000; offset += PAGE) {
    const q = new URLSearchParams({ status: params.status, limit: String(PAGE), offset: String(offset) });
    if (params.channel) q.set("channel", params.channel);
    if (params.compact) q.set("compact", "true");
    const res = await apiFetch<{ data: PriceUpdateMatch[] }>(`${BASE}/matches/saved?${q}`, { cache: "no-store" });
    out.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  return out;
}

export async function setPriceUpdateManualUrl(input: {
  productId: string;
  competitor: PriceUpdateCompetitor;
  url: string;
  verified?: boolean;
}): Promise<PriceUpdateMatch> {
  const res = await apiFetch<PriceUpdateMatch>(`${BASE}/matches/manual-url`, {
    method: "POST",
    body: JSON.stringify({
      product_id: input.productId,
      competitor: input.competitor,
      url: input.url,
      verified: Boolean(input.verified),
    }),
  });
  return res;
}

export async function refreshPriceUpdateMatches(input: {
  productIds: string[];
  competitor?: PriceUpdateCompetitor;
  /** false = free sync: re-read saved links only, no Google Search / AI (default true). */
  allowAi?: boolean;
  /** Abort the request (the Stop button on a bulk check). */
  signal?: AbortSignal;
}): Promise<PriceUpdateMatch[]> {
  const res = await apiFetch<{ data: PriceUpdateMatch[] }>(`${BASE}/refresh`, {
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      product_ids: input.productIds,
      competitor: input.competitor,
      allow_ai: input.allowAi ?? true,
    }),
  });
  return res.data;
}

export type PriceApplyField = "price" | "stock";

export type PriceApplyRow = {
  product_id: string;
  name: string;
  competitor: string | null;
  site: string | null;
  current: number | string | null;
  new: number | string | null;
  /** Why this product won't change (no price on that site, already the same, …). */
  skip: string | null;
  applied: boolean | null;
};

/** Copy the picked competitors' price or stock into our catalog. dryRun = preview only. */
export async function applyCompetitorValues(input: {
  field: PriceApplyField;
  items: { productId: string; competitor: string }[];
  dryRun: boolean;
}): Promise<PriceApplyRow[]> {
  const res = await apiFetch<{ data: PriceApplyRow[] }>(`${BASE}/apply`, {
    method: "POST",
    body: JSON.stringify({
      field: input.field,
      dry_run: input.dryRun,
      items: input.items.map((i) => ({ product_id: i.productId, competitor: i.competitor })),
    }),
  });
  return res.data;
}

/** Remove a saved competitor link (its price/stock go too); search won't bring it back. */
export async function removePriceUpdateLink(input: {
  productId: string;
  competitor: PriceUpdateCompetitor;
}): Promise<PriceUpdateMatch> {
  return apiFetch<PriceUpdateMatch>(`${BASE}/matches/remove-link`, {
    method: "POST",
    body: JSON.stringify({ product_id: input.productId, competitor: input.competitor }),
  });
}
