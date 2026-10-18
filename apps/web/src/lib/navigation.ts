import type { LucideIcon } from "lucide-react";
import {
  workspaceNavItems,
  SIDEBAR_HIDDEN_MODULE_IDS,
  workspaceHomeItem,
  type WorkspaceNavItem,
} from "@/lib/workspace/navigation-config";

export type NavItem = {
  title: string;
  href?: string;
  icon?: LucideIcon;
  children?: NavItem[];
};

function toNavItem(node: WorkspaceNavItem): NavItem {
  return {
    title: node.title,
    href: node.href,
    icon: node.icon,
    children: node.children?.map(toNavItem),
  };
}

/** Derived from workspace nav — keep in sync via navigation-config.ts only. */
export const sidebarNav: NavItem[] = [
  {
    title: workspaceHomeItem.title,
    href: workspaceHomeItem.href,
    icon: workspaceHomeItem.icon,
  },
  ...workspaceNavItems.filter((item) => !SIDEBAR_HIDDEN_MODULE_IDS.has(item.id)).map(toNavItem),
];

export const quickCreateItems = [
  { label: "Product", href: "/website/products?create=1" },
  { label: "Order", href: "/sales" },
  { label: "POS Sale", href: "/pos/sale" },
  { label: "Customer", href: "/customers?create=1" },
  { label: "Category", href: "/website/categories?create=1" },
  { label: "Purchase Order", href: "/purchase/orders?create=1" },
  { label: "Service Item", href: "/service/items?create=1" },
  { label: "Job Card", href: "/service/jobs" },
  { label: "Manufactured Item", href: "/manufacturing/items?create=1" },
  { label: "Coupon", href: "/website/marketing/coupons?create=1" },
];

export const branches = [
  { id: "br1", companyId: "co1", name: "Dhaka HQ" },
  { id: "br2", companyId: "co1", name: "Chittagong" },
  { id: "br3", companyId: "co2", name: "Main Warehouse" },
];
