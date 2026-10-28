"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
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
import type { MovementGridHandle, MovementRow } from "@/components/inventory/movement-grid";
import { fetchStockMovements } from "@/lib/api/inventory";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MovementGrid = dynamic(
  () => import("@/components/inventory/movement-grid").then((m) => m.MovementGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

function MovementsContent() {
  const searchParams = useSearchParams();
  const itemId = searchParams.get("item") || undefined;
  const sku = searchParams.get("sku") ?? "";

  const { warehouses: allWarehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  // a member limited to some warehouses (locations) picks and filters only among theirs
  const warehouses = useMemo(() => warehouseAccess.pickable(allWarehouses), [warehouseAccess, allWarehouses]);
  const apiHealth = useApiHealth();
  const gridRef = useRef<MovementGridHandle>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchStockMovements({ item_id: itemId, limit: 1000 });
      setMovements(rows as MovementRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load movements");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Movements">
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
              void load();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <MovementGrid
      ref={gridRef}
      movements={movements}
      warehouses={warehouses}
      loading={loading}
      initialSearch={sku}
      onFilterCountChange={handleFilterCount}
      headerLeftActions={headerLeftActions}
      className="min-h-0 flex-1"
    />
  );
}

export default function MovementsPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback />}>
      <MovementsContent />
    </Suspense>
  );
}
