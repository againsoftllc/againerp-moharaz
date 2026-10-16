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
import { Eye, Pencil, Send, Star, Trash2, Trophy, X } from "lucide-react";
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
import { cn, formatDate } from "@/lib/utils";
import { RFQ_STATUS_LABELS, type PurchaseRfq, type RfqStatus } from "@/lib/mock-data/purchase-rfq";
import type { Supplier } from "@/lib/mock-data/suppliers";

const STATUS_LABEL: Record<RfqStatus, string> = {
  ...RFQ_STATUS_LABELS,
  vendor_response: "Supplier response",
};

const STATUS_TONE: Record<RfqStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  sent: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  vendor_response: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  quotation: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  po_created: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const COLUMN_KEYS = [
  "number",
  "title",
  "suppliers",
  "createdAt",
  "status",
  "deadline",
  "buyer",
  "products",
  "quantity",
  "quotes",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: "RFQ",
  title: "Title",
  suppliers: "Suppliers",
  createdAt: "Date",
  status: "Status",
  deadline: "Deadline",
  buyer: "Buyer",
  products: "Product",
  quantity: "Quantity",
  quotes: "Quotes",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  number: true,
  title: true,
  suppliers: true,
  createdAt: true,
  status: true,
  deadline: true,
  buyer: true,
  products: true,
  quantity: true,
  quotes: true,
};

const FILTER_VISIBILITY_KEYS = ["search", "supplier", "status", "buyer"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  supplier: "Supplier",
  status: "Status",
  buyer: "Buyer",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  supplier: true,
  status: true,
  buyer: false,
};

type FilterState = {
  search: string;
  supplierId: string;
  status: string;
  buyer: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  supplierId: "all",
  status: "all",
  buyer: "all",
};

function productLabel(rfq: PurchaseRfq) {
  return rfq.lines.map((line) => line.name || line.sku).filter(Boolean).join(", ");
}

function qtyRequested(rfq: PurchaseRfq) {
  return rfq.lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
}

export type PurchaseRfqGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const PurchaseRfqGrid = forwardRef<
  PurchaseRfqGridHandle,
  {
    rfqs: PurchaseRfq[];
    suppliers?: Supplier[];
    loading?: boolean;
    onEdit: (rfq: PurchaseRfq) => void;
    onSend: (rfq: PurchaseRfq) => void;
    onAward: (rfq: PurchaseRfq, quoteId: string, supplierId: string) => void;
    onDelete: (ids: string[]) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function PurchaseRfqGrid(
  {
    rfqs,
    suppliers = [],
    loading = false,
    onEdit,
    onSend,
    onAward,
    onDelete,
    onFilterCountChange,
    headerLeftActions,
    footerLeftActions,
    className,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<PurchaseRfq> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseRfq[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<PurchaseRfq[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState("purchase-rfq-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "purchase-rfq-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const supplierById = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const supplier of suppliers) map.set(supplier.id, supplier);
    return map;
  }, [suppliers]);

  const supplierName = useCallback(
    (id: string) => supplierById.get(id)?.name ?? id,
    [supplierById],
  );

  const supplierNames = useCallback(
    (rfq: PurchaseRfq) => rfq.invitedSupplierIds.map(supplierName).join(", "),
    [supplierName],
  );

  const buyerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rfqs) {
      const name = row.buyer?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rfqs]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rfqs.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.supplierId !== "all" && !row.invitedSupplierIds.includes(filters.supplierId)) {
        return false;
      }
      if (filters.buyer !== "all" && (row.buyer ?? "") !== filters.buyer) return false;
      if (!q) return true;
      const haystack = [
        row.number,
        row.title,
        row.buyer,
        supplierNames(row),
        productLabel(row),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rfqs, filters, supplierNames]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.supplierId !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.buyer !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const openDeleteConfirm = useCallback((targets: PurchaseRfq[]) => {
    if (!targets.length) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTargets.length) return;
    onDelete(deleteTargets.map((row) => row.id));
    toast.success(
      deleteTargets.length === 1
        ? `${deleteTargets[0].number} deleted`
        : `${deleteTargets.length} RFQs deleted`,
    );
    setDeleteOpen(false);
    setSelected([]);
    gridApiRef.current?.deselectAll();
  }, [deleteTargets, onDelete]);

  const exportCsv = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = COLUMN_KEYS.map((key) => COLUMN_LABELS[key]);
    const body = rows.map((row) =>
      [
        row.number,
        row.title,
        supplierNames(row),
        row.createdAt,
        STATUS_LABEL[row.status],
        row.deadline,
        row.buyer,
        productLabel(row),
        qtyRequested(row),
        row.quotes.length,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-rfq-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} RFQ${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered, supplierNames]);

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
        ...(key === "buyer" ? { buyer: "all" } : {}),
      }));
    }
  };

  const RowMenu = useCallback(
    ({ data }: { data: PurchaseRfq }) => {
      const submitted = data.quotes.filter((q) => q.status === "submitted");
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onEdit(data)}>
              {canWrite ? <Pencil className="mr-1.5 h-3 w-3" /> : <Eye className="mr-1.5 h-3 w-3" />}
              {canWrite ? "Edit" : "View"}
            </DropdownMenuItem>
            {canWrite && data.status === "draft" && (
              <DropdownMenuItem onClick={() => onSend(data)}>
                <Send className="mr-1.5 h-3 w-3" /> Send
              </DropdownMenuItem>
            )}
            {canWrite &&
              submitted.map((quote) => (
                <DropdownMenuItem
                  key={quote.id}
                  onClick={() => {
                    const sid = suppliers.some((s) => s.id === quote.supplierId)
                      ? quote.supplierId
                      : "";
                    if (!sid) {
                      toast.error("This quote has no matching supplier to raise a PO");
                      return;
                    }
                    onAward(data, quote.id, sid);
                  }}
                >
                  <Trophy className="mr-1.5 h-3 w-3" /> Award {quote.quoteNumber} ·{" "}
                  {supplierName(quote.supplierId)}
                </DropdownMenuItem>
              ))}
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
      );
    },
    [canWrite, onAward, onEdit, onSend, openDeleteConfirm, supplierName, suppliers],
  );

  const ControlsCell = useCallback(
    (p: ICellRendererParams<PurchaseRfq>) => {
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

  const columnDefs = useMemo<ColDef<PurchaseRfq>[]>(
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
        cellRenderer: (p: ICellRendererParams<PurchaseRfq>) =>
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
        colId: "number",
        field: "number",
        headerName: COLUMN_LABELS.number,
        hide: !resolvedCols.number,
        pinned: "left",
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<PurchaseRfq>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.number}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p.data!);
              }}
            >
              {p.data.number}
            </button>
          ) : null,
      },
      {
        colId: "title",
        field: "title",
        headerName: COLUMN_LABELS.title,
        hide: !resolvedCols.title,
        flex: 1.6,
        minWidth: 160,
        tooltipField: "title",
      },
      {
        colId: "suppliers",
        headerName: COLUMN_LABELS.suppliers,
        hide: !resolvedCols.suppliers,
        flex: 1.2,
        minWidth: 140,
        valueGetter: (p) => (p.data ? supplierNames(p.data) : ""),
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "createdAt",
        field: "createdAt",
        headerName: COLUMN_LABELS.createdAt,
        hide: !resolvedCols.createdAt,
        width: 118,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 140,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseRfq>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={STATUS_LABEL[status]}>
              {STATUS_LABEL[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "deadline",
        field: "deadline",
        headerName: COLUMN_LABELS.deadline,
        hide: !resolvedCols.deadline,
        width: 118,
        minWidth: 100,
      },
      {
        colId: "buyer",
        field: "buyer",
        headerName: COLUMN_LABELS.buyer,
        hide: !resolvedCols.buyer,
        width: 130,
        minWidth: 100,
      },
      {
        colId: "products",
        headerName: COLUMN_LABELS.products,
        hide: !resolvedCols.products,
        flex: 1.4,
        minWidth: 140,
        valueGetter: (p) => (p.data ? productLabel(p.data) : ""),
        tooltipValueGetter: (p) => (p.data ? productLabel(p.data) : ""),
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
        valueGetter: (p) => (p.data ? qtyRequested(p.data) : 0),
      },
      {
        colId: "quotes",
        headerName: COLUMN_LABELS.quotes,
        hide: !resolvedCols.quotes,
        width: 90,
        minWidth: 72,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => p.data?.quotes.length ?? 0,
      },
    ],
    [ControlsCell, RowMenu, canWrite, onEdit, resolvedCols, supplierNames],
  );

  return (
    <AgainListGrid<PurchaseRfq>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search RFQ, supplier, product…"
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
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
          )}
          {resolvedVisibleFilters.buyer && (
            <FilterSelect
              value={filters.buyer}
              onChange={(buyer) => setFilters((f) => ({ ...f, buyer }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Buyer"
              options={[
                { value: "all", label: "All buyers" },
                ...buyerOptions.map((name) => ({ value: name, label: name })),
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
      emptyTitle="No RFQs match your filters"
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
              <p className="truncate font-mono text-sm font-medium">{row.number}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.title} · {STATUS_LABEL[row.status]}
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

      <Dialog.Root
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              {deleteTargets.length === 1 ? "Delete RFQ?" : "Delete RFQs?"}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `${deleteTargets[0]?.number} will be removed from this list.`
                : `${deleteTargets.length} RFQs will be removed from this list.`}
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
