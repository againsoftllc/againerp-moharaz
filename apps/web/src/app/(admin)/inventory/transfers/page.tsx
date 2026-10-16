"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Plus, RefreshCw, Settings2 } from "lucide-react";
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
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import {
  cancelStockTransfer,
  fetchStockTransfer,
  fetchStockTransfers,
  shipStockTransfer,
  type ApiStockTransfer,
} from "@/lib/api/stock-transfers";
import { StockTransferDrawer } from "@/components/inventory/stock-transfer-drawer";
import type { StockTransferGridHandle } from "@/components/inventory/stock-transfer-grid";
import { cn } from "@/lib/utils";

const StockTransferGrid = dynamic(
  () => import("@/components/inventory/stock-transfer-grid").then((m) => m.StockTransferGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening transfers…" /> },
);

function StockTransfersContent() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { warehouses } = useInventoryWarehouses();
  const gridRef = useRef<StockTransferGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [rows, setRows] = useState<ApiStockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewRow, setViewRow] = useState<ApiStockTransfer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchStockTransfers();
      setRows(list.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load transfers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchStockTransfers();
        if (!cancelled) setRows(list.data);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load transfers");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const headerLeftActions = (
    <ListGridHeaderStart title="Stock Transfers">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setCreateOpen(true)}>
          New Transfer
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("relative h-[26px] w-[26px] shrink-0 rounded-none")}
            aria-label="Settings"
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
      <StockTransferGrid
        ref={gridRef}
        transfers={rows}
        warehouses={warehouses}
        loading={loading && rows.length === 0}
        onView={async (row) => {
          try {
            setViewRow(await fetchStockTransfer(row.id));
          } catch {
            setViewRow(row);
          }
        }}
        onShip={async (row) => {
          try {
            await shipStockTransfer(row.id);
            toast.success(`${row.transfer_number} shipped`);
            void load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Ship failed");
          }
        }}
        onReceive={async (row) => {
          try {
            setViewRow(await fetchStockTransfer(row.id));
          } catch {
            setViewRow(row);
          }
        }}
        onCancel={async (row) => {
          try {
            await cancelStockTransfer(row.id);
            toast.success(`${row.transfer_number} cancelled`);
            void load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Cancel failed");
          }
        }}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} transfer${rows.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <StockTransferDrawer
        key={`new:${createOpen}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, is_active: w.active }))}
        onChanged={load}
      />
      <StockTransferDrawer
        key={`view:${viewRow?.id ?? "none"}`}
        open={Boolean(viewRow)}
        onOpenChange={(next) => {
          if (!next) setViewRow(null);
        }}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, is_active: w.active }))}
        transfer={viewRow}
        onChanged={load}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={() => setCreateOpen(true)}
          aria-label="New transfer"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default function StockTransfersPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening transfers…" />}>
        <StockTransfersContent />
      </Suspense>
    </div>
  );
}
