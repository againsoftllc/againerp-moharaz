"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { SEO_CONFIG_MENU, SEO_NAV_MENUS } from "@/lib/seo/seo-nav";
import { SpecificationProfilesDrawer, openSpecificationProfiles } from "@/components/specifications/specification-profiles-drawer";

/** `action` items open something in place (no page): see handleSelect */
type NavLink = { id: string; label: string; href: string; action?: "spec-profiles"; children?: NavLink[] };
type NavGroup = { id: string; label: string; href?: string; children: NavLink[] };

type NavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href?: string; action?: NavLink["action"]; children?: NavLink[] };

type NavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: NavEntry[];
};

/** Again catalog main navbar — same dark strip as Inventory. */
const CATALOG_NAV = {
  bg: "#2c2e3f",
  border: "#1e2030",
  activeBg: "#243b3b",
  activeBorder: "#3d5a58",
  dropdownBg: "#383b4a",
  dropdownBorder: "#4a4d5c",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

// Explicit top-level nav order. Any id not listed here (future additions)
// falls back to appending after these, so nothing silently disappears.
const TOP_NAV_ORDER = ["catalog", "sales", "tools", "promotions", "site", "blog", "seo", "configuration"];

const DIRECT_LINKS: NavLink[] = [{ id: "blog", label: "Blog", href: "/website/blog" }];

const NAV_GROUPS_BASE: NavGroup[] = [
  {
    id: "site",
    label: "Site",
    children: [
      { id: "pages", label: "Pages", href: "/website/pages" },
      { id: "layout", label: "Layout", href: "/website/layout" },
      { id: "menus", label: "Menus", href: "/website/menus" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    children: [
      { id: "product", label: "Product", href: "/website/products" },
      { id: "product-draft", label: "Product Draft", href: "/website/product-draft" },
      { id: "category", label: "Category", href: "/website/categories" },
      { id: "brand", label: "Brand", href: "/website/brands" },
      { id: "attribute", label: "Attribute", href: "/website/attributes" },
      // opens the Specification Profiles drawer (the filters are the profiles' filterable fields)
      { id: "filter", label: "Filter", href: "#specification-profiles", action: "spec-profiles" },
      { id: "options", label: "Options", href: "/website/variants" },
      { id: "review", label: "Review", href: "/website/reviews" },
      { id: "qa", label: "Q&A", href: "/website/qa" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: [
      { id: "settings", label: "Settings", href: "/website/settings" },
      { id: "builder", label: "Builders", href: "/website/product-configurator/profiles" },
    ],
  },
  // Offers, Coupons, and Happy Hour are real marketing pages backed by the
  // marketing_* API routers. Templates isn't built yet — "Coming soon"
  // placeholder. Bundles is a real, existing page (moved out of Configuration).
  {
    id: "promotions",
    label: "Promotions",
    children: [
      { id: "offers", label: "Offers", href: "/website/marketing/offers" },
      { id: "happy-hour", label: "Happy Hour", href: "/website/marketing/happy-hour" },
      { id: "coupons", label: "Coupons", href: "/website/marketing/coupons" },
      { id: "bundles", label: "Bundles", href: "/website/bundles" },
      { id: "templates", label: "Templates", href: "/website/templates" },
    ],
  },
  // Same 4 items as the Sales module's own navbar, mounted under /website/sales/*
  // so they show the Website chrome — the actual /sales/* module is untouched.
  {
    id: "sales",
    label: "Sales",
    children: [
      { id: "order", label: "Order", href: "/website/orders" },
      { id: "quotation", label: "Quotation", href: "/website/quotations" },
      { id: "return", label: "Return", href: "/website/returns" },
      { id: "customer", label: "Customer", href: "/website/customers" },
    ],
  },
  // Storefront tools — Price Compare + PC Builder are real, existing pages; the
  // rest aren't built yet and land on a shared "Coming soon" placeholder.
  {
    id: "tools",
    label: "Tools",
    children: [
      { id: "price-compare", label: "Price Compare", href: "/website/price-compare" },
      { id: "pc-builder", label: "PC Builder", href: "/website/pc-builder" },
      { id: "cctv-builder", label: "CCTV Builder", href: "/website/cctv-builder" },
      { id: "server-builder", label: "Server Builder", href: "/website/server-builder" },
      { id: "laptop-finder", label: "Laptop Finder", href: "/website/laptop-finder" },
      { id: "ac-calculator", label: "AC Calculator", href: "/website/ac-calculator" },
      { id: "emi-calculator", label: "EMI Calculator", href: "/website/emi-calculator" },
      { id: "product-compare", label: "Product Compare", href: "/website/product-compare" },
    ],
  },
  // Former Website module's SEO tools, carried over as-is. "Config" (was its own
  // top-level "SEO Config" dropdown) now lives here as one submenu entry, with its
  // General/Sitemap/Robots/Schema sections nested as a flyout submenu under it.
  {
    id: "seo",
    label: "SEO",
    children: [
      ...SEO_NAV_MENUS.filter((m) => m.href).map((m) => ({
        id: m.id,
        label: m.label,
        href: m.href!,
      })),
      {
        id: "config",
        label: "Config",
        href: SEO_CONFIG_MENU.href!,
        children: SEO_CONFIG_MENU.children
          .filter((entry): entry is Extract<typeof entry, { kind: "item" }> => entry.kind === "item")
          .map((entry) => ({ id: entry.id, label: entry.label, href: entry.href })),
      },
    ],
  },
];

function isActiveHref(pathname: string, href: string) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // `/website/reviews` list — don't steal tools subroutes
  if (href === "/website/reviews") {
    const first = pathname.slice(href.length + 1).split("/")[0] ?? "";
    const siblingRoots = new Set(["reports", "settings", "all"]);
    return !siblingRoots.has(first);
  }
  return true;
}

function resolveCatalogNav(
  pathname: string,
  groups: NavGroup[],
): { activeNav: string; activeSub: string } {
  // Check the most specific (longest) hrefs first — otherwise a short href like "/seo"
  // (URLs) would greedily match "/seo/audit" before the real "Audit" entry gets a chance.
  const candidates: { navId: string; subId: string; href: string }[] = [];
  for (const group of groups) {
    if (group.href) {
      candidates.push({ navId: group.id, subId: group.id, href: group.href });
    }
    for (const child of group.children) {
      candidates.push({ navId: group.id, subId: child.id, href: child.href });
      for (const grandchild of child.children ?? []) {
        candidates.push({ navId: group.id, subId: grandchild.id, href: grandchild.href });
      }
    }
  }
  for (const item of DIRECT_LINKS) {
    candidates.push({ navId: item.id, subId: item.id, href: item.href });
  }
  candidates.sort((a, b) => b.href.length - a.href.length);
  for (const c of candidates) {
    if (isActiveHref(pathname, c.href)) {
      return { activeNav: c.navId, activeSub: c.subId };
    }
  }
  return { activeNav: "catalog", activeSub: "product" };
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? CATALOG_NAV.activeBg : "transparent",
    borderColor: highlighted ? CATALOG_NAV.activeBorder : "transparent",
  };
}

function NavChip({
  highlighted,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { highlighted: boolean }) {
  return (
    <button
      type="button"
      className={cn(NAV_CHIP, highlighted ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE, className)}
      style={navButtonStyle(highlighted)}
      {...props}
    >
      {children}
    </button>
  );
}

function CatalogAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#714B67" />
        <rect x="14" y="0" width="14" height="14" fill="#00A09D" />
        <rect x="0" y="14" width="14" height="14" fill="#F0AD4E" />
        <rect x="14" y="14" width="14" height="14" fill="#714B67" opacity="0.55" />
      </g>
    </svg>
  );
}

function NavMenuItem({
  menu,
  activeNav,
  activeSub,
}: {
  menu: NavMenu;
  activeNav: string;
  activeSub: string;
}) {
  const router = useRouter();
  const active = menu.id === activeNav;
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Nested flyout (e.g. SEO > Config > General/Sitemap/Robots/Schema).
  const [subOpenId, setSubOpenId] = useState<string | null>(null);
  const [subMenuPos, setSubMenuPos] = useState<{ left: number; top: number } | null>(null);
  const subCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subTriggerRefs = useRef<Record<string, HTMLElement | null>>({});

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ left: rect.left, top: rect.bottom });
  }, []);

  const showMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!open) updatePosition();
    setOpen(true);
  };

  const hideMenu = () => {
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setSubOpenId(null);
    }, 120);
  };

  const showSubMenu = (entryId: string) => {
    if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
    const rect = subTriggerRefs.current[entryId]?.getBoundingClientRect();
    if (rect) setSubMenuPos({ left: rect.right, top: rect.top });
    setSubOpenId(entryId);
  };

  const hideSubMenu = () => {
    subCloseTimer.current = setTimeout(() => setSubOpenId(null), 120);
  };

  const handleSelect = (entry: { href?: string; action?: string }) => {
    setOpen(false);
    setSubOpenId(null);
    if (entry.action === "spec-profiles") openSpecificationProfiles();
    else if (entry.href) router.push(entry.href);
  };

  const dropdownPanel =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            className="fixed z-[9999] max-h-[min(70vh,28rem)] min-w-[160px] overflow-y-auto rounded-none border py-0.5 text-white shadow-lg"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              backgroundColor: CATALOG_NAV.dropdownBg,
              borderColor: CATALOG_NAV.dropdownBorder,
            }}
            onMouseEnter={showMenu}
            onMouseLeave={hideMenu}
          >
            {menu.children.map((entry) => {
              if (entry.kind === "header") {
                return (
                  <div
                    key={entry.id}
                    role="presentation"
                    className="cursor-default px-3 py-1 text-[10px] font-normal uppercase tracking-wide text-white/45"
                  >
                    {entry.label}
                  </div>
                );
              }

              const subActive = active && entry.id === activeSub;
              const hasChildren = !!entry.children?.length;
              return (
                <div
                  key={entry.id}
                  ref={hasChildren ? (el) => { subTriggerRefs.current[entry.id] = el; } : undefined}
                  onMouseEnter={hasChildren ? () => showSubMenu(entry.id) : undefined}
                  onMouseLeave={hasChildren ? hideSubMenu : undefined}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup={hasChildren ? "menu" : undefined}
                    aria-expanded={hasChildren ? subOpenId === entry.id : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-none px-3 py-1 text-left text-[11px] leading-snug text-white/90 hover:bg-white/10 hover:text-white",
                      subActive && "bg-white/10 font-medium text-white",
                    )}
                    onClick={() => handleSelect(entry)}
                  >
                    {entry.label}
                    {hasChildren && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  const subOpenEntry =
    subOpenId != null
      ? menu.children
          .filter((e): e is Extract<NavEntry, { kind: "item" }> => e.kind === "item")
          .find((e) => e.id === subOpenId)
      : undefined;

  const subMenuPanel =
    subOpenEntry?.children?.length && subMenuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            className="fixed z-[10000] max-h-[min(70vh,28rem)] min-w-[180px] overflow-y-auto rounded-none border py-0.5 text-white shadow-lg"
            style={{
              left: subMenuPos.left,
              top: subMenuPos.top,
              backgroundColor: CATALOG_NAV.dropdownBg,
              borderColor: CATALOG_NAV.dropdownBorder,
            }}
            onMouseEnter={() => {
              if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
            }}
            onMouseLeave={hideSubMenu}
          >
            {subOpenEntry.children.map((child) => (
              <button
                key={child.id}
                type="button"
                role="menuitem"
                className="block w-full cursor-pointer rounded-none px-3 py-1 text-left text-[11px] leading-snug text-white/90 hover:bg-white/10 hover:text-white"
                onClick={() => handleSelect(child)}
              >
                {child.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  if (menu.direct) {
    return (
      <div className={NAV_SLOT}>
        <NavChip
          highlighted={active}
          onClick={() => {
            if (menu.href) router.push(menu.href);
          }}
        >
          {menu.label}
        </NavChip>
      </div>
    );
  }

  const highlighted = active || open;

  return (
    <>
      <div
        ref={triggerRef}
        className={NAV_SLOT}
        onMouseEnter={showMenu}
        onMouseLeave={hideMenu}
      >
        <NavChip
          highlighted={highlighted}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={menu.href ? () => router.push(menu.href!) : undefined}
        >
          {menu.label}
        </NavChip>
      </div>
      {dropdownPanel}
      {subMenuPanel}
    </>
  );
}

export function CatalogModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const builderPlugin = usePluginsStore((s) => s.plugins["again-builder"]);
  const isPluginVisible = usePluginsStore((s) => s.isPluginVisible);
  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const uninstallPlugin = usePluginsStore((s) => s.uninstallPlugin);
  const setEnabled = usePluginsStore((s) => s.setEnabled);
  const buildersEnabled = Boolean(
    isPluginVisible("again-builder") && builderPlugin?.installed && builderPlugin?.enabled,
  );

  // Keep local plugin gate in sync with API (e.g. after ops seed / install).
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/api/again-builder-plugin")
      .then(({ fetchAgainBuilderPlugin }) => fetchAgainBuilderPlugin())
      .then((row) => {
        if (cancelled) return;
        if (row.installed) {
          if (!usePluginsStore.getState().plugins["again-builder"]?.installed) {
            installPlugin("again-builder");
          }
          setEnabled("again-builder", row.enabled);
        } else if (usePluginsStore.getState().plugins["again-builder"]?.installed) {
          uninstallPlugin("again-builder");
        }
      })
      .catch(() => {
        /* offline / unauthorized — keep local store */
      });
    return () => {
      cancelled = true;
    };
  }, [installPlugin, uninstallPlugin, setEnabled]);

  const navGroups = useMemo(() => {
    return NAV_GROUPS_BASE.map((group) => ({
      ...group,
      children: group.children.filter((child) => child.id !== "builder" || buildersEnabled),
    }));
  }, [buildersEnabled]);

  const navMenus: NavMenu[] = useMemo(() => {
    const groupMenus = navGroups.map((group) => ({
      id: group.id,
      label: group.label,
      href: group.href,
      children: group.children.map((child) => ({
        kind: "item" as const,
        id: child.id,
        label: child.label,
        href: child.href,
        action: child.action,
        children: child.children,
      })),
    }));
    const directMenus = DIRECT_LINKS.map((item) => ({
      id: item.id,
      label: item.label,
      direct: true,
      href: item.href,
      children: [] as NavEntry[],
    }));
    const byId = new Map([...groupMenus, ...directMenus].map((m) => [m.id, m]));
    const ordered = TOP_NAV_ORDER.map((id) => byId.get(id)).filter(
      (m): m is NonNullable<typeof m> => Boolean(m),
    );
    const orderedIds = new Set(TOP_NAV_ORDER);
    const remaining = [...groupMenus, ...directMenus].filter((m) => !orderedIds.has(m.id));
    return [...ordered, ...remaining];
  }, [navGroups]);

  const { activeNav, activeSub } = resolveCatalogNav(pathname, navGroups);

  return (
    <header className="shrink-0 bg-background" data-component="catalog-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: CATALOG_NAV.bg,
          borderColor: CATALOG_NAV.border,
        }}
        aria-label="Website module"
        data-component="again_main_navbar"
      >
      <WorkspaceNavDrawerToggle tone="dark" />
      <Link
        href="/website/dashboard"
        prefetch
        aria-label="Website dashboard"
        title="Website dashboard"
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white no-underline hover:bg-white/[0.06] hover:text-white"
      >
        <CatalogAppIcon />
        Website
      </Link>

      <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navMenus.map((menu) => (
          <NavMenuItem key={menu.id} menu={menu} activeNav={activeNav} activeSub={activeSub} />
        ))}
      </div>

      <AgainSystray />
      </nav>
      <SpecificationProfilesDrawer />
    </header>
  );
}

/** Content below navbar — small top gap (Inventory control panel spacing). */
export function CatalogModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}
