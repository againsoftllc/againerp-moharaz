/**
 * AgainERP Vendors navigation — top module chrome.
 * Mirrors lib/suppliers/supplier-nav.ts structurally.
 */

export type VendorNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type VendorNavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: VendorNavEntry[];
};

export const VENDOR_NAV_MENUS: VendorNavMenu[] = [
  {
    id: "directory",
    label: "Vendors",
    direct: true,
    href: "/vendors",
    children: [],
  },
  {
    id: "groups",
    label: "Groups",
    direct: true,
    href: "/vendors/groups",
    children: [],
  },
  {
    id: "catalog",
    label: "Catalog",
    direct: true,
    href: "/vendors/catalog",
    children: [],
  },
  {
    id: "pricing",
    label: "Price Lists",
    direct: true,
    href: "/vendors/price-lists",
    children: [],
  },
  {
    id: "order-requests",
    label: "Order Requests",
    direct: true,
    href: "/vendors/order-requests",
    children: [],
  },
  {
    id: "quotations",
    label: "Quotations",
    direct: true,
    href: "/vendors/quotations",
    children: [],
  },
  {
    id: "analytics",
    label: "Analytics",
    direct: true,
    href: "/vendors/analytics",
    children: [],
  },
  {
    id: "settings",
    label: "Settings",
    direct: true,
    href: "/vendors/settings",
    children: [],
  },
];
