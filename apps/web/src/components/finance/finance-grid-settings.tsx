"use client";

import { Download, Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiHealthStatus } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

export function financeHealthTitle(status: ApiHealthStatus) {
  if (status === "connected") return "API and database connected";
  if (status === "partial") return "API connected, database not connected";
  if (status === "disconnected") return "API/database not connected";
  return "Checking connection…";
}

type Props = {
  apiHealth: { status: ApiHealthStatus };
  loading?: boolean;
  filterCount?: number;
  onRefresh: () => void;
  onFilters?: () => void;
  onColumns: () => void;
  onExport: () => void;
  onResetFilters?: () => void;
};

export function FinanceGridSettingsMenu({
  apiHealth,
  loading = false,
  filterCount = 0,
  onRefresh,
  onFilters,
  onColumns,
  onExport,
  onResetFilters,
}: Props) {
  const healthTitle = financeHealthTitle(apiHealth.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "relative h-[26px] w-[26px] shrink-0 rounded-none",
            apiHealth.status === "connected" &&
              "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
            apiHealth.status === "partial" &&
              "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
            apiHealth.status === "disconnected" &&
              "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
            apiHealth.status === "checking" && "text-muted-foreground",
          )}
          aria-label={`Settings (${healthTitle})`}
          title={healthTitle}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
              {filterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuItem onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
          Refresh
        </DropdownMenuItem>
        {onFilters ? (
          <DropdownMenuItem onClick={onFilters}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span>
            ) : null}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onColumns}>
          <SlidersHorizontal className="mr-1.5 h-3 w-3" />
          Columns
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExport}>
          <Download className="mr-1.5 h-3 w-3" />
          Export
        </DropdownMenuItem>
        {onResetFilters ? (
          <DropdownMenuItem onClick={onResetFilters}>Reset filters</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
