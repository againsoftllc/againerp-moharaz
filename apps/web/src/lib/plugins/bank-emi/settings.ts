import { DEFAULT_EMI_SETTINGS } from "@/lib/mock-data/emi-banks";
import { parseBanksFromConfig } from "@/lib/plugins/bank-emi/banks-config";
import type { EmiSettings } from "./types";

/** Read EMI settings — plugin config overrides prototype defaults when installed */
export function resolveEmiSettings(
  pluginConfig?: Record<string, string | boolean | number> | null,
  installed?: boolean,
  enabled?: boolean,
): EmiSettings {
  const base = DEFAULT_EMI_SETTINGS;

  if (installed && enabled === false) {
    return { ...base, enabled: false };
  }

  if (!installed) {
    return base;
  }

  const minOrderAmount = Number(pluginConfig?.min_order_amount ?? base.minOrderAmount);

  return {
    ...base,
    enabled: Boolean(pluginConfig?.plugin_enabled ?? true),
    minOrderAmount: Number.isFinite(minOrderAmount) ? minOrderAmount : base.minOrderAmount,
    showOnPdp: Boolean(pluginConfig?.show_on_pdp ?? true),
    showOnCart: Boolean(pluginConfig?.show_on_cart ?? true),
    showOnBuilder: Boolean(pluginConfig?.show_on_builder ?? true),
    labelEn: String(pluginConfig?.label_en ?? base.labelEn),
    labelBn: pluginConfig?.label_bn ? String(pluginConfig.label_bn) : base.labelBn,
    banks: parseBanksFromConfig(pluginConfig),
  };
}
