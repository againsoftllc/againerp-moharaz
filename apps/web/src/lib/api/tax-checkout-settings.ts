import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

export const TAX_PLATFORM_KEYS = [
  "tax.rate_percent",
  "tax.label",
  "tax.included_in_price",
  "tax.shipping_taxable",
] as const;

export type TaxPlatformKey = (typeof TAX_PLATFORM_KEYS)[number];

const BOOL_KEYS = new Set<string>(["tax.included_in_price", "tax.shipping_taxable"]);

const NUMBER_KEYS = new Set<string>(["tax.rate_percent"]);

function serializeValue(key: string, value: string | boolean | number): string {
  if (BOOL_KEYS.has(key)) {
    const boolVal = typeof value === "boolean" ? value : String(value) === "true";
    return boolVal ? "true" : "false";
  }
  if (NUMBER_KEYS.has(key)) {
    const n = typeof value === "number" ? value : Number(value);
    // A nonsensical rate would silently distort every order total.
    const safe = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
    return String(safe);
  }
  return String(value ?? "");
}

export async function syncTaxSettingsToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of TAX_PLATFORM_KEYS) {
    if (!(key in values)) continue;
    writes.push(upsertPlatformSetting(key, serializeValue(key, values[key])));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadTaxSettingsFromPlatform(): Promise<
  Partial<Record<TaxPlatformKey, string | boolean | number>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<TaxPlatformKey, string | boolean | number>> = {};
    for (const row of rows) {
      if (!(TAX_PLATFORM_KEYS as readonly string[]).includes(row.key)) continue;
      const key = row.key as TaxPlatformKey;
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
