"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { EXPENSES_NAV_MENUS, type ExpensesNavMenu } from "@/lib/expenses/expenses-nav";

/** Expenses module navbar — same dark strip pattern as Finance / RMA / SEO / HRM. */
const EXPENSES_NAV_THEME = {
  bg: "#3a2a1a",
  border: "#1e2030",
  activeBg: "#4d3a22",
  activeBorder: "#c9822f",
} as const;

const NAV_SLOT = "inline-flex h-[34px] shrink-0 items-center";
const NAV_CHIP =
  "inline-flex h-[24px] shrink-0 items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none whitespace-nowrap";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

function resolveExpensesNav(pathname: string): string {
  const byDepth = [...EXPENSES_NAV_MENUS].sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  for (const menu of byDepth) {
    if (!menu.href) continue;
    if (pathname === menu.href || pathname.startsWith(`${menu.href}/`)) return menu.id;
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
        backgroundColor: highlighted ? EXPENSES_NAV_THEME.activeBg : "transparent",
        borderColor: highlighted ? EXPENSES_NAV_THEME.activeBorder : "transparent",
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function ExpensesNavItem({ menu, active }: { menu: ExpensesNavMenu; active: boolean }) {
  const router = useRouter();
  return (
    <div className={NAV_SLOT}>
      <NavChip highlighted={active} onClick={() => menu.href && router.push(menu.href)}>
        {menu.label}
      </NavChip>
    </div>
  );
}

export function ExpensesModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = resolveExpensesNav(pathname);

  return (
    <header className="shrink-0 bg-background" data-component="expenses-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{ backgroundColor: EXPENSES_NAV_THEME.bg, borderColor: EXPENSES_NAV_THEME.border }}
        aria-label="Expenses module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/expenses")}
        >
          <Receipt className="h-4 w-4 shrink-0" aria-hidden />
          Expenses
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {EXPENSES_NAV_MENUS.map((menu) => (
            <ExpensesNavItem key={menu.id} menu={menu} active={menu.id === activeNav} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar. */
export function ExpensesModuleBody({
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
