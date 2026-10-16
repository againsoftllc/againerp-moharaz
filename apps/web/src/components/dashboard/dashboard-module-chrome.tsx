"use client";

import { useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DASH_NAV = {
  bg: "#2c2e3f",
  border: "#1e2030",
  activeBg: "#243b3b",
  activeBorder: "#3d5a58",
  dropdownBg: "#383b4a",
  dropdownBorder: "#4a4d5c",
} as const;

const NAV_CHIP =
  "inline-flex h-[24px] items-center rounded-none border px-2 text-[12px] font-normal leading-none outline-none";
const NAV_CHIP_IDLE =
  "border-transparent text-white/85 hover:bg-white/[0.06] hover:text-white";
const NAV_CHIP_ACTIVE = "text-white";

type NavChild = { id: string; label: string; href?: string };
type NavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: NavChild[];
};

const NAV_MENUS: NavMenu[] = [
  { id: "overview", label: "Overview", direct: true, href: "/dashboard", children: [] },
  {
    id: "operations",
    label: "Operations",
    children: [
      { id: "sales", label: "Sales", href: "/sales" },
      { id: "customers", label: "Customers", href: "/customers" },
      { id: "dropshipping", label: "Dropshipping", href: "/dropshipping/products" },
      { id: "catalog", label: "Catalog", href: "/website/products" },
    ],
  },
  { id: "settings", label: "Settings", direct: true, href: "/dashboard/settings", children: [] },
];

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? DASH_NAV.activeBg : "transparent",
    borderColor: highlighted ? DASH_NAV.activeBorder : "transparent",
  };
}

function DashboardAppIcon({ className }: { className?: string }) {
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
}: {
  menu: NavMenu;
  activeNav: string;
}) {
  const router = useRouter();
  const active = menu.id === activeNav;

  if (menu.direct) {
    return (
      <div className="inline-flex h-[34px] shrink-0 items-center">
        <button
          type="button"
          className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
          style={navButtonStyle(active)}
          onClick={() => menu.href && router.push(menu.href)}
        >
          {menu.label}
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex h-[34px] shrink-0 items-center">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(NAV_CHIP, active ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
            style={navButtonStyle(active)}
          >
            {menu.label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={0}
          className="z-[200] min-w-[200px] overflow-y-auto rounded-none border p-0 text-white shadow-lg"
          style={{
            backgroundColor: DASH_NAV.dropdownBg,
            borderColor: DASH_NAV.dropdownBorder,
          }}
        >
          {menu.children.map((child) => (
            <DropdownMenuItem
              key={child.id}
              className="cursor-pointer rounded-none px-3 py-1.5 text-[11px] text-white focus:bg-white/10 focus:text-white"
              onSelect={() => {
                if (child.href) {
                  router.push(child.href);
                  return;
                }
                toast.info(`${child.label} — mock`);
              }}
            >
              {child.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DashboardModuleNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = pathname.startsWith("/dashboard/settings") ? "settings" : "overview";

  return (
    <header className="shrink-0 bg-background" data-component="dashboard-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: DASH_NAV.bg,
          borderColor: DASH_NAV.border,
        }}
        aria-label="Dashboard module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/dashboard")}
        >
          <DashboardAppIcon />
          Dashboard
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_MENUS.map((menu) => (
            <NavMenuItem key={menu.id} menu={menu} activeNav={activeNav} />
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

export function DashboardModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}
