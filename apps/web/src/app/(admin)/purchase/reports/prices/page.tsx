"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { toast } from "sonner";
import { FilterSelect } from "@/components/shared/filter-select";
import { Input } from "@/components/ui/input";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import type { InventoryReportGridColumn } from "@/components/inventory/inventory-report-grid";
import {
  InventoryReportToolbar,
  NUMERIC_CELL,
  ReportStat,
  downloadCsv,
  qty,
  taka,
} from "@/components/inventory/inventory-report-shell";
import { todayIso } from "@/components/finance/finance-report-shell";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import {
  fetchPurchasePriceReport,
  type ApiPurchasePriceLine,
  type ApiPurchasePriceReport,
} from "@/lib/api/purchase-orders";
import { cn } from "@/lib/utils";

const InventoryReportGrid = dynamic(
  () => import("@/components/inventory/inventory-report-grid").then((m) => m.InventoryReportGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening report…" />,
  },
);

const INSIGHT_OPTIONS = [
  { value: "all", label: "All SKUs" },
  { value: "last_above_avg", label: "Last > average" },
  { value: "last_below_avg", label: "Last < average" },
  { value: "last_above_default", label: "Last > default" },
  { value: "last_below_default", label: "Last < default" },
  { value: "missing_default", label: "No default price" },
  { value: "never_purchased", label: "Never purchased" },
  { value: "stale_90d", label: "Not bought in 90 days" },
];

function moneyOpt(value: unknown) {
  if (value == null || value === "") return "—";
  return taka(value);
}

function DeltaCell({ value }: { value: string | null | undefined }) {
  if (value == null || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) {
    return <span className="tabular-nums">{taka(0)}</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        n > 0 && "text-red-600 dark:text-red-400",
        n < 0 && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {n > 0 ? "+" : ""}
      {taka(n)}
    </span>
  );
}

function matchesSearch(haystacks: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return haystacks.some((v) => (v ?? "").toLowerCase().includes(query));
}

function matchesInsight(row: ApiPurchasePriceLine, insight: string) {
  const vsAvg = Number(row.vs_avg);
  const vsDef = Number(row.vs_default);
  switch (insight) {
    case "last_above_avg":
      return row.vs_avg != null && vsAvg > 0;
    case "last_below_avg":
      return row.vs_avg != null && vsAvg < 0;
    case "last_above_default":
      return row.vs_default != null && vsDef > 0;
    case "last_below_default":
      return row.vs_default != null && vsDef < 0;
    case "missing_default":
      return row.default_purchase_price == null;
    case "never_purchased":
      return row.po_count === 0;
    case "stale_90d":
      return row.days_since_last != null && row.days_since_last >= 90;
    default:
      return true;
  }
}

const PRICE_COLUMNS: InventoryReportGridColumn<ApiPurchasePriceLine>[] = [
  {
    colId: "name",
    field: "name",
    headerName: "Name",
    flex: 2,
    minWidth: 160,
    tooltipField: "name",
  },
  {
    colId: "sku",
    field: "sku",
    headerName: "SKU",
    width: 110,
    minWidth: 80,
    cellClass: "font-mono text-[11px]",
  },
  {
    colId: "supplier_name",
    field: "supplier_name",
    headerName: "Last supplier",
    width: 160,
    minWidth: 110,
    tooltipField: "supplier_name",
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => p.value || "—",
  },
  {
    colId: "on_hand",
    field: "on_hand",
    headerName: "On hand",
    width: 88,
    minWidth: 64,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => qty(p.value),
  },
  {
    colId: "stock_cost",
    field: "stock_cost",
    headerName: "Stock cost",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) =>
      Number(p.value) > 0 ? taka(p.value) : "—",
  },
  {
    colId: "default_purchase_price",
    field: "default_purchase_price",
    headerName: "Default",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => moneyOpt(p.value),
  },
  {
    colId: "last_purchase_price",
    field: "last_purchase_price",
    headerName: "Last",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: `${NUMERIC_CELL} font-medium`,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => moneyOpt(p.value),
  },
  {
    colId: "avg_purchase_price",
    field: "avg_purchase_price",
    headerName: "Average",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => moneyOpt(p.value),
  },
  {
    colId: "min_purchase_price",
    field: "min_purchase_price",
    headerName: "Lowest",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => moneyOpt(p.value),
  },
  {
    colId: "max_purchase_price",
    field: "max_purchase_price",
    headerName: "Highest",
    width: 118,
    minWidth: 96,
    hide: true,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => moneyOpt(p.value),
  },
  {
    colId: "last_purchase_date",
    field: "last_purchase_date",
    headerName: "Last date",
    width: 110,
    minWidth: 96,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => p.value || "—",
  },
  {
    colId: "days_since_last",
    field: "days_since_last",
    headerName: "Days since",
    width: 104,
    minWidth: 80,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiPurchasePriceLine>) => {
      const days = p.data?.days_since_last;
      if (days == null) return <span className="text-muted-foreground">—</span>;
      return (
        <span className={cn("tabular-nums", days >= 90 && "text-amber-600 dark:text-amber-400")}>
          {days}d
        </span>
      );
    },
  },
  {
    colId: "last_po_number",
    field: "last_po_number",
    headerName: "Last PO",
    width: 120,
    minWidth: 90,
    hide: true,
    cellClass: "font-mono text-[11px]",
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => p.value || "—",
  },
  {
    colId: "vs_avg",
    field: "vs_avg",
    headerName: "Vs average",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiPurchasePriceLine>) => (
      <DeltaCell value={p.data?.vs_avg} />
    ),
  },
  {
    colId: "vs_default",
    field: "vs_default",
    headerName: "Vs default",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiPurchasePriceLine>) => (
      <DeltaCell value={p.data?.vs_default} />
    ),
  },
  {
    colId: "po_count",
    field: "po_count",
    headerName: "POs",
    width: 72,
    minWidth: 56,
    hide: true,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => qty(p.value),
  },
  {
    colId: "qty_purchased",
    field: "qty_purchased",
    headerName: "Qty bought",
    width: 104,
    minWidth: 80,
    hide: true,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => qty(p.value),
  },
  {
    colId: "total_spend",
    field: "total_spend",
    headerName: "Spend",
    width: 130,
    minWidth: 100,
    hide: true,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiPurchasePriceLine>) => taka(p.value),
  },
];

export default function PurchasePriceReportPage() {
  const { suppliers } = useCommerceSuppliers();
  const [supplierId, setSupplierId] = useState("all");
  const [insight, setInsight] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ApiPurchasePriceReport | null>(null);

  const supplierOptions = useMemo(
    () => [
      { value: "all", label: "All suppliers" },
      ...suppliers.map((s) => ({ value: s.id, label: s.name })),
    ],
    [suppliers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(
        await fetchPurchasePriceReport({
          supplierId: supplierId === "all" ? undefined : supplierId,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = searchInput.trim().toLowerCase();
  const rows = (report?.data ?? []).filter((r) => {
    if (!matchesSearch([r.sku, r.name, r.supplier_name, r.last_po_number], search)) return false;
    return matchesInsight(r, insight);
  });

  const filteredSpend = rows.reduce((sum, r) => sum + Number(r.total_spend || 0), 0);
  const filteredOnHand = rows.reduce((sum, r) => sum + Number(r.on_hand || 0), 0);
  const aboveAvg = rows.filter((r) => r.vs_avg != null && Number(r.vs_avg) > 0).length;
  const belowAvg = rows.filter((r) => r.vs_avg != null && Number(r.vs_avg) < 0).length;
  const stale = rows.filter((r) => r.days_since_last != null && r.days_since_last >= 90).length;
  const neverBought = rows.filter((r) => r.po_count === 0).length;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <InventoryReportGrid<ApiPurchasePriceLine>
        storageKey="purchase-prices"
        rows={rows}
        columns={PRICE_COLUMNS}
        loading={loading && rows.length === 0}
        emptyTitle="No purchase-price lines match your filters"
        emptyHint="Change supplier or insight, or clear search"
        mobileLine={(r) => ({
          title: r.name,
          meta: `${r.sku} · ${r.supplier_name ?? "Never purchased"}`,
          value: moneyOpt(r.last_purchase_price),
        })}
        toolbar={
          <InventoryReportToolbar
            title="Purchase prices"
            onRefresh={() => void load()}
            loading={loading}
            extraFilters={
              <>
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search SKU, name…"
                  className="w-[220px] shrink-0 rounded-none"
                />
                <FilterSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  width="w-[190px]"
                  className="shrink-0"
                  ariaLabel="Supplier"
                />
                <FilterSelect
                  value={insight}
                  onChange={setInsight}
                  options={INSIGHT_OPTIONS}
                  width="w-[200px]"
                  className="shrink-0"
                  ariaLabel="Insight"
                />
              </>
            }
            onExport={() =>
              downloadCsv(
                `purchase-prices-${todayIso()}.csv`,
                [
                  "Name",
                  "SKU",
                  "Last supplier",
                  "On hand",
                  "Stock cost",
                  "Default",
                  "Last",
                  "Average",
                  "Lowest",
                  "Highest",
                  "Last date",
                  "Days since",
                  "Last PO",
                  "Vs average",
                  "Vs default",
                  "POs",
                  "Qty bought",
                  "Spend",
                ],
                rows.map((r) => [
                  r.name,
                  r.sku,
                  r.supplier_name ?? "",
                  r.on_hand,
                  r.stock_cost,
                  r.default_purchase_price ?? "",
                  r.last_purchase_price ?? "",
                  r.avg_purchase_price ?? "",
                  r.min_purchase_price ?? "",
                  r.max_purchase_price ?? "",
                  r.last_purchase_date ?? "",
                  r.days_since_last ?? "",
                  r.last_po_number ?? "",
                  r.vs_avg ?? "",
                  r.vs_default ?? "",
                  r.po_count,
                  r.qty_purchased,
                  r.total_spend,
                ]),
              )
            }
          />
        }
        summary={
          report ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              <ReportStat label="SKUs" value={qty(rows.length)} />
              <ReportStat label="On hand" value={qty(filteredOnHand)} />
              <ReportStat label="Spend" value={taka(filteredSpend)} />
              <ReportStat
                label="Last > avg"
                value={qty(aboveAvg)}
                tone={aboveAvg > 0 ? "danger" : undefined}
              />
              <ReportStat
                label="Last < avg"
                value={qty(belowAvg)}
                tone={belowAvg > 0 ? "ok" : undefined}
              />
              <ReportStat
                label="90d stale"
                value={qty(stale)}
                tone={stale > 0 ? "danger" : undefined}
              />
              <ReportStat label="Never bought" value={qty(neverBought)} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
