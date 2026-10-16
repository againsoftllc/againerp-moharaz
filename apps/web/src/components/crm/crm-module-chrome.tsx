"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { CRM_NAV_MENUS, type CrmNavMenu } from "@/lib/crm/crm-nav";

/** CRM module navbar — same dark strip pattern as Finance / RMA / SEO. */
const CRM_NAV_THEME = {
  bg: "#2b2740",
  border: "#1e2030",
  activeBg: "#3a3060",
  activeBorder: "#7a68d6",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE = "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

function resolveCrmNav(pathname: string): string {
  const byDepth = [...CRM_NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of byDepth) {
    if (!menu.href) continue;
    if (pathname === menu.href || pathname.startsWith(`${menu.href}/`)) return menu.id;
  }
  return "dashboard";
}

function CrmAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#5B4FBF" />
        <circle cx="10.5" cy="11" r="4" fill="#8B7FE8" />
        <circle cx="19" cy="11" r="3" fill="#B3A9F0" />
        <path d="M4 24c0-4 3-6.5 6.5-6.5S17 20 17 24" fill="#8B7FE8" />
        <path d="M15 24c0-3.2 2.4-5.2 5.2-5.2S24.5 20.8 24.5 24" fill="#B3A9F0" />
      </g>
    </svg>
  );
}

function NavChip({ menu, active }: { menu: CrmNavMenu; active: boolean }) {
  const router = useRouter();
  return (
    <div className={NAV_SLOT}>
      <button
        type="button"
        className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
        style={{
          backgroundColor: active ? CRM_NAV_THEME.activeBg : "transparent",
          borderColor: active ? CRM_NAV_THEME.activeBorder : "transparent",
        }}
        onClick={() => {
          if (menu.href) router.push(menu.href);
        }}
      >
        {menu.label}
      </button>
    </div>
  );
}

export function CrmModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolveCrmNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="crm-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: CRM_NAV_THEME.bg, borderColor: CRM_NAV_THEME.border }}
        aria-label="CRM module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/crm/dashboard")}
        >
          <CrmAppIcon />
          CRM
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CRM_NAV_MENUS.map((menu) => (
            <NavChip key={menu.id} menu={menu} active={menu.id === activeNav} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function CrmModuleBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>;
}
