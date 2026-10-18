"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND_PROJECT_NAME, BRAND_SUITE_NAME } from "@/lib/brand";
import { useAppStore } from "@/lib/store/app-store";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import {
  isToggleableModuleId,
  useModuleSettingsStore,
} from "@/lib/store/module-settings-store";
import { NAV_MODULE_MAP, hasPermission } from "@/lib/auth/permissions";
import {
  flattenWorkspaceNav,
  workspaceDashboardItem,
  workspaceNavItems,
  SIDEBAR_HIDDEN_MODULE_IDS,
  type WorkspaceNavItem,
} from "@/lib/workspace/navigation-config";

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (pathname === href) return true;
  // AI module — `/ai` and any conversation under it.
  if (href === "/ai") return pathname === "/ai" || pathname.startsWith("/ai/");
  // Dropshipping module — any `/dropshipping/*` route.
  if (href === "/dropshipping/products") return pathname.startsWith("/dropshipping");
  // HRM module — any `/hrm/*` route.
  if (href === "/hrm/employees") return pathname.startsWith("/hrm");
  // Website module — `/website/*`, nested Blog, and SEO (`/seo/*`).
  if (href === "/website" || href === "/website/pages") {
    return (
      pathname === "/website" ||
      pathname.startsWith("/website/") ||
      pathname === "/blog" ||
      pathname.startsWith("/blog/") ||
      pathname === "/seo" ||
      pathname.startsWith("/seo/")
    );
  }
  // Reports hub — not Workspace.
  if (href === "/reports") return pathname === "/reports" || pathname.startsWith("/reports/");
  // Media lives under /workspace/media but is its own main-menu module.
  if (href === "/workspace/media") {
    return (
      pathname === "/workspace/media" ||
      pathname.startsWith("/workspace/media/") ||
      pathname === "/media" ||
      pathname.startsWith("/media/")
    );
  }
  // Workspace module — workspace + settings + system access routes (not Media).
  if (href === "/workspace/apps") {
    const onMedia =
      pathname === "/workspace/media" ||
      pathname.startsWith("/workspace/media/") ||
      pathname === "/media" ||
      pathname.startsWith("/media/");
    return (
      (!onMedia && pathname.startsWith("/workspace")) ||
      pathname === "/settings" ||
      pathname.startsWith("/settings/") ||
      pathname === "/system" ||
      pathname.startsWith("/system/")
    );
  }
  // `/sales` leaf — only exact match (settings is under Sales module chrome, not sidebar child).
  if (href === "/sales") return pathname === "/sales" || pathname.startsWith("/sales/");
  if (href === "/accounting") return pathname === "/accounting" || pathname.startsWith("/accounting/");
  if (href === "/purchase/orders") return pathname.startsWith("/purchase");
  if (href === "/inventory/dashboard" || href === "/inventory/catalog" || href === "/inventory/stock") return pathname.startsWith("/inventory");
  return pathname.startsWith(href + "/");
}

function hasActiveChild(item: WorkspaceNavItem, pathname: string): boolean {
  if (item.href && isActive(pathname, item.href)) return true;
  return item.children?.some((c) => hasActiveChild(c, pathname)) ?? false;
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
  depth = 0,
  openItems,
  setOpenItems,
}: {
  item: WorkspaceNavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: (title: string, href: string) => void;
  depth?: number;
  openItems: Record<string, boolean>;
  setOpenItems: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const favorites = useAppStore((s) => s.favorites);
  const Icon = item.icon;

  // Expandable item with children
  if (item.children?.length) {
    const childActive = hasActiveChild(item, pathname);
    const open = openItems[item.id] ?? childActive;
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpenItems((s) => ({ ...s, [item.id]: !open }))}
          className={cn(
          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          childActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          depth > 0 && "ml-2 w-[calc(100%-0.5rem)]",
        )}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 truncate">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {!collapsed && <span className="truncate">{item.title}</span>}
          </span>
          {!collapsed && (
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition", open && "rotate-180")} />
          )}
        </button>
        {open && !collapsed && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-1">
            {item.children.map((child) => (
              <NavLink
                key={child.id}
                item={child}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
                depth={depth + 1}
                openItems={openItems}
                setOpenItems={setOpenItems}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf item with href
  if (!item.href) return null;
  const active = isActive(pathname, item.href);
  const favorited = favorites.includes(item.href);

  return (
    <div className="group relative">
      <Link
        href={item.href}
        onClick={() => onNavigate(item.title, item.href!)}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.title : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          active
            ? "border-l-2 border-primary bg-primary/10 pl-[calc(0.5rem-2px)] font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          depth > 0 && !active && "hover:text-foreground",
        )}
      >
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {!collapsed && <span className="truncate">{item.title}</span>}
        {!collapsed && item.badge ? (
          <span className="ml-auto rounded-full bg-primary/15 px-1.5 text-[10px] text-primary dark:text-primary-foreground/90">
            {item.badge}
          </span>
        ) : null}
      </Link>
      {!collapsed && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite(item.href!);
          }}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100",
            favorited && "opacity-100 text-amber-500",
          )}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-3 w-3", favorited && "fill-current")} />
        </button>
      )}
    </div>
  );
}

type Props = {
  className?: string;
  onNavigate?: () => void;
};

/** WS-SIDE-* — Zone C navigation drawer (opened from top menu). */
export function WorkspaceSidebar({ className, onNavigate }: Props) {
  const pathname = usePathname();
  const favorites = useAppStore((s) => s.favorites);
  const addRecent = useAppStore((s) => s.addRecent);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const moduleEnabled = useModuleSettingsStore((s) => s.enabled);
  const permissions = useAdminAuth((s) => s.permissions);
  const role = useAdminAuth((s) => s.user?.role);
  const enabledModules = useAdminAuth((s) => s.enabledModules);

  const visibleNavItems = useMemo(
    () =>
      workspaceNavItems.filter((item) => {
        if (SIDEBAR_HIDDEN_MODULE_IDS.has(item.id)) return false;
        // Reports is a hub, not a toggleable RBAC module — always in the sidebar.
        if (item.id === "reports") return true;
        if (isToggleableModuleId(item.id) && moduleEnabled[item.id] === false) return false;
        const moduleId = NAV_MODULE_MAP[item.id] ?? item.id;
        if (enabledModules && !enabledModules.includes(moduleId)) return false;
        return hasPermission(permissions, moduleId, "read", role);
      }),
    [moduleEnabled, permissions, role, enabledModules],
  );

  const navIndex = useMemo(() => flattenWorkspaceNav(), []);
  const favoriteItems = useMemo(
    () =>
      favorites
        .map((href) => navIndex.find((n) => n.href === href))
        .filter(Boolean) as { title: string; href: string }[],
    [favorites, navIndex],
  );

  const handleNavigate = (title: string, href: string) => {
    addRecent(title, href);
    onNavigate?.();
  };

  return (
    <aside
      data-zone="C"
      data-component="WS-SIDE"
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-border bg-card text-foreground",
        className,
      )}
      aria-label="Main navigation"
    >
      <div
        className="flex h-14 shrink-0 items-center border-b border-border bg-card px-3 pr-10"
        data-component="WS-SIDE-BRAND"
      >
        <Link
          href="/dashboard"
          onClick={() => handleNavigate("Dashboard", "/dashboard")}
          className="flex min-w-0 flex-col"
        >
          <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {BRAND_SUITE_NAME}
          </span>
          <span className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
            {BRAND_PROJECT_NAME}
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto bg-card p-2 text-xs text-foreground">
        <nav className="space-y-1">
          <NavLink
            item={workspaceDashboardItem}
            pathname={pathname}
            collapsed={false}
            onNavigate={handleNavigate}
            openItems={openItems}
            setOpenItems={setOpenItems}
          />
        </nav>

        {favoriteItems.length > 0 && (
          <section className="mt-3" data-component="WS-SIDE-FAV">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Favorites
            </p>
            {favoriteItems.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                onClick={() => handleNavigate(f.title, f.href)}
                className={cn(
                  "block truncate rounded-md px-2 py-1 text-xs transition-colors",
                  isActive(pathname, f.href)
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.title}
              </Link>
            ))}
          </section>
        )}

        <nav className="mt-3 space-y-0.5">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              pathname={pathname}
              collapsed={false}
              onNavigate={handleNavigate}
              openItems={openItems}
              setOpenItems={setOpenItems}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
