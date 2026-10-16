import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

export const MARKETING_PLATFORM_KEYS = ["marketing.loyalty"] as const;

export type MarketingPlatformKey = (typeof MARKETING_PLATFORM_KEYS)[number];

function serializeBool(value: boolean): string {
  return value ? "true" : "false";
}

export async function syncMarketingSettingsToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of MARKETING_PLATFORM_KEYS) {
    if (!(key in values)) continue;
    const raw = values[key];
    const boolVal = typeof raw === "boolean" ? raw : String(raw) === "true";
    writes.push(upsertPlatformSetting(key, serializeBool(boolVal)));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadMarketingSettingsFromPlatform(): Promise<
  Partial<Record<MarketingPlatformKey, boolean>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<MarketingPlatformKey, boolean>> = {};
    for (const row of rows) {
      if ((MARKETING_PLATFORM_KEYS as readonly string[]).includes(row.key)) {
        const v = (row.value ?? "").trim().toLowerCase();
        out[row.key as MarketingPlatformKey] = ["1", "true", "yes", "on"].includes(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}
