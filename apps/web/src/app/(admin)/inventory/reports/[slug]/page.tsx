"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import type { ICellRendererParams, ValueFormatterParams, ValueGetterParams } from "ag-grid-community";
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
  taka,
} from "@/components/inventory/inventory-report-shell";
import { todayIso, yearStartIso } from "@/components/finance/finance-report-shell";
import {
  fetchMovementSummaryReport,
  fetchOnHandReport,
  fetchProductReportList,
  type ApiProductReportRow,
  fetchProfitBreakdownReport,
  fetchProfitLossReport,
  fetchSupplierValuationReport,
  fetchValuationReport,
  type ApiMovementSummaryLine,
  type ApiMovementSummaryReport,
  type ApiOnHandLine,
  type ApiOnHandReport,
  type ApiProfitBreakdownRow,
  type ApiProfitLossReport,
  type ApiSupplierValuationReport,
  type ApiValuationLine,
  type ApiValuationReport,
  type ApiValuationSupplierGroup,
  type ProfitBreakdownGroup,
} from "@/lib/api/inventory";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { INVENTORY_REPORTS } from "@/lib/inventory/inventory-nav";
import { cn } from "@/lib/utils";

// The product report's row click opens the same Product Drawer the Catalog
// list uses (Overview/Stock/Sales/Purchase/Ledger/Serial/Warranty-RMA/Price
// History) — one product detail view, not a second one duplicating its Ledger tab.
const ProductDrawer = dynamic(
  () =>
    import("@/components/products/product-drawer/product-drawer").then(
      (module) => module.ProductDrawer,
    ),
  { ssr: false },
);

const InventoryReportGrid = dynamic(
  () =>
    import("@/components/inventory/inventory-report-grid").then((m) => m.InventoryReportGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening report…" />,
  },
);

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "overstock", label: "Overstock" },
];

const STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  overstock: "Overstock",
};

const STATUS_TONE: Record<string, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low_stock: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  overstock: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

const ON_HAND_COLUMNS: InventoryReportGridColumn<ApiOnHandLine>[] = [
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
    colId: "warehouse_name",
    field: "warehouse_name",
    headerName: "Warehouse",
    width: 150,
    minWidth: 110,
  },
  {
    colId: "on_hand",
    field: "on_hand",
    headerName: "On hand",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: `${NUMERIC_CELL} font-medium`,
    valueFormatter: (p: ValueFormatterParams<ApiOnHandLine>) => qty(p.value),
  },
  {
    colId: "reserved",
    field: "reserved",
    headerName: "Reserved",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiOnHandLine>) => qty(p.value),
  },
  {
    colId: "available",
    field: "available",
    headerName: "Available",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiOnHandLine>) => {
      const n = p.data?.available ?? 0;
      return (
        <span className={cn("tabular-nums", n <= 0 && "text-red-600 dark:text-red-400")}>{qty(n)}</span>
      );
    },
  },
  {
    colId: "incoming",
    field: "incoming",
    headerName: "Incoming",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiOnHandLine>) => qty(p.value),
  },
  {
    colId: "stock_value",
    field: "stock_value",
    headerName: "Value",
    width: 130,
    minWidth: 100,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiOnHandLine>) => taka(p.value),
  },
  {
    colId: "status",
    field: "status",
    headerName: "Status",
    width: 128,
    minWidth: 104,
    cellRenderer: (p: ICellRendererParams<ApiOnHandLine>) => {
      const s = p.data?.status;
      if (!s) return null;
      return (
        <GridChipBadge className={STATUS_TONE[s]} title={STATUS_LABEL[s] ?? s}>
          {STATUS_LABEL[s] ?? s}
        </GridChipBadge>
      );
    },
  },
];

const VALUATION_COLUMNS: InventoryReportGridColumn<ApiValuationLine>[] = [
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
    colId: "warehouse_name",
    field: "warehouse_name",
    headerName: "Warehouse",
    width: 150,
    minWidth: 110,
  },
  {
    colId: "supplier_name",
    field: "supplier_name",
    headerName: "Supplier",
    width: 170,
    minWidth: 120,
    tooltipField: "supplier_name",
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) => p.value || "—",
  },
  {
    colId: "on_hand",
    field: "on_hand",
    headerName: "On hand",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) => qty(p.value),
  },
  {
    colId: "unit_cost",
    field: "unit_cost",
    headerName: "Unit cost",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) => taka(p.value),
  },
  {
    colId: "stock_value",
    field: "stock_value",
    headerName: "Cost value",
    width: 130,
    minWidth: 100,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) => taka(p.value),
  },
  {
    colId: "sale_price",
    field: "sale_price",
    headerName: "Sale price",
    width: 118,
    minWidth: 96,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) =>
      Number(p.value) > 0 ? taka(p.value) : "—",
  },
  {
    colId: "sales_value",
    field: "sales_value",
    headerName: "At sale price",
    width: 130,
    minWidth: 110,
    type: "numericColumn",
    cellClass: `${NUMERIC_CELL} font-medium`,
    valueFormatter: (p: ValueFormatterParams<ApiValuationLine>) => taka(p.value),
  },
  {
    colId: "profit",
    field: "profit",
    headerName: "Potential profit",
    width: 140,
    minWidth: 110,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiValuationLine>) => {
      const row = p.data;
      if (!row) return null;
      if (Number(row.sale_price) <= 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      const n = Number(row.profit);
      return (
        <span
          className={cn(
            "tabular-nums font-medium",
            n < 0 && "text-red-600 dark:text-red-400",
            n > 0 && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {taka(row.profit)}
        </span>
      );
    },
  },
];

const SUPPLIER_COLUMNS: InventoryReportGridColumn<ApiValuationSupplierGroup>[] = [
  {
    colId: "supplier_name",
    field: "supplier_name",
    headerName: "Supplier",
    flex: 2,
    minWidth: 180,
    tooltipField: "supplier_name",
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) => p.value || "No supplier",
  },
  {
    colId: "sku_count",
    field: "sku_count",
    headerName: "SKUs",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) => qty(p.value),
  },
  {
    colId: "units",
    field: "units",
    headerName: "Units",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) => qty(p.value),
  },
  {
    colId: "value",
    field: "value",
    headerName: "Cost value",
    width: 140,
    minWidth: 110,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) => taka(p.value),
  },
  {
    colId: "sales_value",
    field: "sales_value",
    headerName: "At sale price",
    width: 140,
    minWidth: 110,
    type: "numericColumn",
    cellClass: `${NUMERIC_CELL} font-medium`,
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) => taka(p.value),
  },
  {
    colId: "profit",
    field: "profit",
    headerName: "Potential profit",
    width: 150,
    minWidth: 120,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiValuationSupplierGroup>) => {
      const row = p.data;
      if (!row) return null;
      const n = Number(row.profit);
      return (
        <span
          className={cn(
            "tabular-nums font-medium",
            n < 0 && "text-red-600 dark:text-red-400",
            n > 0 && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {taka(row.profit)}
        </span>
      );
    },
  },
  {
    colId: "margin",
    headerName: "Margin",
    width: 96,
    minWidth: 72,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueGetter: (p: ValueGetterParams<ApiValuationSupplierGroup>) => {
      const sales = Number(p.data?.sales_value);
      if (!sales) return null;
      return (Number(p.data?.profit) / sales) * 100;
    },
    valueFormatter: (p: ValueFormatterParams<ApiValuationSupplierGroup>) =>
      p.value == null || Number.isNaN(Number(p.value)) ? "—" : `${Number(p.value).toFixed(1)}%`,
  },
];

/** Product report before a single product is opened: the report itself as a
 * datatable — one row per catalog product, lifetime stock/purchase/sales/profit
 * figures (the same numbers `product_report` computes per item). Click a row to
 * drill into that product's dated movement ledger below. */
type ProductReportListRow = ApiProductReportRow & { id: string };
type ProfitBreakdownGridRow = ApiProfitBreakdownRow & { id: string };

const PL_BREAKDOWN_TABS: { id: ProfitBreakdownGroup; label: string; column: string }[] = [
  { id: "product", label: "Profit by products", column: "Product" },
  { id: "category", label: "Profit by categories", column: "Category" },
  { id: "brand", label: "Profit by brands", column: "Brand" },
  { id: "location", label: "Profit by locations", column: "Location" },
  { id: "invoice", label: "Profit by invoice", column: "Invoice" },
  { id: "date", label: "Profit by date", column: "Date" },
  { id: "customer", label: "Profit by customer", column: "Customer" },
  { id: "day", label: "Profit by day", column: "Day" },
  { id: "staff", label: "Profit by service staff", column: "Service staff" },
];

function plBreakdownColumns(columnLabel: string): InventoryReportGridColumn<ProfitBreakdownGridRow>[] {
  return [
    { colId: "label", headerName: columnLabel, field: "label", flex: 2, minWidth: 180 },
    {
      colId: "qty",
      headerName: "Qty sold",
      field: "qty",
      width: 100,
      minWidth: 90,
      type: "numericColumn",
      headerClass: "ag-right-aligned-header",
      cellClass: NUMERIC_CELL,
      valueFormatter: (p) => qty(p.value),
    },
    {
      colId: "revenue",
      headerName: "Revenue",
      field: "revenue",
      width: 130,
      minWidth: 110,
      type: "numericColumn",
      headerClass: "ag-right-aligned-header",
      cellClass: NUMERIC_CELL,
      valueFormatter: (p) => taka(p.value),
    },
    {
      colId: "cost",
      headerName: "Cost",
      field: "cost",
      width: 130,
      minWidth: 110,
      type: "numericColumn",
      headerClass: "ag-right-aligned-header",
      cellClass: NUMERIC_CELL,
      valueFormatter: (p) => taka(p.value),
    },
    {
      colId: "gross_profit",
      headerName: "Gross Profit",
      field: "gross_profit",
      width: 130,
      minWidth: 110,
      type: "numericColumn",
      headerClass: "ag-right-aligned-header",
      cellClass: (p) => cn(NUMERIC_CELL, Number(p.value) < 0 && "text-destructive"),
      valueFormatter: (p) => taka(p.value),
    },
  ];
}

const PRODUCT_REPORT_LIST_COLUMNS: InventoryReportGridColumn<ProductReportListRow>[] = [
  { colId: "name", headerName: "Product", field: "name", flex: 2, minWidth: 200 },
  {
    colId: "sku",
    headerName: "SKU",
    field: "sku",
    width: 130,
    minWidth: 110,
    cellClass: "font-mono text-[11px]",
  },
  { colId: "category", headerName: "Category", field: "category", width: 130, minWidth: 100, valueFormatter: (p) => p.value || "—" },
  {
    colId: "supplier_name",
    headerName: "Supplier",
    field: "supplier_name",
    width: 150,
    minWidth: 110,
    valueFormatter: (p) => p.value || "—",
  },
  {
    colId: "on_hand",
    headerName: "On hand",
    field: "on_hand",
    width: 100,
    minWidth: 90,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: (p) => cn(NUMERIC_CELL, Number(p.value) < 0 && "text-destructive"),
    valueFormatter: (p) => qty(p.value),
  },
  {
    colId: "available",
    headerName: "Available",
    field: "available",
    width: 100,
    minWidth: 90,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => qty(p.value),
  },
  {
    colId: "stock_value",
    headerName: "Stock value",
    field: "stock_value",
    width: 120,
    minWidth: 100,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => taka(p.value),
  },
  {
    colId: "purchased_qty",
    headerName: "Purchased",
    field: "purchased_qty",
    width: 100,
    minWidth: 90,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => qty(p.value),
  },
  {
    colId: "sold_qty",
    headerName: "Sold",
    field: "sold_qty",
    width: 90,
    minWidth: 80,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => qty(p.value),
  },
  {
    colId: "sales_revenue",
    headerName: "Sales",
    field: "sales_revenue",
    width: 120,
    minWidth: 100,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => taka(p.value),
  },
  {
    colId: "profit",
    headerName: "Profit / loss",
    field: "profit",
    width: 120,
    minWidth: 100,
    type: "numericColumn",
    headerClass: "ag-right-aligned-header",
    cellClass: (p) => cn(NUMERIC_CELL, Number(p.value) < 0 ? "text-destructive" : Number(p.value) > 0 ? "text-emerald-600 dark:text-emerald-400" : ""),
    valueFormatter: (p) => taka(p.value),
  },
];

const MOVEMENT_COLUMNS: InventoryReportGridColumn<ApiMovementSummaryLine>[] = [
  {
    colId: "moved_on",
    headerName: "Date",
    width: 110,
    minWidth: 96,
    valueGetter: (p: ValueGetterParams<ApiMovementSummaryLine>) =>
      p.data?.moved_on ?? p.data?.created_at?.slice(0, 10) ?? "",
  },
  {
    colId: "movement_label",
    field: "movement_label",
    headerName: "Type",
    width: 150,
    minWidth: 120,
  },
  {
    colId: "name",
    field: "name",
    headerName: "Name",
    flex: 2,
    minWidth: 160,
    tooltipField: "name",
    valueFormatter: (p: ValueFormatterParams<ApiMovementSummaryLine>) => p.value || "—",
  },
  {
    colId: "sku",
    field: "sku",
    headerName: "SKU",
    width: 110,
    minWidth: 80,
    cellClass: "font-mono text-[11px]",
    valueFormatter: (p: ValueFormatterParams<ApiMovementSummaryLine>) => p.value || "—",
  },
  {
    colId: "warehouse_name",
    field: "warehouse_name",
    headerName: "Warehouse",
    width: 150,
    minWidth: 110,
  },
  {
    colId: "quantity",
    field: "quantity",
    headerName: "Qty",
    width: 88,
    minWidth: 64,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    cellRenderer: (p: ICellRendererParams<ApiMovementSummaryLine>) => {
      const row = p.data;
      if (!row) return null;
      return (
        <span
          className={cn(
            "tabular-nums",
            row.effect === "on_hand_out" && "text-red-600 dark:text-red-400",
            row.effect === "on_hand_in" && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {row.quantity}
        </span>
      );
    },
  },
  {
    colId: "qty_before",
    field: "qty_before",
    headerName: "Before",
    width: 88,
    minWidth: 64,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiMovementSummaryLine>) => qty(p.value),
  },
  {
    colId: "qty_after",
    field: "qty_after",
    headerName: "After",
    width: 88,
    minWidth: 64,
    type: "numericColumn",
    cellClass: NUMERIC_CELL,
    valueFormatter: (p: ValueFormatterParams<ApiMovementSummaryLine>) => qty(p.value),
  },
  {
    colId: "reference",
    field: "reference",
    headerName: "Reference",
    width: 140,
    minWidth: 100,
    cellClass: "font-mono text-[11px] text-muted-foreground",
    valueFormatter: (p: ValueFormatterParams<ApiMovementSummaryLine>) => p.value || "—",
  },
];

export default function InventoryReportPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback label="Opening report…" />}>
        <InventoryReportBody />
      </Suspense>
    </div>
  );
}

function matchesSearch(haystacks: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return haystacks.some((v) => (v ?? "").toLowerCase().includes(query));
}

function InventoryReportBody() {
  const slug = useParams<{ slug: string }>().slug;
  const router = useRouter();
  const meta = INVENTORY_REPORTS.find((r) => r.id === slug);
  const { warehouses } = useInventoryWarehouses();
  const [warehouseId, setWarehouseId] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState(yearStartIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [onHand, setOnHand] = useState<ApiOnHandReport | null>(null);
  const [valuation, setValuation] = useState<ApiValuationReport | null>(null);
  const [bySupplier, setBySupplier] = useState<ApiSupplierValuationReport | null>(null);
  const [movements, setMovements] = useState<ApiMovementSummaryReport | null>(null);
  const [profitLoss, setProfitLoss] = useState<ApiProfitLossReport | null>(null);
  // Profit/Loss breakdown tabs (Profit by products/categories/brands/…) — one
  // shared server-paged/searched table, re-fetched whenever the tab, the
  // page-level warehouse/date filters, or the table's own search/page change.
  const [plBreakdownTab, setPlBreakdownTab] = useState<"overall" | ProfitBreakdownGroup>("overall");
  const [plBreakdownSearch, setPlBreakdownSearch] = useState("");
  const [plBreakdownPage, setPlBreakdownPage] = useState(0);
  const [plBreakdownPageSize, setPlBreakdownPageSize] = useState(50);
  const [plBreakdownLoading, setPlBreakdownLoading] = useState(true);
  const [plBreakdownRows, setPlBreakdownRows] = useState<ProfitBreakdownGridRow[]>([]);
  const [plBreakdownTotal, setPlBreakdownTotal] = useState(0);
  const [plBreakdownTotalGrossProfit, setPlBreakdownTotalGrossProfit] = useState(0);
  // A row's `product_id` opens the same Product Drawer the Catalog list uses —
  // one product detail view (Overview/Stock/Sales/Purchase/Ledger/Serial/
  // Warranty-RMA/Price History), not a second one duplicating its Ledger tab.
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  // The product report's datatable stage:
  // server-paged, server-searched — this is the whole catalog's report, not a
  // client-side slice of it.
  const [productListSearch, setProductListSearch] = useState("");
  const [productListPage, setProductListPage] = useState(0);
  const [productListPageSize, setProductListPageSize] = useState(50);
  const [productListLoading, setProductListLoading] = useState(true);
  const [productListRows, setProductListRows] = useState<ProductReportListRow[]>([]);
  const [productListTotal, setProductListTotal] = useState(0);
  const [productListSums, setProductListSums] = useState({
    stockValue: 0,
    soldQty: 0,
    salesRevenue: 0,
    profit: 0,
  });

  const warehouseOptions = useMemo(
    () => [
      { value: "all", label: "All warehouses" },
      ...warehouses.map((w) => ({ value: w.id, label: w.name })),
    ],
    [warehouses],
  );

  const load = useCallback(async () => {
    if (slug === "reorder-suggestions") return;
    setLoading(true);
    try {
      const wh = warehouseId === "all" ? undefined : warehouseId;
      if (slug === "on-hand") {
        setOnHand(
          await fetchOnHandReport({
            warehouseId: wh,
            status: status === "all" ? undefined : status,
          }),
        );
      } else if (slug === "valuation") {
        setValuation(await fetchValuationReport({ warehouseId: wh }));
      } else if (slug === "by-supplier") {
        setBySupplier(await fetchSupplierValuationReport({ warehouseId: wh }));
      } else if (slug === "movements") {
        setMovements(
          await fetchMovementSummaryReport({
            warehouseId: wh,
            dateFrom,
            dateTo,
          }),
        );
      } else if (slug === "profit-loss") {
        setProfitLoss(await fetchProfitLossReport({ warehouseId: wh, dateFrom, dateTo }));
      }
      // "product" has its own loader (loadProductList) — the datatable is
      // server-paged/searched independently of this shared date-range load.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [slug, warehouseId, status, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Product report datatable stage: server paged and
  // searched — reset to page 0 whenever the filters change so a stale page
  // number never lands on an empty page.
  useEffect(() => {
    setProductListPage(0);
  }, [productListSearch, warehouseId]);

  const loadProductList = useCallback(async () => {
    setProductListLoading(true);
    try {
      const res = await fetchProductReportList({
        search: productListSearch.trim() || undefined,
        warehouseId: warehouseId === "all" ? undefined : warehouseId,
        page: productListPage + 1,
        perPage: productListPageSize,
      });
      setProductListRows(res.data.map((r) => ({ ...r, id: r.item_id })));
      setProductListTotal(res.meta.total);
      setProductListSums({
        stockValue: Number(res.meta.sum_stock_value) || 0,
        soldQty: res.meta.sum_sold_qty,
        salesRevenue: Number(res.meta.sum_sales_revenue) || 0,
        profit: Number(res.meta.sum_profit) || 0,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the product report");
    } finally {
      setProductListLoading(false);
    }
  }, [productListSearch, warehouseId, productListPage, productListPageSize]);

  useEffect(() => {
    if (slug !== "product") return;
    const handle = setTimeout(() => void loadProductList(), 250);
    return () => clearTimeout(handle);
    // loadProductList already carries every filter as a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, loadProductList]);

  // Profit/Loss breakdown table: reset to page 0 whenever the tab, search, or
  // shared warehouse/date filters change, same pattern as the product report.
  useEffect(() => {
    setPlBreakdownPage(0);
  }, [plBreakdownTab, plBreakdownSearch, warehouseId, dateFrom, dateTo]);

  const loadPlBreakdown = useCallback(async () => {
    if (plBreakdownTab === "overall") return;
    setPlBreakdownLoading(true);
    try {
      const res = await fetchProfitBreakdownReport({
        groupBy: plBreakdownTab,
        warehouseId: warehouseId === "all" ? undefined : warehouseId,
        dateFrom,
        dateTo,
        search: plBreakdownSearch.trim() || undefined,
        page: plBreakdownPage + 1,
        perPage: plBreakdownPageSize,
      });
      setPlBreakdownRows(res.data.map((r) => ({ ...r, id: r.key })));
      setPlBreakdownTotal(res.meta.total);
      setPlBreakdownTotalGrossProfit(Number(res.meta.total_gross_profit) || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the profit breakdown");
    } finally {
      setPlBreakdownLoading(false);
    }
  }, [plBreakdownTab, warehouseId, dateFrom, dateTo, plBreakdownSearch, plBreakdownPage, plBreakdownPageSize]);

  useEffect(() => {
    if (slug !== "profit-loss" || plBreakdownTab === "overall") return;
    const handle = setTimeout(() => void loadPlBreakdown(), 250);
    return () => clearTimeout(handle);
    // loadPlBreakdown already carries every filter as a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, plBreakdownTab, loadPlBreakdown]);

  const search = searchInput.trim().toLowerCase();

  if (!meta || slug === "reorder-suggestions") {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Unknown report. Open Reports → All reports to pick one.
      </p>
    );
  }

  const warehouseFilter = (
    <FilterSelect
      value={warehouseId}
      onChange={setWarehouseId}
      options={warehouseOptions}
      width="w-[190px]"
      className="shrink-0"
      ariaLabel="Warehouse"
    />
  );

  const searchInputEl = (
    <Input
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      placeholder={slug === "by-supplier" ? "Search supplier…" : "Search SKU, name…"}
      className="w-[220px] shrink-0 rounded-none"
    />
  );

  if (slug === "profit-loss") {
    const activeTab = PL_BREAKDOWN_TABS.find((t) => t.id === plBreakdownTab) ?? null;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <InventoryReportToolbar
              title={meta.label}
              onRefresh={() => {
                void load();
                void loadPlBreakdown();
              }}
              loading={loading}
              showDates
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFrom={setDateFrom}
              onDateTo={setDateTo}
              extraFilters={warehouseFilter}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPlBreakdownTab("overall")}
            className={cn(
              "rounded-none border px-2 py-1 text-[12px] font-medium transition-colors",
              plBreakdownTab === "overall"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            Overall
          </button>
          {PL_BREAKDOWN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlBreakdownTab(tab.id)}
              className={cn(
                "rounded-none border px-2 py-1 text-[12px] font-medium transition-colors",
                tab.id === plBreakdownTab
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {plBreakdownTab === "overall" || !activeTab ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProfitLossReportBody report={profitLoss} loading={loading} />
            <div className="flex justify-end px-4 pb-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-none bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
              >
                Print
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <InventoryReportGrid<ProfitBreakdownGridRow>
              storageKey={`profit-breakdown-${activeTab.id}`}
              rows={plBreakdownRows}
              columns={plBreakdownColumns(activeTab.column)}
              loading={plBreakdownLoading}
              emptyTitle="No data"
              emptyHint="Nothing matches this filter for the selected period"
              mobileLine={(r) => ({ title: r.label, meta: `Qty ${qty(r.qty)}`, value: taka(r.gross_profit) })}
              serverPaging={{
                total: plBreakdownTotal,
                page: plBreakdownPage,
                pageSize: plBreakdownPageSize,
                onPageChange: setPlBreakdownPage,
                onPageSizeChange: setPlBreakdownPageSize,
              }}
              toolbar={
                <InventoryReportToolbar
                  title={activeTab.label}
                  onRefresh={() => void loadPlBreakdown()}
                  loading={plBreakdownLoading}
                  onExport={() =>
                    downloadCsv(
                      `${activeTab.id}-profit-breakdown.csv`,
                      [activeTab.column, "Qty sold", "Revenue", "Cost", "Gross Profit"],
                      plBreakdownRows.map((r) => [r.label, r.qty, r.revenue, r.cost, r.gross_profit]),
                    )
                  }
                  extraFilters={
                    <>
                      <Input
                        value={plBreakdownSearch}
                        onChange={(e) => setPlBreakdownSearch(e.target.value)}
                        placeholder={`Search ${activeTab.column.toLowerCase()}…`}
                        className="h-[26px] w-[220px] shrink-0 rounded-none text-xs"
                      />
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Total gross profit: <span className="font-semibold text-foreground">{taka(plBreakdownTotalGrossProfit)}</span>
                      </span>
                    </>
                  }
                />
              }
            />
          </div>
        )}
      </div>
    );
  }

  if (slug === "product") {
    // The report itself is the datatable — every product, one row, lifetime
    // stock/purchase/sales/profit. Click a row to open the Product Drawer
    // (Overview/Stock/Sales/Purchase/Ledger/Serial/Warranty-RMA/Price History —
    // the same drawer the Catalog list opens, so there is one product detail
    // view in the app, not a second one duplicating its Ledger tab).
    return (
      <>
        <InventoryReportGrid<ProductReportListRow>
          storageKey="product-report-list"
          rows={productListRows}
          columns={PRODUCT_REPORT_LIST_COLUMNS}
          loading={productListLoading}
          emptyTitle="No products"
          emptyHint="Nothing in the catalog matches — try another name or SKU"
          mobileLine={(r) => ({
            title: r.name,
            meta: `${r.sku} · on hand ${qty(r.on_hand)}`,
            value: taka(r.profit),
          })}
          onRowClicked={(r) => r.product_id && setOpenProductId(r.product_id)}
          serverPaging={{
            total: productListTotal,
            page: productListPage,
            pageSize: productListPageSize,
            onPageChange: setProductListPage,
            onPageSizeChange: setProductListPageSize,
          }}
          toolbar={
            <InventoryReportToolbar
              title={meta.label}
              onRefresh={() => void loadProductList()}
              loading={productListLoading}
              extraFilters={
                <>
                  <Input
                    value={productListSearch}
                    onChange={(e) => setProductListSearch(e.target.value)}
                    placeholder="Search product by name or SKU…"
                    className="h-[26px] w-[240px] shrink-0 rounded-none text-xs"
                    data-testid="product-report-list-search"
                  />
                  {warehouseFilter}
                </>
              }
            />
          }
          summary={
            <p className="px-3 py-1 text-xs text-muted-foreground" data-testid="product-report-list-summary">
              {productListTotal} product{productListTotal === 1 ? "" : "s"} · Stock value{" "}
              <span className="text-foreground">{taka(productListSums.stockValue)}</span> · Sold{" "}
              <span className="text-foreground">{qty(productListSums.soldQty)}</span> · Sales{" "}
              <span className="text-foreground">{taka(productListSums.salesRevenue)}</span> · Profit{" "}
              <span
                className={cn(
                  productListSums.profit < 0
                    ? "text-destructive"
                    : productListSums.profit > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                )}
              >
                {taka(productListSums.profit)}
              </span>
            </p>
          }
        />
        <ProductDrawer
          open={openProductId != null}
          productId={openProductId}
          onOpenChange={(open) => {
            if (!open) setOpenProductId(null);
          }}
          onEdit={(product) => router.push(`/inventory/catalog?edit=${product.id}`)}
        />
      </>
    );
  }

  if (slug === "on-hand") {
    const rows = (onHand?.data ?? []).filter((r) =>
      matchesSearch([r.sku, r.name, r.warehouse_name], search),
    );
    const m = onHand?.meta;
    return (
      <InventoryReportGrid<ApiOnHandLine>
        storageKey="on-hand"
        rows={rows}
        columns={ON_HAND_COLUMNS}
        loading={loading && rows.length === 0}
        emptyTitle="No stock lines match your filters"
        emptyHint="Change warehouse or status, or clear search"
        mobileLine={(r) => ({
          title: r.name,
          meta: `${r.sku} · ${r.warehouse_name ?? "—"}`,
          value: taka(r.stock_value),
        })}
        toolbar={
          <InventoryReportToolbar
            title={meta.label}
            onRefresh={() => void load()}
            loading={loading}
            extraFilters={
              <>
                {searchInputEl}
                {warehouseFilter}
                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  width="w-[160px]"
                  className="shrink-0"
                  ariaLabel="Status"
                />
              </>
            }
            onExport={() =>
              downloadCsv(
                `stock-on-hand-${todayIso()}.csv`,
                [
                  "Name",
                  "SKU",
                  "Warehouse",
                  "On hand",
                  "Reserved",
                  "Available",
                  "Incoming",
                  "Unit cost",
                  "Value",
                  "Status",
                ],
                rows.map((r) => [
                  r.name,
                  r.sku,
                  r.warehouse_name ?? "",
                  r.on_hand,
                  r.reserved,
                  r.available,
                  r.incoming,
                  r.unit_cost,
                  r.stock_value,
                  r.status,
                ]),
              )
            }
          />
        }
        summary={
          m ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
              <ReportStat label="Lines" value={qty(m.count)} />
              <ReportStat label="On hand" value={qty(m.total_units)} />
              <ReportStat label="Available" value={qty(m.available_units)} />
              <ReportStat label="Reserved" value={qty(m.reserved_units)} />
              <ReportStat label="Value" value={taka(m.total_value)} />
              <ReportStat
                label="Out of stock"
                value={qty(m.out_of_stock_count)}
                tone={m.out_of_stock_count > 0 ? "danger" : undefined}
              />
            </div>
          ) : null
        }
      />
    );
  }

  if (slug === "valuation") {
    const supplierGroups = valuation?.by_supplier ?? [];
    const supplierOptions = [
      { value: "all", label: "All suppliers" },
      ...supplierGroups
        .filter((s) => s.supplier_id)
        .map((s) => ({
          value: s.supplier_id as string,
          label: s.supplier_name || s.supplier_id || "Supplier",
        })),
      ...(supplierGroups.some((s) => !s.supplier_id)
        ? [{ value: "none", label: "No supplier" }]
        : []),
    ];
    const rows = (valuation?.data ?? []).filter((r) => {
      if (!matchesSearch([r.sku, r.name, r.warehouse_name, r.supplier_name], search)) return false;
      if (supplierId === "all") return true;
      if (supplierId === "none") return !r.supplier_id;
      return r.supplier_id === supplierId;
    });
    const filteredCost = rows.reduce((sum, r) => sum + Number(r.stock_value || 0), 0);
    const filteredSales = rows.reduce((sum, r) => sum + Number(r.sales_value || 0), 0);
    const filteredProfit = rows.reduce((sum, r) => sum + Number(r.profit || 0), 0);
    const filteredUnits = rows.reduce((sum, r) => sum + Number(r.on_hand || 0), 0);
    return (
      <InventoryReportGrid<ApiValuationLine>
        storageKey="valuation"
        rows={rows}
        columns={VALUATION_COLUMNS}
        loading={loading && rows.length === 0}
        emptyTitle="No valued stock"
        emptyHint="Change supplier or warehouse, or clear search"
        mobileLine={(r) => ({
          title: r.name,
          meta: `${r.sku} · ${r.supplier_name ?? "No supplier"}`,
          value: Number(r.sale_price) > 0 ? taka(r.profit) : taka(r.stock_value),
        })}
        toolbar={
          <InventoryReportToolbar
            title={meta.label}
            onRefresh={() => void load()}
            loading={loading}
            extraFilters={
              <>
                {searchInputEl}
                {warehouseFilter}
                <FilterSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  width="w-[190px]"
                  className="shrink-0"
                  ariaLabel="Supplier"
                />
              </>
            }
            onExport={() =>
              downloadCsv(
                `stock-valuation-${todayIso()}.csv`,
                [
                  "Name",
                  "SKU",
                  "Warehouse",
                  "Supplier",
                  "On hand",
                  "Unit cost",
                  "Cost value",
                  "Sale price",
                  "At sale price",
                  "Potential profit",
                ],
                rows.map((r) => [
                  r.name,
                  r.sku,
                  r.warehouse_name ?? "",
                  r.supplier_name ?? "",
                  r.on_hand,
                  r.unit_cost,
                  r.stock_value,
                  r.sale_price,
                  r.sales_value,
                  r.profit,
                ]),
              )
            }
          />
        }
        summary={
          valuation ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <ReportStat label="SKUs with stock" value={qty(rows.length)} />
              <ReportStat label="Units" value={qty(filteredUnits)} />
              <ReportStat label="Cost value" value={taka(filteredCost)} />
              <ReportStat label="At sale price" value={taka(filteredSales)} />
              <ReportStat
                label="Potential profit"
                value={taka(filteredProfit)}
                tone={
                  filteredProfit < 0 ? "danger" : filteredProfit > 0 ? "ok" : undefined
                }
              />
              <ReportStat
                label="Warehouses"
                value={qty(new Set(rows.map((r) => r.warehouse_id)).size)}
              />
            </div>
          ) : null
        }
      />
    );
  }

  if (slug === "by-supplier") {
    const rows = (bySupplier?.data ?? []).filter((r) =>
      matchesSearch([r.supplier_name], search),
    );
    const m = bySupplier?.meta;
    return (
      <InventoryReportGrid<ApiValuationSupplierGroup>
        storageKey="by-supplier"
        rows={rows}
        columns={SUPPLIER_COLUMNS}
        loading={loading && rows.length === 0}
        emptyTitle="No supplier stock"
        emptyHint="No on-hand stock, or nothing matches search"
        mobileLine={(r) => ({
          title: r.supplier_name ?? "No supplier",
          meta: `${qty(r.sku_count)} SKUs · ${qty(r.units)} units`,
          value: taka(r.value),
        })}
        toolbar={
          <InventoryReportToolbar
            title={meta.label}
            onRefresh={() => void load()}
            loading={loading}
            extraFilters={
              <>
                {searchInputEl}
                {warehouseFilter}
              </>
            }
            onExport={() =>
              downloadCsv(
                `stock-by-supplier-${todayIso()}.csv`,
                ["Supplier", "SKUs", "Units", "Cost value", "At sale price", "Potential profit"],
                rows.map((r) => [
                  r.supplier_name ?? "No supplier",
                  r.sku_count,
                  r.units,
                  r.value,
                  r.sales_value,
                  r.profit,
                ]),
              )
            }
          />
        }
        summary={
          m ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <ReportStat label="Suppliers" value={qty(m.supplier_count)} />
              <ReportStat label="SKUs with stock" value={qty(m.count)} />
              <ReportStat label="Units" value={qty(m.total_units)} />
              <ReportStat label="Cost value" value={taka(m.total_value)} />
              <ReportStat label="At sale price" value={taka(m.total_sales_value)} />
              <ReportStat
                label="Potential profit"
                value={taka(m.total_profit)}
                tone={
                  Number(m.total_profit) < 0
                    ? "danger"
                    : Number(m.total_profit) > 0
                      ? "ok"
                      : undefined
                }
              />
            </div>
          ) : null
        }
      />
    );
  }

  const rows = (movements?.data ?? []).filter((r) =>
    matchesSearch([r.sku, r.name, r.warehouse_name, r.movement_label, r.reference], search),
  );
  const byType = movements?.by_type ?? [];
  const mm = movements?.meta;

  return (
    <InventoryReportGrid<ApiMovementSummaryLine>
      storageKey="movements"
      rows={rows}
      columns={MOVEMENT_COLUMNS}
      loading={loading && rows.length === 0}
      emptyTitle="No movements in this period"
      emptyHint="Widen the date range or pick another warehouse"
      mobileLine={(r) => ({
        title: r.name || r.sku || r.movement_label,
        meta: `${r.moved_on ?? r.created_at.slice(0, 10)} · ${r.movement_label}`,
        value: String(r.quantity),
      })}
      toolbar={
        <InventoryReportToolbar
          title={meta.label}
          showDates
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFrom={setDateFrom}
          onDateTo={setDateTo}
          onRefresh={() => void load()}
          loading={loading}
          extraFilters={
            <>
              {searchInputEl}
              {warehouseFilter}
            </>
          }
          onExport={() =>
            downloadCsv(
              `stock-movements-${dateFrom}-${dateTo}.csv`,
              ["Date", "Type", "Name", "SKU", "Warehouse", "Qty", "Before", "After", "Reference"],
              rows.map((r) => [
                r.moved_on ?? "",
                r.movement_label,
                r.name ?? "",
                r.sku ?? "",
                r.warehouse_name ?? "",
                r.quantity,
                r.qty_before,
                r.qty_after,
                r.reference ?? "",
              ]),
            )
          }
        />
      }
      summary={
        mm ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <ReportStat label="Lines" value={qty(mm.count)} />
              <ReportStat label="Qty in" value={qty(mm.qty_in)} />
              <ReportStat label="Qty out" value={qty(mm.qty_out)} />
              <ReportStat
                label="Net"
                value={qty(mm.qty_in - mm.qty_out)}
                tone={mm.qty_in - mm.qty_out < 0 ? "danger" : undefined}
              />
            </div>
            {byType.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {byType.map((b) => (
                  <span
                    key={b.movement_type}
                    className="rounded-none border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {b.movement_label}: +{qty(b.qty_in)} / −{qty(b.qty_out)}
                    <span className="ml-1 text-foreground/70">({qty(b.count)})</span>
                  </span>
                ))}
              </div>
            ) : null}
            {mm.total > mm.count ? (
              <p className="text-[11px] text-muted-foreground">
                Showing {qty(mm.count)} of {qty(mm.total)} movements in this period.
              </p>
            ) : null}
          </div>
        ) : null
      }
    />
  );
}

function PLLine({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-3 py-2 text-[13px] last:border-b-0">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
      </div>
      <p className="shrink-0 tabular-nums font-semibold">{value}</p>
    </div>
  );
}

/** AgainPOS-style Profit / Loss report — two stat cards, then COGS and the
 * derived Gross/Net profit lines. Every field the backend returns is shown
 * even where it's always ৳0 today (no purchase/transfer shipping charge,
 * additional purchase expenses, reward redemption, or round-off tracked
 * anywhere yet) so the shape matches AgainPOS ahead of that data existing. */
function ProfitLossReportBody({
  report,
  loading,
}: {
  report: ApiProfitLossReport | null;
  loading: boolean;
}) {
  if (!report) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {loading ? "Loading…" : "No data for this period."}
      </div>
    );
  }
  const netTone = Number(report.net_profit) < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400";
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-border bg-card">
          <PLLine label="Opening Stock" sub="(By purchase price):" value={taka(report.opening_stock_by_purchase_price)} />
          <PLLine label="Opening Stock" sub="(By sale price):" value={taka(report.opening_stock_by_sale_price)} />
          <PLLine label="Total purchase:" sub="(Exc. tax, Discount)" value={taka(report.total_purchase)} />
          <PLLine label="Total Stock Adjustment:" value={taka(report.total_stock_adjustment)} />
          <PLLine label="Total Expense:" value={taka(report.total_expense)} />
          <PLLine label="Total purchase shipping charge:" value={taka(report.total_purchase_shipping_charge)} />
          <PLLine label="Purchase additional expenses:" value={taka(report.purchase_additional_expenses)} />
          <PLLine label="Total transfer shipping charge:" value={taka(report.total_transfer_shipping_charge)} />
          <PLLine label="Total Sell discount:" value={taka(report.total_sell_discount)} />
          <PLLine label="Total customer reward:" value={taka(report.total_customer_reward)} />
          <PLLine label="Total Sell Return:" value={taka(report.total_sell_return)} />
        </div>
        <div className="border border-border bg-card">
          <PLLine label="Closing stock" sub="(By purchase price):" value={taka(report.closing_stock_by_purchase_price)} />
          <PLLine label="Closing stock" sub="(By sale price):" value={taka(report.closing_stock_by_sale_price)} />
          <PLLine label="Total Sales:" sub="(Exc. tax, Discount)" value={taka(report.total_sales)} />
          <PLLine label="Total sell shipping charge:" value={taka(report.total_sell_shipping_charge)} />
          <PLLine label="Sell additional expenses:" value={taka(report.sell_additional_expenses)} />
          <PLLine label="Total Stock Recovered:" value={taka(report.total_stock_recovered)} />
          <PLLine label="Total Purchase Return:" value={taka(report.total_purchase_return)} />
          <PLLine label="Total Purchase discount:" value={taka(report.total_purchase_discount)} />
          <PLLine label="Total sell round off:" value={taka(report.total_sell_round_off)} />
        </div>
      </div>
      <div className="border border-border bg-card p-4">
        <p className="text-2xl font-bold">
          COGS: <span className="tabular-nums">{taka(report.cogs)}</span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Cost of Goods Sold = Starting inventory (opening stock) + purchases − ending inventory (closing stock)
        </p>
      </div>
      <div className="border border-border bg-card p-4">
        <p className="text-2xl font-bold">
          Gross Profit: <span className="tabular-nums">{taka(report.gross_profit)}</span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">(Total sell price − COGS)</p>
      </div>
      <div className="border border-border bg-card p-4">
        <p className="text-2xl font-bold">
          Net Profit: <span className={cn("tabular-nums", netTone)}>{taka(report.net_profit)}</span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Gross Profit + (Total sell shipping charge + Sell additional expenses + Total Stock Recovered + Total
          Purchase discount + Total sell round off)
          <br />− (Total Stock Adjustment + Total Expense + Total purchase shipping charge + Total transfer shipping
          charge + Purchase additional expenses + Total Sell discount + Total customer reward)
        </p>
      </div>
    </div>
  );
}
