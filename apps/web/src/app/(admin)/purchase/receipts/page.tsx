"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, Plus, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
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
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import {
  fetchPurchaseReceipts,
  postPurchaseReceipt,
  cancelPurchaseReceipt,
  type ApiPurchaseReceipt,
} from "@/lib/api/purchase-receipts";
import { fetchPurchaseOrders, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { ReceiptDrawer } from "@/components/suppliers/receipt-drawer";
import type { PurchaseReceiptGridHandle } from "@/components/purchase/purchase-receipt-grid";
import { cn } from "@/lib/utils";

const PurchaseReceiptGrid = dynamic(
  () =>
    import("@/components/purchase/purchase-receipt-grid").then((m) => m.PurchaseReceiptGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening receipts…" /> },
);

function PurchaseReceiptsContent() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const gridRef = useRef<PurchaseReceiptGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [receipts, setReceipts] = useState<ApiPurchaseReceipt[]>([]);
  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<ApiPurchaseOrder | null>(null);
  const [viewReceipt, setViewReceipt] = useState<ApiPurchaseReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pos] = await Promise.all([
        fetchPurchaseReceipts(),
        fetchPurchaseOrders({ per_page: 300 }),
      ]);
      setReceipts(list.data);
      setOrders(pos.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load receipts");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderById = useMemo(() => {
    const map = new Map(orders.map((o) => [o.id, o]));
    return map;
  }, [orders]);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Purchase receipts">
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
      <PurchaseReceiptGrid
        ref={gridRef}
        receipts={receipts}
        suppliers={suppliers}
        orders={orders}
        loading={loading && receipts.length === 0}
        onView={(row) => {
          setViewReceipt(row);
          setReceiveOrder(orderById.get(row.purchase_order_id) ?? null);
        }}
        onPost={async (row) => {
          await postPurchaseReceipt(row.id);
          toast.success(`${row.receipt_number} posted — stock updated`);
          void load();
        }}
        onCancel={async (row) => {
          await cancelPurchaseReceipt(row.id);
          toast.success(`${row.receipt_number} cancelled`);
          void load();
        }}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <ReceiptDrawer
        key={`new:${createOpen}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        order={null}
        orders={orders}
        onReceived={load}
      />
      <ReceiptDrawer
        key={`view:${viewReceipt?.id ?? "none"}`}
        open={Boolean(viewReceipt)}
        onOpenChange={(next) => {
          if (!next) {
            setViewReceipt(null);
            setReceiveOrder(null);
          }
        }}
        order={receiveOrder}
        receipt={viewReceipt}
        onReceived={load}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={() => setCreateOpen(true)}
          aria-label="New receipt"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default function PurchaseReceiptsPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening receipts…" />}>
        <PurchaseReceiptsContent />
      </Suspense>
    </div>
  );
}
