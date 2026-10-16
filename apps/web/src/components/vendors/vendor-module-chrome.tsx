"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { VENDOR_NAV_MENUS, type VendorNavMenu } from "@/lib/vendors/vendor-nav";

/** Vendors module navbar — same dark strip pattern as Suppliers / Finance. */
const VENDOR_NAV_THEME = {
  bg: "#2b3a32",
  border: "#1e2b24",
  activeBg: "#2f4a3a",
  activeBorder: "#4a725b",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE = "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

const NAV_MENUS: VendorNavMenu[] = VENDOR_NAV_MENUS;

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveVendorNav(pathname: string): string {
  const sorted = [...NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of sorted) {
    if (menu.href && isActiveHref(pathname, menu.href)) return menu.id;
  }
  return "directory";
}

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? VENDOR_NAV_THEME.activeBg : "transparent",
    borderColor: highlighted ? VENDOR_NAV_THEME.activeBorder : "transparent",
  };
}

function VendorAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#2f9e5b" />
        <rect x="14" y="0" width="14" height="14" fill="#0ca678" opacity="0.85" />
        <rect x="0" y="14" width="14" height="14" fill="#66d9a3" opacity="0.75" />
        <rect x="14" y="14" width="14" height="14" fill="#12b886" />
      </g>
    </svg>
  );
}

export function VendorModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolveVendorNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="vendor-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: VENDOR_NAV_THEME.bg,
          borderColor: VENDOR_NAV_THEME.border,
        }}
        aria-label="Vendors module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/vendors")}
        >
          <VendorAppIcon />
          Vendors
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_MENUS.map((menu) => (
            <div key={menu.id} className={NAV_SLOT}>
              <button
                type="button"
                className={cn(NAV_CHIP, menu.id === activeNav ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
                style={navButtonStyle(menu.id === activeNav)}
                onClick={() => menu.href && router.push(menu.href)}
              >
                {menu.label}
              </button>
            </div>
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function VendorModuleBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>;
}
