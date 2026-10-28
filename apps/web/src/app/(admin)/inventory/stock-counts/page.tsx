"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Filter, Plus, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select } from "@/components/ui/native-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { StockCountDrawer } from "@/components/inventory/stock-count-drawer";
import type { StockCountGridHandle } from "@/components/inventory/stock-count-grid";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { createStockCount, fetchStockCounts, type ApiStockCount } from "@/lib/api/inventory";
import { cn } from "@/lib/utils";

const StockCountGrid = dynamic(
  () => import("@/components/inventory/stock-count-grid").then((m) => m.StockCountGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function StockCountsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { warehouses: allWarehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  // a member limited to some warehouses (locations) picks and filters only among theirs
  const warehouses = useMemo(() => warehouseAccess.pickable(allWarehouses), [warehouseAccess, allWarehouses]);
  const gridRef = useRef<StockCountGridHandle>(null);
  const [counts, setCounts] = useState<ApiStockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWarehouseId, setNewWarehouseId] = useState("");
  const [creating, setCreating] = useState(false);
  const [openCountId, setOpenCountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchStockCounts();
      setCounts(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load stock counts");
      setCounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (createOpen) setNewWarehouseId(warehouses[0]?.id ?? "");
  }, [createOpen, warehouses]);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);

  async function handleCreate() {
    if (!newWarehouseId) return;
    setCreating(true);
    try {
      const row = await createStockCount({ warehouseId: newWarehouseId });
      toast.success(`${row.count_number} created`);
      setCreateOpen(false);
      await load();
      setOpenCountId(row.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create count");
    } finally {
      setCreating(false);
    }
  }

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Stock Counts">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setCreateOpen(true)}>
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
    <>
      <StockCountGrid
        ref={gridRef}
        counts={counts}
        warehouses={warehouses}
        loading={loading}
        onView={(row) => setOpenCountId(row.id)}
        onChanged={load}
        onFilterCountChange={handleFilterCount}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={() => setCreateOpen(true)}
          aria-label="New count"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          title="New count"
          resizable
          closeButton="inside"
          className="w-[280px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <div className="flex items-center gap-2 border-b border-border pb-2 pr-8">
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => void handleCreate()}
              disabled={!newWarehouseId || creating}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
            <h2 className="text-sm font-semibold">New count</h2>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Snapshots on-hand quantity for every stock line in the warehouse.
          </p>
          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-medium text-foreground">Warehouse</label>
            <Select
              value={newWarehouseId}
              onChange={(e) => setNewWarehouseId(e.target.value)}
              className="w-full rounded-none"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
        </SheetContent>
      </Sheet>

      <StockCountDrawer
        open={!!openCountId}
        onOpenChange={(o) => !o && setOpenCountId(null)}
        countId={openCountId}
        canWrite={canWrite}
        onChanged={() => void load()}
      />
    </>
  );
}
