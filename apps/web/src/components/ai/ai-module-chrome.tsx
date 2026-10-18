"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { AI_NAV_MENUS } from "@/lib/ai/ai-nav";

/** AI module navbar - the same dark strip as CRM / Finance / Catalog. */
const AI_NAV_THEME = {
  bg: "#1f3a34",
  border: "#16282a",
  activeBg: "#2b5249",
  activeBorder: "#4fae96",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE = "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

function resolveAiNav(pathname: string): string {
  const byDepth = [...AI_NAV_MENUS].sort((a, b) => b.href.length - a.href.length);
  for (const menu of byDepth) {
    if (pathname === menu.href || pathname.startsWith(`${menu.href}/`)) return menu.id;
  }
  return "admin";
}

function AiAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#10A37F" />
        <path d="M14 5l2.2 5.8L22 13l-5.8 2.2L14 21l-2.2-5.8L6 13l5.8-2.2z" fill="#fff" />
        <path d="M21.5 4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff" opacity="0.8" />
      </g>
    </svg>
  );
}

export function AiModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolveAiNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="ai-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: AI_NAV_THEME.bg, borderColor: AI_NAV_THEME.border }}
        aria-label="AI module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/ai")}
        >
          <AiAppIcon />
          AI
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {AI_NAV_MENUS.map((menu) => {
            const active = menu.id === activeNav;
            return (
              <div key={menu.id} className={NAV_SLOT}>
                <button
                  type="button"
                  className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
                  style={{
                    backgroundColor: active ? AI_NAV_THEME.activeBg : "transparent",
                    borderColor: active ? AI_NAV_THEME.activeBorder : "transparent",
                  }}
                  onClick={() => router.push(menu.href)}
                >
                  {menu.label}
                </button>
              </div>
            );
          })}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below the navbar. */
export function AiModuleBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>;
}
