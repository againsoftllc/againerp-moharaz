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
import { Pencil, Trash2, X } from "lucide-react";
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
import { SeoRedirectDrawer } from "@/components/seo/seo-redirect-drawer";
import { deleteSeoRedirect, type ApiSeoRedirect } from "@/lib/api/seo-redirects";
import type { RedirectStatus } from "@/lib/mock-data/seo";


const STATUS_TONE: Record<RedirectStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  draft: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
  disabled: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

type FilterState = { search: string; type: string; status: string };
const DEFAULT_FILTERS: FilterState = { search: "", type: "all", status: "all" };

const DEFAULT_VISIBLE = {
  fromPath: true,
  toPath: true,
  type: true,
  status: true,
  hits: true,
  note: false,
  updatedAt: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  fromPath: "From",
  toPath: "To",
  type: "Type",
  status: "Status",
  hits: "Hits 30d",
  note: "Note",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, type: true, status: true };

export type SeoRedirectGridHandle = {
  openCreate: () => void;
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const SeoRedirectGrid = forwardRef<
  SeoRedirectGridHandle,
  {
    redirects: ApiSeoRedirect[];
    loading?: boolean;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function SeoRedirectGrid(
  { redirects, loading = false, onChanged, onFilterCountChange, headerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ApiSeoRedirect> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSeoRedirect | null>(null);
  const [selected, setSelected] = useState<ApiSeoRedirect[]>([]);

  const [visibleCols, setVisibleCols] = useUserScopedState(
    "seo-redirect-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "seo-redirect-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const openEditor = useCallback((row: ApiSeoRedirect | null) => {
    setEditing(row);
    setDrawerOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({
    openCreate: () => openEditor(null),
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return redirects.filter((row) => {
      if (q && !`${row.from_path} ${row.to_path ?? ""}`.toLowerCase().includes(q)) return false;
      if (filters.type !== "all" && row.redirect_type !== filters.type) return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return true;
    });
  }, [redirects, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.type !== "all") n += 1;
    if (filters.status !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const removeRedirect = useCallback(
    async (row: ApiSeoRedirect) => {
      try {
        await deleteSeoRedirect(row.id);
        toast.success(`${row.from_path} removed`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the redirect");
      }
    },
    [onChanged],
  );

  const RedirectRowMenu = useCallback(
    ({ data }: { data: ApiSeoRedirect }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => openEditor(data)} disabled={!canWrite}>
            <Pencil className="mr-1.5 h-3 w-3" /> Edit rule
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void removeRedirect(data)}
            disabled={!canWrite}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="mr-1.5 h-3 w-3" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, openEditor, removeRedirect],
  );

  const columnDefs = useMemo<ColDef<ApiSeoRedirect>[]>(
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
        cellRenderer: (p: ICellRendererParams<ApiSeoRedirect>) =>
          p.data ? <RedirectRowMenu data={p.data} /> : null,
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
        colId: "fromPath",
        field: "from_path",
        headerName: COLUMN_LABELS.fromPath,
        hide: !resolvedCols.fromPath,
        pinned: "left",
        width: 220,
        minWidth: 150,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ApiSeoRedirect>) =>
          p.data ? (
            <button
              type="button"
              className="truncate text-left hover:underline"
              onClick={() => openEditor(p.data!)}
            >
              {p.data.from_path}
            </button>
          ) : null,
      },
      {
        colId: "toPath",
        field: "to_path",
        headerName: COLUMN_LABELS.toPath,
        hide: !resolvedCols.toPath,
        flex: 1,
        minWidth: 150,
        cellClass: "font-mono text-[11px]",
        valueFormatter: (p) => (p.value ? String(p.value) : "— gone"),
      },
      {
        colId: "type",
        field: "redirect_type",
        headerName: COLUMN_LABELS.type,
        hide: !resolvedCols.type,
        width: 90,
        minWidth: 70,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<ApiSeoRedirect>) => {
          const value = p.data?.status as RedirectStatus | undefined;
          if (!value) return null;
          return (
            <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[value])}>
              {value}
            </Badge>
          );
        },
      },
      {
        colId: "hits",
        field: "hits_30d",
        headerName: COLUMN_LABELS.hits,
        hide: !resolvedCols.hits,
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        cellClass: "tabular-nums",
        valueFormatter: (p) => (Number(p.value) > 0 ? formatQuantity(p.value) : "—"),
      },
      {
        colId: "note",
        field: "note",
        headerName: COLUMN_LABELS.note,
        hide: !resolvedCols.note,
        flex: 1,
        minWidth: 140,
        cellClass: "text-[11px]",
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
    [resolvedCols, canWrite, RedirectRowMenu, openEditor],
  );

  return (
    <AgainListGrid<ApiSeoRedirect>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search from or to path…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.type && (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                { value: "301", label: "301" },
                { value: "302", label: "302" },
                { value: "307", label: "307" },
                { value: "308", label: "308" },
                { value: "410", label: "410" },
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
                { value: "active", label: "Active" },
                { value: "draft", label: "Draft" },
                { value: "disabled", label: "Disabled" },
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
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 dark:text-red-400"
              onClick={async () => {
                const rows = [...selected];
                for (const row of rows) await deleteSeoRedirect(row.id).catch(() => null);
                toast.success(`${rows.length} rule${rows.length === 1 ? "" : "s"} removed`);
                setSelected([]);
                onChanged?.();
              }}
            >
              Delete selected
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
      emptyTitle="No redirects match your filters"
      emptyHint="Add a rule, or clear the filters"
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
              onClick={() => openEditor(row)}
            >
              <p className="truncate font-mono text-[11px]">{row.from_path}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                → {row.to_path ?? "gone"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.redirect_type} · {row.status}
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

      <SeoRedirectDrawer
        key={`seo-redirect:${editing?.id ?? "new"}:${drawerOpen}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        row={editing}
        onSaved={onChanged}
      />
    </AgainListGrid>
  );
});
