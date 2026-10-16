"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ColDef, GridApi, ICellRendererParams, RowDragEndEvent } from "ag-grid-community";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Filter,
  GripVertical,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  COLLECTION_TYPE_LABELS,
  type CollectionStatus,
  type CollectionType,
  type ProductCollection,
} from "@/lib/mock-data/collections";
import {
  bulkPatchCatalogCollections,
  deleteCatalogCollections,
  patchCatalogCollection,
  reorderCatalogCollections,
} from "@/lib/api/use-catalog-collections";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
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
import { CollectionMobileCards } from "@/components/collections/collection-mobile-cards";
import { AgainListGrid } from "@/components/shared/again-list-grid";

const COLUMN_KEYS = ["hero", "slug", "type", "rules", "products", "schedule", "status", "updated"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  hero: "Hero",
  slug: "Slug",
  type: "Type",
  rules: "Rules",
  products: "Products",
  schedule: "Schedule",
  status: "Status",
  updated: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  hero: true,
  slug: true,
  type: true,
  rules: true,
  products: true,
  schedule: false,
  status: true,
  updated: true,
};

const LIVE_EDIT_TOGGLES = ["name", "slug", "status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  name: "Name",
  slug: "Slug",
  status: "Status",
};

const LIVE_EDIT_HINTS: Record<LiveEditKey, string> = {
  name: "Double-click cell to edit in grid",
  slug: "Double-click cell to edit in grid",
  status: "Click status badge to cycle",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  name: true,
  slug: true,
  status: true,
};

const FILTER_KEYS = ["search", "type", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  type: "Type",
  status: "Status",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "Name, slug, rules diye khujun",
  type: "Collection type filter",
  status: "Lifecycle status filter",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  type: true,
  status: false,
};

type FilterState = {
  search: string;
  type: string;
  status: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  type: "all",
  status: "all",
};

const STATUS_CYCLE: CollectionStatus[] = ["draft", "active", "inactive", "archived"];

function applyFilters(rows: ProductCollection[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((c) => {
    if (
      q &&
      !c.name.toLowerCase().includes(q) &&
      !c.slug.toLowerCase().includes(q) &&
      !c.ruleSummary.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.type !== "all" && c.type !== f.type) return false;
    if (f.status !== "all" && c.status !== f.status) return false;
    return true;
  });
}

function reorderCollectionIds(
  collections: ProductCollection[],
  draggedId: string,
  overId: string,
): string[] | null {
  if (draggedId === overId) return null;
  const sorted = [...collections].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = sorted.map((c) => c.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

function statusBadgeClass(status: CollectionStatus) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "draft") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

type Props = {
  className?: string;
  /** @deprecated Use onEdit from the page instead */
  addTrigger?: number;
  collections: ProductCollection[];
  loading?: boolean;
  onCollectionsChanged?: () => void;
  onEdit?: (collection: ProductCollection) => void;
};

export function CollectionGrid({
  className,
  collections,
  loading: _loading = false,
  onCollectionsChanged,
  onEdit: onEditProp,
}: Props) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ProductCollection> | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<ProductCollection[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useState(DEFAULT_LIVE_EDIT);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ProductCollection[]>([]);

  const ordered = useMemo(
    () => [...collections].sort((a, b) => a.sortOrder - b.sortOrder),
    [collections],
  );
  const filtered = useMemo(() => applyFilters(ordered, filters), [ordered, filters]);

  const openEdit = useCallback(
    (collection: ProductCollection) => {
      onEditProp?.(collection);
    },
    [onEditProp],
  );

  const cycleStatus = useCallback(
    async (collection: ProductCollection) => {
      const idx = STATUS_CYCLE.indexOf(collection.status);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      try {
        await patchCatalogCollection(collection.id, { status: next });
        onCollectionsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onCollectionsChanged],
  );

  const archiveCollection = useCallback(
    async (collection: ProductCollection) => {
      if (collection.isSystem) {
        toast.error("System collections cannot be archived");
        return;
      }
      try {
        await patchCatalogCollection(collection.id, { status: "archived" });
        toast.success(`Archived ${collection.name}`);
        onCollectionsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Archive failed");
      }
    },
    [onCollectionsChanged],
  );

  const bulkUpdateStatus = useCallback(
    async (targets: ProductCollection[], status: CollectionStatus, label: string) => {
      const eligible = targets.filter((t) => !t.isSystem || status !== "archived");
      if (eligible.length === 0) {
        toast.error("System collections cannot be archived");
        return;
      }
      try {
        await bulkPatchCatalogCollections(eligible, { status });
        toast.success(`${label} (${eligible.length})`);
        setSelected([]);
        onCollectionsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed");
      }
    },
    [onCollectionsChanged],
  );

  const openDeleteConfirm = useCallback((targets: ProductCollection[]) => {
    const deletable = targets.filter((t) => !t.isSystem);
    if (deletable.length === 0) {
      toast.error("System collections cannot be deleted");
      return;
    }
    setDeleteTargets(deletable);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      await deleteCatalogCollections(deleteTargets.map((t) => t.id));
      toast.success(
        `Deleted ${deleteTargets.length} collection${deleteTargets.length > 1 ? "s" : ""}`,
      );
      setDeleteOpen(false);
      setDeleteTargets([]);
      setSelected([]);
      onCollectionsChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, [deleteTargets, onCollectionsChanged]);

  const onCellValueChanged = useCallback(
    async (e: { data: ProductCollection; colDef: { field?: string } }) => {
      const field = e.colDef.field;
      if (!field || !e.data?.id) return;
      if (field === "slug" && slugHasError(e.data.slug, { id: e.data.id })) {
        const validation = validateSlug(e.data.slug, { id: e.data.id });
        toast.error(validation.message ?? "Slug already in use");
        return;
      }
      try {
        await patchCatalogCollection(e.data.id, {
          [field]: e.data[field as keyof ProductCollection],
        } as Partial<ProductCollection>);
        toast.success(`Updated ${field}`);
        onCollectionsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onCollectionsChanged],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<ProductCollection>) => {
      if (!data) return null;
      const label = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      if (!liveEdit.status) {
        return <span className={cn("text-[10px] capitalize", statusBadgeClass(data.status))}>{label}</span>;
      }
      return (
        <button
          type="button"
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors",
            statusBadgeClass(data.status),
          )}
          onClick={(e) => {
            e.stopPropagation();
            cycleStatus(data);
          }}
        >
          {label}
        </button>
      );
    },
    [liveEdit.status, cycleStatus],
  );

  const TypeCell = useCallback(({ data }: ICellRendererParams<ProductCollection>) => {
    if (!data) return null;
    return (
      <Badge variant="outline" className="max-w-full truncate text-[10px] font-normal">
        {COLLECTION_TYPE_LABELS[data.type]}
      </Badge>
    );
  }, []);

  const onRowDragEnd = useCallback(
    async (e: RowDragEndEvent<ProductCollection>) => {
      const dragged = e.node.data;
      const over = e.overNode?.data;
      if (!dragged || !over) return;

      const orderedIds = reorderCollectionIds(collections, dragged.id, over.id);
      if (!orderedIds) {
        e.api.setGridOption("rowData", filtered);
        return;
      }

      try {
        await reorderCatalogCollections(orderedIds);
        toast.success("Display order updated");
        onCollectionsChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reorder failed");
        e.api.setGridOption("rowData", filtered);
      }
    },
    [collections, filtered, onCollectionsChanged],
  );

  const RowActions = useCallback(
    ({ data }: ICellRendererParams<ProductCollection>) => {
      if (!data) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(data)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
            {!data.isSystem && (
              <DropdownMenuItem onClick={() => archiveCollection(data)} className="text-destructive">
                <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [openEdit, archiveCollection],
  );

  const columnDefs = useMemo<ColDef<ProductCollection>[]>(
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
        rowDrag: canWrite,
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
        colId: "hero",
        field: "heroImageUrl",
        headerName: "",
        width: 52,
        hide: !visibleCols.hero,
        resizable: false,
        suppressMovable: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellRenderer: (p: ICellRendererParams<ProductCollection>) =>
          p.data?.heroImageUrl ? (
            <img src={p.data.heroImageUrl} alt="" className="h-7 w-10 rounded object-cover" />
          ) : (
            <span className="inline-block h-7 w-10 rounded bg-muted" />
          ),
      },
      {
        field: "name",
        headerName: "Name",
        width: 200,
        minWidth: 140,
        editable: canWrite && liveEdit.name,
        tooltipField: "name",
        cellClass: "font-medium text-foreground",
      },
      {
        field: "slug",
        headerName: "Slug",
        width: 160,
        hide: !visibleCols.slug,
        editable: canWrite && liveEdit.slug,
        tooltipField: "slug",
        cellEditor: canWrite && liveEdit.slug ? SlugCellEditor : undefined,
        cellClassRules: slugCellClassRules,
      },
      {
        colId: "type",
        field: "type",
        headerName: "Type",
        width: 130,
        hide: !visibleCols.type,
        cellRenderer: TypeCell,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "rules",
        field: "ruleSummary",
        headerName: "Rules",
        width: 220,
        hide: !visibleCols.rules,
        tooltipField: "ruleSummary",
        cellClass: "text-muted-foreground text-xs",
      },
      {
        field: "productCount",
        headerName: "Products",
        width: 88,
        hide: !visibleCols.products,
      },
      {
        colId: "schedule",
        headerName: "Schedule",
        width: 140,
        hide: !visibleCols.schedule,
        valueGetter: (p) => {
          const s = p.data?.scheduleStart;
          const e = p.data?.scheduleEnd;
          if (!s && !e) return "—";
          if (s && e) return `${s} → ${e}`;
          return s ?? e ?? "—";
        },
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 96,
        hide: !visibleCols.status,
        cellRenderer: StatusCell,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "updated",
        field: "updatedAt",
        headerName: "Updated",
        width: 100,
        hide: !visibleCols.updated,
      },
      {
        headerName: "",
        width: 48,
        pinned: "right",
        resizable: false,
        suppressMovable: true,
        cellRenderer: RowActions,
        sortable: false,
        suppressHeaderMenuButton: true,
      },
    ],
    [RowActions, visibleCols, liveEdit, StatusCell, TypeCell, canWrite],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "type" ? { type: "all" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
      }));
    }
  };

  return (
    <AgainListGrid<ProductCollection>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      apiRef={gridApiRef}
      onOpenColumns={() => setColumnSheetOpen(true)}
      filterBar={
        <>
          {visibleFilters.search && (
            <Input
              placeholder="Search name, slug, rules…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="max-w-[220px] rounded-none"
            />
          )}
          {visibleFilters.type && (
            <Select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              className="w-[160px] rounded-none"
            >
              <option value="all">All types</option>
              {(Object.keys(COLLECTION_TYPE_LABELS) as CollectionType[]).map((t) => (
                <option key={t} value={t}>
                  {COLLECTION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
          {visibleFilters.status && (
            <Select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-[130px] rounded-none"
            >
              <option value="all">All status</option>
              {STATUS_CYCLE.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => setFilterSheetOpen(true)}>
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Filters
          </Button>
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => setLiveEditSheetOpen(true)}>
            <MousePointerClick className="mr-1.5 h-3.5 w-3.5" /> Live Edit
          </Button>
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => bulkUpdateStatus(selected, "active", "Activated")}
            >
              Activate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => bulkUpdateStatus(selected, "inactive", "Deactivated")}
            >
              Deactivate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none text-destructive"
              onClick={() => openDeleteConfirm(selected)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        ) : null
      }
      emptyTitle="No collections match your filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        rowDragManaged: canWrite,
        onRowDragEnd,
        onCellValueChanged,
        onSelectionChanged: (e) => {
          const rows: ProductCollection[] = [];
          e.api.forEachNodeAfterFilterAndSort((node) => {
            if (node.isSelected() && node.data) rows.push(node.data);
          });
          setSelected(rows);
        },
      }}
      mobile={
        <CollectionMobileCards
          collections={filtered}
          onEdit={openEdit}
          onArchive={archiveCollection}
        />
      }
    >
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[min(320px,100vw)]">
          <h2 className="text-sm font-semibold">Columns</h2>
          <p className="mt-1 text-xs text-muted-foreground">Show or hide grid columns</p>
          <div className="mt-4 space-y-3">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                {COLUMN_LABELS[key]}
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) => setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" className="w-[min(320px,100vw)]">
          <h2 className="text-sm font-semibold">Live Edit</h2>
          <p className="mt-1 text-xs text-muted-foreground">Inline editing in the grid</p>
          <div className="mt-4 space-y-4">
            {LIVE_EDIT_TOGGLES.map((key) => (
              <div key={key}>
                <label className="flex items-center justify-between gap-2 text-sm font-medium">
                  {LIVE_EDIT_LABELS[key]}
                  <input
                    type="checkbox"
                    checked={liveEdit[key]}
                    onChange={(e) => setLiveEdit((v) => ({ ...v, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-input"
                  />
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{LIVE_EDIT_HINTS[key]}</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-[min(320px,100vw)]">
          <h2 className="text-sm font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">Choose which filters appear in the toolbar</p>
          <div className="mt-4 space-y-4">
            {FILTER_KEYS.map((key) => (
              <div key={key}>
                <label className="flex items-center justify-between gap-2 text-sm font-medium">
                  {FILTER_LABELS[key]}
                  <input
                    type="checkbox"
                    checked={visibleFilters[key]}
                    onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{FILTER_HINTS[key]}</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-input bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete collections?</Dialog.Title>
            <p className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length} collection{deleteTargets.length > 1 ? "s" : ""} will be removed.
              System collections are protected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" className="absolute right-3 top-3 h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
}
