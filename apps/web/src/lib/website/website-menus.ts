export type MenuLinkType = "page" | "category" | "brand" | "custom";
export type MenuKind = "system" | "custom";
export type MenuSource = "auto" | "custom";
export type MenuAutoType = "category" | "brand" | "page";
export type MenuNavStyle = "megamenu" | "dropdown";
export type MenuSystemKey = "catalog" | "header" | "footer";

export type WebsiteMenuItem = {
  id: string;
  label: string;
  linkType: MenuLinkType;
  linkRefId: string | null;
  href: string;
  hidden: boolean;
  children: WebsiteMenuItem[];
};

export type WebsiteMenu = {
  id: string;
  companyId: string;
  name: string;
  handle: string;
  kind: MenuKind;
  systemKey: MenuSystemKey | null;
  source: MenuSource;
  autoType: MenuAutoType;
  /** When Auto: newly synced entities start visible (eye open) or hidden (eye closed). */
  autoShowNew: boolean;
  active: boolean;
  sortOrder: number;
  items: WebsiteMenuItem[];
  autoPreview: WebsiteMenuItem[];
  createdAt: string;
  updatedAt: string;
};

export type WebsiteMenuSlot = {
  slotKey: string;
  menuId: string;
  menuName: string | null;
  title: string;
  navStyle: MenuNavStyle;
  updatedAt: string;
};

export type WebsiteMenuInput = {
  name: string;
  handle?: string;
  source?: MenuSource;
  autoType?: MenuAutoType;
  autoShowNew?: boolean;
  items?: WebsiteMenuItem[];
  active?: boolean;
};

export type WebsiteMenuUpdateInput = {
  name?: string;
  handle?: string;
  source?: MenuSource;
  autoType?: MenuAutoType;
  autoShowNew?: boolean;
  items?: WebsiteMenuItem[];
  active?: boolean;
  sortOrder?: number;
};

export function newMenuItemId(): string {
  return `mi${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultMenuItem(partial?: Partial<WebsiteMenuItem>): WebsiteMenuItem {
  return {
    id: newMenuItemId(),
    label: "",
    linkType: "custom",
    linkRefId: null,
    href: "",
    hidden: false,
    children: [],
    ...partial,
  };
}

export function autoTypeLabel(autoType: MenuAutoType): string {
  switch (autoType) {
    case "brand":
      return "Brand";
    case "page":
      return "Page";
    default:
      return "Category";
  }
}

export function slotLabel(slotKey: string): string {
  switch (slotKey) {
    case "catalog.shop":
      return "Catalog / Shop";
    case "header.primary":
      return "Header";
    case "footer.links":
      return "Footer links";
    default:
      return slotKey;
  }
}
