"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
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
import { PoDetailDrawer } from "@/components/purchase/po-detail-drawer";
import type { PurchaseReportGridHandle } from "@/components/purchase/purchase-report-grid";
import { daysOverdue } from "@/components/purchase/purchase-report-grid";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import {
  fetchPurchaseDashboard,
  fetchPurchaseOrders,
  type ApiPurchaseDashboard,
  type ApiPurchaseOrder,
} from "@/lib/api/purchase-orders";
import { cn, formatCurrency } from "@/lib/utils";

const PurchaseReportGrid = dynamic(
  () => import("@/components/purchase/purchase-report-grid").then((m) => m.PurchaseReportGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening open orders…" /> },
);

export default function PurchaseOpenOrdersPage() {
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const gridRef = useRef<PurchaseReportGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [dashboard, setDashboard] = useState<ApiPurchaseDashboard | null>(null);
  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewOrder, setViewOrder] = useState<ApiPurchaseOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, list] = await Promise.all([
        fetchPurchaseDashboard(),
        fetchPurchaseOrders({ per_page: 300 }),
      ]);
      setDashboard(dash);
      setOrders(list.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reports");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === "confirmed" || o.status === "partial_received") &&
          (daysOverdue(o.expected_date, today) ?? 0) > 0,
      ).length,
    [orders, today],
  );

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Open orders">
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
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <PurchaseReportGrid
        ref={gridRef}
        orders={orders}
        suppliers={suppliers}
        loading={loading && orders.length === 0}
        onView={setViewOrder}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${overdueCount} overdue · ${dashboard?.pending_receive_count ?? 0} pending · ${dashboard?.open_po_count ?? 0} open · ${formatCurrency(Number(dashboard?.spend_total ?? 0))} spend`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <PoDetailDrawer
        open={Boolean(viewOrder)}
        onOpenChange={(next) => {
          if (!next) setViewOrder(null);
        }}
        order={viewOrder}
      />
    </div>
  );
}
