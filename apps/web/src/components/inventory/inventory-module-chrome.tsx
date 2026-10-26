"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { useApprovalSummary } from "@/lib/approvals/use-approval-summary";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import {
  INVENTORY_NAV_MENUS,
  type InventoryNavEntry,
  type InventoryNavMenu,
} from "@/lib/inventory/inventory-nav";

type NavEntry = InventoryNavEntry;
type NavMenu = InventoryNavMenu;

/** Inventory module navbar — same dark strip pattern as HRM / Dropshipping. */
const INVENTORY_NAV = {
  bg: "#2c2e3f",
  border: "#1e2030",
  activeBg: "#243b3b",
  activeBorder: "#3d5a58",
  dropdownBg: "#383b4a",
  dropdownBorder: "#4a4d5c",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

const NAV_MENUS: NavMenu[] = INVENTORY_NAV_MENUS;

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveInventoryNav(pathname: string): { activeNav: string; activeSub: string } {
  // the dashboard is the module's home (the "Inventory" title), no menu of its own
  if (pathname === "/inventory/dashboard") return { activeNav: "", activeSub: "" };
  for (const menu of NAV_MENUS) {
    if (menu.direct && menu.href && isActiveHref(pathname, menu.href)) {
      return { activeNav: menu.id, activeSub: menu.id };
    }
    const items = menu.children
      .filter((e): e is Extract<NavEntry, { kind: "item" }> => e.kind === "item")
      .sort((a, b) => b.href.length - a.href.length);
    for (const child of items) {
      if (isActiveHref(pathname, child.href)) {
        return { activeNav: menu.id, activeSub: child.id };
      }
    }
  }
  return { activeNav: "catalog", activeSub: "catalog" };
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? INVENTORY_NAV.activeBg : "transparent",
    borderColor: highlighted ? INVENTORY_NAV.activeBorder : "transparent",
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

/** How many held actions wait for the viewer (an approver) or, for everyone else, how many of their own are still waiting. */
function ApprovalNavBadge() {
  const { summary } = useApprovalSummary();
  if (!summary) return null;
  const count = summary.can_approve_any ? summary.pending_for_me : summary.my_pending;
  if (count <= 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white"
      title={summary.can_approve_any ? "Waiting for your approval" : "Your requests waiting for approval"}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function InventoryAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#0CA678" />
        <rect x="14" y="0" width="14" height="14" fill="#3B5BDB" />
        <rect x="0" y="14" width="14" height="14" fill="#12B886" opacity="0.7" />
        <rect x="14" y="14" width="14" height="14" fill="#FAB005" />
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
    router.push(entry.href);
  };

  const dropdownPanel =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            className="fixed z-[9999] max-h-[min(80vh,40rem)] min-w-[260px] overflow-y-auto rounded-none border py-1 text-white shadow-lg"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              backgroundColor: INVENTORY_NAV.dropdownBg,
              borderColor: INVENTORY_NAV.dropdownBorder,
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
                    className="mt-1 cursor-default border-t border-white/10 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/45 first:mt-0 first:border-t-0 first:pt-1.5"
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
          {menu.id === "approve" ? <ApprovalNavBadge /> : null}
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
        <NavChip highlighted={highlighted} aria-expanded={open} aria-haspopup="menu">
          {menu.label}
        </NavChip>
      </div>
      {dropdownPanel}
    </>
  );
}

export function InventoryModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, activeSub } = resolveInventoryNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="inventory-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: INVENTORY_NAV.bg,
          borderColor: INVENTORY_NAV.border,
        }}
        aria-label="Inventory module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/inventory/dashboard")}
        >
          <InventoryAppIcon />
          Inventory
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_MENUS.map((menu) => (
            <NavMenuItem key={menu.id} menu={menu} activeNav={activeNav} activeSub={activeSub} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function InventoryModuleBody({
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
