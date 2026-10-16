import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";
import type { SettingItemDef } from "@/lib/settings/types";

/**
 * Generic platform-settings sync for a category made entirely of plain
 * toggle/select/number items (no bespoke merge logic) — Catalog, Sales,
 * Orders, Checkout, SEO. Categories with real cross-field behavior (payments,
 * shipping, customers, store, marketing) keep their own dedicated modules.
 */

function serialize(item: SettingItemDef, raw: string | boolean | number): string {
  if (item.type === "toggle") {
    const bool = typeof raw === "boolean" ? raw : String(raw) === "true";
    return bool ? "true" : "false";
  }
  return String(raw ?? "");
}

export async function syncCategorySettingsToPlatform(
  items: SettingItemDef[],
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const item of items) {
    if (!(item.key in values)) continue;
    writes.push(upsertPlatformSetting(item.key, serialize(item, values[item.key])));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadCategorySettingsFromPlatform(
  items: SettingItemDef[],
): Promise<Record<string, string | boolean | number>> {
  try {
    const rows = await fetchPlatformSettings();
    const byKey = new Map(rows.map((row) => [row.key, row.value ?? ""]));
    const out: Record<string, string | boolean | number> = {};
    for (const item of items) {
      const raw = byKey.get(item.key);
      if (raw === undefined) continue; // never saved — caller keeps the schema default
      if (item.type === "toggle") {
        out[item.key] = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
      } else if (item.type === "number") {
        const n = Number(raw);
        out[item.key] = Number.isFinite(n) ? n : item.defaultValue;
      } else {
        out[item.key] = raw;
      }
    }
    return out;
  } catch {
    return {};
  }
}
