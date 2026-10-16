"use client";

import { useState, type ReactNode } from "react";
import { Archive, Filter, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { ConfiguratorAnalyticsKpi } from "@/lib/configurator/types";
import { hasConfiguratorPermission, CONFIGURATOR_PERMISSIONS } from "@/lib/configurator/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ConfiguratorFilterField = {
  key: string;
  label: string;
  type: "select" | "text";
  options?: { value: string; label: string }[];
};

type Props = {
  workflow?: string[];
  kpis?: ConfiguratorAnalyticsKpi[];
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterFields?: ConfiguratorFilterField[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  selectedCount?: number;
  onBulkActivate?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
  createLabel?: string;
  onCreate?: () => void;
  extraToolbar?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ConfiguratorAdminShell({
  workflow,
  kpis,
  search,
  onSearchChange,
  searchPlaceholder = "Quick search…",
  filterFields = [],
  filterValues = {},
  onFilterChange,
  selectedCount = 0,
  onBulkActivate,
  onBulkArchive,
  onBulkDelete,
  onClearSelection,
  createLabel = "Create",
  onCreate,
  extraToolbar,
  children,
  className,
}: Props) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const canCreate = hasConfiguratorPermission(CONFIGURATOR_PERMISSIONS.create);
  const canEdit = hasConfiguratorPermission(CONFIGURATOR_PERMISSIONS.edit);
  const canDelete = hasConfiguratorPermission(CONFIGURATOR_PERMISSIONS.delete);

  const activeFilterCount = filterFields.filter(
    (f) => filterValues[f.key] && filterValues[f.key] !== "all",
  ).length;

  return (
    <div className={cn("space-y-3", className)}>
      {workflow && workflow.length > 0 && (
        <div className="rounded-lg border border-input bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Workflow</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {workflow.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full bg-background px-2 py-0.5 font-medium text-foreground shadow-sm">
                  {step}
                </span>
                {i < workflow.length - 1 && <span>→</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {kpis && kpis.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-input bg-card p-3 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              <p className="mt-0.5 text-xl font-semibold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 max-w-sm">
          {searchPlaceholder && (
            <>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-8 text-xs"
              />
            </>
          )}
        </div>

        {filterFields.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setFilterSheetOpen(true)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}

        {extraToolbar}

        {canCreate && onCreate && (
          <Button size="sm" className="ml-auto h-8" onClick={onCreate}>
            {createLabel}
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <span className="text-xs font-medium">{selectedCount} selected</span>
          {canEdit && onBulkActivate && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBulkActivate}>
              Activate
            </Button>
          )}
          {canEdit && onBulkArchive && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBulkArchive}>
              <Archive className="mr-1 h-3 w-3" />
              Archive
            </Button>
          )}
          {canDelete && onBulkDelete && (
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={onBulkDelete}>
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          )}
          {onClearSelection && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onClearSelection}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      )}

      {children}

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent className="w-full sm:max-w-sm">
          <div className="flex items-center gap-2 border-b border-input pb-3">
            <Filter className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Advanced filters</h2>
          </div>
          <div className="mt-4 space-y-4">
            {filterFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                {field.type === "select" && field.options ? (
                  <Select
                    value={filterValues[field.key] ?? "all"}
                    onChange={(e) => onFilterChange?.(field.key, e.target.value)}
                    className="h-9 text-xs"
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={filterValues[field.key] ?? ""}
                    onChange={(e) => onFilterChange?.(field.key, e.target.value)}
                    className="h-9 text-xs"
                  />
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                filterFields.forEach((f) => onFilterChange?.(f.key, f.type === "select" ? "all" : ""));
                setFilterSheetOpen(false);
              }}
            >
              Reset filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type RowCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ConfiguratorRowCheckbox({ checked, onChange }: RowCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-3.5 w-3.5 rounded border-input"
    />
  );
}
