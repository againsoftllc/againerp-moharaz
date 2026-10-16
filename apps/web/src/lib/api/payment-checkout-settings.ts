import { upsertPlatformSetting, fetchPlatformSettings } from "@/lib/api/platform-settings";

export const PAYMENT_PLATFORM_KEYS = [
  "payments.cod",
  "payments.online",
  "payments.bank",
  "payments.partial",
] as const;

export type PaymentPlatformKey = (typeof PAYMENT_PLATFORM_KEYS)[number];

function serializeBool(value: boolean): string {
  return value ? "true" : "false";
}

export async function syncPaymentSettingsToPlatform(
  values: Record<string, string | boolean | number>,
): Promise<void> {
  const writes: Promise<unknown>[] = [];
  for (const key of PAYMENT_PLATFORM_KEYS) {
    if (!(key in values)) continue;
    const raw = values[key];
    const boolVal = typeof raw === "boolean" ? raw : String(raw) === "true";
    writes.push(upsertPlatformSetting(key, serializeBool(boolVal)));
  }
  if (writes.length) await Promise.all(writes);
}

export async function loadPaymentSettingsFromPlatform(): Promise<
  Partial<Record<PaymentPlatformKey, boolean>>
> {
  try {
    const rows = await fetchPlatformSettings();
    const out: Partial<Record<PaymentPlatformKey, boolean>> = {};
    for (const row of rows) {
      if ((PAYMENT_PLATFORM_KEYS as readonly string[]).includes(row.key)) {
        const v = (row.value ?? "").trim().toLowerCase();
        out[row.key as PaymentPlatformKey] = ["1", "true", "yes", "on"].includes(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Map workspace plugin id → storefront / API install helpers. */
export const PAYMENT_PLUGIN_IDS = ["bkash", "sslcommerz", "paypal", "stripe", "bank-emi"] as const;
