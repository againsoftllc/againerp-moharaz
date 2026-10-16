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
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { toast } from "sonner";
import type { Category } from "@/lib/mock-data/categories";
import { getDisplayOrder } from "@/lib/mock-data/categories";
import { getCategoryAncestorNames, getCategoryBreadcrumb, getCategoryDepth, getParentLabel, reorderSiblingIds } from "@/lib/category-utils";
import {
  bulkPatchCatalogCategories,
  createCatalogCategory,
  deleteCatalogCategories,
  patchCatalogCategory,
  reorderCatalogCategories,
  updateCatalogCategory,
} from "@/lib/api/use-catalog-categories";
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
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryMobileCards } from "@/components/categories/category-mobile-cards";
import { AgainListGrid } from "@/components/shared/again-list-grid";

const COLUMN_KEYS = [
  "icon",
  "caption",
  "parent",
  "slug",
  "menu",
  "products",
  "status",
  "updated",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  icon: "Icon",
  caption: "Caption",
  parent: "Parent",
  slug: "Slug",
  menu: "Menu",
  products: "Products",
  status: "Status",
  updated: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  icon: true,
  caption: true,
  parent: true,
  slug: true,
  menu: true,
  products: true,
  status: true,
  updated: true,
};

const LIVE_EDIT_KEYS = ["caption", "slug", "menu", "status", "order"] as const;
type LiveEditKey = (typeof LIVE_EDIT_KEYS)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  caption: "Caption",
  slug: "Slug",
  menu: "Menu",
  status: "Status",
  order: "Order",
};

const LIVE_EDIT_HINTS: Record<LiveEditKey, string> = {
  caption: "Double-click cell to edit in grid",
  slug: "Double-click cell to edit in grid",
  menu: "Click Yes / No in grid · live update",
  status: "Click On / Off in grid · Off = inactive",
  order: "Drag row handle to reorder (same parent)",
};

/** Toggleable live-edit fields (order is always on — listed for reference) */
const LIVE_EDIT_TOGGLES = ["caption", "slug", "menu", "status"] as const;
type LiveEditToggleKey = (typeof LIVE_EDIT_TOGGLES)[number];

const DEFAULT_LIVE_EDIT: Record<LiveEditToggleKey, boolean> = {
  caption: true,
  slug: true,
  menu: true,
  status: true,
};

const FORM_ONLY_FIELDS = [
  "Description",
  "Parent",
  "Meta title / description / keywords",
  "Icon & Banner",
] as const;

const FILTER_KEYS = ["search", "status", "menu"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  menu: "Menu",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "Name, caption, slug diye khujun",
  status: "Active / Inactive filter",
  menu: "Website menu Yes / No filter",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  menu: true,
};

type FilterState = {
  search: string;
  status: string;
  topMenu: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  topMenu: "all",
};

function applyFilters(rows: Category[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((c) => {
    if (
      q &&
      !c.name.toLowerCase().includes(q) &&
      !c.caption.toLowerCase().includes(q) &&
      !c.slug.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.status === "on" && !c.active) return false;
    if (f.status === "off" && c.active) return false;
    if (f.topMenu === "top" && !c.showInTopMenu) return false;
    if (f.topMenu === "not-top" && c.showInTopMenu) return false;
    return true;
  });
}

type Props = {
  className?: string;
  /** @deprecated use URL-param driven openCreate from page instead */
  addTrigger?: number;
  categories: Category[];
  loading?: boolean;
  /** New categories inherit this channel (default catalog). */
  channel?: "catalog" | "dropshipping";
  onCategoriesChanged?: () => void;
  onView?: (category: Category) => void;
  onEdit?: (category: Category) => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
};

export type CategoryGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.status !== "all") n += 1;
  if (f.topMenu !== "all") n += 1;
  if (f.search.trim()) n += 1;
  return n;
}

export const CategoryGrid = forwardRef<CategoryGridHandle, Props>(function CategoryGrid(
  {
    className,
    addTrigger = 0,
    categories,
    loading = false,
    channel = "catalog",
    onCategoriesChanged,
    onView,
    onEdit,
    footerLeftActions,
    headerLeftActions,
    onAdvancedFilterCountChange,
  },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Category> | null>(null);
  const mediaItems = useMediaStore((s) => s.items);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Category[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useState(DEFAULT_LIVE_EDIT);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Category[]>([]);

  const ordered = useMemo(() => getDisplayOrder(categories), [categories]);
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

  const openCreate = useCallback((parentId: string | null = null) => {
    setFormMode("create");
    setEditCategory(null);
    setDefaultParentId(parentId);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback(
    (cat: Category) => {
      if (onEdit) {
        onEdit(cat);
        return;
      }
      setFormMode("edit");
      setEditCategory(cat);
      setDefaultParentId(null);
      setFormOpen(true);
    },
    [onEdit],
  );

  useEffect(() => {
    if (addTrigger > 0 && canWrite) openCreate(null);
  }, [addTrigger, openCreate, canWrite]);

  useEffect(() => {
    gridApiRef.current?.refreshCells({ columns: ["icon"], force: true });
  }, [mediaItems]);

  const fitColumnsToGrid = useCallback((api: { sizeColumnsToFit: () => void }) => {
    requestAnimationFrame(() => {
      api.sizeColumnsToFit();
      requestAnimationFrame(() => api.sizeColumnsToFit());
    });
  }, []);

  useEffect(() => {
    if (gridApiRef.current) fitColumnsToGrid(gridApiRef.current);
  }, [visibleCols, fitColumnsToGrid]);

  const turnOff = useCallback(
    async (cat: Category) => {
      try {
        await patchCatalogCategory(cat.id, { active: false });
        toast.success(`Turned off ${cat.name}`);
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onCategoriesChanged],
  );

  const toggleField = useCallback(
    async (cat: Category, field: "active" | "showInTopMenu") => {
      try {
        await patchCatalogCategory(cat.id, { [field]: !cat[field] });
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onCategoriesChanged],
  );

  const bulkUpdate = useCallback(
    async (targets: Category[], patch: Partial<Category>, label: string) => {
      try {
        await bulkPatchCatalogCategories(targets, patch);
        toast.success(`${label} (${targets.length})`);
        setSelected([]);
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed");
      }
    },
    [onCategoriesChanged],
  );

  const openDeleteConfirm = useCallback((targets: Category[]) => {
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      await deleteCatalogCategories(deleteTargets.map((t) => t.id));
      toast.success(
        `Deleted ${deleteTargets.length} categor${deleteTargets.length > 1 ? "ies" : "y"}`,
      );
      setDeleteOpen(false);
      setDeleteTargets([]);
      setSelected([]);
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, [deleteTargets, onCategoriesChanged]);

  const onCellValueChanged = useCallback(
    async (e: { data: Category; colDef: { field?: string } }) => {
      const field = e.colDef.field;
      if (!field || !e.data?.id) return;
      if (field === "slug" && slugHasError(e.data.slug, { id: e.data.id })) {
        const validation = validateSlug(e.data.slug, { id: e.data.id });
        toast.error(validation.message ?? "Slug already in use");
        return;
      }
      try {
        await patchCatalogCategory(e.data.id, {
          [field]: e.data[field as keyof Category],
        } as Partial<Category>);
        toast.success(`Updated ${field}`);
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onCategoriesChanged],
  );

  const MenuCell = useCallback(
    ({ data }: ICellRendererParams<Category>) => {
      if (!data) return null;
      const yes = data.showInTopMenu;
      if (!liveEdit.menu) {
        return (
          <span className={cn("text-[10px]", yes ? "text-primary" : "text-muted-foreground")}>
            {yes ? "Yes" : "No"}
          </span>
        );
      }
      return (
        <button
          type="button"
          title={yes ? "Website menu te dekhabe" : "Website menu te dekhabe na"}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            yes ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          onClick={(e) => {
            e.stopPropagation();
            toggleField(data, "showInTopMenu");
          }}
        >
          {yes ? "Yes" : "No"}
        </button>
      );
    },
    [liveEdit.menu, toggleField],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<Category>) => {
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
          title={on ? "Active — category live ache" : "Inactive — category off"}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          onClick={(e) => {
            e.stopPropagation();
            toggleField(data, "active");
          }}
        >
          {on ? "On" : "Off"}
        </button>
      );
    },
    [liveEdit.status, toggleField],
  );

  const handleSave = async (data: Partial<Category>) => {
    try {
      if (formMode === "create") {
        await createCatalogCategory({
          name: data.name ?? "New Category",
          caption: data.caption ?? data.name ?? "New",
          slug: data.slug ?? "new-category",
          parentId: data.parentId ?? defaultParentId ?? null,
          active: data.active ?? true,
          showInTopMenu: data.showInTopMenu ?? false,
          showPriceComparison: data.showPriceComparison ?? true,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          iconUrl: data.iconUrl,
          bannerUrl: data.bannerUrl,
          iconMediaId: data.iconMediaId,
          bannerMediaId: data.bannerMediaId,
          channel,
        });
        toast.success("Category created");
      } else if (editCategory) {
        await updateCatalogCategory(editCategory.id, {
          name: data.name,
          caption: data.caption,
          slug: data.slug,
          parentId: data.parentId,
          active: data.active,
          showInTopMenu: data.showInTopMenu,
          showPriceComparison: data.showPriceComparison,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          iconUrl: data.iconUrl,
          bannerUrl: data.bannerUrl,
          iconMediaId: data.iconMediaId,
          bannerMediaId: data.bannerMediaId,
        });
        toast.success("Category updated");
      }
      setFormOpen(false);
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onRowDragEnd = useCallback(
    async (e: RowDragEndEvent<Category>) => {
      const dragged = e.node.data;
      const over = e.overNode?.data;
      if (!dragged || !over) return;

      const orderedIds = reorderSiblingIds(categories, dragged.id, over.id);
      if (!orderedIds) {
        toast.error("Same parent er moddhei drag korte hobe");
        e.api.setGridOption("rowData", filtered);
        return;
      }

      try {
        await reorderCatalogCategories(dragged.parentId ?? null, orderedIds);
        toast.success("Order updated");
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reorder failed");
        e.api.setGridOption("rowData", filtered);
      }
    },
    [categories, filtered, onCategoriesChanged],
  );

  const RowActions = useCallback(
    (p: ICellRendererParams<Category>) => {
      const data = p.data;
      if (!data) return null;
      return (
        <div className="flex items-center justify-center gap-0">
          <ActivityTriggerButton
            entity={{
              type: "category",
              id: data.id,
              label: data.name,
              subtitle: `/${data.slug}`,
            }}
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
                  <DropdownMenuItem onClick={() => openCreate(data.id)}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> Add subcategory
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
    [onView, openEdit, openCreate, turnOff, canWrite],
  );

  const columnDefs = useMemo<ColDef<Category>[]>(
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
        sortable: false,
      },
      {
        rowDrag: true,
        width: 32,
        maxWidth: 32,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        sortable: false,
        headerComponent: () => (
          <GripVertical className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
        ),
      },
      {
        colId: "icon",
        field: "iconUrl",
        headerName: "",
        width: 36,
        maxWidth: 36,
        hide: !visibleCols.icon,
        resizable: false,
        suppressMovable: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellRenderer: (p: ICellRendererParams<Category>) => {
          const url = resolveMediaUrl(p.data?.iconMediaId, p.data?.iconUrl);
          return url
            ? <img src={url} alt="" className="h-7 w-7 rounded object-cover" />
            : <span className="inline-block h-7 w-7 rounded bg-muted" />;
        },
      },
      {
        field: "name",
        headerName: "Name",
        width: 260,
        minWidth: 140,
        editable: false,
        cellStyle: (p) => {
          if (!p.data) return undefined;
          return { paddingLeft: `${getCategoryDepth(p.data, categories) * 16}px` };
        },
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Category>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full truncate text-left font-semibold text-foreground hover:underline focus-visible:outline-none"
              title={p.data.name}
              onClick={(e) => {
                e.stopPropagation();
                if (onEdit) onEdit(p.data!);
              }}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      {
        field: "caption",
        headerName: "Caption",
        width: 100,
        hide: !visibleCols.caption,
        editable: canWrite && liveEdit.caption,
        tooltipField: "caption",
      },
      {
        colId: "parent",
        field: "parentId",
        headerName: "Parent",
        width: 120,
        hide: !visibleCols.parent,
        valueGetter: (p) =>
          p.data ? getCategoryBreadcrumb(p.data, categories) : "",
      },
      {
        field: "slug",
        headerName: "Slug",
        width: 180,
        hide: !visibleCols.slug,
        editable: canWrite && liveEdit.slug,
        tooltipField: "slug",
        cellEditor: liveEdit.slug ? SlugCellEditor : undefined,
        cellClassRules: slugCellClassRules,
      },
      {
        colId: "menu",
        field: "showInTopMenu",
        headerName: "Menu",
        headerTooltip: "Yes = website top menu te dekhabe · No = dekhabe na",
        width: 88,
        hide: !visibleCols.menu,
        cellRenderer: MenuCell,
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
        headerTooltip: "On = Active (category live) · Off = Inactive (hidden from storefront)",
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
        sortable: false,
        suppressHeaderMenuButton: true,
        cellRenderer: RowActions,
      },
    ],
    [categories, RowActions, visibleCols, liveEdit, MenuCell, StatusCell, mediaItems, onView],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "menu" ? { topMenu: "all" } : {}),
      }));
    }
  };

  return (
    <AgainListGrid<Category>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {visibleFilters.search && (
            <Input
              placeholder="Search name, caption, slug…"
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
          {visibleFilters.menu && (
            <Select
              value={filters.topMenu}
              onChange={(e) => setFilters((f) => ({ ...f, topMenu: e.target.value }))}
              className="w-[140px] shrink-0 rounded-none"
            >
              <option value="all">All menu</option>
              <option value="top">Menu Yes</option>
              <option value="not-top">Menu No</option>
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
            onClick={() => bulkUpdate(selected, { showInTopMenu: true }, "Menu Yes")}
          >
            Menu Yes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdate(selected, { showInTopMenu: false }, "Menu No")}
          >
            Menu No
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(`Export started for ${selected.length} categories (mock)`)}
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
      emptyTitle="No categories match your filters"
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
          <CategoryMobileCards
            categories={filtered.slice(0, 50)}
            allCategories={categories}
            onEdit={openEdit}
            onTurnOff={turnOff}
            onAddChild={(c) => openCreate(c.id)}
          />
          {filtered.length > 50 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing 50 of {filtered.length} — use desktop to reorder
            </p>
          )}
        </>
      }
    >
      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        category={
          editCategory
            ? categories.find((c) => c.id === editCategory.id) ?? editCategory
            : null
        }
        categories={categories}
        defaultParentId={defaultParentId}
        onSave={(data) => void handleSave(data)}
        onLiveChange={(data) => void patchCatalogCategory(data.id, data).then(() => onCategoriesChanged?.())}
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
              <p className="text-xs font-medium">{LIVE_EDIT_LABELS.order}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{LIVE_EDIT_HINTS.order}</p>
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
            <Dialog.Title className="text-base font-semibold">Delete categories?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `"${deleteTargets[0]?.name}" will be permanently deleted.`
                : `${deleteTargets.length} categories will be permanently deleted.`}
              {" "}Subcategories under selected items will also be removed.
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
