export type ModuleNavTab = {
  id: string;
  label: string;
  href: string;
};

export type ModuleContext = {
  moduleId: string;
  moduleLabel: string;
  tabs: ModuleNavTab[];
};

const MODULE_TABS: Record<string, Omit<ModuleContext, "moduleId">> = {
  catalog: {
    moduleLabel: "Catalog",
    tabs: [
      { id: "WS-MODNAV-DASH", label: "Products", href: "/catalog/products" },
      { id: "WS-MODNAV-OPS", label: "Categories", href: "/catalog/categories" },
      { id: "WS-MODNAV-OPS", label: "Brands", href: "/catalog/brands" },
      { id: "WS-MODNAV-RPT", label: "Reports", href: "/reports" },
    ],
  },
  inventory: {
    moduleLabel: "Inventory",
    tabs: [
      { id: "WS-MODNAV-DASH", label: "Dashboard", href: "/inventory/dashboard" },
      { id: "WS-MODNAV-OPS", label: "Catalog", href: "/inventory/catalog" },
    ],
  },
  purchase: {
    moduleLabel: "Purchase",
    tabs: [
      { id: "WS-MODNAV-DASH", label: "Orders", href: "/purchase/orders" },
      { id: "WS-MODNAV-OPS", label: "Returns", href: "/purchase/returns" },
      { id: "WS-MODNAV-OPS", label: "Suppliers", href: "/suppliers" },
    ],
  },
  sales: {
    moduleLabel: "Sales",
    tabs: [
      { id: "WS-MODNAV-DASH", label: "Orders", href: "/sales" },
      { id: "WS-MODNAV-OPS", label: "Returns", href: "/sales/returns" },
      { id: "WS-MODNAV-SET", label: "Settings", href: "/sales/settings" },
    ],
  },
  website: {
    moduleLabel: "Website",
    tabs: [
      { id: "WS-MODNAV-PAGES", label: "Pages", href: "/website/pages" },
      { id: "WS-MODNAV-BLOG", label: "Blog", href: "/blog/articles" },
      { id: "WS-MODNAV-LAYOUT", label: "Layout", href: "/website/layout" },
      { id: "WS-MODNAV-SEO", label: "SEO", href: "/seo" },
      { id: "WS-MODNAV-SEOCFG", label: "Config", href: "/seo/config" },
      { id: "WS-MODNAV-MKT", label: "Marketing", href: "/website/marketing/offers" },
      { id: "WS-MODNAV-SET", label: "Configuration", href: "/website/configuration" },
    ],
  },
  accounting: {
    moduleLabel: "Accounting",
    tabs: [{ id: "WS-MODNAV-DASH", label: "Dashboard", href: "/accounting" }],
  },
};

export function resolveModuleContext(pathname: string): ModuleContext | null {
  if (pathname.startsWith("/catalog")) {
    return { moduleId: "catalog", ...MODULE_TABS.catalog };
  }
  if (pathname.startsWith("/inventory")) {
    return { moduleId: "inventory", ...MODULE_TABS.inventory };
  }
  if (pathname.startsWith("/purchase")) {
    return { moduleId: "purchase", ...MODULE_TABS.purchase };
  }
  if (pathname.startsWith("/sales")) {
    return { moduleId: "sales", ...MODULE_TABS.sales };
  }
  if (
    pathname === "/website" ||
    pathname.startsWith("/website/") ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname === "/seo" ||
    pathname.startsWith("/seo/")
  ) {
    return { moduleId: "website", ...MODULE_TABS.website };
  }
  if (pathname === "/accounting" || pathname.startsWith("/accounting/")) {
    return { moduleId: "accounting", ...MODULE_TABS.accounting };
  }
  return null;
}

export function isModuleNavTabActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === pathname) return true;
  if (pathname.startsWith(base + "/")) return true;
  return false;
}
