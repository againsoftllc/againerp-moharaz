/** AI module navigation - top module chrome (same pattern as CRM / Finance). */
export type AiNavMenu = { id: string; label: string; href: string };

export const AI_NAV_MENUS: AiNavMenu[] = [
  { id: "admin", label: "Admin", href: "/ai" },
  { id: "storefront", label: "Storefront", href: "/ai/storefront" },
  { id: "configuration", label: "Configuration", href: "/ai/configuration" },
];
