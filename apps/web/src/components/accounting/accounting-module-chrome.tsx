"use client";

import { usePathname, useRouter } from "next/navigation";
import { Clock, House, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { ACCOUNTING_NAV_MENUS } from "@/lib/accounting/accounting-nav";
import type { ReactNode } from "react";

const ACCOUNTING_NAV = {
  bg: "#173a5e",
  border: "#102a43",
} as const;

const NAV_LINK =
  "inline-flex h-[32px] shrink-0 items-center whitespace-nowrap px-2.5 text-[12px] font-normal leading-none text-white/90 outline-none hover:bg-white/10 hover:text-white";

export function AccountingModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="shrink-0 bg-background" data-component="accounting-module-heading">
      <nav
        className="relative z-50 flex h-[32px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: ACCOUNTING_NAV.bg, borderColor: ACCOUNTING_NAV.border }}
        aria-label="Accounting module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[32px] w-8 shrink-0 items-center justify-center text-white/90 hover:bg-white/10 hover:text-white"
          aria-label="Home"
          onClick={() => router.push("/accounting")}
        >
          <House className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="inline-flex h-[32px] w-8 shrink-0 items-center justify-center text-white/90 hover:bg-white/10 hover:text-white"
          aria-label="Favorites"
        >
          <Star className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="inline-flex h-[32px] w-8 shrink-0 items-center justify-center text-white/90 hover:bg-white/10 hover:text-white"
          aria-label="Recent"
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ACCOUNTING_NAV_MENUS.map((item) => {
            const settingsActive = pathname.startsWith("/accounting/settings");
            const active =
              item.id === "setup"
                ? settingsActive
                : item.id === "financial"
                  ? pathname.startsWith("/accounting") && !settingsActive
                  : false;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(NAV_LINK, active && "bg-white/15 font-medium text-white")}
                onClick={() => router.push(item.href ?? "/accounting")}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

export function AccountingModuleBody({
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
