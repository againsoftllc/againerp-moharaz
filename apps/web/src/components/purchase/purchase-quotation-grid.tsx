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
import { Ban, Eye, Pencil, Star, Trash2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  QUOTATION_STATUS_LABELS,
  type PurchaseRfq,
  type QuotationStatus,
  type RfqVendorQuote,
} from "@/lib/mock-data/purchase-rfq";
import type { Supplier } from "@/lib/mock-data/suppliers";

export type PurchaseQuotationRow = RfqVendorQuote & { rfqNumber: string; rfqTitle: string };

const STATUS_TONE: Record<QuotationStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  submitted: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const COLUMN_KEYS = [
  "quoteNumber",
  "supplier",
  "rfqNumber",
  "rfqTitle",
  "submittedAt",
  "status",
  "validUntil",
  "products",
  "quantity",
  "total",
  "lead",
  "moq",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  quoteNumber: "Quote",
  supplier: "Supplier",
  rfqNumber: "RFQ",
  rfqTitle: "Title",
  submittedAt: "Date",
  status: "Status",
  validUntil: "Valid until",
  products: "Product",
  quantity: "Quantity",
  total: "Amount",
  lead: "Lead",
  moq: "MOQ",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  quoteNumber: true,
  supplier: true,
  rfqNumber: true,
  rfqTitle: true,
  submittedAt: true,
  status: true,
  validUntil: true,
  products: true,
  quantity: true,
  total: true,
  lead: true,
  moq: false,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "rfq"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  rfq: "RFQ",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  rfq: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  rfqId: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  rfqId: "all",
};

function productLabel(rfq: PurchaseRfq | undefined) {
  if (!rfq) return "";
  return rfq.lines.map((line) => line.name || line.sku).filter(Boolean).join(", ");
}

function qtyQuoted(rfq: PurchaseRfq | undefined) {
  if (!rfq) return 0;
  return rfq.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
}

export type PurchaseQuotationGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseQuotationGrid = forwardRef<
  PurchaseQuotationGridHandle,
  {
    quotes: PurchaseQuotationRow[];
    rfqs?: PurchaseRfq[];
    suppliers?: Supplier[];
    loading?: boolean;
    onEdit: (row: PurchaseQuotationRow) => void;
    onAward: (row: PurchaseQuotationRow) => void;
    onReject: (row: PurchaseQuotationRow) => void;
    onDelete: (ids: string[]) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseQuotationGrid(
  {
    quotes,
    rfqs = [],
    suppliers = [],
    loading = false,
    onEdit,
    onAward,
    onReject,
    onDelete,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<PurchaseQuotationRow> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseQuotationRow[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<PurchaseQuotationRow[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    "purchase-quotation-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-quotation-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const rfqById = useMemo(() => {
    const map = new Map<string, PurchaseRfq>();
    for (const rfq of rfqs) map.set(rfq.id, rfq);
    return map;
  }, [rfqs]);

  const supplierName = useCallback(
    (id: string) => suppliers.find((s) => s.id === id)?.name ?? id,
    [suppliers],
  );

  const rfqOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of quotes) {
      if (!seen.has(row.rfqId)) seen.set(row.rfqId, `${row.rfqNumber} — ${row.rfqTitle}`);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [quotes]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return quotes.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.supplierId !== "all" && row.supplierId !== filters.supplierId) return false;
      if (filters.rfqId !== "all" && row.rfqId !== filters.rfqId) return false;
      if (!q) return true;
      const rfq = rfqById.get(row.rfqId);
      const haystack = [
        row.quoteNumber,
        row.rfqNumber,
        row.rfqTitle,
        supplierName(row.supplierId),
        productLabel(rfq),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [quotes, filters, rfqById, supplierName]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.rfqId !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const openDeleteConfirm = useCallback((targets: PurchaseQuotationRow[]) => {
    if (!targets.length) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTargets.length) return;
    onDelete(deleteTargets.map((row) => row.id));
    toast.success(
      deleteTargets.length === 1
        ? `${deleteTargets[0].quoteNumber} deleted`
        : `${deleteTargets.length} quotations deleted`,
    );
    setDeleteOpen(false);
    setSelected([]);
    gridApiRef.current?.deselectAll();
  }, [deleteTargets, onDelete]);

  const exportCsv = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = rows.map((row) => {
      const rfq = rfqById.get(row.rfqId);
      return [
        row.quoteNumber,
        supplierName(row.supplierId),
        row.rfqNumber,
        row.rfqTitle,
        row.submittedAt ?? "",
        QUOTATION_STATUS_LABELS[row.status],
        row.validUntil,
        productLabel(rfq),
        qtyQuoted(rfq),
        row.totalAmount,
        row.leadTimeDays,
        row.moq,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} quote${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered, rfqById, supplierName]);

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

  const toggleVisibleFilter = (key: FilterVisibilityKey, enabled: boolean) => {
    setVisibleFilters((v) => {
      const merged = { ...DEFAULT_VISIBLE_FILTERS, ...v, [key]: enabled };
      return Object.fromEntries(FILTER_VISIBILITY_KEYS.map((k) => [k, merged[k]])) as Record<
        FilterVisibilityKey,
        boolean
      >;
    });
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "supplier" ? { supplierId: "all" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "rfq" ? { rfqId: "all" } : {}),
      }));
    }
  };

  const RowMenu = useCallback(
    ({ data }: { data: PurchaseQuotationRow }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onEdit(data)}>
            {canWrite ? <Pencil className="mr-1.5 h-3 w-3" /> : <Eye className="mr-1.5 h-3 w-3" />}
            {canWrite ? "Edit" : "View"}
          </DropdownMenuItem>
          {canWrite && data.status === "submitted" && (
            <DropdownMenuItem onClick={() => onAward(data)}>
              <Trophy className="mr-1.5 h-3 w-3" /> Award to PO
            </DropdownMenuItem>
          )}
          {canWrite && data.status === "submitted" && (
            <DropdownMenuItem onClick={() => onReject(data)}>
              <Ban className="mr-1.5 h-3 w-3" /> Reject
            </DropdownMenuItem>
          )}
          {canWrite && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => openDeleteConfirm([data])}>
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, onAward, onEdit, onReject, openDeleteConfirm],
  );

  const ControlsCell = useCallback(
    (p: ICellRendererParams<PurchaseQuotationRow>) => {
      if (!p.data) return null;
      const on = Boolean(starred[p.data.id]);
      return (
        <div className="flex h-full items-center">
          <button
            type="button"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={on ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              setStarred((prev) => ({ ...prev, [p.data!.id]: !prev[p.data!.id] }));
            }}
          >
            <Star className={cn("h-3 w-3", on && "fill-amber-400 text-amber-400")} aria-hidden />
          </button>
        </div>
      );
    },
    [starred],
  );

  const columnDefs = useMemo<ColDef<PurchaseQuotationRow>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        sortable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<PurchaseQuotationRow>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        width: canWrite ? 40 : 24,
        maxWidth: canWrite ? 40 : 24,
        minWidth: canWrite ? 40 : 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
        cellRenderer: ControlsCell,
      },
      {
        colId: "quoteNumber",
        field: "quoteNumber",
        headerName: COLUMN_LABELS.quoteNumber,
        hide: !resolvedCols.quoteNumber,
        pinned: "left",
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<PurchaseQuotationRow>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.quoteNumber}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p.data!);
              }}
            >
              {p.data.quoteNumber}
            </button>
          ) : null,
      },
      {
        colId: "supplier",
        headerName: COLUMN_LABELS.supplier,
        hide: !resolvedCols.supplier,
        flex: 1.3,
        minWidth: 150,
        valueGetter: (p) => (p.data ? supplierName(p.data.supplierId) : ""),
        tooltipValueGetter: (p) => (p.data ? supplierName(p.data.supplierId) : ""),
      },
      {
        colId: "rfqNumber",
        field: "rfqNumber",
        headerName: COLUMN_LABELS.rfqNumber,
        hide: !resolvedCols.rfqNumber,
        width: 140,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "rfqTitle",
        field: "rfqTitle",
        headerName: COLUMN_LABELS.rfqTitle,
        hide: !resolvedCols.rfqTitle,
        flex: 1.4,
        minWidth: 140,
        tooltipField: "rfqTitle",
      },
      {
        colId: "submittedAt",
        field: "submittedAt",
        headerName: COLUMN_LABELS.submittedAt,
        hide: !resolvedCols.submittedAt,
        width: 118,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 120,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<PurchaseQuotationRow>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={QUOTATION_STATUS_LABELS[status]}>
              {QUOTATION_STATUS_LABELS[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "validUntil",
        field: "validUntil",
        headerName: COLUMN_LABELS.validUntil,
        hide: !resolvedCols.validUntil,
        width: 118,
        minWidth: 100,
      },
      {
        colId: "products",
        headerName: COLUMN_LABELS.products,
        hide: !resolvedCols.products,
        flex: 1.3,
        minWidth: 140,
        valueGetter: (p) => (p.data ? productLabel(rfqById.get(p.data.rfqId)) : ""),
        tooltipValueGetter: (p) => (p.data ? productLabel(rfqById.get(p.data.rfqId)) : ""),
      },
      {
        colId: "quantity",
        headerName: COLUMN_LABELS.quantity,
        hide: !resolvedCols.quantity,
        width: 100,
        minWidth: 80,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => (p.data ? qtyQuoted(rfqById.get(p.data.rfqId)) : 0),
      },
      {
        colId: "total",
        field: "totalAmount",
        headerName: COLUMN_LABELS.total,
        hide: !resolvedCols.total,
        width: 120,
        minWidth: 96,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "lead",
        field: "leadTimeDays",
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
        colId: "moq",
        field: "moq",
        headerName: COLUMN_LABELS.moq,
        hide: !resolvedCols.moq,
        width: 88,
        minWidth: 72,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
    ],
    [ControlsCell, RowMenu, canWrite, onEdit, resolvedCols, rfqById, supplierName],
  );

  return (
    <AgainListGrid<PurchaseQuotationRow>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search quote, RFQ, supplier…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
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
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(QUOTATION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.rfq && (
            <FilterSelect
              value={filters.rfqId}
              onChange={(rfqId) => setFilters((f) => ({ ...f, rfqId }))}
              width="w-[200px]"
              className="shrink-0"
              ariaLabel="RFQ"
              options={[
                { value: "all", label: "All RFQs" },
                ...rfqOptions.map(([value, label]) => ({ value, label })),
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
      banner={
        selected.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button variant="outline" size="sm" className="rounded-none" onClick={exportCsv}>
              Export selected
            </Button>
            {canWrite && (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-none"
                onClick={() => openDeleteConfirm(selected)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete selected
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 rounded-none p-0"
              onClick={() => {
                setSelected([]);
                gridApiRef.current?.deselectAll();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No quotations match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => onEdit(row)}
            >
              <p className="truncate font-mono text-sm font-medium">{row.quoteNumber}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {supplierName(row.supplierId)} · {formatCurrency(row.totalAmount)}
              </p>
            </button>
          ))}
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              {deleteTargets.length === 1 ? "Delete quotation?" : "Delete quotations?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `${deleteTargets[0]?.quoteNumber} will be removed from this list.`
                : `${deleteTargets.length} quotations will be removed from this list.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" className="rounded-none" onClick={confirmDelete}>
                Delete permanently
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
