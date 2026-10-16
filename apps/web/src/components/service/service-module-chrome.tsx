"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { SERVICE_NAV_MENUS } from "@/lib/service/service-nav";

const THEME = {
  bg: "#243044",
  border: "#1e2030",
  activeBg: "#2f3f58",
  activeBorder: "#4a6a8a",
} as const;

function ServiceAppIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 28 28" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect width="28" height="28" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="28" height="28" fill="#1C7ED6" />
        <rect x="14" y="0" width="14" height="14" fill="#1864AB" />
        <rect x="0" y="14" width="14" height="14" fill="#4DABF7" />
        <rect x="14" y="14" width="14" height="14" fill="#74C0FC" />
      </g>
    </svg>
  );
}

export function ServiceModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="shrink-0 bg-background" data-component="service-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: THEME.bg, borderColor: THEME.border }}
        aria-label="Service module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/service")}
        >
          <ServiceAppIcon />
          Service
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SERVICE_NAV_MENUS.map((menu) => {
            const active =
              menu.href === "/service"
                ? pathname === "/service"
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

export function ServiceModuleBody({
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
