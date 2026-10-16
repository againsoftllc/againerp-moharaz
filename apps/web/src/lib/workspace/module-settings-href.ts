/** Canonical settings page for each workspace sidebar module. */
export const MODULE_SETTINGS_HREF: Record<string, string> = {
  dashboard: "/dashboard/settings",
  catalog: "/catalog/settings",
  inventory: "/inventory/settings",
  purchase: "/purchase/settings",
  rma: "/rma/settings",
  service: "/service/settings",
  vendors: "/vendors/settings",
  dropshipping: "/dropshipping/settings",
  hrm: "/hrm/settings",
  website: "/website/configuration",
  media: "/workspace/media/settings",
  sales: "/sales/settings",
  pos: "/pos/settings",
  finance: "/finance/settings",
  accounting: "/finance/settings",
  crm: "/crm/settings",
  customers: "/customers/settings",
  workspace: "/workspace/business",
};

export function moduleSettingsHref(moduleId: string): string | undefined {
  return MODULE_SETTINGS_HREF[moduleId];
}
