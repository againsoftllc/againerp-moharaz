"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";

type NavLink = { id: string; label: string; href: string };
type NavGroup = { id: string; label: string; children: NavLink[] };

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

/** Again catalog main navbar — same dark strip as Inventory. */
const DROPSHIPPING_NAV = {
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

const DIRECT_LINKS: NavLink[] = [
  { id: "products", label: "Products", href: "/dropshipping/products" },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "import",
    label: "Import",
    children: [
      { id: "elim", label: "AgainAPI", href: "/dropshipping/import" },
      { id: "amazon", label: "Amazon", href: "/dropshipping/import/amazon" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: [
      { id: "settings", label: "Settings", href: "/dropshipping/settings" },
      { id: "category", label: "Category", href: "/dropshipping/categories" },
      { id: "brand", label: "Brand", href: "/dropshipping/brands" },
      { id: "attribute", label: "Attribute", href: "/dropshipping/attributes" },
      { id: "filter", label: "Filter", href: "/dropshipping/filters" },
    ],
  },
];

const NAV_MENUS: NavMenu[] = [
  ...DIRECT_LINKS.map((item) => ({
    id: item.id,
    label: item.label,
    direct: true,
    href: item.href,
    children: [] as NavEntry[],
  })),
  ...NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    children: group.children.map((child) => ({
      kind: "item" as const,
      id: child.id,
      label: child.label,
      href: child.href,
    })),
  })),
];

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveDropshippingNav(pathname: string): { activeNav: string; activeSub: string } {
  for (const item of DIRECT_LINKS) {
    if (isActiveHref(pathname, item.href)) {
      return { activeNav: item.id, activeSub: item.id };
    }
  }
  for (const group of NAV_GROUPS) {
    // Longer hrefs first so /import/amazon wins over /import
    const children = [...group.children].sort((a, b) => b.href.length - a.href.length);
    for (const child of children) {
      if (isActiveHref(pathname, child.href)) {
        return { activeNav: group.id, activeSub: child.id };
      }
    }
  }
  return { activeNav: "products", activeSub: "products" };
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? DROPSHIPPING_NAV.activeBg : "transparent",
    borderColor: highlighted ? DROPSHIPPING_NAV.activeBorder : "transparent",
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

function DropshippingAppIcon({ className }: { className?: string }) {
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
              backgroundColor: DROPSHIPPING_NAV.dropdownBg,
              borderColor: DROPSHIPPING_NAV.dropdownBorder,
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
        <NavChip highlighted={highlighted} aria-expanded={open} aria-haspopup="menu">
          {menu.label}
        </NavChip>
      </div>
      {dropdownPanel}
    </>
  );
}

export function DropshippingModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, activeSub } = resolveDropshippingNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="dropshipping-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: DROPSHIPPING_NAV.bg,
          borderColor: DROPSHIPPING_NAV.border,
        }}
        aria-label="Dropshipping module"
        data-component="again_main_navbar"
      >
      <WorkspaceNavDrawerToggle tone="dark" />
      <button
        type="button"
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
        onClick={() => router.push("/dropshipping/products")}
      >
        <DropshippingAppIcon />
        Dropshipping
      </button>

      <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_MENUS.map((menu) => (
          <NavMenuItem key={menu.id} menu={menu} activeNav={activeNav} activeSub={activeSub} />
        ))}
      </div>

      <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar — small top gap (Inventory control panel spacing). */
export function DropshippingModuleBody({
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
