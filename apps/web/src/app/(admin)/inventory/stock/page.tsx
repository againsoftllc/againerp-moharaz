"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { InventoryGridHeader } from "@/components/inventory/inventory-grid-header";
import type { StockGridFilters, StockGridHandle } from "@/components/inventory/stock-grid";
import type { StockListParams } from "@/lib/api/inventory";
import { useInventoryStock, useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

const StockGrid = dynamic(
  () => import("@/components/inventory/stock-grid").then((m) => m.StockGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function StockPage() {
  // The stock list runs to thousands of lines, so search, warehouse, status and paging are done by the server: filtering a
  // first page in the browser hid every line that was not in it (the RMA Store's own products among them).
  const [filters, setFilters] = useState<StockGridFilters>({ search: "", warehouseId: "all", status: "all" });
  const [applied, setApplied] = useState<StockGridFilters>(filters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApplied(filters);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const params = useMemo<StockListParams>(
    () => ({
      search: applied.search || undefined,
      warehouse_id: applied.warehouseId !== "all" ? applied.warehouseId : undefined,
      status: applied.status !== "all" ? applied.status : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    [applied.search, applied.warehouseId, applied.status, page, pageSize],
  );
  const { items, total, loading, refetch } = useInventoryStock(params);
  const { warehouses: allWarehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  // a member limited to some warehouses (locations) picks and filters only among theirs
  const warehouses = useMemo(() => warehouseAccess.pickable(allWarehouses), [warehouseAccess, allWarehouses]);
  const canWrite = useAdminCanWrite();
  const gridRef = useRef<StockGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const headerLeftActions = (
    <InventoryGridHeader
      title="Stock"
      loading={loading}
      filterCount={filterCount}
      onRefresh={reload}
      onOpenFilters={() => gridRef.current?.openFilters()}
      onOpenColumns={() => gridRef.current?.openColumns()}
      onResetFilters={() => gridRef.current?.resetFilters()}
      onOpenLiveEdit={canWrite ? () => gridRef.current?.openLiveEdit() : undefined}
    />
  );

  return (
    <StockGrid
      ref={gridRef}
      items={items}
      warehouses={warehouses}
      loading={loading && items.length === 0}
      serverPaging={{
        total,
        page,
        pageSize,
        onPageChange: setPage,
        onPageSizeChange: (size) => {
          setPageSize(size);
          setPage(0);
        },
      }}
      onFiltersChange={setFilters}
      onStockChanged={reload}
      onFilterCountChange={handleFilterCount}
      headerLeftActions={headerLeftActions}
      className="min-h-0 flex-1"
    />
  );
}
