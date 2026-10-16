import { fetchAgainBuilderPlugin } from "@/lib/api/again-builder-plugin";
import { fetchSmartPcBuilderPlugin } from "@/lib/api/smart-pc-builder-plugin";
import { fetchBkashPlugin } from "@/lib/api/bkash-plugin";
import { fetchPathaoPlugin } from "@/lib/api/pathao-plugin";
import { fetchMarketingTrackingPlugin } from "@/lib/api/marketing-tracking-plugin";
import { fetchPaypalPlugin } from "@/lib/api/paypal-plugin";
import { fetchSslcommerzPlugin } from "@/lib/api/sslcommerz-plugin";
import { fetchStripePlugin } from "@/lib/api/stripe-plugin";
import { fetchZktecoPlugin } from "@/lib/api/zkteco-plugin";
import { fetchPlatformSettings } from "@/lib/api/platform-settings";
import { fetchSmsGatewayPlugin, SMS_GATEWAY_PLUGIN_IDS } from "@/lib/api/sms-gateway-plugin";

export type ServerPluginState = { installed: boolean; enabled: boolean };

/** Plugins whose install state lives in their own API table.
 *
 * "steadfast" used to map here to fetchAgainDropApiPlugin — a mismapped
 * leftover, not a real Steadfast integration (that plugin has no API of its
 * own; see registry.ts). Removed along with the Steadfast marketplace entry.
 */
const RECORD_LOADERS: Record<string, () => Promise<{ installed?: boolean; enabled?: boolean }>> = {
  bkash: fetchBkashPlugin,
  sslcommerz: fetchSslcommerzPlugin,
  paypal: fetchPaypalPlugin,
  stripe: fetchStripePlugin,
  pathao: fetchPathaoPlugin,
  "marketing-tracking": fetchMarketingTrackingPlugin,
  zkteco: fetchZktecoPlugin,
  "again-builder": fetchAgainBuilderPlugin,
  ...Object.fromEntries(SMS_GATEWAY_PLUGIN_IDS.map((id) => [id, () => fetchSmsGatewayPlugin(id)])),
  "smart-pc-builder": fetchSmartPcBuilderPlugin,
};

/**
 * What the server believes is installed.
 *
 * The plugins screen used to trust the browser alone, so an install made in one
 * browser looked missing in another — and a failed API call still left the
 * button saying "Installed". This is the single answer everyone shares.
 *
 * A loader that fails is simply left out rather than reported as uninstalled:
 * one unreachable plugin endpoint must not wipe the rest of the screen.
 */
export async function fetchServerPluginStates(): Promise<Record<string, ServerPluginState>> {
  const out: Record<string, ServerPluginState> = {};

  const results = await Promise.allSettled(
    Object.entries(RECORD_LOADERS).map(async ([id, load]) => {
      const row = await load();
      return [id, { installed: Boolean(row.installed), enabled: Boolean(row.enabled) }] as const;
    }),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      const [id, state] = result.value;
      out[id] = state;
    }
  }

  // Bank EMI has no table of its own — it is a platform setting.
  try {
    const settings = await fetchPlatformSettings();
    const raw = settings.find((s) => s.key === "plugin.bank_emi.installed")?.value;
    const installed = String(raw ?? "").toLowerCase() === "true";
    out["bank-emi"] = { installed, enabled: installed };
  } catch {
    /* leave bank-emi to whatever the browser already had */
  }

  // AI Search: platform settings too (installed + its own on/off switch)
  try {
    const settings = await fetchPlatformSettings();
    const value = (k: string) => String(settings.find((s) => s.key === k)?.value ?? "").toLowerCase();
    const installed = value("plugin.ai_search.installed") === "true";
    out["ai-search"] = { installed, enabled: installed && value("plugin.ai_search.enabled") !== "false" };
  } catch {
    /* leave ai-search to whatever the browser already had */
  }

  // Live Chat has no table of its own either — also a platform setting, but
  // unlike Bank EMI it defaults to installed: the feature already works
  // out of the box, so an unset key must not make it vanish.
  try {
    const settings = await fetchPlatformSettings();
    const raw = settings.find((s) => s.key === "plugin.live_chat.installed")?.value;
    const installed = raw == null || raw === "" ? true : String(raw).toLowerCase() === "true";
    out["live-chat"] = { installed, enabled: installed };
  } catch {
    /* leave live-chat to whatever the browser already had */
  }

  return out;
}
