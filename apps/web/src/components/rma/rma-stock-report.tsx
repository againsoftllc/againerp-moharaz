"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Download, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import {
  fetchRmaStockReport,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  type RmaStatus,
  type RmaStockLocationKind,
  type RmaStockReport,
  type RmaStockReportRow,
} from "@/lib/api/rma";

type LocationFilter = "all" | RmaStockLocationKind;
type FlagFilter = "all" | "late" | "aged" | "unlinked";

const LOCATION_LABEL: Record<RmaStockLocationKind, string> = {
  rma_store: "In RMA Store",
  supplier: "With Supplier",
};

const LOCATION_TONE: Record<RmaStockLocationKind, string> = {
  rma_store: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  supplier: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const CUSTODY_TONE: Record<string, string> = {
  in_rma_store: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  replacement_received: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  with_supplier: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const FLAG_OPTIONS: { value: FlagFilter; label: string }[] = [
  { value: "all", label: "All lines" },
  { value: "late", label: "Late from supplier" },
  { value: "aged", label: "Aged" },
  { value: "unlinked", label: "No linked RMA" },
];

const money = (value: string | number) => formatCurrency(Number(value || 0));
const units = (rows: RmaStockReportRow[]) => rows.reduce((sum, r) => sum + r.quantity, 0);

function Tile({
  label,
  value,
  foot,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: string;
  foot?: string;
  tone?: "default" | "warn" | "bad";
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "min-w-0 border-r border-border bg-background px-3 py-1.5 text-left last:border-r-0 enabled:hover:bg-muted/40 disabled:cursor-default",
        active && "bg-[#00a09d]/5 shadow-[inset_0_-2px_0_#00a09d]",
      )}
    >
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-[17px] font-semibold leading-tight tabular-nums text-foreground",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      {foot ? <p className="truncate text-[11px] text-muted-foreground">{foot}</p> : null}
    </button>
  );
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * RMA Stock Report (/inventory/rma/stock-report): every unit that is in an RMA store or out with a supplier right now,
 * in one list. Quantities are the warehouse stock levels, so the report agrees with the Stock page; each line is tied to its
 * RMA, supplier claim and age. Lines no open RMA accounts for are flagged instead of hidden.
 */
export function RmaStockReport() {
  const router = useRouter();
  const [report, setReport] = useState<RmaStockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<LocationFilter>("all");
  const [flag, setFlag] = useState<FlagFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchRmaStockReport());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the RMA stock report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => report?.rows ?? [], [report]);
  const agedAfter = report?.summary.aged_after_days ?? 30;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (location !== "all" && r.location_kind !== location) return false;
      if (flag === "late" && !r.is_late) return false;
      if (flag === "aged" && r.days_in_location <= agedAfter) return false;
      if (flag === "unlinked" && r.linked) return false;
      if (!q) return true;
      return [r.sku, r.product_name, r.serial_number, r.rma_number, r.customer_name, r.supplier_name, r.claim_number, r.location_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, location, flag, agedAfter]);

  const filterCount = (search.trim() ? 1 : 0) + (location !== "all" ? 1 : 0) + (flag !== "all" ? 1 : 0);
  const resetFilters = () => {
    setSearch("");
    setLocation("all");
    setFlag("all");
  };

  const openRma = useCallback((id: string | null) => id && router.push(`/inventory/rma?claim=${encodeURIComponent(id)}`), [router]);

  const exportCsv = () => {
    const header = [
      "Location", "Stock state", "RMA", "RMA status", "SKU", "Product", "Serial", "Qty", "Customer", "Supplier", "Claim",
      "Since", "Days", "Expected return", "Late", "Unit cost", "Cost estimated", "Value", "Linked RMA",
    ];
    const body = filtered.map((r) =>
      [
        r.location_name, r.custody_label, r.rma_number ?? "", r.rma_status ? (RMA_STATUS_LABEL[r.rma_status as RmaStatus] ?? r.rma_status) : "",
        r.sku, r.product_name, r.serial_number, r.quantity, r.customer_name, r.supplier_name, r.claim_number ?? "",
        r.since ? r.since.slice(0, 10) : "", r.days_in_location, r.expected_return_date ?? "", r.is_late ? "yes" : "",
        r.unit_cost, r.cost_estimated ? "estimated" : "", r.value, r.linked ? "yes" : "no",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.map(csvCell).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rma-stock-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} line${filtered.length === 1 ? "" : "s"}`);
  };

  const columnDefs = useMemo<ColDef<RmaStockReportRow>[]>(
    () => [
      {
        colId: "location",
        headerName: "Location",
        field: "location_name",
        width: 150,
        minWidth: 120,
        pinned: "left",
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) =>
          p.data ? (
            <GridChipBadge
              className={cn("max-w-none", LOCATION_TONE[p.data.location_kind])}
              title={`${p.data.location_code} — ${p.data.location_name}`}
            >
              {p.data.location_name}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "rma",
        headerName: "RMA No",
        field: "rma_number",
        width: 150,
        minWidth: 125,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) => {
          if (!p.data) return null;
          if (!p.data.rma_number) {
            return (
              <GridChipBadge className="max-w-none border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" title="No open RMA accounts for this stock">
                No linked RMA
              </GridChipBadge>
            );
          }
          return (
            <GridRefLink className="font-medium" title={p.data.rma_number} onClick={() => openRma(p.data!.rma_id)}>
              {p.data.rma_number}
            </GridRefLink>
          );
        },
      },
      { colId: "sku", headerName: "SKU", field: "sku", width: 120, minWidth: 100, cellClass: "font-mono text-[11px]" },
      {
        colId: "product",
        headerName: "Product",
        field: "product_name",
        flex: 1.6,
        minWidth: 200,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) =>
          p.data ? (
            <span className="block truncate font-medium" title={p.data.product_name}>
              {p.data.product_name}
            </span>
          ) : null,
      },
      {
        colId: "serial",
        headerName: "Serial",
        field: "serial_number",
        width: 150,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "qty",
        headerName: "Qty",
        field: "quantity",
        width: 70,
        minWidth: 56,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      {
        colId: "state",
        headerName: "Stock state",
        field: "custody_label",
        width: 210,
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) =>
          p.data ? (
            <GridChipBadge
              className={cn("max-w-none", CUSTODY_TONE[p.data.custody_state ?? ""] ?? LOCATION_TONE[p.data.location_kind])}
              title={p.data.custody_label}
            >
              {p.data.custody_label}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "status",
        headerName: "RMA status",
        field: "rma_status",
        width: 170,
        minWidth: 130,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) => {
          const status = p.data?.rma_status;
          if (!status) return <span className="text-muted-foreground">—</span>;
          return (
            <GridChipBadge className={cn("max-w-none", RMA_STATUS_TONE[status])} title={RMA_STATUS_LABEL[status as RmaStatus] ?? status}>
              {RMA_STATUS_LABEL[status as RmaStatus] ?? status}
            </GridChipBadge>
          );
        },
      },
      { colId: "customer", headerName: "Customer", field: "customer_name", width: 160, minWidth: 110, valueFormatter: (p) => p.value || "—" },
      { colId: "supplier", headerName: "Supplier", field: "supplier_name", width: 170, minWidth: 110, valueFormatter: (p) => p.value || "—" },
      {
        colId: "claim",
        headerName: "Claim No",
        field: "claim_number",
        width: 140,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "since",
        headerName: "Since",
        field: "since",
        width: 110,
        minWidth: 90,
        valueFormatter: (p) => (p.value ? formatDate(String(p.value)) : "—"),
      },
      {
        colId: "days",
        headerName: "Days",
        field: "days_in_location",
        width: 80,
        minWidth: 64,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) => {
          if (!p.data) return null;
          const aged = p.data.days_in_location > agedAfter;
          return (
            <span
              className={cn(
                "tabular-nums",
                p.data.is_late && "font-semibold text-red-600 dark:text-red-400",
                !p.data.is_late && aged && "font-medium text-amber-600 dark:text-amber-400",
              )}
              title={aged ? `In this location for more than ${agedAfter} days` : undefined}
            >
              {p.data.days_in_location}
            </span>
          );
        },
      },
      {
        colId: "expected",
        headerName: "Expected back",
        field: "expected_return_date",
        width: 150,
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) => {
          if (!p.data?.expected_return_date) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums">{formatDate(p.data.expected_return_date)}</span>
              {p.data.is_late ? (
                <GridChipBadge className="max-w-none border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">Late</GridChipBadge>
              ) : null}
            </span>
          );
        },
      },
      {
        colId: "unitCost",
        headerName: "Unit cost",
        field: "unit_cost",
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        cellRenderer: (p: ICellRendererParams<RmaStockReportRow>) =>
          p.data ? (
            <span title={p.data.cost_estimated ? "Estimated: average cost of this product in the other warehouses" : undefined}>
              {p.data.cost_estimated ? "~" : ""}
              {money(p.data.unit_cost)}
            </span>
          ) : null,
      },
      {
        colId: "value",
        headerName: "Value",
        field: "value",
        width: 120,
        minWidth: 100,
        pinned: "right",
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: cn(NUMERIC_CELL, "font-semibold"),
        valueFormatter: (p) => money(p.value),
      },
    ],
    [agedAfter, openRma],
  );

  const summary = report?.summary;
  const headerLeftActions = (
    <ListGridHeaderStart title="RMA Stock Report">
      <Button variant="outline" size="sm" className="rounded-none" onClick={() => router.push("/inventory/rma")}>
        RMA
      </Button>
      <Button variant="outline" size="sm" className="rounded-none" onClick={() => router.push("/inventory/rma/dashboard")}>
        Dashboard
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="relative h-[26px] w-[26px] shrink-0 rounded-none" aria-label="Settings">
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3" />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={resetFilters}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  const chip = (value: LocationFilter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setLocation(value)}
      aria-pressed={location === value}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-none border px-2 text-[12px] transition-colors",
        location === value
          ? "border-[#00a09d] bg-[#00a09d] text-white"
          : "border-border bg-background text-foreground hover:border-[#00a09d]/60",
      )}
    >
      {label}
      <span className={cn("tabular-nums text-[11px]", location === value ? "text-white/90" : "text-muted-foreground")}>{count}</span>
    </button>
  );

  return (
    <AgainListGrid<RmaStockReportRow>
      className="min-h-0 flex-1"
      layoutKey="grid-layout:inventory.rma.stock-report"
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading && !report}
      getRowId={(p) => p.data.id}
      headerLeftActions={headerLeftActions}
      summary={
        summary ? (
          <div className="grid grid-cols-2 border-b border-border md:grid-cols-4 xl:grid-cols-7">
            <Tile
              label="In RMA Store"
              value={`${summary.store_units} unit${summary.store_units === 1 ? "" : "s"}`}
              foot={money(summary.store_value)}
              active={location === "rma_store"}
              onClick={() => setLocation(location === "rma_store" ? "all" : "rma_store")}
            />
            <Tile
              label="With Supplier"
              value={`${summary.supplier_units} unit${summary.supplier_units === 1 ? "" : "s"}`}
              foot={money(summary.supplier_value)}
              active={location === "supplier"}
              onClick={() => setLocation(location === "supplier" ? "all" : "supplier")}
            />
            <Tile label="Total in RMA" value={`${summary.total_units} unit${summary.total_units === 1 ? "" : "s"}`} foot={`${summary.sku_count} product${summary.sku_count === 1 ? "" : "s"}`} />
            <Tile label="Stock value" value={money(summary.total_value)} foot={rows.some((r) => r.cost_estimated) ? "~ some at average cost" : "At cost"} />
            <Tile
              label="Late from supplier"
              value={String(summary.late_returns)}
              foot="Past expected return"
              tone={summary.late_returns > 0 ? "bad" : "default"}
              active={flag === "late"}
              onClick={() => setFlag(flag === "late" ? "all" : "late")}
            />
            <Tile
              label={`Aged > ${summary.aged_after_days} days`}
              value={String(summary.aged_units)}
              foot={summary.oldest_days ? `Oldest ${summary.oldest_days} days` : "Nothing waiting"}
              tone={summary.aged_units > 0 ? "warn" : "default"}
              active={flag === "aged"}
              onClick={() => setFlag(flag === "aged" ? "all" : "aged")}
            />
            <Tile
              label="No linked RMA"
              value={String(summary.unlinked_units)}
              foot="Stock without an open RMA"
              tone={summary.unlinked_units > 0 ? "warn" : "default"}
              active={flag === "unlinked"}
              onClick={() => setFlag(flag === "unlinked" ? "all" : "unlinked")}
            />
          </div>
        ) : null
      }
      filterBar={
        <>
          {chip("all", "All", summary?.total_units ?? 0)}
          {chip("rma_store", "In RMA Store", summary?.store_units ?? 0)}
          {chip("supplier", "With Supplier", summary?.supplier_units ?? 0)}
          <Input
            placeholder="Search product, SKU, serial, RMA, customer, supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[300px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={flag}
            onChange={(v) => setFlag(v as FlagFilter)}
            width="w-[170px]"
            className="shrink-0"
            ariaLabel="Lines"
            options={FLAG_OPTIONS}
          />
          {filterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </>
      }
      footerLeftActions={
        <span className="px-2 text-[10px] text-muted-foreground">
          {loading && !report
            ? "Loading…"
            : `${filtered.length} line${filtered.length === 1 ? "" : "s"} · ${units(filtered)} unit${units(filtered) === 1 ? "" : "s"} · ${money(
                filtered.reduce((sum, r) => sum + Number(r.value), 0),
              )}`}
        </span>
      }
      emptyTitle={filterCount > 0 ? "No units match your filters" : "Nothing is in an RMA location right now"}
      emptyHint={filterCount > 0 ? "Clear the filters to see every RMA unit" : "Units appear here once a complaint is approved and received into the RMA store"}
      onResetFilters={resetFilters}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((r) => (
            <button key={r.id} type="button" className="block w-full px-3 py-2.5 text-left" onClick={() => openRma(r.rma_id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.product_name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {r.sku}
                    {r.serial_number ? ` · ${r.serial_number}` : ""}
                  </p>
                </div>
                <GridChipBadge className={cn("shrink-0", LOCATION_TONE[r.location_kind])}>{LOCATION_LABEL[r.location_kind]}</GridChipBadge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {r.rma_number ?? "No linked RMA"} · Qty {r.quantity} · {r.days_in_location}d{r.is_late ? " · late" : ""} · {money(r.value)}
              </p>
            </button>
          ))}
        </div>
      }
    />
  );
}
