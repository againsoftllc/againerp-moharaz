"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { InvoiceCreateDrawer } from "@/components/crm/invoice-create-drawer";
import { InvoiceDetailDrawer } from "@/components/crm/invoice-detail-drawer";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { fetchSalesInvoices, type ApiSalesInvoice } from "@/lib/api/sales-invoices";
import { cn, formatCurrency } from "@/lib/utils";

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value);
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "partial", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const COLUMNS: ColDef<ApiSalesInvoice>[] = [
  { field: "invoice_number", headerName: "Invoice #", width: 130, cellClass: "font-medium" },
  { field: "customer_name", headerName: "Client", flex: 1.2, minWidth: 150, valueGetter: (p) => p.data?.customer_name ?? "—" },
  { field: "project_name", headerName: "Project", flex: 1, minWidth: 130, valueGetter: (p) => p.data?.project_name ?? "—" },
  { field: "bill_date", headerName: "Bill date", width: 110 },
  { field: "due_date", headerName: "Due date", width: 110, valueGetter: (p) => p.data?.due_date ?? "—" },
  {
    colId: "total",
    headerName: "Total",
    width: 110,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.total ?? 0),
    valueFormatter: (p) => money(p.data?.total),
  },
  {
    colId: "amount_paid",
    headerName: "Paid",
    width: 110,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => Number(p.data?.amount_paid ?? 0),
    valueFormatter: (p) => money(p.data?.amount_paid),
  },
  {
    colId: "balance",
    headerName: "Due",
    width: 110,
    headerClass: NUMERIC_HEADER,
    cellClass: cn(NUMERIC_CELL, "text-red-600 dark:text-red-400"),
    valueGetter: (p) => Number(p.data?.balance ?? 0),
    valueFormatter: (p) => money(p.data?.balance),
  },
  {
    field: "status",
    headerName: "Status",
    width: 110,
    cellRenderer: (p: ICellRendererParams<ApiSalesInvoice>) =>
      p.data ? <GridChipBadge className="capitalize">{p.data.status}</GridChipBadge> : null,
  },
];

export default function CrmInvoicesPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiSalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSalesInvoices({ search: search || undefined, status });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-invoices-api" });
  }, [error]);

  const headerLeftActions = useMemo(
    () => (
      <ListGridHeaderStart title="Invoices">
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New
          </Button>
        )}
      </ListGridHeaderStart>
    ),
    [canWrite],
  );

  return (
    <AgainListGrid<ApiSalesInvoice>
      rowData={rows}
      columnDefs={COLUMNS}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-[200px] rounded-none text-xs"
          />
          <FilterSelect value={status} onChange={setStatus} width="w-[160px]" ariaLabel="Invoice status filter" options={STATUS_OPTIONS} />
        </>
      }
      emptyTitle="No invoices match your filters"
      emptyHint="Try adjusting your search or filters."
      onResetFilters={() => {
        setSearch("");
        setStatus("all");
      }}
      onRowClicked={(row) => setDetailId(row.id)}
      footerLeftActions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh invoices"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <span className="text-[11px] text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
        </>
      }
    >
      <InvoiceCreateDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          void load();
          setDetailId(id);
        }}
      />
      <InvoiceDetailDrawer
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        invoiceId={detailId}
        onChanged={() => void load()}
      />
    </AgainListGrid>
  );
}
