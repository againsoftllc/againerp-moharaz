import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

/** Storefront customer panel sections that can be hidden. */
export const ACCOUNT_MENU_KEYS = [
  "account_menu.wishlist",
  "account_menu.payments",
  "account_menu.returns",
  "account_menu.qc",
  "account_menu.complain",
  "account_menu.support",
  "account_menu.points",
  "account_menu.delivery",
] as const;

export type AccountMenuKey = (typeof ACCOUNT_MENU_KEYS)[number];

export async function syncAccountMenuSettingsToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of ACCOUNT_MENU_KEYS) {
    if (!(key in values)) continue;
    const raw = values[key];
    const on = typeof raw === "boolean" ? raw : String(raw) === "true";
    writes.push(upsertPlatformSetting(key, on ? "true" : "false"));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadAccountMenuSettingsFromPlatform(): Promise<
  Partial<Record<AccountMenuKey, boolean>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<AccountMenuKey, boolean>> = {};
    for (const row of rows) {
      if (!(ACCOUNT_MENU_KEYS as readonly string[]).includes(row.key)) continue;
      const raw = (row.value ?? "").trim();
      // An unset key keeps the schema default rather than forcing the section off.
      if (!raw) continue;
      out[row.key as AccountMenuKey] = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
    }
    return out;
  } catch {
    return {};
  }
}
