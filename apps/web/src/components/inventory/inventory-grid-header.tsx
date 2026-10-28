"use client";

import { Download, Filter, MousePointerClick, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  loading: boolean;
  filterCount: number;
  onRefresh: () => void;
  onOpenFilters: () => void;
  onOpenColumns: () => void;
  onResetFilters: () => void;
  /** Only the Stock page edits cost in the grid. */
  onOpenLiveEdit?: () => void;
  /** Reports that export their lines add "Export CSV". */
  onExport?: () => void;
};

/** The header-left title + settings cog the Stock page and the Product report share. The cog's colour is the API/database health. */
export function InventoryGridHeader({
  title,
  loading,
  filterCount,
  onRefresh,
  onOpenFilters,
  onOpenColumns,
  onResetFilters,
  onOpenLiveEdit,
  onExport,
}: Props) {
  const apiHealth = useApiHealth();
  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  return (
    <ListGridHeaderStart title={title}>
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
          <DropdownMenuItem
            onClick={() => {
              onRefresh();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFilters}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenColumns}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          {onOpenLiveEdit ? (
            <DropdownMenuItem onClick={onOpenLiveEdit}>
              <MousePointerClick className="mr-1.5 h-3 w-3" />
              Live edit
            </DropdownMenuItem>
          ) : null}
          {onExport ? (
            <DropdownMenuItem onClick={onExport} disabled={loading}>
              <Download className="mr-1.5 h-3 w-3" />
              Export CSV
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onResetFilters}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );
}
