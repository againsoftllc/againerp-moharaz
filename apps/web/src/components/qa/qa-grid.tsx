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
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  Eye,
  Pencil,
  Power,
  PowerOff,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  countQaByStatus,
  type CatalogQa,
  type QaStatus,
} from "@/lib/mock-data/catalog-qa";
import { cn, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import * as SwitchPrimitive from "@radix-ui/react-switch";

const COLUMN_KEYS = [
  "questionId",
  "thumbnail",
  "product",
  "customer",
  "verified",
  "updatedAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  questionId: "Question ID",
  thumbnail: "Image",
  product: "Product",
  customer: "Customer",
  verified: "Verified",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  questionId: false,
  thumbnail: true,
  product: true,
  customer: true,
  verified: true,
  updatedAt: true,
};

const FILTER_KEYS = ["search", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
};

type FilterState = {
  search: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
};

const STATUS_FILTER_VALUES = [
  "all",
  "enabled",
  "disabled",
  "pending",
  "answered",
  "archived",
] as const;

function parseStatus(value: string | null | undefined): string {
  if (!value) return "all";
  if (value === "answered") return "enabled";
  if (value === "archived") return "disabled";
  if ((STATUS_FILTER_VALUES as readonly string[]).includes(value)) return value;
  return "all";
}

function isQaEnabled(status: QaStatus) {
  return status === "answered";
}

function statusFromEnabled(enabled: boolean): QaStatus {
  return enabled ? "answered" : "archived";
}

function statusLabel(status: QaStatus): string {
  if (status === "answered") return "Answered";
  if (status === "pending") return "Pending";
  if (status === "archived") return "Archived";
  return status;
}

function CompactStatusSwitch({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      )}
      aria-label={checked ? "Enabled" : "Disabled"}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

function countAdvancedFilters(f: FilterState) {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.status !== "all") n += 1;
  return n;
}

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer rounded-none", className)} />;
}

function QaGridSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-background animate-[route-fade-in_160ms_ease-out]">
      <div className="flex shrink-0 items-center gap-4 border-b border-input bg-muted/30 px-3 py-2.5">
        <Shimmer className="h-4 w-4" />
        <Shimmer className="h-3 w-28" />
        <Shimmer className="h-3 w-20" />
        <Shimmer className="ml-auto h-3 w-16" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-input overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3" style={{ animationDelay: `${i * 40}ms` }}>
            <Shimmer className="h-4 w-4 shrink-0" />
            <Shimmer className="h-8 w-8 shrink-0" />
            <Shimmer className={cn("h-3 shrink-0", i % 3 === 0 ? "w-40" : "w-32")} />
            <Shimmer className="ml-auto h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export type QaGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

type Props = {
  items: CatalogQa[];
  loading?: boolean;
  initialStatus?: string | null;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
  onView?: (item: CatalogQa) => void;
  onEdit?: (item: CatalogQa) => void;
  onStatusChange?: (id: string, status: QaStatus) => void | Promise<void>;
  onAdvancedFilterCountChange?: (count: number) => void;
  onStatusTabChange?: (status: string) => void;
};

export const QaGrid = forwardRef<QaGridHandle, Props>(function QaGrid(
  {
    items,
    loading = false,
    initialStatus,
    headerLeftActions,
    footerLeftActions,
    className,
    onView,
    onEdit,
    onStatusChange,
    onAdvancedFilterCountChange,
    onStatusTabChange,
  },
  ref,
) {
  const moduleBase = useCatalogModuleBasePath();
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const [rowData, setRowData] = useState(items);
  useEffect(() => {
    setRowData(items);
  }, [items]);

  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    status: parseStatus(initialStatus),
  }));

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      status: parseStatus(initialStatus),
    }));
  }, [initialStatus]);

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEditStatus, setLiveEditStatus] = useUserScopedState(
    "qa-grid:live-edit-status",
    true,
  );
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "qa-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "qa-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );
  const [selected, setSelected] = useState<CatalogQa[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const byStatus = countQaByStatus(rowData);
    return {
      all: byStatus.all,
      enabled: byStatus.answered ?? 0,
      disabled: (byStatus.all ?? 0) - (byStatus.answered ?? 0),
      pending: byStatus.pending ?? 0,
    };
  }, [rowData]);

  const filtered = useMemo(() => {
    return rowData.filter((r) => {
      if (filters.status === "enabled" && !isQaEnabled(r.status)) return false;
      if (filters.status === "disabled" && isQaEnabled(r.status)) return false;
      if (filters.status === "pending" || filters.status === "archived") {
        if (r.status !== filters.status) return false;
      }
      const q = filters.search.toLowerCase().trim();
      if (
        q &&
        !r.product.name.toLowerCase().includes(q) &&
        !r.customer.name.toLowerCase().includes(q) &&
        !r.question.toLowerCase().includes(q) &&
        !r.questionId.toLowerCase().includes(q) &&
        !(r.answer ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [rowData, filters]);

  const advancedCount = countAdvancedFilters(filters);
  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openLiveEdit: () => setLiveEditSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
    }),
    [],
  );

  const openQa = useCallback(
    (item: CatalogQa) => {
      if (onView) onView(item);
      else router.push(`${moduleBase}/qa/${item.id}`);
    },
    [onView, router, moduleBase],
  );

  const updateStatus = useCallback(
    (id: string, status: QaStatus) => {
      if (onStatusChange) {
        void onStatusChange(id, status);
        return;
      }
      setRowData((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    },
    [onStatusChange],
  );

  const toggleEnabled = useCallback(
    (item: CatalogQa, enabled: boolean) => {
      const next = statusFromEnabled(enabled);
      updateStatus(item.id, next);
      if (!onStatusChange) {
        toast.success(`${item.questionId} → ${enabled ? "Enabled" : "Disabled"}`);
      }
    },
    [updateStatus, onStatusChange],
  );

  const QaRowMenu = useCallback(
    ({ data }: { data: CatalogQa }) => {
      const enabled = isQaEnabled(data.status);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => openQa(data)}>
              <Eye className="mr-1.5 h-3 w-3" /> View
            </DropdownMenuItem>
            {canWrite && onEdit ? (
              <DropdownMenuItem onClick={() => onEdit(data)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
            ) : null}
            {canWrite && (
              <DropdownMenuItem onClick={() => toggleEnabled(data, !enabled)}>
                {enabled ? (
                  <>
                    <PowerOff className="mr-1.5 h-3 w-3" /> Disable
                  </>
                ) : (
                  <>
                    <Power className="mr-1.5 h-3 w-3" /> Enable
                  </>
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [openQa, onEdit, canWrite, toggleEnabled],
  );

  const QaControlsCell = useCallback(
    (p: ICellRendererParams<CatalogQa>) => {
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

  const columnDefs = useMemo<ColDef<CatalogQa>[]>(
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
        cellRenderer: (p: ICellRendererParams<CatalogQa>) =>
          p.data ? <QaRowMenu data={p.data} /> : null,
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
        cellRenderer: QaControlsCell,
      },
      {
        colId: "questionId",
        field: "questionId",
        headerName: "Question ID",
        hide: !visibleCols.questionId,
        pinned: "left",
        width: 100,
        minWidth: 88,
        resizable: true,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "thumbnail",
        headerName: "",
        width: 28,
        maxWidth: 28,
        hide: !visibleCols.thumbnail,
        resizable: false,
        suppressMovable: true,
        suppressSizeToFit: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<CatalogQa>) =>
          p.data?.product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.data.product.imageUrl}
              alt=""
              className="h-5 w-5 rounded-none object-cover"
            />
          ) : null,
      },
      {
        colId: "question",
        headerName: "Question",
        flex: 2,
        minWidth: 160,
        resizable: true,
        tooltipField: "question",
        cellRenderer: (p: ICellRendererParams<CatalogQa>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.question}
              onClick={(e) => {
                e.stopPropagation();
                openQa(p.data!);
              }}
            >
              {p.data.question}
            </button>
          ) : null,
      },
      {
        colId: "product",
        headerName: "Product",
        hide: !visibleCols.product,
        width: 180,
        minWidth: 120,
        valueGetter: (p) => p.data?.product.name,
      },
      {
        colId: "customer",
        headerName: "Customer",
        hide: !visibleCols.customer,
        width: 150,
        minWidth: 110,
        valueGetter: (p) => p.data?.customer.name,
      },
      {
        colId: "verified",
        headerName: "Verified",
        hide: !visibleCols.verified,
        width: 80,
        cellRenderer: (p: ICellRendererParams<CatalogQa>) =>
          p.data?.isVerified ? (
            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        colId: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<CatalogQa>) => {
          if (!p.data) return null;
          const enabled = isQaEnabled(p.data.status);
          const label = statusLabel(p.data.status);
          if (!canWrite || !liveEditStatus) {
            return (
              <span
                className={cn(
                  "border border-border px-1.5 py-0.5 text-[11px] font-medium",
                  enabled
                    ? "text-emerald-700 dark:text-emerald-400"
                    : p.data.status === "pending"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            );
          }
          return (
            <div className="flex h-full items-center gap-2">
              <span
                className={cn(
                  "min-w-[58px] border border-border px-1.5 py-0.5 text-[10px] font-medium",
                  enabled
                    ? "text-emerald-700 dark:text-emerald-400"
                    : p.data.status === "pending"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
                title={
                  p.data.status === "pending"
                    ? "Open edit and add an answer to publish on storefront"
                    : undefined
                }
              >
                {label}
              </span>
              <CompactStatusSwitch
                checked={enabled}
                onCheckedChange={(next) => toggleEnabled(p.data!, next)}
              />
            </div>
          );
        },
      },
      {
        colId: "updatedAt",
        headerName: "Updated",
        hide: !visibleCols.updatedAt,
        width: 100,
        valueGetter: (p) =>
          p.data ? formatDate(p.data.updatedAt || p.data.createdAt) : "",
      },
    ],
    [
      QaRowMenu,
      QaControlsCell,
      visibleCols,
      canWrite,
      liveEditStatus,
      openQa,
      toggleEnabled,
    ],
  );

  const setStatusFilter = (status: string) => {
    setFilters((f) => ({ ...f, status }));
    onStatusTabChange?.(status);
  };

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
      }));
      if (key === "status") onStatusTabChange?.("all");
    }
  };

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
    onStatusTabChange?.("all");
  };

  return (
    <AgainListGrid<CatalogQa>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading && rowData.length === 0}
      loadingFallback={<QaGridSkeleton />}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search question, product, customer…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={setStatusFilter}
              width="w-[148px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: `All statuses (${counts.all ?? 0})` },
                { value: "pending", label: `Pending (${counts.pending ?? 0})` },
                { value: "enabled", label: `Answered (${counts.enabled ?? 0})` },
                { value: "disabled", label: `Not answered (${counts.disabled ?? 0})` },
              ]}
            />
          )}
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <Button
            size="sm"
            className="h-7 rounded-none"
            onClick={() => {
              selected.forEach((r) => updateStatus(r.id, "answered"));
              toast.success(`Enabled ${selected.length} questions`);
              setSelected([]);
            }}
          >
            <Power className="mr-1 h-3.5 w-3.5" /> Enable
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-none"
            onClick={() => {
              selected.forEach((r) => updateStatus(r.id, "archived"));
              toast.success(`Disabled ${selected.length} questions`);
              setSelected([]);
            }}
          >
            <PowerOff className="mr-1 h-3.5 w-3.5" /> Disable
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 rounded-none p-0"
            onClick={() => setSelected([])}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No questions match your filters"
      emptyHint="Try clearing filters or add a new question"
      onResetFilters={resetAllFilters}
      onOpenColumns={() => setColumnSheetOpen(true)}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        onRowDoubleClicked: (e) => e.data && openQa(e.data),
      }}
      mobile={
        loading && rowData.length === 0 ? (
          <QaGridSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div className="rounded-none border border-dashed border-input bg-card p-8 text-center">
            <p className="text-sm font-medium">No questions found</p>
            <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {filtered.slice(0, 50).map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full gap-3 rounded-none border border-input bg-card p-3 text-left"
                onClick={() => openQa(item)}
              >
                {item.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.product.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.question}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.product.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={
                        isQaEnabled(item.status)
                          ? "text-emerald-600 dark:text-emerald-400"
                          : undefined
                      }
                    >
                      {isQaEnabled(item.status) ? "Enable" : "Disable"}
                    </span>
                    <span>·</span>
                    <span>{item.customer.name}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="chevron"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={resetAllFilters}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent
          side="right"
          title="Live edit"
          resizable
          closeButton="chevron"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Live edit</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={liveEditStatus}
                onChange={(e) => setLiveEditStatus(e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
              />
              Status
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            When Status is on, use the switch in the grid to Enable / Disable questions.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setLiveEditStatus(true)}
          >
            Reset live edit
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="chevron"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
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
    </AgainListGrid>
  );
});
