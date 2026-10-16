"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { cn, formatCurrency } from "@/lib/utils";
import type { ApiSupplierLink, ApiSupplierProduct } from "@/lib/api/supplier-catalog";
import type { Supplier } from "@/lib/mock-data/suppliers";

const STOCK_TONE: Record<string, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unknown: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const STOCK_LABEL: Record<string, string> = {
  in_stock: "In stock",
  low: "Low",
  out: "Out",
  unknown: "Unknown",
};

const COLUMN_KEYS = [
  "product",
  "sku",
  "supplier",
  "price",
  "stock",
  "status",
  "lead",
  "mapped",
  "minQty",
  "warranty",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  product: "Product",
  sku: "Supplier SKU",
  supplier: "Supplier",
  price: "Price",
  stock: "Stock",
  status: "Status",
  lead: "Lead",
  mapped: "Mapped item",
  minQty: "MOQ",
  warranty: "Warranty",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  product: true,
  sku: true,
  supplier: true,
  price: true,
  stock: true,
  status: true,
  lead: true,
  mapped: true,
  minQty: false,
  warranty: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "mapped"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  mapped: "Mapped",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  mapped: true,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  mapped: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  mapped: "all",
};

export type PurchaseProductGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseProductGrid = forwardRef<
  PurchaseProductGridHandle,
  {
    products: ApiSupplierProduct[];
    links: ApiSupplierLink[];
    suppliers?: Supplier[];
    loading?: boolean;
    onMap: (product: ApiSupplierProduct) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseProductGrid(
  {
    products,
    links,
    suppliers = [],
    loading = false,
    onMap,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiSupplierProduct> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-product-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-product-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const linkByProductId = useMemo(() => {
    const map = new Map<string, ApiSupplierLink>();
    for (const link of links) if (link.supplier_product_id) map.set(link.supplier_product_id, link);
    return map;
  }, [links]);

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const supplier of suppliers) map.set(supplier.id, supplier.name);
    return map;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return products.filter((row) => {
      const link = linkByProductId.get(row.id);
      if (q) {
        const haystack = [
          row.supplier_sku,
          row.supplier_title,
          supplierNameById.get(row.supplier_id) ?? "",
          link?.item_sku ?? "",
          link?.item_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.supplierId !== "all" && row.supplier_id !== filters.supplierId) return false;
      if (filters.status !== "all" && row.stock_status !== filters.status) return false;
      if (filters.mapped === "mapped" && !link) return false;
      if (filters.mapped === "unmapped" && link) return false;
      return true;
    });
  }, [products, filters, linkByProductId, supplierNameById]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.mapped !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const exportCsv = useCallback(() => {
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = filtered.map((row) => {
      const link = linkByProductId.get(row.id);
      const values = [
        row.supplier_title,
        row.supplier_sku,
        supplierNameById.get(row.supplier_id) ?? "",
        Number(row.supplier_price) || 0,
        row.supplier_stock ?? "",
        STOCK_LABEL[row.stock_status] ?? row.stock_status,
        row.lead_time_days,
        link?.item_sku ?? "",
        row.min_order_qty,
        row.warranty ?? "",
      ];
      return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} product${filtered.length === 1 ? "" : "s"}`);
  }, [filtered, linkByProductId, supplierNameById]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
      resetFilters: () => setFilters(DEFAULT_FILTERS),
      exportCsv,
    }),
    [exportCsv],
  );

  const RowMenu = useCallback(
    ({ data }: { data: ApiSupplierProduct }) => {
      const link = linkByProductId.get(data.id);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canWrite && !link ? (
              <DropdownMenuItem onClick={() => onMap(data)}>
                <Plus className="mr-1.5 h-3 w-3" /> Map to item
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>
                <Link2 className="mr-1.5 h-3 w-3" /> {link?.item_sku ?? "Mapped"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [canWrite, linkByProductId, onMap],
  );

  const columnDefs = useMemo<ColDef<ApiSupplierProduct>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<ApiSupplierProduct>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "product",
        field: "supplier_title",
        headerName: COLUMN_LABELS.product,
        hide: !resolvedCols.product,
        flex: 2,
        minWidth: 180,
        tooltipField: "supplier_title",
      },
      {
        colId: "sku",
        field: "supplier_sku",
        headerName: COLUMN_LABELS.sku,
        hide: !resolvedCols.sku,
        width: 140,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "supplier",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.2,
        minWidth: 140,
        valueGetter: (p) => supplierNameById.get(p.data?.supplier_id ?? "") ?? "",
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "price",
        field: "supplier_price",
        headerName: COLUMN_LABELS.price,
        hide: !resolvedCols.price,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueGetter: (p) => Number(p.data?.supplier_price ?? 0),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "stock",
        field: "supplier_stock",
        headerName: COLUMN_LABELS.stock,
        hide: !resolvedCols.stock,
        width: 96,
        minWidth: 76,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (p.value == null || p.value === "" ? "—" : String(p.value)),
      },
      {
        colId: "status",
        field: "stock_status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ApiSupplierProduct>) => {
          const status = p.data?.stock_status ?? "unknown";
          return (
            <GridChipBadge
              className={STOCK_TONE[status] ?? STOCK_TONE.unknown}
              title={STOCK_LABEL[status] ?? status}
            >
              {STOCK_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "lead",
        field: "lead_time_days",
        headerName: COLUMN_LABELS.lead,
        hide: !resolvedCols.lead,
        width: 88,
        minWidth: 72,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (p.value == null ? "—" : `${p.value}d`),
      },
      {
        colId: "mapped",
        headerName: COLUMN_LABELS.mapped,
        hide: !resolvedCols.mapped,
        width: 150,
        minWidth: 120,
        valueGetter: (p) => linkByProductId.get(p.data?.id ?? "")?.item_sku ?? "",
        cellRenderer: (p: ICellRendererParams<ApiSupplierProduct>) => {
          if (!p.data) return null;
          const link = linkByProductId.get(p.data.id);
          if (link?.item_sku) {
            return <span className="font-mono text-[11px]">{link.item_sku}</span>;
          }
          if (!canWrite) return <span className="text-muted-foreground">—</span>;
          return (
            <button
              type="button"
              className="inline-flex h-6 items-center text-[12px] text-[#00a09d] hover:underline"
              onClick={() => onMap(p.data!)}
            >
              Map
            </button>
          );
        },
      },
      {
        colId: "minQty",
        field: "min_order_qty",
        headerName: COLUMN_LABELS.minQty,
        hide: !resolvedCols.minQty,
        width: 88,
        minWidth: 72,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      {
        colId: "warranty",
        field: "warranty",
        headerName: COLUMN_LABELS.warranty,
        hide: !resolvedCols.warranty,
        width: 120,
        minWidth: 96,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
    ],
    [
      RowMenu,
      canWrite,
      linkByProductId,
      onMap,
      resolvedCols,
      supplierNameById,
    ],
  );

  const toggleVisibleFilter = (key: FilterVisibilityKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...DEFAULT_VISIBLE_FILTERS, ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "supplier" ? { supplierId: "all" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "mapped" ? { mapped: "all" } : {}),
      }));
    }
  };

  return (
    <AgainListGrid<ApiSupplierProduct>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search product, SKU, supplier…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.supplier && (
            <FilterSelect
              value={filters.supplierId}
              onChange={(supplierId) => setFilters((f) => ({ ...f, supplierId }))}
              width="w-[200px]"
              className="shrink-0"
              ariaLabel="Supplier"
              options={[
                { value: "all", label: "All suppliers" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Stock status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "in_stock", label: "In stock" },
                { value: "low", label: "Low" },
                { value: "out", label: "Out" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
          )}
          {resolvedVisibleFilters.mapped && (
            <FilterSelect
              value={filters.mapped}
              onChange={(mapped) => setFilters((f) => ({ ...f, mapped }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Mapped"
              options={[
                { value: "all", label: "All mapping" },
                { value: "mapped", label: "Mapped" },
                { value: "unmapped", label: "Unmapped" },
              ]}
            />
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          )}
        </>
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No supplier products match your filters"
      emptyHint="Map a product from a supplier workspace, or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => {
            const link = linkByProductId.get(row.id);
            return (
              <div key={row.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.supplier_title}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {row.supplier_sku}
                    </p>
                  </div>
                  <GridChipBadge className={cn("shrink-0", STOCK_TONE[row.stock_status] ?? STOCK_TONE.unknown)}>
                    {STOCK_LABEL[row.stock_status] ?? row.stock_status}
                  </GridChipBadge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {supplierNameById.get(row.supplier_id) ?? "Supplier"} · {formatCurrency(Number(row.supplier_price))}
                  {link?.item_sku ? ` · ${link.item_sku}` : ""}
                </p>
                {canWrite && !link ? (
                  <button
                    type="button"
                    className="mt-1 text-[12px] text-[#00a09d] hover:underline"
                    onClick={() => onMap(row)}
                  >
                    Map
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_VISIBILITY_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
