"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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
import { ReturnDrawer } from "@/components/purchase/return-drawer";
import type { PurchaseReturnGridHandle } from "@/components/purchase/purchase-return-grid";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { fetchPurchaseOrders, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import {
  apiReturnToPurchaseReturn,
  approvePurchaseReturn,
  creditPurchaseReturn,
  fetchPurchaseReturns,
  rejectPurchaseReturn,
} from "@/lib/api/purchase-returns";
import { purchaseOrderIsReturnable, type PurchaseReturn } from "@/lib/mock-data/purchase-returns";
import { purchasePaths } from "@/lib/purchase/purchase-paths";
import { cn, formatCurrency } from "@/lib/utils";

const PurchaseReturnGrid = dynamic(
  () => import("@/components/purchase/purchase-return-grid").then((m) => m.PurchaseReturnGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening returns…" /> },
);

function readOrderFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("order") || undefined;
}

export default function PurchaseReturnsPage() {
  const router = useRouter();
  const [fromOrderId, setFromOrderId] = useState<string | undefined>(undefined);
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const gridRef = useRef<PurchaseReturnGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [orders, setOrders] = useState<ApiPurchaseOrder[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const loadReturns = useCallback(async () => {
    try {
      const res = await fetchPurchaseReturns();
      setReturns(res.data.map(apiReturnToPurchaseReturn));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load returns");
      setReturns([]);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetchPurchaseOrders({ per_page: 300 });
      setOrders(res.data.filter(purchaseOrderIsReturnable));
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    void loadReturns();
    void loadOrders();
  }, [loadReturns, loadOrders]);

  useEffect(() => {
    const orderId = readOrderFromUrl();
    if (!orderId) return;
    setFromOrderId(orderId);
    setCreateOpen(true);
  }, []);

  const creditTotal = useMemo(
    () => returns.reduce((sum, r) => sum + r.creditAmount, 0),
    [returns],
  );

  const handleApprove = async (row: PurchaseReturn) => {
    try {
      await approvePurchaseReturn(row.id);
      toast.success(`${row.number} approved`);
      void loadReturns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  };

  const handleReject = async (row: PurchaseReturn) => {
    try {
      await rejectPurchaseReturn(row.id);
      toast.success(`${row.number} rejected`);
      void loadReturns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }
  };

  const handleCredit = async (row: PurchaseReturn) => {
    try {
      await creditPurchaseReturn(row.id);
      toast.success(`${row.number} credited — stock and AP updated`);
      void loadReturns();
      void loadOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Credit failed");
    }
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
    <ListGridHeaderStart title="Purchase returns">
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
              void loadReturns();
              void loadOrders();
              apiHealth.recheck();
            }}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
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
      <PurchaseReturnGrid
        ref={gridRef}
        returns={returns}
        suppliers={suppliers}
        onApprove={(row) => void handleApprove(row)}
        onReject={(row) => void handleReject(row)}
        onCredit={(row) => void handleCredit(row)}
        onChanged={() => {
          void loadReturns();
          void loadOrders();
        }}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {returns.length} return{returns.length === 1 ? "" : "s"} · {formatCurrency(creditTotal)}{" "}
            credit
          </span>
        }
        className="min-h-0 flex-1"
      />

      <ReturnDrawer
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && fromOrderId) router.replace(purchasePaths.returns);
        }}
        orders={orders}
        initialOrderId={fromOrderId}
        onCreated={() => {
          void loadReturns();
          void loadOrders();
        }}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={() => setCreateOpen(true)}
          aria-label="New return"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
