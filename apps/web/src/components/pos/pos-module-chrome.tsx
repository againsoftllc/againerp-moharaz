"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { POS_NAV_MENUS } from "@/lib/pos/pos-nav";

const THEME = {
  bg: "#1f2a22",
  border: "#1e2030",
  activeBg: "#2d4634",
  activeBorder: "#4a8060",
} as const;

function PosAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#2B8A3E" />
        <rect x="14" y="0" width="14" height="14" fill="#37B24D" />
        <rect x="0" y="14" width="14" height="14" fill="#40C057" />
        <rect x="14" y="14" width="14" height="14" fill="#69DB7C" />
      </g>
    </svg>
  );
}

export function PosModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="shrink-0 bg-background" data-component="pos-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: THEME.bg, borderColor: THEME.border }}
        aria-label="POS module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/pos")}
        >
          <PosAppIcon />
          POS
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {POS_NAV_MENUS.map((menu) => {
            const active =
              menu.href === "/pos"
                ? pathname === "/pos"
                : Boolean(menu.href && pathname.startsWith(menu.href));
            return (
              <button
                key={menu.id}
                type="button"
                className="inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none text-white/85"
                style={{
                  backgroundColor: active ? THEME.activeBg : "transparent",
                  borderColor: active ? THEME.activeBorder : "transparent",
                }}
                onClick={() => menu.href && router.push(menu.href)}
              >
                {menu.label}
              </button>
            );
          })}
        </div>
        <AgainSystray />
      </nav>
    </header>
  );
}

export function PosModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden animate-[route-fade-in_160ms_ease-out] [&>*]:min-h-0 [&>*]:flex-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
