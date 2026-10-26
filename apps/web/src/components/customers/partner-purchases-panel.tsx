"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Eye } from "lucide-react";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { PoFormDrawer } from "@/components/suppliers/po-form-drawer";
import { fetchPurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { usePurchaseOrders } from "@/lib/api/use-purchase-orders";
import { PURCHASE_ORDER_STATUS_LABELS, type PurchaseOrder } from "@/lib/mock-data/purchase-orders";
import { formatCurrency, formatDate } from "@/lib/utils";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_billed: "Not billed",
  unpaid: "Due",
  partial: "Partial",
  paid: "Paid",
};

const PAYMENT_STATUS_TONE: Record<string, string> = {
  not_billed: "border-border bg-muted/40 text-muted-foreground",
  unpaid: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const PURCHASE_STATUS_TONE: Record<string, string> = {
  draft: "border-border bg-muted/40 text-muted-foreground",
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  partial_received: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

/** AgainPOS "Purchases" tab: every PO placed with this party as supplier,
 * reusing the app's common data-table (AgainListGrid). */
export function PartnerPurchasesPanel({
  supplierId,
  fillHeight,
}: {
  supplierId: string;
  fillHeight?: boolean;
}) {
  const params = useMemo(() => ({ supplier_id: supplierId, per_page: 50 }), [supplierId]);
  const { orders, loading, refetch } = usePurchaseOrders(params);
  // the PO opens in its own drawer over this one, so closing it comes straight back to the supplier
  const [opened, setOpened] = useState<ApiPurchaseOrder | null>(null);

  const rowData = useMemo(() => orders.map((o) => ({ ...o })), [orders]);

  const columnDefs = useMemo<ColDef<PurchaseOrder>[]>(
    () => [
      {
        colId: "action",
        headerName: "Action",
        width: 64,
        minWidth: 56,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<PurchaseOrder>) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 rounded-none p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Open ${p.data?.number}`}
            onClick={() => {
              const id = p.data?.id;
              if (!id) return;
              fetchPurchaseOrder(id)
                .then(setOpened)
                .catch((err) => toast.error(err instanceof Error ? err.message : "Could not open the purchase order"));
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        ),
      },
      {
        colId: "date",
        headerName: "Date",
        field: "orderDate",
        width: 100,
        minWidth: 90,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "number",
        headerName: "Reference No",
        field: "number",
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      // every row is this supplier's, so the Supplier column would only repeat the drawer's title: Location takes the space
      { colId: "warehouse", headerName: "Location", field: "warehouse", flex: 1, minWidth: 110 },
      {
        colId: "status",
        headerName: "Purchase Status",
        field: "status",
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseOrder>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={PURCHASE_STATUS_TONE[status] ?? ""} title={PURCHASE_ORDER_STATUS_LABELS[status]}>
              {PURCHASE_ORDER_STATUS_LABELS[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "paymentStatus",
        headerName: "Payment Status",
        field: "paymentStatus",
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<PurchaseOrder>) => {
          const status = p.data?.paymentStatus ?? "not_billed";
          return (
            <GridChipBadge className={PAYMENT_STATUS_TONE[status] ?? ""} title={PAYMENT_STATUS_LABELS[status]}>
              {PAYMENT_STATUS_LABELS[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "total",
        headerName: "Grand Total",
        field: "total",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "paymentDue",
        headerName: "Payment due",
        field: "paymentDue",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (Number(p.value ?? 0) > 0.004 ? formatCurrency(Number(p.value)) : "—"),
      },
      { colId: "createdByName", headerName: "Added By", field: "createdByName", width: 120, minWidth: 100 },
    ],
    [],
  );

  return (
    <>
      <AgainListGrid<PurchaseOrder>
        embedded
        className={fillHeight ? "flex min-h-0 flex-1 flex-col" : "h-[360px]"}
        gridClassName={
          fillHeight
            ? "[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1"
            : undefined
        }
        rowData={rowData}
        columnDefs={columnDefs}
        loading={loading}
        getRowId={(p) => p.data.id}
        emptyTitle="No purchase orders yet"
        emptyHint="POs placed with this supplier will appear here."
      />
      {opened ? (
        <PoFormDrawer
          key={`po:${opened.id}`}
          open
          onOpenChange={(next) => {
            if (!next) setOpened(null);
          }}
          supplierId={supplierId}
          order={opened}
          onCreated={() => void refetch()}
        />
      ) : null}
    </>
  );
}
