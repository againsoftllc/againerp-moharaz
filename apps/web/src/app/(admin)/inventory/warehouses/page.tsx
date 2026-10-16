"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { Download, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import type { WarehouseGridHandle } from "@/components/inventory/warehouse-grid";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

const WarehouseGrid = dynamic(
  () => import("@/components/inventory/warehouse-grid").then((m) => m.WarehouseGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function WarehousesPage() {
  const { warehouses, loading, refetch } = useInventoryWarehouses();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<WarehouseGridHandle>(null);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Warehouses">
      {canWrite ? (
        <Button
          size="sm"
          className="rounded-none"
          onClick={() => gridRef.current?.openCreate()}
        >
          New
        </Button>
      ) : null}
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
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3.5 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <WarehouseGrid
        ref={gridRef}
        warehouses={warehouses}
        loading={loading}
        onChanged={() => void refetch()}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
