"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ExternalLink, Filter, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { useCatalogVariants } from "@/lib/api/use-catalog-variants";
import type { CatalogVariantRow } from "@/lib/mock-data/variants";
import { formatCurrency, cn } from "@/lib/utils";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { AgainListGrid } from "@/components/shared/again-list-grid";

const COLUMN_KEYS = [
  "productSku",
  "variant",
  "variantSku",
  "category",
  "price",
  "stock",
  "status",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  productSku: "Product SKU",
  variant: "Variant",
  variantSku: "Variant SKU",
  category: "Category",
  price: "Price",
  stock: "Stock",
  status: "Status",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  productSku: true,
  variant: true,
  variantSku: true,
  category: true,
  price: true,
  stock: true,
  status: true,
};

type FilterState = {
  search: string;
  category: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  category: "all",
  status: "all",
};

const FILTER_KEYS = ["search", "category", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  category: "Category",
  status: "Status",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "SKU or product name",
  category: "Product category",
  status: "Published / draft / …",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  category: true,
  status: false,
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.category !== "all") n += 1;
  if (f.status !== "all") n += 1;
  return n;
}

function applyClientFilters(rows: CatalogVariantRow[], f: FilterState) {
  return rows.filter((row) => {
    if (f.status !== "all" && row.status !== f.status) return false;
    return true;
  });
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "draft") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

type Props = {
  className?: string;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
};

export type VariantCatalogListHandle = {
  openFilters: () => void;
  openColumns: () => void;
  refetch: () => Promise<void>;
};

export const VariantCatalogList = forwardRef<VariantCatalogListHandle, Props>(
  function VariantCatalogList(
    {
      className,
      headerLeftActions,
      onAdvancedFilterCountChange,
      onLoadingChange,
      onErrorChange,
    },
    ref,
  ) {
    const moduleBase = useCatalogModuleBasePath();
    const router = useRouter();

    const [toolbarFilters, setToolbarFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
    const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [columnSheetOpen, setColumnSheetOpen] = useState(false);

    const { variants, total, loading, error, refetch } = useCatalogVariants();

    const advancedCount = countAdvancedFilters(toolbarFilters);

    useEffect(() => {
      onAdvancedFilterCountChange?.(advancedCount);
    }, [advancedCount, onAdvancedFilterCountChange]);

    useEffect(() => {
      onLoadingChange?.(loading);
    }, [loading, onLoadingChange]);

    useEffect(() => {
      onErrorChange?.(error);
    }, [error, onErrorChange]);

    useEffect(() => {
      if (error) {
        toast.error(`API: ${error}`, { id: "catalog-variants-api" });
      }
    }, [error]);

    const runRefetch = useCallback(async () => {
      await refetch({
        search: toolbarFilters.search,
        category: toolbarFilters.category,
      });
    }, [refetch, toolbarFilters.search, toolbarFilters.category]);

    useEffect(() => {
      void runRefetch();
    }, [runRefetch]);

    useImperativeHandle(
      ref,
      () => ({
        openFilters: () => setFilterSheetOpen(true),
        openColumns: () => setColumnSheetOpen(true),
        refetch: runRefetch,
      }),
      [runRefetch],
    );

    const categories = useMemo(() => {
      const set = new Set(variants.map((r) => r.category).filter(Boolean));
      return ["all", ...Array.from(set).sort()];
    }, [variants]);

    const statuses = useMemo(() => {
      const set = new Set(variants.map((r) => r.status));
      return ["all", ...Array.from(set).sort()];
    }, [variants]);

    const filtered = useMemo(
      () => applyClientFilters(variants, toolbarFilters),
      [variants, toolbarFilters],
    );

    const openProduct = useCallback(
      (row: CatalogVariantRow) => {
        router.push(`${moduleBase}/products/${row.productId}`);
      },
      [moduleBase, router],
    );

    const StatusCell = useCallback(({ data }: ICellRendererParams<CatalogVariantRow>) => {
      if (!data) return null;
      return (
        <span
          className={cn(
            "inline-flex rounded-none px-1.5 py-0.5 text-[10px] font-medium capitalize",
            statusClass(data.status),
          )}
        >
          {data.status}
        </span>
      );
    }, []);

    const ProductCell = useCallback(({ data }: ICellRendererParams<CatalogVariantRow>) => {
      if (!data) return null;
      return (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium text-foreground">{data.productName}</span>
        </div>
      );
    }, []);

    const VariantCell = useCallback(({ data }: ICellRendererParams<CatalogVariantRow>) => {
      if (!data) return null;
      return (
        <span className="inline-flex items-center gap-1">
          {data.variantLabel}
          {data.isDefault ? (
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Default" />
          ) : null}
        </span>
      );
    }, []);

    const RowActions = useCallback(
      ({ data }: ICellRendererParams<CatalogVariantRow>) => {
        if (!data) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link href={`${moduleBase}/products/${data.productId}`}>
                  <ExternalLink className="mr-1.5 h-3 w-3" /> Open product
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      [moduleBase],
    );

    const columnDefs = useMemo<ColDef<CatalogVariantRow>[]>(
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
          sortable: false,
          cellRenderer: RowActions,
        },
        {
          colId: "product",
          field: "productName",
          headerName: "Product",
          flex: 1.4,
          minWidth: 180,
          tooltipField: "productName",
          cellRenderer: ProductCell,
          onCellClicked: (p) => {
            if (p.data) openProduct(p.data);
          },
          cellClass: "cursor-pointer",
        },
        {
          colId: "productSku",
          field: "productSku",
          headerName: "Product SKU",
          width: 120,
          hide: !visibleCols.productSku,
          cellClass: "font-mono text-xs",
          tooltipField: "productSku",
        },
        {
          colId: "variant",
          field: "variantLabel",
          headerName: "Variant",
          flex: 1,
          minWidth: 140,
          hide: !visibleCols.variant,
          cellRenderer: VariantCell,
          tooltipField: "variantLabel",
        },
        {
          colId: "variantSku",
          field: "variantSku",
          headerName: "SKU",
          width: 130,
          hide: !visibleCols.variantSku,
          cellClass: "font-mono text-xs",
          tooltipField: "variantSku",
        },
        {
          colId: "category",
          field: "category",
          headerName: "Category",
          width: 140,
          hide: !visibleCols.category,
          cellClass: "text-muted-foreground",
        },
        {
          colId: "price",
          field: "price",
          headerName: "Price",
          width: 100,
          hide: !visibleCols.price,
          valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
          cellClass: "text-right",
          headerClass: "ag-right-aligned-header",
        },
        {
          colId: "stock",
          field: "stock",
          headerName: "Stock",
          width: 80,
          hide: !visibleCols.stock,
          cellClass: (p) =>
            cn("text-right", p.data?.stock === 0 && "font-medium text-destructive"),
          headerClass: "ag-right-aligned-header",
        },
        {
          colId: "status",
          field: "status",
          headerName: "Status",
          width: 100,
          hide: !visibleCols.status,
          cellRenderer: StatusCell,
          suppressHeaderMenuButton: true,
        },
      ],
      [RowActions, ProductCell, VariantCell, StatusCell, visibleCols, openProduct],
    );

    const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
      setVisibleFilters((v) => ({ ...v, [key]: enabled }));
      if (!enabled) {
        setToolbarFilters((f) => ({
          ...f,
          [key]: key === "search" ? "" : "all",
        }));
      }
    };

    return (
      <AgainListGrid<CatalogVariantRow>
        className={className}
        rowData={filtered}
        columnDefs={columnDefs}
        loading={loading}
        headerLeftActions={headerLeftActions}
        onOpenColumns={() => setColumnSheetOpen(true)}
        filterBar={
          <>
            {visibleFilters.search && (
              <Input
                placeholder="Search SKU or product…"
                value={toolbarFilters.search}
                onChange={(e) => setToolbarFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-[220px] shrink-0 rounded-none"
              />
            )}
            {visibleFilters.category && (
              <Select
                value={toolbarFilters.category}
                onChange={(e) => setToolbarFilters((f) => ({ ...f, category: e.target.value }))}
                className="w-[160px] shrink-0 rounded-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All categories" : c}
                  </option>
                ))}
              </Select>
            )}
            {visibleFilters.status && (
              <Select
                value={toolbarFilters.status}
                onChange={(e) => setToolbarFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-[140px] shrink-0 rounded-none"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All status" : s}
                  </option>
                ))}
              </Select>
            )}
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {loading
                ? "Loading…"
                : `${filtered.length}${total !== filtered.length ? ` / ${total}` : ""}`}
            </span>
            {!headerLeftActions && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => void runRefetch()}
                  disabled={loading}
                >
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setFilterSheetOpen(true)}
                >
                  <Filter className="mr-1.5 h-3.5 w-3.5" /> Filters
                </Button>
              </>
            )}
          </>
        }
        emptyTitle="No variants found."
        onResetFilters={() => setToolbarFilters(DEFAULT_FILTERS)}
        defaultColDef={{ minWidth: 64 }}
        mobile={
          <div className="space-y-2 overflow-auto p-2">
            {loading && filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading variants…</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No variants found.</p>
            ) : (
              filtered.map((row) => (
                <Link
                  key={row.id}
                  href={`${moduleBase}/products/${row.productId}`}
                  className="block rounded-none border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.productName}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {row.variantLabel}
                        {row.isDefault ? " · default" : ""}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{row.variantSku}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p>{formatCurrency(row.price)}</p>
                      <p className={cn(row.stock === 0 && "text-destructive")}>{row.stock} stock</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        }
      >
        <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
          <SheetContent side="right" className="w-[min(320px,100vw)] rounded-none">
            <h2 className="text-sm font-semibold">Columns</h2>
            <div className="mt-4 space-y-3">
              {COLUMN_KEYS.map((key) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  {COLUMN_LABELS[key]}
                  <input
                    type="checkbox"
                    checked={visibleCols[key]}
                    onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded-none border-input"
                  />
                </label>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="right" className="w-[min(320px,100vw)] rounded-none">
            <h2 className="text-sm font-semibold">Filters</h2>
            <div className="mt-4 space-y-4">
              {FILTER_KEYS.map((key) => (
                <div key={key}>
                  <label className="flex items-center justify-between gap-2 text-sm font-medium">
                    {FILTER_LABELS[key]}
                    <input
                      type="checkbox"
                      checked={visibleFilters[key]}
                      onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                      className="h-4 w-4 rounded-none border-input"
                    />
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{FILTER_HINTS[key]}</p>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </AgainListGrid>
    );
  },
);
