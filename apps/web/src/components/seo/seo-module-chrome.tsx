"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { SEO_CONFIG_MENU, SEO_NAV_MENUS, type SeoNavMenu } from "@/lib/seo/seo-nav";

/** SEO module navbar — same dark strip pattern as RMA / HRM / Dropshipping. */
const SEO_NAV_THEME = {
  bg: "#26343a",
  border: "#1e2030",
  activeBg: "#2f4750",
  activeBorder: "#4a7280",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

/**
 * Longest href first: every SEO route starts with `/seo`, so the root entry
 * would otherwise claim `/seo/audit` as its own.
 */
function resolveSeoNav(pathname: string): string {
  if (pathname === "/seo/config" || pathname.startsWith("/seo/config/")) return "config";
  const byDepth = [...SEO_NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of byDepth) {
    if (!menu.href) continue;
    if (pathname === menu.href || pathname.startsWith(`${menu.href}/`)) return menu.id;
  }
  return "urls";
}

function SeoAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#0C8599" />
        <rect x="14" y="0" width="14" height="14" fill="#1098AD" />
        <rect x="0" y="14" width="14" height="14" fill="#15AABF" opacity="0.85" />
        <rect x="14" y="14" width="14" height="14" fill="#66D9E8" />
      </g>
    </svg>
  );
}

function NavChip({ menu, active }: { menu: SeoNavMenu; active: boolean }) {
  const router = useRouter();
  return (
    <div className={NAV_SLOT}>
      <button
        type="button"
        className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
        style={{
          backgroundColor: active ? SEO_NAV_THEME.activeBg : "transparent",
          borderColor: active ? SEO_NAV_THEME.activeBorder : "transparent",
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

export function SeoModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolveSeoNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="seo-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: SEO_NAV_THEME.bg, borderColor: SEO_NAV_THEME.border }}
        aria-label="SEO module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/seo")}
        >
          <SeoAppIcon />
          SEO
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SEO_NAV_MENUS.map((menu) => (
            <NavChip key={menu.id} menu={menu} active={menu.id === activeNav} />
          ))}
          <NavChip menu={SEO_CONFIG_MENU} active={activeNav === "config"} />
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function SeoModuleBody({
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
