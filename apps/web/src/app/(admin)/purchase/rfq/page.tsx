"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import { RfqFormDrawer } from "@/components/purchase/rfq-form-drawer";
import type { PurchaseRfqGridHandle } from "@/components/purchase/purchase-rfq-grid";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { confirmPurchaseOrder, createPurchaseOrder } from "@/lib/api/purchase-orders";
import {
  apiRfqToLegacy,
  awardRfqQuote,
  bulkDeletePurchaseRfqs,
  fetchPurchaseRfqs,
  linkRfqPo,
  sendPurchaseRfq,
} from "@/lib/api/purchase-rfq";
import type { PurchaseRfq } from "@/lib/mock-data/purchase-rfq";
import { readPurchaseSettings } from "@/lib/purchase/purchase-paths";
import { cn } from "@/lib/utils";

const PurchaseRfqGrid = dynamic(
  () => import("@/components/purchase/purchase-rfq-grid").then((m) => m.PurchaseRfqGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening RFQ…" /> },
);

function PurchaseRfqContent() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const { suppliers } = useCommerceSuppliers();
  const { warehouses } = useInventoryWarehouses();
  const [rfqs, setRfqs] = useState<PurchaseRfq[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<PurchaseRfqGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRfq, setEditRfq] = useState<PurchaseRfq | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPurchaseRfqs({ per_page: 300 });
      const mapped = list.data.map(apiRfqToLegacy);
      setRfqs(mapped);
      // Keep an already-open edit drawer in sync with the latest quotes/status, the same
      // way purchase/orders/page.tsx refreshes its open PO drawer after every reload.
      setEditRfq((current) => (current ? (mapped.find((r) => r.id === current.id) ?? current) : current));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load RFQs");
      setRfqs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultWarehouseId = () =>
    readPurchaseSettings().defaultWarehouseId ||
    (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id ||
    "";

  const awardToPo = async (rfq: PurchaseRfq, quoteId: string, supplierId: string) => {
    const quote = rfq.quotes.find((q) => q.id === quoteId);
    if (!quote) return;
    const warehouseId = defaultWarehouseId();
    if (!warehouseId) {
      toast.error("Set a default warehouse in Purchase settings first");
      return;
    }
    try {
      await awardRfqQuote(rfq.id, quoteId);
      const po = await createPurchaseOrder({
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        notes: `Awarded from ${rfq.number}`,
        lines: rfq.lines.map((line) => {
          const lq = quote.lineQuotes.find((q) => q.rfqLineId === line.id);
          return {
            sku: line.sku,
            quantity_ordered: line.quantity,
            unit_cost: lq?.unitPrice ?? 0,
          };
        }),
      });
      await confirmPurchaseOrder(po.id);
      await linkRfqPo(rfq.id, po.id);
      toast.success(`Awarded — ${po.po_number} confirmed`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${err.message} — the quote may already be awarded; create the PO manually if the SKU is missing.`
          : "Could not create PO",
      );
    } finally {
      void load();
    }
  };

  const handleFormOpenChange = (open: boolean) => {
    if (open) return;
    setEditRfq(null);
    setCreateOpen(false);
  };

  const openCreate = () => {
    setEditRfq(null);
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
    <ListGridHeaderStart title="RFQ">
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
            <Download className="mr-1.5 h-3.5 w-3" />
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
      <PurchaseRfqGrid
        ref={gridRef}
        rfqs={rfqs}
        suppliers={suppliers}
        loading={loading && rfqs.length === 0}
        onEdit={(row) => {
          setCreateOpen(false);
          setEditRfq(row);
        }}
        onSend={(row) => {
          void sendPurchaseRfq(row.id)
            .then(() => {
              toast.success(`${row.number} sent to suppliers`);
              void load();
            })
            .catch((err) => {
              toast.error(err instanceof Error ? err.message : "Could not send RFQ");
            });
        }}
        onAward={(row, quoteId, supplierId) => void awardToPo(row, quoteId, supplierId)}
        onDelete={(ids) =>
          void bulkDeletePurchaseRfqs(ids)
            .then(() => load())
            .catch((err) => {
              toast.error(err instanceof Error ? err.message : "Could not delete RFQs");
            })
        }
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${rfqs.length} request${rfqs.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      <RfqFormDrawer
        key={`rfq:${editRfq?.id ?? "new"}:${createOpen}`}
        open={createOpen || Boolean(editRfq)}
        onOpenChange={handleFormOpenChange}
        rfq={editRfq}
        suppliers={suppliers}
        onSaved={() => void load()}
        onAward={(rfq, quoteId, supplierId) => void awardToPo(rfq, quoteId, supplierId)}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add RFQ"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default function PurchaseRfqPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening RFQ…" />}>
        <PurchaseRfqContent />
      </Suspense>
    </div>
  );
}
