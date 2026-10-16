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
import { ExternalLink, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatQuantity } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SeoUrlDrawer } from "@/components/seo/seo-url-drawer";
import { type ApiSeoUrl } from "@/lib/api/seo-urls";
import {
  ENTITY_TYPE_LABELS,
  URL_STATUS_LABELS,
  type SeoEntityType,
  type UrlStatus,
} from "@/lib/mock-data/seo";


const STATUS_TONE: Record<UrlStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  redirect: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  noindex: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  draft: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

type FilterState = { search: string; entityType: string; status: string };
const DEFAULT_FILTERS: FilterState = { search: "", entityType: "all", status: "all" };

const DEFAULT_VISIBLE = {
  slug: true,
  title: true,
  entityType: true,
  status: true,
  indexable: true,
  canonical: false,
  redirectTo: false,
  views: true,
  updatedAt: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  slug: "Path",
  title: "Title",
  entityType: "Type",
  status: "Status",
  indexable: "Indexable",
  canonical: "Canonical",
  redirectTo: "Redirects to",
  views: "Views 30d",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, entityType: true, status: true };

export type SeoUrlGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const SeoUrlGrid = forwardRef<
  SeoUrlGridHandle,
  {
    urls: ApiSeoUrl[];
    loading?: boolean;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function SeoUrlGrid(
  { urls, loading = false, onChanged, onFilterCountChange, headerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiSeoUrl> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSeoUrl | null>(null);
  const [selected, setSelected] = useState<ApiSeoUrl[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState("seo-url-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "seo-url-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return urls.filter((row) => {
      if (q && !`${row.slug} ${row.title}`.toLowerCase().includes(q)) return false;
      if (filters.entityType !== "all" && row.entity_type !== filters.entityType) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return true;
    });
  }, [urls, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.entityType !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const UrlRowMenu = useCallback(
    ({ data }: { data: ApiSeoUrl }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setEditing(data)} disabled={!canWrite}>
            <Pencil className="mr-1.5 h-3 w-3" /> Edit URL
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.open(data.slug, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-1.5 h-3 w-3" /> Open page
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite],
  );

  const columnDefs = useMemo<ColDef<ApiSeoUrl>[]>(
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
        cellRenderer: (p: ICellRendererParams<ApiSeoUrl>) =>
          p.data ? <UrlRowMenu data={p.data} /> : null,
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
      },
      {
        colId: "slug",
        field: "slug",
        headerName: COLUMN_LABELS.slug,
        hide: !resolvedCols.slug,
        pinned: "left",
        width: 240,
        minWidth: 160,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiSeoUrl>) =>
          p.data ? (
            <button
              type="button"
              className="truncate text-left hover:underline"
              onClick={() => setEditing(p.data!)}
            >
              {p.data.slug}
            </button>
          ) : null,
      },
      {
        colId: "title",
        field: "title",
        headerName: COLUMN_LABELS.title,
        hide: !resolvedCols.title,
        flex: 2,
        minWidth: 160,
      },
      {
        colId: "entityType",
        field: "entity_type",
        headerName: COLUMN_LABELS.entityType,
        hide: !resolvedCols.entityType,
        width: 110,
        minWidth: 90,
        valueFormatter: (p) =>
          ENTITY_TYPE_LABELS[p.value as SeoEntityType] ?? String(p.value ?? ""),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ApiSeoUrl>) => {
          const row = p.data;
          if (!row) return null;
          const value = row.status as UrlStatus;
          return (
            <span className="flex items-center gap-1">
              <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[value])}>
                {URL_STATUS_LABELS[value] ?? value}
              </Badge>
              {row.status_locked && (
                <Lock
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label="Set by hand — the sync leaves this alone"
                />
              )}
            </span>
          );
        },
      },
      {
        colId: "indexable",
        field: "indexable",
        headerName: COLUMN_LABELS.indexable,
        hide: !resolvedCols.indexable,
        width: 100,
        minWidth: 80,
        // AG Grid infers a checkbox for boolean fields and ignores valueFormatter,
        // so render the text ourselves.
        cellRenderer: (p: ICellRendererParams<ApiSeoUrl>) => (
          <span className={cn("text-[11px]", !p.value && "text-muted-foreground")}>
            {p.value ? "Yes" : "No"}
          </span>
        ),
      },
      {
        colId: "canonical",
        field: "canonical_url",
        headerName: COLUMN_LABELS.canonical,
        hide: !resolvedCols.canonical,
        flex: 1,
        minWidth: 140,
        cellClass: "text-[11px]",
      },
      {
        colId: "redirectTo",
        field: "redirect_to",
        headerName: COLUMN_LABELS.redirectTo,
        hide: !resolvedCols.redirectTo,
        width: 180,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "views",
        field: "views_30d",
        headerName: COLUMN_LABELS.views,
        hide: !resolvedCols.views,
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        cellClass: "tabular-nums",
        valueFormatter: (p) => (Number(p.value) > 0 ? formatQuantity(p.value) : "—"),
      },
      {
        colId: "updatedAt",
        field: "updated_at",
        headerName: COLUMN_LABELS.updatedAt,
        hide: !resolvedCols.updatedAt,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => formatDate(p.value),
      },
    ],
    [resolvedCols, canWrite, UrlRowMenu],
  );

  const exportSelected = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = ["Path", "Title", "Type", "Status", "Indexable", "Canonical", "Views 30d"];
    const body = rows.map((r) =>
      [r.slug, r.title, r.entity_type, r.status, r.indexable ? "yes" : "no", r.canonical_url, r.views_30d]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-urls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} URL${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered]);

  return (
    <AgainListGrid<ApiSeoUrl>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search path or title…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.entityType && (
            <FilterSelect
              value={filters.entityType}
              onChange={(entityType) => setFilters((f) => ({ ...f, entityType }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                ...(Object.keys(ENTITY_TYPE_LABELS) as SeoEntityType[]).map((value) => ({
                  value,
                  label: ENTITY_TYPE_LABELS[value],
                })),
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
                ...(Object.keys(URL_STATUS_LABELS) as UrlStatus[]).map((value) => ({
                  value,
                  label: URL_STATUS_LABELS[value],
                })),
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
            <Button variant="outline" size="sm" onClick={exportSelected}>
              Export selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
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
      emptyTitle="No URLs match your filters"
      emptyHint="Resync from the catalogue, or clear the filters"
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
              onClick={() => setEditing(row)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px]">{row.slug}</p>
                  <p className="truncate text-sm font-medium">{row.title}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 rounded-none text-[10px]", STATUS_TONE[row.status as UrlStatus])}
                >
                  {URL_STATUS_LABELS[row.status as UrlStatus] ?? row.status}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ENTITY_TYPE_LABELS[row.entity_type as SeoEntityType] ?? row.entity_type}
                {row.indexable ? " · indexable" : " · not indexed"}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-[320px]">
          <h3 className="text-sm font-semibold">Filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">Show or hide toolbar filters.</p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ),
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[320px] overflow-y-auto">
          <h3 className="text-sm font-semibold">Columns</h3>
          <p className="mt-1 text-xs text-muted-foreground">Choose the columns to display.</p>
          <div className="mt-4 space-y-2">
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                />
                <span>{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <SeoUrlDrawer
        key={`seo-url:${editing?.id ?? "none"}`}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        row={editing}
        onSaved={onChanged}
      />
    </AgainListGrid>
  );
});
