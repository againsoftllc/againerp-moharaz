/**
 * Center → AgainERP workspace module + plugin mapping.
 * Center codes come from /api/v1/client/entitlements.
 */

import type { ToggleableModuleId } from "@/lib/store/module-settings-store";
import { PLUGIN_REGISTRY } from "@/lib/settings/plugins/registry";

/** Center module code → ERP sidebar module ids it gates. */
export const CENTER_MODULE_TO_ERP: Record<string, ToggleableModuleId[]> = {
  catalog: ["catalog", "dropshipping"],
  orders: ["sales"],
  customers: ["customers"],
  media: ["media"],
  seo: ["website"],
};

/** ERP modules not yet represented in Center — stay on local toggles. */
export const LOCAL_ONLY_MODULE_IDS: ToggleableModuleId[] = [
  "inventory",
  "purchase",
  "rma",
  "service",
  "vendors",
  "hrm",
  "blog",
  "pos",
  "finance",
  "accounting",
  "crm",
];

/** Center plugin codes (= AgainERP PLUGIN_REGISTRY ids). */
export const CENTER_PLUGIN_IDS = PLUGIN_REGISTRY.map((p) => p.id);

export type CenterEntitlements = {
  client_id: string;
  slug: string;
  name: string;
  plan: string;
  domain: string | null;
  api_url: string | null;
  status: string;
  enabled_modules: string[];
  enabled_plugins?: string[];
  feature_flags: Record<string, boolean>;
  /** Center AI Access toggle — ERP assistant uses Center-proxied OpenAI when true. */
  ai_enabled?: boolean;
  ai_access_status?: string;
  modules: Array<{
    code: string;
    label: string;
    enabled: boolean;
    status: string;
    feature_flag_key?: string;
  }>;
  plugins?: Array<{
    id?: string;
    code: string;
    label: string;
    enabled: boolean;
    status: string;
    feature_flag_key?: string;
    category?: string;
    /** False when Center's plan/tier disallows this plugin for the tenant outright. */
    can_enable?: boolean;
    blocked_reason?: string | null;
  }>;
};

/** True when Center granted AI Access for this fleet client. */
export function isCenterAiEnabled(entitlements: CenterEntitlements | null | undefined): boolean {
  if (!entitlements) return false;
  if (typeof entitlements.ai_enabled === "boolean") return entitlements.ai_enabled;
  return Boolean(entitlements.feature_flags?.["ai.enabled"]);
}

export function centerManagedErpModuleIds(): ToggleableModuleId[] {
  const ids = new Set<ToggleableModuleId>();
  for (const erpIds of Object.values(CENTER_MODULE_TO_ERP)) {
    for (const id of erpIds) ids.add(id);
  }
  return [...ids];
}

export function isCenterManagedModule(id: string): boolean {
  return centerManagedErpModuleIds().includes(id as ToggleableModuleId);
}

/**
 * Build ERP module enabled map from Center entitlements.
 * Unmapped (local-only) modules keep `localEnabled` values.
 */
export function erpEnabledFromCenter(
  entitlements: CenterEntitlements,
  localEnabled: Record<ToggleableModuleId, boolean>,
): Record<ToggleableModuleId, boolean> {
  const centerOn = new Set(entitlements.enabled_modules);
  const next = { ...localEnabled };

  for (const [centerCode, erpIds] of Object.entries(CENTER_MODULE_TO_ERP)) {
    const allowed = centerOn.has(centerCode);
    for (const erpId of erpIds) {
      next[erpId] = allowed;
    }
  }

  return next;
}

/**
 * Plugin ids Center explicitly disallows for this tenant's plan (can_enable: false).
 * Center's per-plugin `enabled` flag tracks whether the tenant has *activated* it in
 * Center's own dashboard — a separate, tenant-level toggle, not platform availability —
 * so it must not be used to hide plugins from the local ERP marketplace. A plugin Center
 * doesn't mention at all, or lists with `can_enable: true`, stays visible/installable here.
 */
export function blockedPluginsFromCenter(entitlements: CenterEntitlements): string[] {
  if (!Array.isArray(entitlements.plugins)) return [];
  return entitlements.plugins
    .filter((p) => p.can_enable === false)
    .map((p) => p.id ?? p.code)
    .filter((id): id is string => Boolean(id) && CENTER_PLUGIN_IDS.includes(id));
}
