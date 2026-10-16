"use client";

import { useId, type ReactNode } from "react";
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
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/lib/mock-data/customers";

export type CustomerListFilter = CustomerStatus | "all";
export type CustomerViewMode = "list" | "kanban" | "activity";

const BRAND = "#714B67";

const CUSTOMERS_NAV = {
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
type NavMenu = { id: string; label: string; children: NavChild[] };

const NAV_MENUS: NavMenu[] = [
  {
    id: "contacts",
    label: "Contacts",
    children: [
      { id: "customers", label: "Customers" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: [
      { id: "settings", label: "Settings" },
    ],
  },
];

type NavbarProps = {
  activeNav?: string;
  activeSub?: string;
  onNavigate?: (menuId: string, subId: string) => void;
};

function navButtonStyle(highlighted: boolean) {
  return {
    backgroundColor: highlighted ? CUSTOMERS_NAV.activeBg : "transparent",
    borderColor: highlighted ? CUSTOMERS_NAV.activeBorder : "transparent",
  };
}

function CustomersAppIcon({ className }: { className?: string }) {
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
        className="z-[200] max-h-[min(70vh,28rem)] min-w-[200px] overflow-y-auto rounded-none border p-0 text-white shadow-lg"
        style={{
          backgroundColor: CUSTOMERS_NAV.dropdownBg,
          borderColor: CUSTOMERS_NAV.dropdownBorder,
        }}
      >
        {menu.children.map((child) => {
          const subActive = active && child.id === activeSub;
          return (
            <DropdownMenuItem
              key={child.id}
              className={cn(
                "cursor-pointer rounded-none px-3 py-1.5 text-[11px] text-white focus:bg-white/10 focus:text-white",
                subActive && "bg-white/10 font-medium",
              )}
              onSelect={() => {
                if (child.id === "customers") {
                  router.push("/customers");
                  onNavigate?.(menu.id, child.id);
                  return;
                }
                if (onNavigate) {
                  onNavigate(menu.id, child.id);
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

export function CustomersModuleNavbar({
  activeNav = "contacts",
  activeSub = "customers",
  onNavigate,
}: NavbarProps) {
  const router = useRouter();

  return (
    <header className="shrink-0 bg-background" data-component="customers-module-heading">
      <nav
        className="relative z-50 flex h-[34px] shrink-0 items-center overflow-visible border-b text-white [&_[data-component=again\_menu\_systray]_button]:text-white/65 [&_[data-component=again\_menu\_systray]_button:hover]:bg-white/[0.08] [&_[data-component=again\_menu\_systray]_button:hover]:text-white"
        style={{
          backgroundColor: CUSTOMERS_NAV.bg,
          borderColor: CUSTOMERS_NAV.border,
        }}
        aria-label="Customers module"
        data-component="again_main_navbar"
      >
        <WorkspaceNavDrawerToggle tone="dark" />
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-bold text-white hover:bg-white/[0.06]"
          onClick={() => router.push("/customers")}
        >
          <CustomersAppIcon />
          Customers
        </button>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_MENUS.map((menu) => (
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

export function CustomersModuleBody({
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

const LIST_OPTIONS: { id: CustomerListFilter; label: string }[] = [
  { id: "all", label: "Customers" },
  ...(
    Object.entries(CUSTOMER_STATUS_LABELS) as [CustomerStatus, string][]
  ).map(([id, label]) => ({ id, label })),
];

function listTitle(filter: CustomerListFilter) {
  if (filter === "all") return "Customers";
  return CUSTOMER_STATUS_LABELS[filter];
}

type ControlPanelProps = {
  listFilter: CustomerListFilter;
  onListFilterChange: (filter: CustomerListFilter) => void;
  onNew: () => void;
  canWrite?: boolean;
  pagerLabel: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  viewMode?: CustomerViewMode;
  onViewModeChange?: (mode: CustomerViewMode) => void;
};

export function CustomersControlPanel({
  listFilter,
  onListFilterChange,
  onNew,
  canWrite = true,
  pagerLabel,
  searchQuery = "",
  onSearchChange,
  viewMode = "list",
  onViewModeChange,
}: ControlPanelProps) {
  const heading = listTitle(listFilter);

  const viewButtons: { id: CustomerViewMode; label: string; icon: typeof List }[] = [
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
              {LIST_OPTIONS.map((opt) => (
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
              className="z-[200] min-w-[220px] rounded-sm border border-border bg-background p-0 text-foreground shadow-md"
            >
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
                   className="z-[200] min-w-[220px] rounded-sm border-border bg-popover p-0 text-popover-foreground shadow-md"
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
              aria-label="Search customers"
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
                  onClick={() => onViewModeChange?.(v.id)}
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

export function CustomersModuleHeading({
  activeNav,
  activeSub,
  onNavigate,
  showControlPanel = true,
  listFilter = "all",
  onListFilterChange,
  onNew,
  canWrite,
  pagerLabel = "0-0 / 0",
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: HeadingProps) {
  return (
    <header className="shrink-0 bg-background" data-component="customers-module-heading">
      <CustomersModuleNavbar
        activeNav={activeNav}
        activeSub={activeSub}
        onNavigate={onNavigate}
      />
      {showControlPanel && onListFilterChange && onNew ? (
        <CustomersControlPanel
          listFilter={listFilter}
          onListFilterChange={onListFilterChange}
          onNew={onNew}
          canWrite={canWrite}
          pagerLabel={pagerLabel}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      ) : null}
    </header>
  );
}
