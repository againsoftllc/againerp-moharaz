"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FinanceAgListGrid, NUMERIC_CELL, NUMERIC_HEADER, type FinanceAgListGridColumn, type FinanceAgListGridHandle } from "@/components/finance/finance-ag-list-grid";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { OpeningBatchDrawer } from "@/components/finance/opening-batch-drawer";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchOpeningBatches, type ApiOpeningBatch } from "@/lib/api/finance-masters";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Finance → Accounting → Opening balances: GL openings entered as a batch, finalized once (posted and locked). */
export default function FinanceOpeningBalancesPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const [rows, setRows] = useState<ApiOpeningBatch[]>([]);
  const [restricted, setRestricted] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openBatch, setOpenBatch] = useState<ApiOpeningBatch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOpeningBatches();
      setRows(res.data);
      setRestricted(res.restricted);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load opening balances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (p: { value: unknown }) => formatCurrency(Number(p.value));
  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "date", field: "as_of_date", headerName: "As of", width: 120, valueFormatter: (p) => formatDate(p.value) },
      { colId: "status", field: "status", headerName: "Status", width: 110, valueFormatter: (p) => (p.value === "finalized" ? "Finalized" : "Draft") },
      { colId: "lines", headerName: "Accounts", width: 100, valueGetter: (p) => p.data?.lines.length ?? 0, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL },
      { colId: "debit", field: "total_debit", headerName: "Debit", width: 130, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL, valueFormatter: money },
      { colId: "credit", field: "total_credit", headerName: "Credit", width: 130, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL, valueFormatter: money },
      { colId: "difference", field: "difference", headerName: "To equity", width: 130, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL, valueFormatter: money },
      { colId: "journal", field: "journal_entry_number", headerName: "Journal", width: 120, valueFormatter: (p) => p.value || "—" },
      { colId: "note", field: "note", headerName: "Note", flex: 1, minWidth: 160, valueFormatter: (p) => p.value || "—" },
    ],
    [],
  );

  const open = (batch: ApiOpeningBatch | null) => {
    setOpenBatch(batch);
    setDrawerOpen(true);
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Opening balances">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => open(null)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={0}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <FinanceAgListGrid
        className="min-h-0 flex-1"
        gridRef={gridRef}
        storageKey="finance-opening-balances"
        rows={rows}
        columns={columns as unknown as FinanceAgListGridColumn[]}
        loading={loading && rows.length === 0}
        headerLeftActions={headerLeftActions}
        footerLeftActions={<span className="px-2 text-[10px] text-muted-foreground">{loading ? "Loading…" : `${rows.length} batch(es)`}</span>}
        onRowClicked={(row) => open(row as ApiOpeningBatch)}
        emptyTitle="No opening balances yet"
        emptyHint="Click New to enter what each account held on your go-live date."
        csvFileName={`opening-balances-${new Date().toISOString().slice(0, 10)}.csv`}
        csvHeaders={["As of", "Status", "Debit", "Credit", "To equity", "Journal", "Note"]}
        csvRow={(b: ApiOpeningBatch) => [b.as_of_date, b.status, b.total_debit, b.total_credit, b.difference, b.journal_entry_number ?? "", b.note ?? ""]}
        mobileLine={(b: ApiOpeningBatch) => ({ title: `Opening ${formatDate(b.as_of_date)}`, meta: b.status, value: formatCurrency(Number(b.total_debit)) })}
      />
      <OpeningBatchDrawer
        open={drawerOpen}
        batch={openBatch}
        restricted={restricted}
        canWrite={canWrite}
        onOpenChange={setDrawerOpen}
        onChanged={() => void load()}
      />
    </div>
  );
}
