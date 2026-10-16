"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import {
  FINANCE_NAV_MENUS,
  type FinanceNavEntry,
  type FinanceNavMenu,
} from "@/lib/finance/finance-nav";

/** Finance module navbar — same dark strip pattern as RMA / SEO / HRM. */
const FINANCE_NAV_THEME = {
  bg: "#20342a",
  border: "#1e2030",
  activeBg: "#2a4636",
  activeBorder: "#4a8064",
  dropdownBg: "#2a3a32",
  dropdownBorder: "#3d5a48",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

function resolveFinanceNav(pathname: string): { activeNav: string; activeSub: string } {
  for (const menu of FINANCE_NAV_MENUS) {
    const items = (menu.children ?? []).filter(
      (e): e is Extract<FinanceNavEntry, { kind: "item" }> => e.kind === "item",
    );
    const sub = items
      .slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (sub) return { activeNav: menu.id, activeSub: sub.id };
  }
  const byDepth = [...FINANCE_NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of byDepth) {
    if (!menu.href) continue;
    if (pathname === menu.href || pathname.startsWith(`${menu.href}/`)) {
      return { activeNav: menu.id, activeSub: menu.id };
    }
  }
  return { activeNav: "", activeSub: "" };
}

function FinanceAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#2B8A3E" />
        <rect x="14" y="0" width="14" height="14" fill="#37B24D" />
        <rect x="0" y="14" width="14" height="14" fill="#40C057" opacity="0.85" />
        <rect x="14" y="14" width="14" height="14" fill="#69DB7C" />
      </g>
    </svg>
  );
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
      style={{
        backgroundColor: highlighted ? FINANCE_NAV_THEME.activeBg : "transparent",
        borderColor: highlighted ? FINANCE_NAV_THEME.activeBorder : "transparent",
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function FinanceNavItem({ menu, active, activeSub }: { menu: FinanceNavMenu; active: boolean; activeSub: string }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

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

  if (menu.direct) {
    return (
      <div className={NAV_SLOT}>
        <NavChip highlighted={active} onClick={() => menu.href && router.push(menu.href)}>
          {menu.label}
        </NavChip>
      </div>
    );
  }

  const items = menu.children.filter(
    (e): e is Extract<FinanceNavEntry, { kind: "item" }> => e.kind === "item",
  );

  const dropdownPanel =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            className="fixed z-[9999] max-h-[min(80vh,40rem)] min-w-[240px] overflow-y-auto rounded-none border py-1 text-white shadow-lg"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              backgroundColor: FINANCE_NAV_THEME.dropdownBg,
              borderColor: FINANCE_NAV_THEME.dropdownBorder,
            }}
            onMouseEnter={showMenu}
            onMouseLeave={hideMenu}
          >
            {items.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                className={cn(
                  "block w-full cursor-pointer rounded-none px-3 py-1.5 text-left text-[11px] leading-snug text-white/90 hover:bg-white/10 hover:text-white",
                  active && entry.id === activeSub && "bg-white/10 font-medium text-white",
                )}
                onClick={() => {
                  setOpen(false);
                  router.push(entry.href);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={NAV_SLOT}
        onMouseEnter={showMenu}
        onMouseLeave={hideMenu}
      >
        <NavChip
          highlighted={active || open}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => menu.href && router.push(menu.href)}
        >
          {menu.label}
        </NavChip>
      </div>
      {dropdownPanel}
    </>
  );
}

export function FinanceModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, activeSub } = resolveFinanceNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="finance-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: FINANCE_NAV_THEME.bg, borderColor: FINANCE_NAV_THEME.border }}
        aria-label="Finance module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/finance/dashboard")}
        >
          <FinanceAppIcon />
          Finance
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FINANCE_NAV_MENUS.map((menu) => (
            <FinanceNavItem key={menu.id} menu={menu} active={menu.id === activeNav} activeSub={activeSub} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function FinanceModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>
  );
}
