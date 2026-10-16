"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
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
import { fetchPurchaseOrders, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { fetchPurchaseBills, toVendorBill } from "@/lib/api/purchase-bills";
import type { VendorBill } from "@/lib/mock-data/purchase-bills";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { useOpenFromUrl } from "@/lib/hooks/use-open-from-url";
import type { PurchaseOrderGridHandle } from "@/components/purchase/purchase-order-grid";
import {
  parsePurchaseOrderCreateLines,
  purchasePaths,
  type PurchaseOrderPrefillLine,
} from "@/lib/purchase/purchase-paths";
import { cn } from "@/lib/utils";

const PurchaseOrderGrid = dynamic(
  () =>
    import("@/components/purchase/purchase-order-grid").then((module) => module.PurchaseOrderGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening purchase orders…" />,
  },
);

function billedQty(order: ApiPurchaseOrder, billedByPo: Map<string, Map<string, number>>) {
  const byLine = billedByPo.get(order.id);
  if (!byLine) return 0;
  let total = 0;
  for (const line of order.lines) total += byLine.get(line.id) ?? 0;
  return total;
}

function PurchaseOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const [bills, setBills] = useState<VendorBill[]>([]);
  const gridRef = useRef<PurchaseOrderGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);

  const supplierFromUrl = searchParams.get("supplier");
  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [editOrder, setEditOrder] = useState<ApiPurchaseOrder | null>(null);

  const initialSupplierId = searchParams.get("create") === "1" ? (searchParams.get("supplier") ?? "") : "";
  // Deep link: /purchase/orders?open=<id> (e.g. from an Aladin "created PO-… — open it" link)
  useOpenFromUrl(orders, (o) => o.id, (o) => {
    setCreateOpen(false);
    setEditOrder(o);
  });

  const initialWarehouseId = searchParams.get("create") === "1" ? (searchParams.get("warehouse") ?? "") : "";
  const initialLines = useMemo<PurchaseOrderPrefillLine[]>(
    () =>
      searchParams.get("create") === "1"
        ? parsePurchaseOrderCreateLines(searchParams.get("lines"))
        : [],
    [searchParams],
  );

  const billedByOrderId = useMemo(() => {
    const billedByPo = new Map<string, Map<string, number>>();
    for (const bill of bills) {
      if (bill.status === "cancelled") continue;
      let byLine = billedByPo.get(bill.purchaseOrderId);
      if (!byLine) {
        byLine = new Map();
        billedByPo.set(bill.purchaseOrderId, byLine);
      }
      for (const line of bill.lines) {
        byLine.set(line.poLineId, (byLine.get(line.poLineId) ?? 0) + line.quantityBill);
      }
    }
    const totals = new Map<string, number>();
    for (const order of orders) totals.set(order.id, billedQty(order, billedByPo));
    return totals;
  }, [bills, orders]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPurchaseOrders({ per_page: 300 });
      setOrders(list.data);
      // Keep an already-open edit drawer in sync — its `order` prop is a snapshot
      // that wouldn't otherwise pick up changes from a receipt/payment/etc.
      setEditOrder((current) =>
        current ? (list.data.find((o) => o.id === current.id) ?? current) : current,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load purchase orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchPurchaseBills()
      .then((res) => setBills(res.data.map(toVendorBill)))
      .catch(() => setBills([]));
  }, []);

  useEffect(() => {
    if (searchParams.get("create") === "1") setCreateOpen(true);
  }, [searchParams]);

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open && searchParams.get("create") === "1") {
      router.replace(purchasePaths.orders);
    }
  };

  const handleFormOpenChange = (open: boolean) => {
    if (open) return;
    setEditOrder(null);
    handleCreateOpenChange(false);
  };

  const openCreate = () => {
    setEditOrder(null);
    setCreateOpen(true);
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Purchase orders">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
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
      <PurchaseOrderGrid
        ref={gridRef}
        orders={orders}
        suppliers={suppliers}
        loading={loading && orders.length === 0}
        billedByOrderId={billedByOrderId}
        initialSupplierId={supplierFromUrl ?? undefined}
        onEdit={(order) => {
          setCreateOpen(false);
          setEditOrder(order);
        }}
        onReceive={(order) => {
          setCreateOpen(false);
          setEditOrder(order);
        }}
        onReturn={(order) =>
          router.push(`${purchasePaths.returns}?order=${encodeURIComponent(order.id)}`)
        }
        onChanged={load}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <PoFormDrawer
        key={`po:${editOrder?.id ?? "new"}:${createOpen}:${initialSupplierId}:${initialWarehouseId}:${initialLines.map((l) => l.sku).join(",")}`}
        open={createOpen || Boolean(editOrder)}
        onOpenChange={handleFormOpenChange}
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          country: s.country,
          phone: s.phone,
          email: s.email,
          contactPerson: s.contactPerson,
          balanceDue: s.openingBalance,
        }))}
        initialSupplierId={editOrder ? undefined : initialSupplierId || undefined}
        initialWarehouseId={editOrder ? undefined : initialWarehouseId || undefined}
        initialLines={editOrder ? undefined : initialLines}
        order={editOrder}
        onCreated={(created) => {
          if (created && !editOrder) setEditOrder(created);
          void load();
        }}
      />
      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add purchase order"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening purchase orders…" />}>
        <PurchaseOrdersContent />
      </Suspense>
    </div>
  );
}
