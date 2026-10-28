"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { toast } from "sonner";
import { FilterSelect } from "@/components/shared/filter-select";
import { Input } from "@/components/ui/input";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import type { InventoryReportGridColumn } from "@/components/inventory/inventory-report-grid";
import {
  InventoryReportToolbar,
  NUMERIC_CELL,
  ReportStat,
  downloadCsv,
  qty,
} from "@/components/inventory/inventory-report-shell";
import { todayIso } from "@/components/finance/finance-report-shell";
import {
  fetchSerialsReport,
  type ApiSerialReport,
  type ApiSerialReportLine,
} from "@/lib/api/inventory";
import {
  SERIAL_STATUS_LABEL,
  SERIAL_STATUS_TONE,
  type SerialStatus,
} from "@/lib/api/inventory-serials";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { cn } from "@/lib/utils";

const InventoryReportGrid = dynamic(
  () => import("@/components/inventory/inventory-report-grid").then((m) => m.InventoryReportGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening report…" />,
  },
);

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(SERIAL_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const INSIGHT_OPTIONS = [
  { value: "all", label: "All units" },
  { value: "warranty_expiring", label: "Warranty ≤ 30 days" },
  { value: "warranty_expired", label: "Warranty expired" },
  { value: "no_warranty", label: "Sold, no warranty date" },
  { value: "aging_90", label: "In stock 90+ days" },
  { value: "open_rma", label: "Open RMA" },
  { value: "exceptions", label: "Lost / damaged / scrapped" },
  { value: "in_transit", label: "In transit" },
];

const SOURCE_LABEL: Record<string, string> = {
  receipt: "Goods receipt",
  manual: "Manual",
  rma_replacement: "RMA replacement",
  adjustment: "Adjustment",
};

const WARRANTY_LABEL: Record<string, string> = {
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  unknown: "Unknown",
};

const WARRANTY_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expiring: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unknown: "border-border bg-muted/40 text-muted-foreground",
};

function matchesSearch(haystacks: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return haystacks.some((v) => (v ?? "").toLowerCase().includes(query));
}

function matchesInsight(row: ApiSerialReportLine, insight: string) {
  switch (insight) {
    case "warranty_expiring":
      return row.warranty_status === "expiring";
    case "warranty_expired":
      return row.warranty_status === "expired";
    case "no_warranty":
      return (
        row.warranty_status === "unknown" &&
        (row.status === "sold" || row.status === "in_service")
      );
    case "aging_90":
      return row.status === "in_stock" && (row.days_in_stock ?? 0) >= 90;
    case "open_rma":
      return row.has_open_rma;
    case "exceptions":
      return row.status === "lost" || row.status === "damaged" || row.status === "scrapped";
    case "in_transit":
      return row.status === "in_transit";
    default:
      return true;
  }
}

function daysCell(value: number | null | undefined, warnAt?: number) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const warn = warnAt != null && value >= warnAt;
  return <span className={cn("tabular-nums", warn && "text-amber-600 dark:text-amber-400")}>{value}d</span>;
}

const SERIAL_COLUMNS: InventoryReportGridColumn<ApiSerialReportLine>[] = [
  {
    colId: "name",
    field: "name",
    headerName: "Name",
    flex: 2,
    minWidth: 150,
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
    colId: "serial_number",
    field: "serial_number",
    headerName: "Serial",
    width: 160,
    minWidth: 120,
    cellClass: "font-mono text-[11px]",
    tooltipField: "serial_number",
  },
  {
    colId: "status",
    field: "status",
    headerName: "Status",
    width: 128,
    minWidth: 104,
    cellRenderer: (p: ICellRendererParams<ApiSerialReportLine>) => {
      const s = p.data?.status as SerialStatus | undefined;
      if (!s) return null;
      return (
        <GridChipBadge className={SERIAL_STATUS_TONE[s]} title={SERIAL_STATUS_LABEL[s] ?? s}>
          {SERIAL_STATUS_LABEL[s] ?? s}
        </GridChipBadge>
      );
    },
  },
  {
    colId: "warehouse_name",
    field: "warehouse_name",
    headerName: "Warehouse",
    width: 150,
    minWidth: 110,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "received_on",
    field: "received_on",
    headerName: "Received",
    width: 110,
    minWidth: 96,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "days_in_stock",
    field: "days_in_stock",
    headerName: "Days in stock",
    width: 118,
    minWidth: 90,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiSerialReportLine>) =>
      daysCell(p.data?.days_in_stock, 90),
  },
  {
    colId: "sold_on",
    field: "sold_on",
    headerName: "Sold",
    width: 110,
    minWidth: 96,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "customer_name",
    field: "customer_name",
    headerName: "Customer",
    width: 150,
    minWidth: 110,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "warranty_expires_on",
    field: "warranty_expires_on",
    headerName: "Warranty until",
    width: 120,
    minWidth: 100,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "warranty_status",
    field: "warranty_status",
    headerName: "Warranty",
    width: 118,
    minWidth: 96,
    cellRenderer: (p: ICellRendererParams<ApiSerialReportLine>) => {
      const s = p.data?.warranty_status ?? "unknown";
      return (
        <GridChipBadge className={WARRANTY_TONE[s] ?? WARRANTY_TONE.unknown} title={WARRANTY_LABEL[s] ?? s}>
          {WARRANTY_LABEL[s] ?? s}
        </GridChipBadge>
      );
    },
  },
  {
    colId: "days_to_warranty",
    field: "days_to_warranty",
    headerName: "Days left",
    width: 100,
    minWidth: 80,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiSerialReportLine>) => {
      const days = p.data?.days_to_warranty;
      if (days == null) return <span className="text-muted-foreground">—</span>;
      if (days < 0) {
        return (
          <span className="tabular-nums text-red-600 dark:text-red-400">{Math.abs(days)}d ago</span>
        );
      }
      return (
        <span className={cn("tabular-nums", days <= 30 && "text-amber-600 dark:text-amber-400")}>
          {days}d
        </span>
      );
    },
  },
  {
    colId: "has_open_rma",
    field: "has_open_rma",
    headerName: "RMA",
    width: 72,
    minWidth: 56,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => (p.value ? "Open" : "—"),
  },
  {
    colId: "supplier_name",
    field: "supplier_name",
    headerName: "Supplier",
    width: 150,
    minWidth: 110,
    hide: true,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "source_type",
    field: "source_type",
    headerName: "Source",
    width: 130,
    minWidth: 100,
    hide: true,
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) =>
      SOURCE_LABEL[String(p.value)] ?? p.value ?? "—",
  },
  {
    colId: "order_number",
    field: "order_number",
    headerName: "Order",
    width: 120,
    minWidth: 90,
    hide: true,
    cellClass: "font-mono text-[11px]",
    valueFormatter: (p: ValueFormatterParams<ApiSerialReportLine>) => p.value || "—",
  },
  {
    colId: "days_since_sold",
    field: "days_since_sold",
    headerName: "Days since sold",
    width: 128,
    minWidth: 100,
    hide: true,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiSerialReportLine>) => daysCell(p.data?.days_since_sold),
  },
];

export default function SerialRegisterReportPage() {
  const { warehouses: allWarehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  // a member limited to some warehouses (locations) picks and filters only among theirs
  const warehouses = useMemo(() => warehouseAccess.pickable(allWarehouses), [warehouseAccess, allWarehouses]);
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [insight, setInsight] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ApiSerialReport | null>(null);

  const warehouseOptions = useMemo(
    () => [
      { value: "all", label: warehouseAccess.restricted ? "My default warehouse" : "All warehouses" },
      ...warehouses.map((w) => ({ value: w.id, label: w.name })),
    ],
    [warehouses, warehouseAccess.restricted],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(
        await fetchSerialsReport({
          warehouseId: warehouseId === "all" ? undefined : warehouseId,
          status: status === "all" ? undefined : status,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = searchInput.trim().toLowerCase();
  const rows = (report?.data ?? []).filter((r) => {
    if (
      !matchesSearch(
        [r.serial_number, r.sku, r.name, r.customer_name, r.order_number, r.supplier_name],
        search,
      )
    ) {
      return false;
    }
    return matchesInsight(r, insight);
  });

  const inStock = rows.filter((r) => r.status === "in_stock").length;
  const sold = rows.filter((r) => r.status === "sold").length;
  const expiring = rows.filter((r) => r.warranty_status === "expiring").length;
  const expired = rows.filter((r) => r.warranty_status === "expired").length;
  const aging = rows.filter((r) => r.status === "in_stock" && (r.days_in_stock ?? 0) >= 90).length;
  const openRma = rows.filter((r) => r.has_open_rma).length;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <InventoryReportGrid<ApiSerialReportLine>
        storageKey="serials"
        rows={rows}
        columns={SERIAL_COLUMNS}
        loading={loading && rows.length === 0}
        emptyTitle="No serials match your filters"
        emptyHint="Change warehouse, status, or insight — or clear search"
        mobileLine={(r) => ({
          title: r.serial_number,
          meta: `${r.name || r.sku} · ${SERIAL_STATUS_LABEL[r.status as SerialStatus] ?? r.status}`,
          value: WARRANTY_LABEL[r.warranty_status] ?? r.warranty_status,
        })}
        toolbar={
          <InventoryReportToolbar
            title="Serial register"
            onRefresh={() => void load()}
            loading={loading}
            extraFilters={
              <>
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search serial, SKU, customer…"
                  className="w-[220px] shrink-0 rounded-none"
                />
                <FilterSelect
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouseOptions}
                  width="w-[190px]"
                  className="shrink-0"
                  ariaLabel="Warehouse"
                />
                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  width="w-[160px]"
                  className="shrink-0"
                  ariaLabel="Status"
                />
                <FilterSelect
                  value={insight}
                  onChange={setInsight}
                  options={INSIGHT_OPTIONS}
                  width="w-[210px]"
                  className="shrink-0"
                  ariaLabel="Insight"
                />
              </>
            }
            onExport={() =>
              downloadCsv(
                `serial-register-${todayIso()}.csv`,
                [
                  "Name",
                  "SKU",
                  "Serial",
                  "Status",
                  "Warehouse",
                  "Received",
                  "Days in stock",
                  "Sold",
                  "Customer",
                  "Warranty until",
                  "Warranty",
                  "Days left",
                  "Open RMA",
                  "Supplier",
                  "Source",
                  "Order",
                  "Days since sold",
                ],
                rows.map((r) => [
                  r.name,
                  r.sku,
                  r.serial_number,
                  SERIAL_STATUS_LABEL[r.status as SerialStatus] ?? r.status,
                  r.warehouse_name ?? "",
                  r.received_on ?? "",
                  r.days_in_stock ?? "",
                  r.sold_on ?? "",
                  r.customer_name,
                  r.warranty_expires_on ?? "",
                  WARRANTY_LABEL[r.warranty_status] ?? r.warranty_status,
                  r.days_to_warranty ?? "",
                  r.has_open_rma ? "Open" : "",
                  r.supplier_name ?? "",
                  SOURCE_LABEL[r.source_type] ?? r.source_type,
                  r.order_number ?? "",
                  r.days_since_sold ?? "",
                ]),
              )
            }
          />
        }
        summary={
          report ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              <ReportStat label="Units" value={qty(rows.length)} />
              <ReportStat label="In stock" value={qty(inStock)} />
              <ReportStat label="Sold" value={qty(sold)} />
              <ReportStat
                label="Warranty ≤ 30d"
                value={qty(expiring)}
                tone={expiring > 0 ? "danger" : undefined}
              />
              <ReportStat
                label="Expired"
                value={qty(expired)}
                tone={expired > 0 ? "danger" : undefined}
              />
              <ReportStat
                label="90d in stock"
                value={qty(aging)}
                tone={aging > 0 ? "danger" : undefined}
              />
              <ReportStat
                label="Open RMA"
                value={qty(openRma)}
                tone={openRma > 0 ? "danger" : undefined}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}
