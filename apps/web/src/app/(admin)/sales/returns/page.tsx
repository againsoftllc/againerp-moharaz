"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
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
import { SalesModuleNavbar, SalesModuleBody, type SalesListFilter } from "@/components/sales/sales-module-chrome";
import { SalesReturnDrawer } from "@/components/sales/sales-return-drawer";
import type { SalesReturnGridHandle } from "@/components/sales/sales-return-grid";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchSalesOrders, type ApiSalesOrder } from "@/lib/api/sales";
import {
  apiReturnToSalesReturn,
  confirmSalesReturn,
  creditSalesReturn,
  cancelSalesReturn,
  fetchSalesReturns,
} from "@/lib/api/sales-returns";
import type { SalesReturn } from "@/lib/sales/sales-returns";
import { cn, formatCurrency } from "@/lib/utils";

const SalesReturnGrid = dynamic(
  () => import("@/components/sales/sales-return-grid").then((m) => m.SalesReturnGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening returns…" /> },
);

// Clean, query-free mounts for other modules' own Sales dropdowns — each
// module's own layout.tsx already supplies a navbar there.
const CLEAN_RETURNS_MOUNTS = ["/website/returns", "/inventory/returns"];

function readOrderFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("order") || undefined;
}

export default function SalesReturnsPage() {
  const pathname = usePathname();
  // Mounted under one of CLEAN_RETURNS_MOUNTS — that module's own layout.tsx
  // already provides a navbar there, so don't render our own.
  const chrome = !CLEAN_RETURNS_MOUNTS.includes(pathname ?? "");
  const router = useRouter();
  const [fromOrderId, setFromOrderId] = useState<string | undefined>(undefined);
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<SalesReturnGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [orders, setOrders] = useState<ApiSalesOrder[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // NavMenuItem already navigates for every top-level Sales nav item (href or
  // listFilter), so there's nothing left for this page to do here.
  const handleNav = useCallback(() => {}, []);

  const loadReturns = useCallback(async () => {
    try {
      const res = await fetchSalesReturns();
      setReturns(res.data.map(apiReturnToSalesReturn));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load returns");
      setReturns([]);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const rows = await fetchSalesOrders({ per_page: 200, sort_by: "order_date", sort_dir: "desc" });
      setOrders(rows.filter((o) => o.lines.some((l) => l.quantity_delivered > (l.quantity_returned ?? 0))));
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

  const creditTotal = useMemo(() => returns.reduce((sum, r) => sum + r.creditAmount, 0), [returns]);

  const handleConfirm = async (row: SalesReturn) => {
    try {
      await confirmSalesReturn(row.id);
      toast.success(`${row.number} confirmed`);
      void loadReturns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Confirm failed");
    }
  };

  const handleCancel = async (row: SalesReturn) => {
    try {
      await cancelSalesReturn(row.id);
      toast.success(`${row.number} cancelled`);
      void loadReturns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  const handleCredit = async (row: SalesReturn) => {
    try {
      await creditSalesReturn(row.id);
      toast.success(`${row.number} credited — stock in and AR credit memo posted`);
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
    <ListGridHeaderStart title="Returns">
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
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {chrome && (
        <SalesModuleNavbar activeNav="return" activeSub="return" onNavigate={handleNav} />
      )}
      <SalesModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <SalesReturnGrid
          ref={gridRef}
          returns={returns}
          onConfirm={(row) => void handleConfirm(row)}
          onCancel={(row) => void handleCancel(row)}
          onCredit={(row) => void handleCredit(row)}
          onChanged={() => {
            void loadReturns();
            void loadOrders();
          }}
          onFilterCountChange={setFilterCount}
          headerLeftActions={headerLeftActions}
          footerLeftActions={
            <span className="px-2 text-[10px] text-muted-foreground">
              {returns.length} return{returns.length === 1 ? "" : "s"} · {formatCurrency(creditTotal)} credit
            </span>
          }
          className="min-h-0 flex-1"
        />
      </SalesModuleBody>

      <SalesReturnDrawer
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && fromOrderId) router.replace(pathname || "/sales/returns");
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
