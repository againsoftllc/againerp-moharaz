import { BUSINESS_SETTINGS_CATEGORIES } from "@/lib/settings/settings-schema";

/**
 * Only the settings the ERP reads are listed. The old Store, Catalog, Orders, Checkout, Marketing, SEO and Email / SMS pages held
 * values nothing consumed (Store duplicated Company, Localisation duplicated Company › Localization, Permission moved to Users &
 * Roles), so they are no longer offered. Their keys stay in settings-schema.ts.
 */
export const BUSINESS_GENERAL_TAB_IDS = ["customers"] as const;

export const BUSINESS_CONFIG_TABS = [
  { id: "payments", title: "Payment Gateways" },
  { id: "shipping", title: "Shipping Methods" },
] as const;

export type BusinessSettingsTabId =
  | (typeof BUSINESS_GENERAL_TAB_IDS)[number]
  | (typeof BUSINESS_CONFIG_TABS)[number]["id"];

const ALL_TAB_IDS = new Set<string>([
  ...BUSINESS_GENERAL_TAB_IDS,
  ...BUSINESS_CONFIG_TABS.map((t) => t.id),
]);

export function isBusinessSettingsTabId(value: string): value is BusinessSettingsTabId {
  return ALL_TAB_IDS.has(value);
}

/** Where the pages that used to be tabs here live now. */
export const MOVED_BUSINESS_TABS: Record<string, string> = {
  permission: "/workspace/users",
  localisation: "/workspace/setup?tab=localization",
};

export function parseBusinessSettingsTab(raw: string | null): BusinessSettingsTabId {
  if (raw && isBusinessSettingsTabId(raw)) return raw;
  return "customers";
}

export function businessSettingsHref(tab: BusinessSettingsTabId) {
  if (tab === "customers") return "/website/settings/checkout";
  return `/website/settings/checkout?tab=${tab}`;
}

export function businessGeneralTabs() {
  return BUSINESS_GENERAL_TAB_IDS.map((id) => {
    const category = BUSINESS_SETTINGS_CATEGORIES.find((c) => c.id === id);
    const itemCount =
      category?.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0) ?? 0;
    return {
      id,
      title: category?.title ?? id,
      itemCount,
    };
  });
}

export function categoryItemCount(categoryId: string) {
  const category = BUSINESS_SETTINGS_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return 0;
  return category.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0);
}
