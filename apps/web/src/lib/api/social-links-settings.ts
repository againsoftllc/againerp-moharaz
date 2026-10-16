import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

/** Public social profile URLs the storefront renders. */
export const SOCIAL_LINK_KEYS = [
  "social.facebook",
  "social.instagram",
  "social.youtube",
] as const;

export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

export async function syncSocialLinksToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of SOCIAL_LINK_KEYS) {
    if (!(key in values)) continue;
    writes.push(upsertPlatformSetting(key, String(values[key] ?? "").trim()));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadSocialLinksFromPlatform(): Promise<
  Partial<Record<SocialLinkKey, string>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<SocialLinkKey, string>> = {};
    for (const row of rows) {
      if (!(SOCIAL_LINK_KEYS as readonly string[]).includes(row.key)) continue;
      out[row.key as SocialLinkKey] = (row.value ?? "").trim();
    }
    return out;
  } catch {
    return {};
  }
}
