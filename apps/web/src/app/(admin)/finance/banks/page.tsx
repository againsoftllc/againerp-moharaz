"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BankDrawer } from "@/components/finance/bank-drawer";
import { FinanceAgListGrid, NUMERIC_CELL, NUMERIC_HEADER, type FinanceAgListGridColumn, type FinanceAgListGridHandle } from "@/components/finance/finance-ag-list-grid";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchBanks, type ApiBank } from "@/lib/api/finance-masters";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

/** Finance → Payments → Banks: the bank and branch master (OnerERP Bank → Branch → Account). */
export default function FinanceBanksPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const [rows, setRows] = useState<ApiBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openBank, setOpenBank] = useState<ApiBank | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await fetchBanks()).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load banks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) =>
      `${b.name} ${b.short_name ?? ""} ${b.swift_code ?? ""} ${b.branches.map((br) => `${br.name} ${br.routing_number ?? ""}`).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      { colId: "name", field: "name", headerName: "Bank", flex: 1, minWidth: 200, cellClass: "font-medium" },
      { colId: "short", field: "short_name", headerName: "Short name", width: 120, valueFormatter: (p) => p.value || "—" },
      { colId: "swift", field: "swift_code", headerName: "SWIFT", width: 130, valueFormatter: (p) => p.value || "—" },
      {
        colId: "branches",
        headerName: "Branches",
        width: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.branches.length ?? 0,
      },
      {
        colId: "accounts",
        field: "account_count",
        headerName: "Your accounts",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      { colId: "active", field: "is_active", headerName: "Active", width: 90, valueFormatter: (p) => (p.value ? "Yes" : "No") },
    ],
    [],
  );

  const open = (bank: ApiBank | null) => {
    setOpenBank(bank);
    setDrawerOpen(true);
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Banks">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => open(null)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={search.trim() ? 1 : 0}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => setSearch("")}
      />
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <FinanceAgListGrid
        className="min-h-0 flex-1"
        gridRef={gridRef}
        storageKey="finance-banks"
        rows={filtered}
        columns={columns as unknown as FinanceAgListGridColumn[]}
        loading={loading && rows.length === 0}
        headerLeftActions={headerLeftActions}
        footerLeftActions={<span className="px-2 text-[10px] text-muted-foreground">{loading ? "Loading…" : `${filtered.length} shown`}</span>}
        onRowClicked={(row) => open(row as ApiBank)}
        onResetFilters={() => setSearch("")}
        filterToggles={[{ key: "search", label: "Search" }]}
        emptyTitle={rows.length === 0 ? "No banks yet" : "No bank matches"}
        csvFileName={`banks-${new Date().toISOString().slice(0, 10)}.csv`}
        csvHeaders={["Bank", "Short name", "SWIFT", "Branches", "Your accounts", "Active"]}
        csvRow={(b: ApiBank) => [b.name, b.short_name ?? "", b.swift_code ?? "", b.branches.length, b.account_count, b.is_active ? "Yes" : "No"]}
        mobileLine={(b: ApiBank) => ({ title: b.name, meta: `${b.branches.length} branch(es)`, value: b.is_active ? "Active" : "Inactive" })}
        filterBar={(visible) =>
          (visible.search !== false ? (
            <Input
              placeholder="Search bank, branch, routing no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[260px] shrink-0 rounded-none"
            />
          ) : null) as ReactNode
        }
      />
      <BankDrawer
        open={drawerOpen}
        bank={openBank}
        canWrite={canWrite}
        onOpenChange={setDrawerOpen}
        onChanged={() => void load()}
      />
    </div>
  );
}
