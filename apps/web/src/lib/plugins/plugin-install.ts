import { installAgainBuilderPlugin } from "@/lib/api/again-builder-plugin";
import { installAgainDropApiPlugin } from "@/lib/api/again-drop-api-plugin";
import { installBkashPlugin } from "@/lib/api/bkash-plugin";
import { installMarketingTrackingPlugin } from "@/lib/api/marketing-tracking-plugin";
import { installPathaoPlugin } from "@/lib/api/pathao-plugin";
import { installPaypalPlugin } from "@/lib/api/paypal-plugin";
import { upsertPlatformSetting } from "@/lib/api/platform-settings";
import { installPriceUpdatePlugin } from "@/lib/api/price-update-plugin";
import { installSmartPcBuilderPlugin } from "@/lib/api/smart-pc-builder-plugin";
import { installSmsGatewayPlugin, isSmsGatewayPluginId } from "@/lib/api/sms-gateway-plugin";
import { installSslcommerzPlugin } from "@/lib/api/sslcommerz-plugin";
import { installStripePlugin } from "@/lib/api/stripe-plugin";
import { installCloudflarePlugin } from "@/lib/api/use-cloudflare-plugin";
import { installZktecoPlugin } from "@/lib/api/zkteco-plugin";
import { usePluginsStore } from "@/lib/store/plugins-store";

/** The server registration of each plugin that has one. Plugins missing here (China Import) live in the browser only. */
const SERVER_INSTALLERS: Record<string, () => Promise<unknown>> = {
  bkash: installBkashPlugin,
  sslcommerz: installSslcommerzPlugin,
  paypal: installPaypalPlugin,
  stripe: installStripePlugin,
  pathao: installPathaoPlugin,
  zkteco: installZktecoPlugin,
  cloudflare: installCloudflarePlugin,
  "again-drop-api": installAgainDropApiPlugin,
  "again-builder": installAgainBuilderPlugin,
  "smart-pc-builder": installSmartPcBuilderPlugin,
  "price-update": installPriceUpdatePlugin,
  "marketing-tracking": installMarketingTrackingPlugin,
  "bank-emi": () => upsertPlatformSetting("plugin.bank_emi.installed", "true"),
  "ai-search": () =>
    Promise.all([
      upsertPlatformSetting("plugin.ai_search.installed", "true"),
      upsertPlatformSetting("plugin.ai_search.enabled", "true"),
    ]),
};

/**
 * Install a plugin: register it on the server first, then mark it installed in this browser. Throws when the API
 * refuses, and then nothing is marked installed — so the Apps grid, the plugins list and the plugin's own page
 * all agree with what the server (and the storefront checkout) see.
 */
export async function registerPluginInstall(pluginId: string): Promise<void> {
  if (isSmsGatewayPluginId(pluginId)) await installSmsGatewayPlugin(pluginId);
  else await SERVER_INSTALLERS[pluginId]?.();
  usePluginsStore.getState().installPlugin(pluginId);
}
