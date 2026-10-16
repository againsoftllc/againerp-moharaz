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
  ColDef,
  GridApi,
  ICellRendererParams,
  RowDragEndEvent,
} from "ag-grid-community";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Eye,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Brand } from "@/lib/mock-data/brands";
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
import { cn } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
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
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { BrandMobileCards } from "@/components/brands/brand-mobile-cards";
import { AgainListGrid } from "@/components/shared/again-list-grid";

const COLUMN_KEYS = ["logo", "slug", "website", "products", "status", "updated"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  logo: "Logo",
  slug: "Slug",
  website: "Website",
  products: "Products",
  status: "Status",
  updated: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  logo: true,
  slug: true,
  website: true,
  products: true,
  status: true,
  updated: true,
};

const LIVE_EDIT_TOGGLES = ["slug", "status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  slug: "Slug",
  status: "Status",
};

const LIVE_EDIT_HINTS: Record<LiveEditKey, string> = {
  slug: "Double-click cell to edit in grid",
  status: "Click On / Off in grid · Off = inactive",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  slug: true,
  status: true,
};

const FORM_ONLY_FIELDS = [
  "Description",
  "Meta title / description / keywords",
  "Logo & Banner",
  "Website URL",
] as const;

const FILTER_KEYS = ["search", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "Name, slug diye khujun",
  status: "Active / Inactive filter",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: false,
};

type FilterState = {
  search: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
};

function applyFilters(rows: Brand[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q) && !b.slug.toLowerCase().includes(q)) {
      return false;
    }
    if (f.status === "on" && !b.active) return false;
    if (f.status === "off" && b.active) return false;
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
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useState(DEFAULT_LIVE_EDIT);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Brand[]>([]);

  const ordered = useMemo(
    () => [...brands].sort((a, b) => a.sortOrder - b.sortOrder),
    [brands],
  );
  const filtered = useMemo(() => applyFilters(ordered, filters), [ordered, filters]);
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

  const fitColumnsToGrid = useCallback((api: { sizeColumnsToFit: () => void }) => {
    requestAnimationFrame(() => {
      api.sizeColumnsToFit();
      requestAnimationFrame(() => api.sizeColumnsToFit());
    });
  }, []);

  useEffect(() => {
    if (gridApiRef.current) fitColumnsToGrid(gridApiRef.current);
  }, [visibleCols, fitColumnsToGrid]);

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
        await patchCatalogBrand(brand.id, { active: false });
        toast.success(`Turned off ${brand.name}`);
        onBrandsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onBrandsChanged],
  );

  const toggleActive = useCallback(
    async (brand: Brand) => {
      try {
        await patchCatalogBrand(brand.id, { active: !brand.active });
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
    ({ data }: ICellRendererParams<Brand>) => {
      if (!data) return null;
      const on = data.active;
      if (!liveEdit.status) {
        return (
          <span className={cn("text-[10px]", on ? "text-emerald-600" : "text-muted-foreground")}>
            {on ? "On" : "Off"}
          </span>
        );
      }
      return (
        <button
          type="button"
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          onClick={(e) => {
            e.stopPropagation();
            toggleActive(data);
          }}
        >
          {on ? "On" : "Off"}
        </button>
      );
    },
    [liveEdit.status, toggleActive],
  );

  const handleSave = async (data: Partial<Brand>) => {
    try {
      if (formMode === "create") {
        await createCatalogBrand({
          name: data.name ?? "New Brand",
          slug: data.slug ?? "new-brand",
          active: data.active ?? true,
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

  const RowActions = useCallback(
    ({ data }: ICellRendererParams<Brand>) => {
      if (!data) return null;
      return (
        <div className="flex items-center gap-0">
          <ActivityTriggerButton
            entity={{ type: "brand", id: data.id, label: data.name, subtitle: `/${data.slug}` }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={() => onView(data)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View
                </DropdownMenuItem>
              )}
              {canWrite && (
                <>
                  <DropdownMenuItem onClick={() => openEdit(data)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => turnOff(data)} className="text-destructive">
                    <Archive className="mr-2 h-3.5 w-3.5" /> Turn off
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    [openEdit, turnOff, onView, canWrite],
  );

  const columnDefs = useMemo<ColDef<Brand>[]>(
    () => [
      {
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        width: 32,
        maxWidth: 32,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
      },
      {
        rowDrag: true,
        width: 36,
        maxWidth: 36,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        headerComponent: () => (
          <GripVertical className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
        ),
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
        width: 220,
        minWidth: 140,
        editable: false,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Brand>) => {
          if (!p.data) return null;
          return (
            <button
              type="button"
              className="truncate text-left hover:underline focus-visible:outline-none"
              onClick={(e) => { e.stopPropagation(); openEdit(p.data!); }}
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
        tooltipField: "slug",
        cellEditor: liveEdit.slug ? SlugCellEditor : undefined,
        cellClassRules: slugCellClassRules,
      },
      {
        colId: "website",
        field: "websiteUrl",
        headerName: "Website",
        width: 180,
        hide: !visibleCols.website,
        valueFormatter: (p) => {
          if (!p.value) return "—";
          try {
            return new URL(String(p.value)).hostname;
          } catch {
            return String(p.value);
          }
        },
        tooltipField: "websiteUrl",
      },
      {
        field: "productCount",
        headerName: "Products",
        width: 88,
        hide: !visibleCols.products,
      },
      {
        colId: "status",
        field: "active",
        headerName: "Status",
        width: 88,
        hide: !visibleCols.status,
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
        colId: "actions",
        headerName: "Action",
        width: 72,
        maxWidth: 72,
        pinned: "right",
        resizable: false,
        suppressMovable: true,
        cellRenderer: RowActions,
        sortable: false,
        suppressHeaderMenuButton: true,
      },
    ],
    [RowActions, visibleCols, liveEdit, StatusCell, mediaItems, onView, openEdit],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
      }));
    }
  };

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
            <Select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-[128px] shrink-0 rounded-none"
            >
              <option value="all">All status</option>
              <option value="on">Active</option>
              <option value="off">Inactive</option>
            </Select>
          )}
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <Button size="sm" onClick={() => bulkUpdate(selected, { active: true }, "Activated")}>
            Turn on (Active)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulkUpdate(selected, { active: false }, "Deactivated")}
          >
            Turn off (Inactive)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`Export started for ${selected.length} brands (mock)`)}
          >
            Export selected
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => openDeleteConfirm(selected)}
          >
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
      autoFit={false}
      defaultColDef={{ minWidth: 72 }}
      gridProps={{
        autoSizeStrategy: { type: "fitGridWidth" },
        rowDragEntireRow: true,
        colResizeDefault: "shift",
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onRowDragEnd,
        onCellValueChanged,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        onGridSizeChanged: (e) => fitColumnsToGrid(e.api),
        rowClassRules: {
          "opacity-45": (p) => !!p.data && !p.data.active,
        },
      }}
      mobile={
        <>
          <BrandMobileCards
            brands={filtered.slice(0, 50)}
            onEdit={openEdit}
            onTurnOff={turnOff}
          />
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

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[180px] max-w-[180px] gap-2 p-3">
          <h2 className="pr-6 text-sm font-semibold">Columns</h2>
          <div className="mt-3 space-y-1.5">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="rounded border-input"
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which filters show in the toolbar above the list.
          </p>
          <div className="mt-4 space-y-3">
            {FILTER_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleFilters[key]}
                  onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                  className="mt-0.5 rounded border-input"
                />
                <span>
                  <span className="font-medium">{FILTER_LABELS[key]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {FILTER_HINTS[key]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
              setFilters(DEFAULT_FILTERS);
            }}
          >
            Reset filters
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Live edit</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which fields you can edit directly in the list without opening the form.
          </p>
          <div className="mt-4 space-y-3">
            {LIVE_EDIT_TOGGLES.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={liveEdit[key]}
                  onChange={(e) =>
                    setLiveEdit((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-input"
                />
                <span>
                  <span className="font-medium">{LIVE_EDIT_LABELS[key]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {LIVE_EDIT_HINTS[key]}
                  </span>
                </span>
              </label>
            ))}
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium">Order</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Drag row handle to reorder</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Always enabled</p>
            </div>
          </div>
          <div className="mt-5 border-t border-input pt-4">
            <p className="text-xs font-medium text-muted-foreground">Edit form only</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {FORM_ONLY_FIELDS.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
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
