"use client";

/**
 * Maps website menu items → Shop megamenu columns (same rules as Monarch storefront).
 * Level-1 left rail · Level-2 groups · Level-3+ flattened under each group.
 */
import type { WebsiteMenuItem } from "@/lib/website/website-menus";

export type ShopPreviewLink = { id: string; name: string; href: string };
export type ShopPreviewGroup = {
  id: string;
  name: string;
  href: string;
  links: ShopPreviewLink[];
};
export type ShopPreviewCategory = {
  id: string;
  name: string;
  href: string;
  hasGroups: boolean;
  sub: ShopPreviewLink[];
  groups: ShopPreviewGroup[];
};

function flattenDescendants(nodes: WebsiteMenuItem[]): ShopPreviewLink[] {
  const out: ShopPreviewLink[] = [];
  for (const n of nodes) {
    if (n.hidden) continue;
    out.push({ id: n.id, name: n.label, href: n.href || "#" });
    if (n.children.length > 0) {
      out.push(...flattenDescendants(n.children));
    }
  }
  return out;
}

export function menuItemsToShopPreview(items: WebsiteMenuItem[]): ShopPreviewCategory[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => {
      const children = item.children.filter((c) => !c.hidden);
      if (children.length === 0) {
        return {
          id: item.id,
          name: item.label,
          href: item.href || "#",
          hasGroups: false,
          sub: [{ id: item.id, name: `All ${item.label}`, href: item.href || "#" }],
          groups: [],
        };
      }

      const hasGroups = children.some((c) => c.children.some((g) => !g.hidden));

      if (hasGroups) {
        return {
          id: item.id,
          name: item.label,
          href: item.href || "#",
          hasGroups: true,
          sub: [],
          groups: children.map((c) => {
            const grand = c.children.filter((g) => !g.hidden);
            return {
              id: c.id,
              name: c.label,
              href: c.href || "#",
              links:
                grand.length > 0
                  ? flattenDescendants(grand)
                  : [{ id: c.id, name: `All ${c.label}`, href: c.href || "#" }],
            };
          }),
        };
      }

      return {
        id: item.id,
        name: item.label,
        href: item.href || "#",
        hasGroups: false,
        sub: children.map((c) => ({
          id: c.id,
          name: c.label,
          href: c.href || "#",
        })),
        groups: [],
      };
    });
}
