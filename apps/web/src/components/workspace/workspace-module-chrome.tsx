"use client";

import { useCallback, useId, useMemo, useRef, useState, type ReactNode, Suspense } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useIsSystemManager } from "@/lib/auth/permissions";
import { useScopeSites } from "@/lib/store/scope-sites";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";

type NavLink = { id: string; label: string; href: string };

type NavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href?: string };

type NavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: NavEntry[];
};

/** Again workspace main navbar — same dark strip as Catalog. */
const WORKSPACE_NAV = {
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

const DIRECT_LINKS: NavLink[] = [{ id: "media", label: "Media", href: "/workspace/media" }];

const APPS_HREF = "/workspace/apps";
const BILLING_HREF = "/workspace/billing";

const SITES_HREF = "/workspace/sites";

const CONFIG_LINKS: NavLink[] = [
  { id: "company", label: "Company", href: "/workspace/setup" },
  { id: "branches", label: "Branches", href: "/workspace/branches" },
  { id: "sequences", label: "Document Numbering", href: "/workspace/sequences" },
  { id: "periods", label: "Accounting Periods", href: "/workspace/periods" },
  { id: "approvals", label: "Approval Limits", href: "/workspace/approval-limits" },
  { id: "ai-approvals", label: "AI Approvals", href: "/workspace/ai-approvals" },
  { id: "ai-usage", label: "AI Usage", href: "/workspace/ai-usage" },
  { id: "general", label: "General Settings", href: "/workspace/business" },
  { id: "localisation", label: "Localisation", href: "/workspace/business?tab=localisation" },
  { id: "payments", label: "Payment Gateways", href: "/workspace/business?tab=payments" },
  { id: "shipping", label: "Shipping Methods", href: "/workspace/business?tab=shipping" },
  { id: "notifications", label: "Email / SMS", href: "/workspace/business?tab=notifications" },
  { id: "permission", label: "Permission", href: "/workspace/business?tab=permission" },
];

const NAV_MENUS: NavMenu[] = [
  // Apps is one page (modules + plugins in one grid) - a plain link, no sub menu
  { id: "apps", label: "Apps", direct: true, href: APPS_HREF, children: [] as NavEntry[] },
  // the ERP's own bills (subscription / module / plugin) and their pay links — System Manager only
  { id: "billing", label: "Billing", direct: true, href: BILLING_HREF, children: [] as NavEntry[] },
  ...DIRECT_LINKS.map((item) => ({
    id: item.id,
    label: item.label,
    direct: true,
    href: item.href,
    children: [] as NavEntry[],
  })),
  {
    id: "sites",
    label: "Sites",
    href: SITES_HREF,
    // Children are filled in at render time from the stores in the database.
    children: [] as NavEntry[],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: CONFIG_LINKS.map((child) => ({
      kind: "item" as const,
      id: child.id,
      label: child.label,
      href: child.href,
    })),
  },
];

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveWorkspaceNav(
  pathname: string,
  searchParams?: { get: (key: string) => string | null },
): { activeNav: string; activeSub: string } {
  // Apps = Modules + Plugins (plugin settings pages live under /workspace/plugins/<id>)
  if (isActiveHref(pathname, "/workspace/plugins")) {
    return { activeNav: "apps", activeSub: "plugins" };
  }
  if (isActiveHref(pathname, "/workspace/modules")) {
    return { activeNav: "apps", activeSub: "modules" };
  }
  if (isActiveHref(pathname, APPS_HREF)) {
    return {
      activeNav: "apps",
      activeSub: searchParams?.get("tab") === "plugins" ? "plugins" : "modules",
    };
  }
  if (isActiveHref(pathname, BILLING_HREF)) {
    return { activeNav: "billing", activeSub: "billing" };
  }
  // Sites (includes legacy /workspace/website and /workspace/stores)
  if (
    isActiveHref(pathname, SITES_HREF) ||
    isActiveHref(pathname, "/workspace/website") ||
    isActiveHref(pathname, "/workspace/stores")
  ) {
    const siteId = pathname.startsWith(`${SITES_HREF}/`)
      ? pathname.slice(SITES_HREF.length + 1).split("/")[0]
      : "";
    return { activeNav: "sites", activeSub: siteId || "sites-all" };
  }
  if (isActiveHref(pathname, "/workspace/media") || isActiveHref(pathname, "/media")) {
    return { activeNav: "media", activeSub: "media" };
  }
  for (const item of DIRECT_LINKS) {
    if (isActiveHref(pathname, item.href)) {
      return { activeNav: item.id, activeSub: item.id };
    }
  }
  // Users + Roles both live under Configuration → Permission
  if (
    isActiveHref(pathname, "/workspace/users") ||
    isActiveHref(pathname, "/workspace/roles")
  ) {
    return { activeNav: "configuration", activeSub: "permission" };
  }
  if (isActiveHref(pathname, "/workspace/setup")) {
    return { activeNav: "configuration", activeSub: "company" };
  }
  if (isActiveHref(pathname, "/workspace/branches")) {
    return { activeNav: "configuration", activeSub: "branches" };
  }
  if (isActiveHref(pathname, "/workspace/sequences")) {
    return { activeNav: "configuration", activeSub: "sequences" };
  }
  if (isActiveHref(pathname, "/workspace/periods")) {
    return { activeNav: "configuration", activeSub: "periods" };
  }
  if (isActiveHref(pathname, "/workspace/approval-limits")) {
    return { activeNav: "configuration", activeSub: "approvals" };
  }
  if (isActiveHref(pathname, "/workspace/ai-approvals")) {
    return { activeNav: "configuration", activeSub: "ai-approvals" };
  }
  if (isActiveHref(pathname, "/workspace/ai-usage")) {
    return { activeNav: "configuration", activeSub: "ai-usage" };
  }
  if (pathname === "/workspace/business") {
    const tab = searchParams?.get("tab") || "general";
    if (
      tab === "localisation" ||
      tab === "payments" ||
      tab === "shipping" ||
      tab === "notifications" ||
      tab === "permission"
    ) {
      return { activeNav: "configuration", activeSub: tab };
    }
    return { activeNav: "configuration", activeSub: "general" };
  }
  if (isActiveHref(pathname, "/workspace/localisation")) {
    return { activeNav: "configuration", activeSub: "localisation" };
  }
  for (const child of CONFIG_LINKS) {
    const hrefPath = child.href.split("?")[0]!;
    if (hrefPath !== "/workspace/business" && isActiveHref(pathname, hrefPath)) {
      return { activeNav: "configuration", activeSub: child.id };
    }
  }
  // Other /workspace/* categories (e.g. checkout) still highlight Configuration.
  if (pathname.startsWith("/workspace/")) {
    return { activeNav: "configuration", activeSub: "configuration" };
  }
  return { activeNav: "apps", activeSub: "modules" };
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? WORKSPACE_NAV.activeBg : "transparent",
    borderColor: highlighted ? WORKSPACE_NAV.activeBorder : "transparent",
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

function WorkspaceAppIcon({ className }: { className?: string }) {
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
        <rect x="7" y="8" width="14" height="2" rx="1" fill="#fff" opacity="0.9" />
        <rect x="7" y="12" width="10" height="2" rx="1" fill="#fff" opacity="0.7" />
        <rect x="7" y="16" width="12" height="2" rx="1" fill="#fff" opacity="0.7" />
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
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const handleSelect = (entry: Extract<NavEntry, { kind: "item" }>) => {
    setOpen(false);
    if (entry.href) router.push(entry.href);
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
              backgroundColor: WORKSPACE_NAV.dropdownBg,
              borderColor: WORKSPACE_NAV.dropdownBorder,
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
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "block w-full cursor-pointer rounded-none px-3 py-1 text-left text-[11px] leading-snug text-white/90 hover:bg-white/10 hover:text-white",
                    subActive && "bg-white/10 font-medium text-white",
                  )}
                  onClick={() => handleSelect(entry)}
                >
                  {entry.label}
                </button>
              );
            })}
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
          onClick={() => {
            if (!menu.href) return;
            setOpen(false);
            router.push(menu.href);
          }}
        >
          {menu.label}
        </NavChip>
      </div>
      {dropdownPanel}
    </>
  );
}

export function WorkspaceModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeNav, activeSub } = resolveWorkspaceNav(pathname, searchParams);
  const isSystemManager = useIsSystemManager();
  const sites = useScopeSites();

  const menus = useMemo(
    () =>
      NAV_MENUS.filter((menu) => menu.id !== "billing" || isSystemManager).map((menu) => {
        if (menu.id === "sites") {
          const children: NavEntry[] = [
            { kind: "item", id: "sites-all", label: "All stores", href: SITES_HREF },
          ];
          if (sites.length) {
            children.push({ kind: "header", id: "sites-header", label: "Stores" });
            for (const site of sites) {
              children.push({
                kind: "item",
                id: site.id,
                label: site.name,
                href: `${SITES_HREF}/${site.id}`,
              });
            }
          }
          return { ...menu, children };
        }
        // Users + roles are System Manager only, so do not advertise the link.
        if (menu.id === "configuration" && !isSystemManager) {
          return {
            ...menu,
            children: menu.children.filter(
              (child) => !("id" in child && child.id === "permission"),
            ),
          };
        }
        return menu;
      }),
    [isSystemManager, sites],
  );

  return (
    <header className="shrink-0 bg-background" data-component="workspace-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: WORKSPACE_NAV.bg,
          borderColor: WORKSPACE_NAV.border,
        }}
        aria-label="Workspace module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push(APPS_HREF)}
        >
          <WorkspaceAppIcon />
          Workspace
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menus.map((menu) => (
            <NavMenuItem key={menu.id} menu={menu} activeNav={activeNav} activeSub={activeSub} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar — flush with module edges (Catalog pattern). */
export function WorkspaceModuleBody({
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

/** Full module shell used by settings + system layouts. */
export function WorkspaceModuleShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<header className="h-[34px] shrink-0 bg-[#2c2e3f]" />}>
        <WorkspaceModuleNavbar />
      </Suspense>
      <WorkspaceModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-auto">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col p-3 lg:p-4">{children}</div>
      </WorkspaceModuleBody>
    </div>
  );
}
