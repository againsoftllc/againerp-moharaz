"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  ArrowUpRight,
  CheckCircle2,
  Lock,
  PlugZap,
  Search,
  Settings,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  workspaceDashboardItem,
  workspaceNavItems,
} from "@/lib/workspace/navigation-config";
import {
  isToggleableModuleId,
  useModuleSettingsStore,
} from "@/lib/store/module-settings-store";
import { isCenterManagedModule } from "@/lib/center/entitlements";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { moduleSettingsHref } from "@/lib/workspace/module-settings-href";
import { cn } from "@/lib/utils";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Home overview — always available",
  catalog: "Products, categories, brands, attributes, and reviews",
  inventory: "Stock, warehouses, serials, counts, and movements",
  purchase: "RFQs, quotations, orders, receipts, and supplier bills",
  rma: "Return merchandise authorizations and replacements",
  service: "Service tickets, jobs, and after-sales work",
  vendors: "Vendor directory and related records",
  ai: "AI chat workspace — ask Aladin about customers, orders, stock, and finance",
  dropshipping: "Dropship products, sourcing, and supplier sync",
  hrm: "Employees, attendance, leave, and payroll",
  blog: "Articles, categories, and comments",
  website: "Website pages, menus, and live edit",
  media: "Media library — images, videos, and documents",
  sales: "Orders, quotations, and invoicing",
  pos: "Point of sale terminals and retail checkout",
  finance: "Payments, cash, and financial operations",
  accounting: "Ledgers, journals, and accounting reports",
  crm: "Leads, opportunities, and pipeline",
  customers: "Customer profiles and accounts",
  workspace: "Modules, plugins, sites, and media — always available",
};

const ALWAYS_ON_MODULE_IDS = new Set(["dashboard", "workspace"]);

type StatusFilter = "all" | "enabled" | "disabled";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
];

export function ModulesPanel({ embedded = false }: { embedded?: boolean }) {
  const enabled = useModuleSettingsStore((s) => s.enabled);
  const setModuleEnabled = useModuleSettingsStore((s) => s.setModuleEnabled);
  const centerBound = useModuleSettingsStore((s) => s.centerBound);
  const centerPlan = useModuleSettingsStore((s) => s.centerPlan);
  const centerClientName = useModuleSettingsStore((s) => s.centerClientName);
  const centerError = useModuleSettingsStore((s) => s.centerError);
  const canWrite = useAdminCanWrite();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const rows = useMemo(() => {
    const list = [
      workspaceDashboardItem,
      ...workspaceNavItems.filter(
        (item) => isToggleableModuleId(item.id) || ALWAYS_ON_MODULE_IDS.has(item.id),
      ),
    ];
    return list.map((module) => {
      const alwaysOn = ALWAYS_ON_MODULE_IDS.has(module.id);
      const checked = alwaysOn
        ? true
        : isToggleableModuleId(module.id)
          ? (enabled[module.id] ?? true)
          : true;
      return {
        module,
        alwaysOn,
        checked,
        managed: !alwaysOn && centerBound && isCenterManagedModule(module.id),
        description: MODULE_DESCRIPTIONS[module.id] ?? "",
        settingsHref: moduleSettingsHref(module.id),
      };
    });
  }, [enabled, centerBound]);

  const counts = useMemo(() => {
    const on = rows.filter((r) => r.checked).length;
    return { all: rows.length, enabled: on, disabled: rows.length - on };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "enabled" && !r.checked) return false;
      if (filter === "disabled" && r.checked) return false;
      if (!q) return true;
      return `${r.module.title} ${r.description}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {embedded ? <h2 className="text-sm font-semibold">Modules</h2> : <h1 className="page-title">Modules</h1>}
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            {centerBound
              ? "Center-managed modules follow your AgainERP Center plan. Local-only modules can still be toggled here."
              : "Turn workspace modules on or off. Use Settings on a card to configure that module."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span>
            <span className="font-semibold text-foreground">{counts.enabled}</span> of {counts.all}{" "}
            modules enabled
          </span>
        </div>
      </header>

      {/* Center connection */}
      {centerBound ? (
        <section className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-card px-3 py-2.5 text-xs">
          <span className="flex h-7 w-7 items-center justify-center bg-primary/10 text-primary">
            <PlugZap className="h-4 w-4" aria-hidden />
          </span>
          <Badge variant="outline" className="rounded-none">
            Center connected
          </Badge>
          <span className="text-muted-foreground">
            {centerClientName || "Client"}
            {centerPlan ? ` · ${centerPlan}` : ""}
          </span>
          {centerError ? (
            <span className="text-destructive">Sync issue: {centerError}</span>
          ) : null}
        </section>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            aria-label="Search modules"
            className="h-9 rounded-none pl-8 pr-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label="Filter modules"
          className="inline-flex w-full border border-border bg-card sm:w-auto"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums text-[10px]",
                  filter === f.id ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Module cards */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 border border-dashed border-border px-4 py-12 text-center">
          <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No modules found</p>
          <p className="text-xs text-muted-foreground">Try a different search or filter.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 rounded-none"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ module, alwaysOn, checked, managed, description, settingsHref }) => {
            const Icon = module.icon;
            const locked = alwaysOn || managed;
            return (
              <li
                key={module.id}
                className={cn(
                  "group flex flex-col border bg-card p-3 transition-colors",
                  checked ? "border-border hover:border-primary/50" : "border-border/70 bg-muted/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center",
                      checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className={cn("text-sm font-semibold", !checked && "text-muted-foreground")}>
                        {module.title}
                      </h2>
                      {alwaysOn ? (
                        <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                          Always on
                        </Badge>
                      ) : managed ? (
                        <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                          Center
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <SwitchPrimitive.Root
                    checked={checked}
                    disabled={!canWrite || locked}
                    aria-label={`${checked ? "Disable" : "Enable"} ${module.title}`}
                    onCheckedChange={(next) => {
                      if (alwaysOn || !isToggleableModuleId(module.id)) return;
                      setModuleEnabled(module.id, next);
                    }}
                    className="peer mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                  >
                    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                  </SwitchPrimitive.Root>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] font-medium",
                      checked
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        checked ? "bg-emerald-500" : "bg-muted-foreground/50",
                      )}
                      aria-hidden
                    />
                    {checked ? "Enabled" : "Disabled"}
                    {locked ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {checked && module.href ? (
                      <Button asChild variant="ghost" size="sm" className="h-7 rounded-none px-2 text-xs">
                        <Link href={module.href} aria-label={`Open ${module.title}`}>
                          Open
                          <ArrowUpRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    ) : null}
                    {settingsHref ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-none px-2 text-xs"
                      >
                        <Link href={settingsHref} aria-label={`${module.title} settings`}>
                          <Settings className="mr-1 h-3 w-3" />
                          Settings
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
