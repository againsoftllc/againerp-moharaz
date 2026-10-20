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
import type {
  CellClickedEvent,
  ColDef,
  ColumnState,
  GridApi,
  ICellRendererParams,
  RowDragEndEvent,
} from "ag-grid-community";
import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, Eye, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { brandStatusOf, type Brand, type BrandStatus } from "@/lib/mock-data/brands";
import {
  bulkPatchCatalogBrands,
  createCatalogBrand,
  deleteCatalogBrands,
  patchCatalogBrand,
  reorderCatalogBrands,
  updateCatalogBrand,
} from "@/lib/api/use-catalog-brands";
import { resolveMediaUrl } from "@/lib/media/resolve-media";
import { useMediaStore } from "@/lib/store/media-store";
import { useActivityStore } from "@/lib/store/activity-store";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SlugCellEditor } from "@/components/data-grid/slug-cell-editor";
import { slugCellClassRules } from "@/components/data-grid/slug-cell-rules";
import { slugHasError, validateSlug } from "@/lib/url-slug/validate-slug";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { BrandMobileCards } from "@/components/brands/brand-mobile-cards";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";

const COLUMN_KEYS = ["logo", "slug", "products", "status", "updated", "updatedBy"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  logo: "Logo",
  slug: "Slug",
  products: "Products",
  status: "Status",
  updated: "Updated",
  updatedBy: "Updated by",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  logo: true,
  slug: true,
  products: true,
  status: true,
  updated: true,
  updatedBy: true,
};

// every field of the list that can be changed in the table itself (double-click the cell, Enter saves)
const BRAND_STATUSES: BrandStatus[] = ["draft", "published", "unlisted", "archived"];
const BRAND_STATUS_LABEL: Record<BrandStatus, string> = {
  draft: "Draft",
  published: "Published",
  unlisted: "Unlisted",
  archived: "Archived",
};

function BrandStatusBadge({ status }: { status: BrandStatus }) {
  const variant =
    status === "published" ? "success" : status === "draft" ? "warning" : status === "unlisted" ? "outline" : "muted";
  return (
    <div className="flex h-full items-center overflow-hidden">
      <Badge variant={variant} className="max-w-28 shrink-0 truncate leading-4">
        {BRAND_STATUS_LABEL[status]}
      </Badge>
    </div>
  );
}

const LIVE_EDIT_TOGGLES = ["name", "slug", "status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  name: "Name",
  slug: "Slug",
  status: "Status",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  name: false,
  slug: true,
  status: true,
};

const FILTER_KEYS = ["search", "status", "updatedBy"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  updatedBy: "Updated by",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  updatedBy: true,
};

type FilterState = {
  search: string;
  status: string;
  updatedBy: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  updatedBy: "all",
};

function applyFilters(rows: Brand[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q) && !b.slug.toLowerCase().includes(q)) {
      return false;
    }
    if (f.status !== "all" && brandStatusOf(b) !== f.status) return false;
    if (f.updatedBy !== "all" && (b.updatedBy ?? "") !== f.updatedBy) return false;
    return true;
  });
}

function reorderBrandIds(brands: Brand[], draggedId: string, overId: string): string[] | null {
  if (draggedId === overId) return null;
  const sorted = [...brands].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = sorted.map((b) => b.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

/** Saved column order / widths only (visibility stays with the Columns switches). */
function withoutFlex(state: { colId: string; width?: number }[]): ColumnState[] {
  return state.map((c) => ({ colId: c.colId, ...(typeof c.width === "number" ? { width: c.width } : {}) }));
}

type Props = {
  className?: string;
  /** @deprecated Use onEdit + onView from the page instead */
  addTrigger?: number;
  brands: Brand[];
  loading?: boolean;
  channel?: "catalog" | "dropshipping";
  onBrandsChanged?: () => void;
  onView?: (brand: Brand) => void;
  onEdit?: (brand: Brand) => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
};

export type BrandGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.status !== "all") n += 1;
  if (f.updatedBy !== "all") n += 1;
  if (f.search.trim()) n += 1;
  return n;
}

export const BrandGrid = forwardRef<BrandGridHandle, Props>(function BrandGrid(
  {
    className,
    addTrigger = 0,
    brands,
    loading = false,
    channel = "catalog",
    onBrandsChanged,
    onView,
    onEdit: onEditProp,
    footerLeftActions,
    headerLeftActions,
    onAdvancedFilterCountChange,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Brand> | null>(null);
  const mediaItems = useMediaStore((s) => s.items);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editBrand, setEditBrand] = useState<Brand | null>(null);
  const [selected, setSelected] = useState<Brand[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Brand[]>([]);

  // columns / live edit / toolbar filters / column layout are saved per admin (like the Products table)
  const [visibleColsSaved, setVisibleCols] = useUserScopedState("brand-grid:columns", DEFAULT_VISIBLE);
  const visibleCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleColsSaved }), [visibleColsSaved]);
  const [liveEditSaved, setLiveEdit] = useUserScopedState("brand-grid:live-edit", DEFAULT_LIVE_EDIT);
  const liveEdit = useMemo(() => ({ ...DEFAULT_LIVE_EDIT, ...liveEditSaved }), [liveEditSaved]);
  const [visibleFiltersSaved, setVisibleFilters] = useUserScopedState("brand-grid:filters", DEFAULT_VISIBLE_FILTERS);
  const visibleFilters = useMemo(() => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFiltersSaved }), [visibleFiltersSaved]);
  const [savedColumnState, setSavedColumnState, savedColumnStateLoaded] = useUserScopedState<
    { colId: string; width?: number }[]
  >("brand-grid:columnState", [], { sync: true });
  const savedNameWidth = useMemo(
    () => savedColumnState.find((c) => c.colId === "name")?.width ?? null,
    [savedColumnState],
  );

  const ordered = useMemo(
    () => [...brands].sort((a, b) => a.sortOrder - b.sortOrder),
    [brands],
  );
  const filtered = useMemo(() => applyFilters(ordered, filters), [ordered, filters]);
  const advancedCount = countAdvancedFilters(filters);
  const updaters = useMemo(
    () => [...new Set(brands.map((b) => b.updatedBy).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)),
    [brands],
  );

  const persistColumnState = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    setSavedColumnState(
      api.getColumnState().map((c: ColumnState) => ({ colId: c.colId, width: c.width ?? undefined })),
    );
  }, [setSavedColumnState]);

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

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditBrand(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((brand: Brand) => {
    if (onEditProp) {
      onEditProp(brand);
    } else {
      setFormMode("edit");
      setEditBrand(brand);
      setFormOpen(true);
    }
  }, [onEditProp]);

  useEffect(() => {
    if (addTrigger > 0 && canWrite) openCreate();
  }, [addTrigger, openCreate, canWrite]);

  useEffect(() => {
    gridApiRef.current?.refreshCells({ columns: ["logo"], force: true });
  }, [mediaItems]);

  const turnOff = useCallback(
    async (brand: Brand) => {
      try {
        await patchCatalogBrand(brand.id, { status: "unlisted" });
        toast.success(`${brand.name} is unlisted`);
        onBrandsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onBrandsChanged],
  );

  const bulkUpdate = useCallback(
    async (targets: Brand[], patch: Partial<Brand>, label: string) => {
      try {
        await bulkPatchCatalogBrands(targets, patch);
        toast.success(`${label} (${targets.length})`);
        setSelected([]);
        onBrandsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed");
      }
    },
    [onBrandsChanged],
  );

  const openDeleteConfirm = useCallback((targets: Brand[]) => {
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      await deleteCatalogBrands(deleteTargets.map((t) => t.id));
      toast.success(`Deleted ${deleteTargets.length} brand${deleteTargets.length > 1 ? "s" : ""}`);
      setDeleteOpen(false);
      setDeleteTargets([]);
      setSelected([]);
      onBrandsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, [deleteTargets, onBrandsChanged]);

  const onCellValueChanged = useCallback(
    async (e: { data: Brand; colDef: { field?: string } }) => {
      const field = e.colDef.field;
      if (!field || !e.data?.id) return;
      if (field === "slug" && slugHasError(e.data.slug, { id: e.data.id })) {
        const validation = validateSlug(e.data.slug, { id: e.data.id });
        toast.error(validation.message ?? "Slug already in use");
        return;
      }
      if (field === "name" && !String(e.data.name ?? "").trim()) {
        toast.error("Name can't be empty");
        onBrandsChanged?.();
        return;
      }
      try {
        await patchCatalogBrand(e.data.id, {
          [field]: e.data[field as keyof Brand],
        } as Partial<Brand>);
        toast.success(`Updated ${field}`);
        onBrandsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onBrandsChanged],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<Brand>) => (data ? <BrandStatusBadge status={brandStatusOf(data)} /> : null),
    [],
  );

  const handleSave = async (data: Partial<Brand>) => {
    try {
      if (formMode === "create") {
        await createCatalogBrand({
          name: data.name ?? "New Brand",
          slug: data.slug ?? "new-brand",
          active: data.active ?? true,
          status: data.status,
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
          channel,
        });
        toast.success("Brand created");
      } else if (editBrand) {
        await updateCatalogBrand(editBrand.id, {
          name: data.name,
          slug: data.slug,
          active: data.active,
          status: data.status,
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
        });
        toast.success("Brand updated");
      }
      setFormOpen(false);
      onBrandsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onRowDragEnd = useCallback(
    async (e: RowDragEndEvent<Brand>) => {
      const dragged = e.node.data;
      const over = e.overNode?.data;
      if (!dragged || !over) return;

      const orderedIds = reorderBrandIds(brands, dragged.id, over.id);
      if (!orderedIds) {
        e.api.setGridOption("rowData", filtered);
        return;
      }

      try {
        await reorderCatalogBrands(orderedIds);
        toast.success("Order updated");
        onBrandsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reorder failed");
        e.api.setGridOption("rowData", filtered);
      }
    },
    [brands, filtered, onBrandsChanged],
  );

  /** The ≡ at the left of every row — same place and look as in the Products table. */
  const RowMenu = useCallback(
    ({ data }: { data: Brand }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {onView ? (
            <DropdownMenuItem onClick={() => onView(data)}>
              <Eye className="mr-1.5 h-3 w-3" /> View
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() =>
              useActivityStore.getState().openDrawer({
                type: "brand",
                id: data.id,
                label: data.name,
                subtitle: `/${data.slug}`,
              })
            }
          >
            <ClipboardList className="mr-1.5 h-3 w-3" /> Activity
          </DropdownMenuItem>
          {canWrite ? (
            <>
              <DropdownMenuItem onClick={() => openEdit(data)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDeleteConfirm([data])} className="text-destructive">
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [onView, openEdit, openDeleteConfirm, canWrite],
  );

  const columnDefs = useMemo<ColDef<Brand>[]>(
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
        cellRenderer: (p: ICellRendererParams<Brand>) => (p.data ? <RowMenu data={p.data} /> : null),
      },
      {
        // tick box + the handle that drags a brand to a new place in the list
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        rowDrag: canWrite,
        width: canWrite ? 54 : 24,
        maxWidth: canWrite ? 54 : 24,
        minWidth: canWrite ? 54 : 24,
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
        colId: "logo",
        field: "logoUrl",
        headerName: "",
        width: 52,
        hide: !visibleCols.logo,
        resizable: false,
        suppressMovable: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellRenderer: (p: ICellRendererParams<Brand>) => {
          const url = resolveMediaUrl(p.data?.logoMediaId, p.data?.logoUrl);
          return url ? (
            <img src={url} alt="" className="h-7 w-7 rounded object-cover" />
          ) : (
            <span className="inline-block h-7 w-7 rounded bg-muted" />
          );
        },
      },
      {
        field: "name",
        headerName: "Name",
        ...(savedNameWidth != null ? { width: savedNameWidth } : { flex: 2 }),
        minWidth: 160,
        editable: canWrite && liveEdit.name,
        cellClass: canWrite && liveEdit.name ? "live-edit-cell" : undefined,
        valueParser: (p) => String(p.newValue ?? "").trim() || p.oldValue,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Brand>) => {
          if (!p.data) return null;
          return (
            <button
              type="button"
              className="block w-full truncate text-left font-semibold text-foreground hover:underline focus-visible:outline-none"
              title={p.data.name}
              onClick={(e) => {
                e.stopPropagation();
                if (onView) onView(p.data!);
                else openEdit(p.data!);
              }}
            >
              {p.data.name}
            </button>
          );
        },
      },
      {
        field: "slug",
        headerName: "Slug",
        width: 160,
        hide: !visibleCols.slug,
        editable: canWrite && liveEdit.slug,
        cellClass: canWrite && liveEdit.slug ? "live-edit-cell" : undefined,
        tooltipField: "slug",
        cellEditor: liveEdit.slug ? SlugCellEditor : undefined,
        cellClassRules: slugCellClassRules,
      },
      {
        field: "productCount",
        headerName: "Products",
        width: 88,
        hide: !visibleCols.products,
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        hide: !visibleCols.status,
        valueGetter: (p) => (p.data ? brandStatusOf(p.data) : "published"),
        valueSetter: (p) => {
          if (!p.data) return false;
          p.data.status = p.newValue as BrandStatus;
          p.data.active = p.newValue === "published";
          return true;
        },
        editable: canWrite && liveEdit.status,
        cellClass: canWrite && liveEdit.status ? "live-edit-cell" : undefined,
        cellEditor: liveEdit.status ? "agSelectCellEditor" : undefined,
        cellEditorParams: liveEdit.status ? { values: BRAND_STATUSES } : undefined,
        cellRenderer: StatusCell,
      },
      {
        colId: "updated",
        field: "updatedAt",
        headerName: "Updated",
        width: 100,
        hide: !visibleCols.updated,
      },
      {
        colId: "updatedBy",
        field: "updatedBy",
        headerName: "Updated By",
        width: 120,
        hide: !visibleCols.updatedBy,
        valueGetter: (p) => p.data?.updatedBy || "—",
      },
    ],
    [RowMenu, visibleCols, liveEdit, StatusCell, mediaItems, onView, openEdit, canWrite, savedNameWidth],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "updatedBy" ? { updatedBy: "all" } : {}),
      }));
    }
  };

  const SHEET_CLASS = "w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3";
  const CHECK_CLASS =
    "h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary";

  return (
    <AgainListGrid<Brand>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {visibleFilters.search && (
            <Input
              placeholder="Search name, slug…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {visibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[138px]"
              className="shrink-0"
              ariaLabel="Status filter"
              options={[
                { value: "all", label: "All statuses" },
                ...BRAND_STATUSES.map((st) => ({ value: st, label: BRAND_STATUS_LABEL[st] })),
              ]}
            />
          )}
          {visibleFilters.updatedBy && updaters.length > 0 && (
            <FilterSelect
              value={filters.updatedBy}
              onChange={(updatedBy) => setFilters((f) => ({ ...f, updatedBy }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Updated by"
              options={[{ value: "all", label: "All users" }, ...updaters.map((u) => ({ value: u, label: u }))]}
            />
          )}
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button size="sm" onClick={() => void bulkUpdate(selected, { status: "published" }, "Published")}>
              Publish
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void bulkUpdate(selected, { status: "unlisted" }, "Unlisted")}
            >
              Unlist
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void bulkUpdate(selected, { status: "archived" }, "Archived")}
            >
              Archive
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openDeleteConfirm(selected)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
              onClick={() => setSelected([])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No brands match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      defaultColDef={{ minWidth: 72 }}
      layoutKey={false}
      layoutHasWidths={savedColumnState.some((c) => typeof c.width === "number")}
      layoutWidths={savedColumnState}
      layoutReady={savedColumnStateLoaded}
      onGridReady={(e) => {
        if (savedColumnState.length > 0) {
          e.api.setGridOption("suppressColumnMoveAnimation", true);
          e.api.applyColumnState({ state: withoutFlex(savedColumnState), applyOrder: true });
          requestAnimationFrame(() => e.api.setGridOption("suppressColumnMoveAnimation", false));
        }
      }}
      gridProps={{
        colResizeDefault: "shift",
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        rowClass: onView ? "cursor-pointer" : undefined,
        onRowDragEnd,
        onCellValueChanged,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        // a click on the row opens the brand (not on the ≡, tick box, name, badge or an editable cell)
        onCellClicked: (e: CellClickedEvent<Brand>) => {
          if (!e.data || !onView) return;
          const colId = e.column.getColId();
          if (colId === "controls" || colId === "actions" || colId === "name") return;
          if (e.colDef.editable) return;
          const target = e.event?.target;
          if (target instanceof HTMLElement && target.closest("button, a, input, [role='menuitem']")) return;
          onView(e.data);
        },
        onColumnMoved: (e) => {
          // only the admin's own drags, not the saved order being applied on load
          if (e.finished && (e.source === "uiColumnMoved" || e.source === "uiColumnDragged")) persistColumnState();
        },
        onColumnResized: (e) => {
          if (e.finished && e.source === "uiColumnResized") persistColumnState();
        },
        rowClassRules: {
          "opacity-45": (p) => !!p.data && brandStatusOf(p.data) !== "published",
        },
      }}
      mobile={
        <>
          <BrandMobileCards brands={filtered.slice(0, 50)} onEdit={openEdit} onTurnOff={turnOff} />
          {filtered.length > 50 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing 50 of {filtered.length} — use desktop to reorder
            </p>
          )}
        </>
      }
    >
      <BrandFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        brand={editBrand ? brands.find((b) => b.id === editBrand.id) ?? editBrand : null}
        onSave={(data) => void handleSave(data)}
        onLiveChange={(data) => void patchCatalogBrand(data.id, data).then(() => onBrandsChanged?.())}
      />

      {/* Columns */}
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" title="Columns" resizable closeButton="inside" className={SHEET_CLASS}>
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                  className={CHECK_CLASS}
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => {
              setVisibleCols(DEFAULT_VISIBLE);
              setSavedColumnState([]);
              gridApiRef.current?.resetColumnState();
            }}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      {/* Filters */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" title="Filters" resizable closeButton="inside" className={SHEET_CLASS}>
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Show in the toolbar</p>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={visibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                  className={CHECK_CLASS}
                />
                {FILTER_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => {
              setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
              setFilters(DEFAULT_FILTERS);
            }}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      {/* Live edit */}
      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" title="Live edit" resizable closeButton="inside" className={SHEET_CLASS}>
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Live edit</h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tick a field to edit it in the table: double-click its cell, Enter saves, Esc cancels. Status is a list
            (Draft, Published, Unlisted, Archived). Drag the handle at the left of a row to reorder.
          </p>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {LIVE_EDIT_TOGGLES.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={liveEdit[key]}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLiveEdit((v) => ({ ...v, [key]: on }));
                    // a field can only be edited where it is shown (the name always is)
                    if (on && key !== "name") setVisibleCols((cols) => ({ ...cols, [key]: true }));
                  }}
                  className={CHECK_CLASS}
                />
                {LIVE_EDIT_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setLiveEdit(DEFAULT_LIVE_EDIT)}
          >
            Reset live edit
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete brands?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `"${deleteTargets[0]?.name}" will be permanently deleted.`
                : `${deleteTargets.length} brands will be permanently deleted.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
