import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Globe,
  Handshake,
  Headset,
  Image,
  LayoutDashboard,
  Receipt,
  Settings,
  Sparkles,
  Store,
  Truck,
  Users,
  Warehouse,
  Wallet,
  BarChart3,
} from "lucide-react";

export type WorkspaceNavItem = {
  id: string;
  title: string;
  href?: string;
  icon?: LucideIcon;
  badge?: string;
  children?: WorkspaceNavItem[];
};

/** AgainERP workspace sidebar — flat list, no section group headers. */
export const workspaceNavItems: WorkspaceNavItem[] = [
  {
    id: "website",
    title: "Website",
    icon: Globe,
    href: "/website/dashboard",
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: Warehouse,
    href: "/inventory/dashboard",
  },
  {
    id: "service",
    title: "Service",
    icon: Headset,
    href: "/service",
  },
  {
    id: "ai",
    title: "AI",
    icon: Sparkles,
    href: "/ai",
  },
  {
    id: "dropshipping",
    title: "Dropshipping",
    icon: Truck,
    href: "/dropshipping/products",
  },
  {
    id: "hrm",
    title: "HRM",
    icon: Briefcase,
    href: "/hrm/dashboard",
  },
  {
    id: "media",
    title: "Media",
    icon: Image,
    href: "/workspace/media",
  },
  {
    id: "pos",
    title: "POS",
    icon: Store,
    href: "/pos",
  },
  {
    id: "finance",
    title: "Finance",
    icon: Wallet,
    href: "/finance/dashboard",
  },
  {
    id: "expenses",
    title: "Expenses",
    icon: Receipt,
    href: "/expenses",
  },
  {
    id: "crm",
    title: "CRM",
    icon: Handshake,
    href: "/crm/dashboard",
  },
  {
    id: "customers",
    title: "Party",
    icon: Users,
    href: "/party",
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    href: "/reports",
  },
  {
    id: "workspace",
    title: "Workspace",
    icon: Settings,
    href: "/workspace/apps",
  },
];

/** Modules that stay in the Apps list but are not shown in the left menu (Media is opened from the Workspace top bar). */
export const SIDEBAR_HIDDEN_MODULE_IDS: ReadonlySet<string> = new Set(["media"]);

export const workspaceHomeItem: WorkspaceNavItem = {
  id: "home",
  title: "Home",
  href: "/dashboard",
  icon: LayoutDashboard,
};

export const workspaceDashboardItem: WorkspaceNavItem = {
  id: "dashboard",
  title: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
};

export function flattenWorkspaceNav(): { title: string; href: string }[] {
  const items: { title: string; href: string }[] = [];
  const walk = (nodes: WorkspaceNavItem[], prefix: string) => {
    for (const node of nodes) {
      if (node.href) {
        items.push({
          title: prefix ? `${prefix} › ${node.title}` : node.title,
          href: node.href,
        });
      }
      if (node.children) walk(node.children, prefix ? `${prefix} › ${node.title}` : node.title);
    }
  };
  if (workspaceHomeItem.href) {
    items.push({ title: workspaceHomeItem.title, href: workspaceHomeItem.href });
  }
  walk(workspaceNavItems, "");
  return items;
}

export function flattenWorkspaceNavWithPath(): { title: string; href: string; path: string[] }[] {
  const items: { title: string; href: string; path: string[] }[] = [];
  const walk = (nodes: WorkspaceNavItem[], pathPrefix: string[]) => {
    for (const node of nodes) {
      const path = [...pathPrefix, node.title];
      if (node.href) items.push({ title: node.title, href: node.href, path });
      if (node.children) walk(node.children, path);
    }
  };
  if (workspaceHomeItem.href) {
    items.push({
      title: workspaceHomeItem.title,
      href: workspaceHomeItem.href,
      path: [workspaceHomeItem.title],
    });
  }
  walk(workspaceNavItems, []);
  return items;
}
