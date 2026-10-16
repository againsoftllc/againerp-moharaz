import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

export const SHIPPING_PLATFORM_KEYS = [
  "shipping.free_threshold",
  "shipping.default_method",
  "shipping.time_slots",
  "shipping.method_standard",
  "shipping.method_express",
  "shipping.method_same_day",
  "shipping.method_pickup",
  "shipping.rate_default",
  "shipping.rate_express",
  "shipping.rate_same_day",
  "shipping.zones",
  "shipping.district_rates",
] as const;

export type ShippingPlatformKey = (typeof SHIPPING_PLATFORM_KEYS)[number];

const BOOL_KEYS = new Set<string>([
  "shipping.time_slots",
  "shipping.method_standard",
  "shipping.method_express",
  "shipping.method_same_day",
  "shipping.method_pickup",
]);

const NUMBER_KEYS = new Set<string>([
  "shipping.free_threshold",
  "shipping.rate_default",
  "shipping.rate_express",
  "shipping.rate_same_day",
]);

function serializeValue(key: string, value: string | boolean | number): string {
  if (BOOL_KEYS.has(key)) {
    const boolVal = typeof value === "boolean" ? value : String(value) === "true";
    return boolVal ? "true" : "false";
  }
  if (NUMBER_KEYS.has(key)) {
    const n = typeof value === "number" ? value : Number(value);
    return String(Number.isFinite(n) ? n : 0);
  }
  return String(value ?? "");
}

export async function syncShippingSettingsToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of SHIPPING_PLATFORM_KEYS) {
    if (!(key in values)) continue;
    writes.push(upsertPlatformSetting(key, serializeValue(key, values[key])));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadShippingSettingsFromPlatform(): Promise<
  Partial<Record<ShippingPlatformKey, string | boolean | number>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<ShippingPlatformKey, string | boolean | number>> = {};
    for (const row of rows) {
      if (!(SHIPPING_PLATFORM_KEYS as readonly string[]).includes(row.key)) continue;
      const key = row.key as ShippingPlatformKey;
      const raw = (row.value ?? "").trim();
      if (BOOL_KEYS.has(key)) {
        out[key] = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
      } else if (NUMBER_KEYS.has(key)) {
        const n = Number(raw);
        out[key] = Number.isFinite(n) ? n : 0;
      } else {
        out[key] = raw;
      }
    }
    return out;
  } catch {
    return {};
  }
}
