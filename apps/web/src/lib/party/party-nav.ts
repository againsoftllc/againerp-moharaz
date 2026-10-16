/**
 * AgainERP Party navigation — top module chrome.
 * A Party is one real-world person or company; Customer/Supplier/Vendor
 * are roles the same party can hold (see docs/architecture/PARTY_*.md).
 * This module is the unified entry point to all three role lists.
 */

export type PartyNavMenu = {
  id: string;
  label: string;
  direct: true;
  href: string;
  children: [];
};

export const PARTY_NAV_MENUS: PartyNavMenu[] = [
  {
    id: "customers",
    label: "Customer",
    direct: true,
    href: "/customers?from=party",
    children: [],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    direct: true,
    href: "/suppliers?from=party",
    children: [],
  },
  {
    id: "vendors",
    label: "Vendors",
    direct: true,
    href: "/vendors?from=party",
    children: [],
  },
];
