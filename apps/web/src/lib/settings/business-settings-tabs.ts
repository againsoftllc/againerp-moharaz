import { BUSINESS_SETTINGS_CATEGORIES } from "@/lib/settings/settings-schema";

export const BUSINESS_GENERAL_TAB_IDS = [
  "store",
  "catalog",
  "customers",
  "orders",
  "checkout",
  "marketing",
  "seo",
] as const;

export const BUSINESS_CONFIG_TABS = [
  { id: "localisation", title: "Localisation" },
  { id: "payments", title: "Payment Gateways" },
  { id: "shipping", title: "Shipping Methods" },
  { id: "notifications", title: "Email / SMS" },
  { id: "permission", title: "Permission" },
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

export function parseBusinessSettingsTab(raw: string | null): BusinessSettingsTabId {
  if (raw === "general") return "store";
  if (raw && isBusinessSettingsTabId(raw)) return raw;
  return "store";
}

export function businessSettingsHref(tab: BusinessSettingsTabId, loc?: string) {
  if (tab === "store" && !loc) return "/workspace/business";
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "localisation" && loc && loc !== "store-locations") {
    params.set("loc", loc);
  }
  return `/workspace/business?${params.toString()}`;
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
