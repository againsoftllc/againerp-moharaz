import { apiFetch } from "@/lib/api/client";

export type MarketingTrackingSiteRecord = {
  site_id: string;
  site_name: string;
  site_code: string;
  site_domain: string;
  configured: boolean;
  enabled: boolean;
  gtm_id: string;
  ga4_id: string;
  fb_pixel_id: string;
  pixel_events: string[];
  capi_enabled: boolean;
  capi_access_token_set: boolean;
  capi_access_token_hint: string;
  capi_test_event_code: string;
  capi_last_status: string;
  capi_last_sent_at: string | null;
};

export type MarketingTrackingPluginRecord = {
  id: string;
  installed: boolean;
  enabled: boolean;
  available_events: string[];
  sites: MarketingTrackingSiteRecord[];
};

export type MarketingTrackingSiteUpdateInput = Partial<{
  enabled: boolean;
  gtm_id: string;
  ga4_id: string;
  fb_pixel_id: string;
  pixel_events: string[];
  capi_enabled: boolean;
  /** blank or omitted keeps the saved token */
  capi_access_token: string;
  clear_capi_access_token: boolean;
  capi_test_event_code: string;
}>;

const BASE = "/api/v1/plugins/marketing-tracking";

export async function fetchMarketingTrackingPlugin(): Promise<MarketingTrackingPluginRecord> {
  const res = await apiFetch<{ data: MarketingTrackingPluginRecord }>(BASE);
  return res.data;
}

export async function installMarketingTrackingPlugin(): Promise<MarketingTrackingPluginRecord> {
  const res = await apiFetch<{ data: MarketingTrackingPluginRecord }>(`${BASE}/install`, { method: "POST" });
  return res.data;
}

export async function uninstallMarketingTrackingPlugin(): Promise<MarketingTrackingPluginRecord> {
  const res = await apiFetch<{ data: MarketingTrackingPluginRecord }>(`${BASE}/install`, { method: "DELETE" });
  return res.data;
}

export async function updateMarketingTrackingPlugin(input: { enabled?: boolean }): Promise<MarketingTrackingPluginRecord> {
  const res = await apiFetch<{ data: MarketingTrackingPluginRecord }>(BASE, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateMarketingTrackingSite(
  siteId: string,
  input: MarketingTrackingSiteUpdateInput,
): Promise<MarketingTrackingSiteRecord> {
  const res = await apiFetch<{ data: MarketingTrackingSiteRecord }>(`${BASE}/sites/${encodeURIComponent(siteId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function testMarketingTrackingCapi(siteId: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch<{ data: { ok: boolean; message: string } }>(
    `${BASE}/sites/${encodeURIComponent(siteId)}/test-capi`,
    { method: "POST" },
  );
  return res.data;
}
