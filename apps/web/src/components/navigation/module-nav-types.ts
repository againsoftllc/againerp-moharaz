import type { LucideIcon } from "lucide-react";

export type ModuleNavItem = {
  id: string;
  title: string;
  href?: string;
  action?: string;
  icon?: LucideIcon;
  badge?: number;
  children?: ModuleNavItem[];
};

export type ModuleNavFlatEntry = {
  id: string;
  title: string;
  href: string;
  path: string[];
};

export function flattenModuleNav(
  items: ModuleNavItem[],
  parents: string[] = [],
): ModuleNavFlatEntry[] {
  const out: ModuleNavFlatEntry[] = [];
  for (const item of items) {
    const path = [...parents, item.title];
    if (item.href) {
      out.push({ id: item.id, title: item.title, href: item.href, path });
    }
    if (item.children?.length) {
      out.push(...flattenModuleNav(item.children, path));
    }
  }
  return out;
}
