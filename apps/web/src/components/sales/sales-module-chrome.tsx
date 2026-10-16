"use client";

import { useId, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  LayoutGrid,
  Link2,
  List,
  Search,
  Settings,
  Table2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSalesFeatureFlags } from "@/lib/sales/use-sales-settings";
import type { SalesFeatureFlags } from "@/lib/sales/sales-settings";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SalesListFilter = "quotations" | "my_quotations" | "all";
export type SalesViewMode = "list" | "kanban" | "activity";

const BRAND = "#714B67";

/** Again sales main navbar — same dark strip as Dropshipping / Inventory. */
const SALES_NAV = {
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

type NavChild = {
  id: string;
  label: string;
  listFilter?: SalesListFilter;
  href?: string;
};

type NavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  /** Direct items only — same mechanism as a dropdown child's listFilter, so Order/Quotation
   * stay on /sales and just switch which list is shown, instead of navigating to a new page. */
  listFilter?: SalesListFilter;
  children: NavChild[];
};

const NAV_MENUS: NavMenu[] = [
  { id: "order", label: "Order", direct: true, listFilter: "all", children: [] },
  { id: "quotation", label: "Quotation", direct: true, listFilter: "quotations", children: [] },
  { id: "return", label: "Return", direct: true, href: "/sales/returns", children: [] },
  { id: "customer", label: "Customer", direct: true, href: "/customers", children: [] },
];

function childVisible(menuId: string, childId: string, flags: SalesFeatureFlags): boolean {
  if (menuId === "quotation") return flags.navQuotations;
  return true;
}

function filterNavMenus(flags: SalesFeatureFlags): NavMenu[] {
  return NAV_MENUS.filter((menu) => childVisible(menu.id, menu.id, flags));
}

type NavbarProps = {
  activeNav?: string;
  activeSub?: string;
  onNavigate?: (menuId: string, subId: string, listFilter?: SalesListFilter) => void;
};

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? SALES_NAV.activeBg : "transparent",
    borderColor: highlighted ? SALES_NAV.activeBorder : "transparent",
  };
}

/** Colorful Sales app icon (Again-style quilt). */
function SalesAppIcon({ className }: { className?: string }) {
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
  activeSub,
  onNavigate,
}: {
  menu: NavMenu;
  activeNav?: string;
  activeSub?: string;
  onNavigate?: NavbarProps["onNavigate"];
}) {
  const router = useRouter();
  const active = menu.id === activeNav;
  const highlighted = active;

  if (menu.direct) {
    return (
      <button
        type="button"
        className={cn(NAV_CHIP, highlighted ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
        style={navButtonStyle(highlighted)}
        onClick={() => {
          if (menu.href) {
            router.push(menu.href);
          } else if (menu.listFilter) {
            router.push(`/sales?filter=${menu.listFilter}`);
          }
          onNavigate?.(menu.id, menu.id, menu.listFilter);
        }}
      >
        {menu.label}
      </button>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(NAV_CHIP, highlighted ? NAV_CHIP_ACTIVE : NAV_CHIP_IDLE)}
          style={navButtonStyle(highlighted)}
        >
          {menu.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        className="z-[200] max-h-[min(70vh,28rem)] min-w-[160px] overflow-y-auto rounded-none border p-0 py-0.5 text-white shadow-lg"
        style={{
          backgroundColor: SALES_NAV.dropdownBg,
          borderColor: SALES_NAV.dropdownBorder,
        }}
      >
        {menu.children.map((child) => {
          const subActive = active && child.id === activeSub;
          return (
            <DropdownMenuItem
              key={child.id}
              className={cn(
                "cursor-pointer rounded-none px-3 py-1 text-[11px] leading-snug text-white/90 focus:bg-white/10 focus:text-white",
                subActive && "bg-white/10 font-medium text-white",
              )}
              onSelect={() => {
                if (child.href) {
                  router.push(child.href);
                  onNavigate?.(menu.id, child.id, child.listFilter);
                  return;
                }
                if (child.listFilter) {
                  router.push(`/sales?filter=${child.listFilter}`);
                  onNavigate?.(menu.id, child.id, child.listFilter);
                  return;
                }
                if (onNavigate) {
                  onNavigate(menu.id, child.id, child.listFilter);
                } else {
                  toast.info(`${child.label} — mock`);
                }
              }}
            >
              {child.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Again `again_main_navbar` — dark strip, app icon, menus, systray. */
export function SalesModuleNavbar({
  activeNav = "orders",
  activeSub = "orders",
  onNavigate,
}: NavbarProps) {
  const router = useRouter();
  const featureFlags = useSalesFeatureFlags();
  const menus = useMemo(() => filterNavMenus(featureFlags), [featureFlags]);

  return (
    <header className="shrink-0 bg-background" data-component="sales-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: SALES_NAV.bg,
          borderColor: SALES_NAV.border,
        }}
        aria-label="Sales module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/sales")}
        >
          <SalesAppIcon />
          Sales
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menus.map((menu) => (
            <div key={menu.id} className="inline-flex h-[34px] shrink-0 items-center">
              <NavMenuItem
                menu={menu}
                activeNav={activeNav}
                activeSub={activeSub}
                onNavigate={onNavigate}
              />
            </div>
          ))}
        </div>

        <AgainSystray />
      </nav>
    </header>
  );
}

/** Content below navbar — fills remaining height like DropshippingModuleBody. */
export function SalesModuleBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}

type ControlPanelProps = {
  listFilter: SalesListFilter;
  onListFilterChange: (filter: SalesListFilter) => void;
  onNew: () => void;
  canWrite?: boolean;
  pagerLabel: string;
  title?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  viewMode?: SalesViewMode;
  onViewModeChange?: (mode: SalesViewMode) => void;
};

function listTitle(filter: SalesListFilter, title?: string) {
  if (title) return title;
  if (filter === "all") return "Orders";
  if (filter === "my_quotations") return "My Quotations";
  return "Quotations";
}

/**
 * Again `again_control_panel` — New · title · gear · search · pager · views.
 * Kept for legacy/optional surfaces; list page uses grid filter bar instead.
 */
export function SalesControlPanel({
  listFilter,
  onListFilterChange,
  onNew,
  canWrite = true,
  pagerLabel,
  title,
  searchQuery = "",
  onSearchChange,
  viewMode = "list",
  onViewModeChange,
}: ControlPanelProps) {
  const heading = listTitle(listFilter, title);

  const viewButtons: { id: SalesViewMode; label: string; icon: typeof List }[] = [
    { id: "kanban", label: "Kanban", icon: LayoutGrid },
    { id: "list", label: "List", icon: List },
    { id: "activity", label: "Activity", icon: Clock },
  ];

  return (
    <div
      className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-0 pt-2 pb-3"
      data-component="again_control_panel"
    >
      <div className="flex flex-wrap items-center gap-2 gap-y-2">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={onNew}
              className="inline-flex h-[30px] items-center rounded-[3px] px-3 text-[13px] font-medium text-white hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              New
            </button>
          ) : null}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[18px] font-medium leading-none text-foreground outline-none"
              >
                {heading}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="z-[200] min-w-[160px] rounded-sm border border-border bg-background p-0 shadow-md"
            >
              {(
                [
                  { id: "all" as const, label: "Orders" },
                  { id: "quotations" as const, label: "Quotations" },
                  { id: "my_quotations" as const, label: "My Quotations" },
                ] as const
              ).map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  className={cn(
                    "cursor-pointer rounded-none px-3 py-2 text-[13px]",
                    listFilter === opt.id && "bg-muted font-medium",
                  )}
                  onSelect={() => onListFilterChange(opt.id)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={4}
              className="z-[200] min-w-[240px] rounded-sm border border-border bg-background p-0 text-foreground shadow-md"
            >
              <DropdownMenuItem
                className="cursor-pointer rounded-none px-3 py-2 text-[13px] focus:bg-muted"
                onSelect={() => toast.info("Upload Request For Quotation — mock")}
              >
                Upload Request For Quotation
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-0 bg-border" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-none px-3 py-2 text-[13px] focus:bg-muted"
                onSelect={() => toast.info("Import — mock")}
              >
                <Download className="h-4 w-4 text-muted-foreground" />
                Import
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-none px-3 py-2 text-[13px] focus:bg-muted"
                onSelect={() => toast.success("Export started (mock CSV)")}
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-0 bg-border" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer gap-2 rounded-none px-3 py-2 text-[13px] focus:bg-muted data-[state=open]:bg-muted">
                  <Table2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span className="flex-1">Spreadsheet</span>
                  <ChevronRight className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  sideOffset={0}
                  className="z-[200] min-w-[220px] rounded-sm border-border bg-popover p-0 shadow-md"
                >
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 rounded-none px-3 py-2 text-[13px] focus:bg-muted"
                    onSelect={() => toast.info("Link menu in spreadsheet — mock")}
                  >
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    Link menu in spreadsheet
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 rounded-none px-3 py-2 text-[13px] focus:bg-muted"
                    onSelect={() => toast.info("Insert list in spreadsheet — mock")}
                  >
                    <List className="h-4 w-4 text-muted-foreground" />
                    Insert list in spreadsheet
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="min-w-[160px] flex-1 px-1 sm:min-w-[220px] sm:px-4">
          <div className="relative mx-auto max-w-xl">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search..."
              className="h-[30px] w-full rounded-[3px] border border-input bg-background py-1 pl-8 pr-8 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-[#714B67]"
              aria-label="Search"
            />
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <span className="px-1 text-[13px] tabular-nums text-muted-foreground">{pagerLabel}</span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-border text-muted-foreground"
            aria-label="Previous page"
            disabled
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-border text-muted-foreground"
            aria-label="Next page"
            disabled
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="ml-1 flex items-center overflow-hidden rounded-[3px] border border-border">
            {viewButtons.map((v) => {
              const Icon = v.icon;
              const active = viewMode === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  title={v.label}
                  aria-label={v.label}
                  aria-pressed={active}
                  onClick={() => {
                    if (v.id !== "list") {
                      toast.info(`${v.label} view — mock`);
                    }
                    onViewModeChange?.(v.id);
                  }}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center border-r border-border last:border-r-0",
                    active
                      ? "bg-teal-500/15 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type HeadingProps = NavbarProps &
  Partial<ControlPanelProps> & {
    showControlPanel?: boolean;
  };

/** Full Sales heading: dark navbar + optional control panel. */
export function SalesModuleHeading({
  activeNav,
  activeSub,
  onNavigate,
  showControlPanel = true,
  listFilter = "all",
  onListFilterChange,
  onNew,
  canWrite,
  pagerLabel = "0-0 / 0",
  title,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: HeadingProps) {
  return (
    <>
      <SalesModuleNavbar
        activeNav={activeNav}
        activeSub={activeSub}
        onNavigate={onNavigate}
      />
      {showControlPanel && onListFilterChange && onNew ? (
        <SalesControlPanel
          listFilter={listFilter}
          onListFilterChange={onListFilterChange}
          onNew={onNew}
          canWrite={canWrite}
          pagerLabel={pagerLabel}
          title={title}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      ) : null}
    </>
  );
}
