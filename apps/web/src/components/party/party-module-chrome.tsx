"use client";

import { usePathname, useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { PARTY_NAV_MENUS, type PartyNavMenu } from "@/lib/party/party-nav";

/** Party module navbar — same dark strip pattern as Finance / Expenses / RMA / SEO / HRM. */
const PARTY_NAV_THEME = {
  bg: "#1a2a3a",
  border: "#1e2030",
  activeBg: "#233a52",
  activeBorder: "#3d6b96",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

function resolvePartyNav(pathname: string): string {
  const byDepth = [...PARTY_NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of byDepth) {
    const path = menu.href?.split("?")[0];
    if (pathname === path || pathname.startsWith(`${path}/`)) return menu.id;
  }
  return "";
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
        backgroundColor: highlighted ? PARTY_NAV_THEME.activeBg : "transparent",
        borderColor: highlighted ? PARTY_NAV_THEME.activeBorder : "transparent",
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function PartyNavItem({ menu, active }: { menu: PartyNavMenu; active: boolean }) {
  const router = useRouter();
  return (
    <div className={NAV_SLOT}>
      <NavChip highlighted={active} onClick={() => router.push(menu.href)}>
        {menu.label}
      </NavChip>
    </div>
  );
}

export function PartyModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolvePartyNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="party-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: PARTY_NAV_THEME.bg, borderColor: PARTY_NAV_THEME.border }}
        aria-label="Party module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/customers?from=party")}
        >
          <Users className="h-4 w-4 shrink-0" aria-hidden />
          Party
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PARTY_NAV_MENUS.map((menu) => (
            <PartyNavItem key={menu.id} menu={menu} active={menu.id === activeNav} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function PartyModuleBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>{children}</div>
  );
}
