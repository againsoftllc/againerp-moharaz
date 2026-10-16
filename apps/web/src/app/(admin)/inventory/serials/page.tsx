"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Filter, PackagePlus, RefreshCw, Settings2, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
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
import type { SerialGridHandle } from "@/components/inventory/serial-grid";
import { SerialRegisterDrawer } from "@/components/inventory/serial-register-drawer";
import { SerialAssignDrawer } from "@/components/inventory/serial-assign-drawer";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import {
  fetchSerials,
  sameSerialListParams,
  type InventorySerial,
  type SerialListMeta,
  type SerialListParams,
} from "@/lib/api/inventory-serials";
import { cn } from "@/lib/utils";

const SerialGrid = dynamic(
  () => import("@/components/inventory/serial-grid").then((m) => m.SerialGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SerialsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { warehouses } = useInventoryWarehouses();
  const gridRef = useRef<SerialGridHandle>(null);
  const [serials, setSerials] = useState<InventorySerial[]>([]);
  const [meta, setMeta] = useState<SerialListMeta | null>(null);
  const [query, setQuery] = useState<SerialListParams>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  // Filter-driven refetches keep the current rows on screen (no skeleton flash);
  // only the very first load shows the grid placeholder.
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchSerials(query);
      setSerials(res.data);
      setMeta(res.meta);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load serials");
      setSerials([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);
  const handleQueryChange = useCallback((next: SerialListParams) => {
    setQuery((prev) => (sameSerialListParams(prev, next) ? prev : next));
  }, []);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Serials">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setRegisterOpen(true)}>
          <PackagePlus className="mr-1 h-3 w-3" /> Register
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
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", refreshing && "animate-spin")} />
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
          {canWrite ? (
            <DropdownMenuItem onClick={() => setAssignOpen(true)}>
              <ShoppingCart className="mr-1.5 h-3 w-3" />
              Assign to order
            </DropdownMenuItem>
          ) : null}
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
      <SerialGrid
        ref={gridRef}
        serials={serials}
        meta={meta}
        warehouses={warehouses}
        loading={loading}
        onChanged={load}
        onFilterCountChange={handleFilterCount}
        onQueryChange={handleQueryChange}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />

      <SerialRegisterDrawer
        key={`register:${registerOpen}`}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={load}
      />
      <SerialAssignDrawer
        key={`assign:${assignOpen}`}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onAssigned={load}
      />
    </>
  );
}
