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
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useActivityStore } from "@/lib/store/activity-store";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { Badge } from "@/components/ui/badge";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { toast } from "sonner";
import type { Category } from "@/lib/mock-data/categories";
import { getDisplayOrder } from "@/lib/mock-data/categories";
import { getCategoryBreadcrumb, reorderSiblingIds } from "@/lib/category-utils";
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
import { ClipboardList } from "lucide-react";
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
  "updatedBy",
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
  updatedBy: "Updated by",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  icon: true,
  caption: true,
  parent: false,
  slug: true,
  menu: true,
  products: true,
  status: true,
  updated: true,
  updatedBy: true,
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

/** Toggleable live-edit fields (order is always on — listed for reference) */
const LIVE_EDIT_TOGGLES = ["caption", "slug", "menu", "status"] as const;
type LiveEditToggleKey = (typeof LIVE_EDIT_TOGGLES)[number];

const DEFAULT_LIVE_EDIT: Record<LiveEditToggleKey, boolean> = {
  caption: true,
  slug: true,
  menu: true,
  status: true,
};

const FILTER_KEYS = ["search", "status", "menu", "updatedBy"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  menu: "Menu",
  updatedBy: "Updated by",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  menu: true,
  updatedBy: true,
};

type FilterState = {
  search: string;
  status: string;
  topMenu: string;
  updatedBy: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  topMenu: "all",
  updatedBy: "all",
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
    if (f.updatedBy !== "all" && (c.updatedBy ?? "") !== f.updatedBy) return false;
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

/** Saved column order / widths only (visibility stays with the Columns switches). */
function withoutFlex(state: { colId: string; width?: number }[]): ColumnState[] {
  return state.map((c) => ({ colId: c.colId, ...(typeof c.width === "number" ? { width: c.width } : {}) }));
}

export type CategoryGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.status !== "all") n += 1;
  if (f.topMenu !== "all") n += 1;
  if (f.updatedBy !== "all") n += 1;
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
  // columns / live edit / toolbar filters / column layout are saved per admin (like the Products table)
  const [visibleColsSaved, setVisibleCols] = useUserScopedState("category-grid:columns", DEFAULT_VISIBLE);
  const visibleCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleColsSaved }), [visibleColsSaved]);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEditSaved, setLiveEdit] = useUserScopedState("category-grid:live-edit", DEFAULT_LIVE_EDIT);
  const liveEdit = useMemo(() => ({ ...DEFAULT_LIVE_EDIT, ...liveEditSaved }), [liveEditSaved]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFiltersSaved, setVisibleFilters] = useUserScopedState("category-grid:filters", DEFAULT_VISIBLE_FILTERS);
  const visibleFilters = useMemo(() => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFiltersSaved }), [visibleFiltersSaved]);
  const [savedColumnState, setSavedColumnState, savedColumnStateLoaded] = useUserScopedState<
    { colId: string; width?: number }[]
  >("category-grid:columnState", [], { sync: true });
  const savedNameWidth = useMemo(
    () => savedColumnState.find((c) => c.colId === "name")?.width ?? null,
    [savedColumnState],
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Category[]>([]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const ordered = useMemo(() => getDisplayOrder(categories), [categories]);
  const filtered = useMemo(() => applyFilters(ordered, filters), [ordered, filters]);
  const advancedCount = countAdvancedFilters(filters);
  const updaters = useMemo(
    () => [...new Set(categories.map((c) => c.updatedBy).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)),
    [categories],
  );

  const persistColumnState = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    setSavedColumnState(
      api.getColumnState().map((c: ColumnState) => ({ colId: c.colId, width: c.width ?? undefined })),
    );
  }, [setSavedColumnState]);

  /** depth + child count per category, computed once instead of per cell. */
  const treeInfo = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const depthById = new Map<string, number>();
    const childCount = new Map<string, number>();
    for (const c of categories) {
      if (c.parentId) childCount.set(c.parentId, (childCount.get(c.parentId) ?? 0) + 1);
    }
    const depthOf = (c: Category): number => {
      const known = depthById.get(c.id);
      if (known !== undefined) return known;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      const d = parent ? depthOf(parent) + 1 : 0;
      depthById.set(c.id, d);
      return d;
    };
    for (const c of categories) depthOf(c);
    const parentIds = categories.filter((c) => (childCount.get(c.id) ?? 0) > 0).map((c) => c.id);
    return { byId, depthById, childCount, parentIds };
  }, [categories]);

  /** While a search / filter is on, matches are shown with their ancestors and nothing is collapsed. */
  const filtering = Boolean(filters.search.trim()) || filters.status !== "all" || filters.topMenu !== "all";

  const visibleRows = useMemo(() => {
    if (filtering) {
      const keep = new Set<string>();
      for (const c of filtered) {
        let cur: Category | undefined = c;
        while (cur && !keep.has(cur.id)) {
          keep.add(cur.id);
          cur = cur.parentId ? treeInfo.byId.get(cur.parentId) : undefined;
        }
      }
      return ordered.filter((c) => keep.has(c.id));
    }
    const visible = new Map<string, boolean>();
    const out: Category[] = [];
    for (const c of ordered) {
      const show = !c.parentId || (visible.get(c.parentId) === true && expanded.has(c.parentId));
      visible.set(c.id, show);
      if (show) out.push(c);
    }
    return out;
  }, [filtering, filtered, ordered, expanded, treeInfo]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      const badge = (
        <Badge variant={yes ? "success" : "muted"} className="max-w-[7rem] shrink-0 truncate leading-4">
          {yes ? "In menu" : "Not in menu"}
        </Badge>
      );
      return (
        <div className="flex h-full items-center overflow-hidden">
          {liveEdit.menu && canWrite ? (
            <button
              type="button"
              title={yes ? "Click to take it out of the website menu" : "Click to show it in the website menu"}
              onClick={(e) => {
                e.stopPropagation();
                toggleField(data, "showInTopMenu");
              }}
            >
              {badge}
            </button>
          ) : (
            badge
          )}
        </div>
      );
    },
    [liveEdit.menu, toggleField, canWrite],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<Category>) => {
      if (!data) return null;
      const on = data.active;
      const badge = (
        <Badge variant={on ? "success" : "muted"} className="max-w-[7rem] shrink-0 truncate leading-4">
          {on ? "Active" : "Inactive"}
        </Badge>
      );
      return (
        <div className="flex h-full items-center overflow-hidden">
          {liveEdit.status && canWrite ? (
            <button
              type="button"
              title={on ? "Click to turn it off" : "Click to turn it on"}
              onClick={(e) => {
                e.stopPropagation();
                toggleField(data, "active");
              }}
            >
              {badge}
            </button>
          ) : (
            badge
          )}
        </div>
      );
    },
    [liveEdit.status, toggleField, canWrite],
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
        e.api.setGridOption("rowData", visibleRows);
        return;
      }

      try {
        await reorderCatalogCategories(dragged.parentId ?? null, orderedIds);
        toast.success("Order updated");
        onCategoriesChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reorder failed");
        e.api.setGridOption("rowData", visibleRows);
      }
    },
    [categories, visibleRows, onCategoriesChanged],
  );

  /** The ≡ at the left of every row — same place and look as in the Products table. */
  const RowMenu = useCallback(
    ({ data }: { data: Category }) => (
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
                type: "category",
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
              <DropdownMenuItem onClick={() => openCreate(data.id)}>
                <Plus className="mr-1.5 h-3 w-3" /> Add subcategory
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDeleteConfirm([data])} className="text-destructive">
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [onView, openEdit, openCreate, openDeleteConfirm, canWrite],
  );

  const columnDefs = useMemo<ColDef<Category>[]>(
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
        cellRenderer: (p: ICellRendererParams<Category>) => (p.data ? <RowMenu data={p.data} /> : null),
      },
      {
        // tick box + the handle that drags a category to a new place among its siblings
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
        ...(savedNameWidth != null ? { width: savedNameWidth } : { flex: 2 }),
        minWidth: 160,
        editable: false,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Category>) => {
          const d = p.data;
          if (!d) return null;
          const depth = treeInfo.depthById.get(d.id) ?? 0;
          const kids = treeInfo.childCount.get(d.id) ?? 0;
          const open = filtering || expanded.has(d.id);
          return (
            <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: depth * 18 }}>
              {kids > 0 ? (
                <button
                  type="button"
                  aria-label={open ? "Collapse" : "Expand"}
                  aria-expanded={open}
                  disabled={filtering}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(d.id);
                  }}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                className={cn(
                  "min-w-0 truncate text-left text-foreground hover:underline focus-visible:outline-none",
                  kids > 0 ? "font-semibold" : "font-normal",
                )}
                title={d.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEdit) onEdit(d);
                }}
              >
                {d.name}
              </button>
              {kids > 0 ? (
                <span className="ml-1 shrink-0 text-muted-foreground" title={`${kids} subcategories`}>
                  ({kids})
                </span>
              ) : null}
            </div>
          );
        },
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
        colId: "updatedBy",
        field: "updatedBy",
        headerName: "Updated By",
        width: 120,
        hide: !visibleCols.updatedBy,
        valueGetter: (p) => p.data?.updatedBy || "—",
      },
    ],
    [categories, RowMenu, visibleCols, liveEdit, MenuCell, StatusCell, mediaItems, onView, treeInfo, expanded, filtering, toggleExpanded, onEdit, canWrite, savedNameWidth],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "menu" ? { topMenu: "all" } : {}),
        ...(key === "updatedBy" ? { updatedBy: "all" } : {}),
      }));
    }
  };

  return (
    <AgainListGrid<Category>
      className={className}
      rowData={visibleRows}
      columnDefs={columnDefs}
      paginationPageSize={100}
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
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[128px]"
              className="shrink-0"
              ariaLabel="Status filter"
              options={[
                { value: "all", label: "All status" },
                { value: "on", label: "Active" },
                { value: "off", label: "Inactive" },
              ]}
            />
          )}
          {visibleFilters.menu && (
            <FilterSelect
              value={filters.topMenu}
              onChange={(topMenu) => setFilters((f) => ({ ...f, topMenu }))}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Menu filter"
              options={[
                { value: "all", label: "All menu" },
                { value: "top", label: "Menu Yes" },
                { value: "not-top", label: "Menu No" },
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
          <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none px-2 text-xs"
              disabled={filtering || treeInfo.parentIds.length === 0}
              onClick={() => setExpanded(new Set(treeInfo.parentIds))}
              title="Expand every category"
            >
              <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
              Expand all
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none px-2 text-xs"
              disabled={filtering || expanded.size === 0}
              onClick={() => setExpanded(new Set())}
              title="Collapse to top-level categories"
            >
              <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
              Collapse all
            </Button>
          </div>
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
        // a click on the row opens the category (not on the ≡, tick box, name, chevron, badges or an editable cell)
        onCellClicked: (e: CellClickedEvent<Category>) => {
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

      {/* Columns */}
      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" title="Columns" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
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
        <SheetContent side="right" title="Filters" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Show in the toolbar</p>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {FILTER_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={visibleFilters[key]}
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
        <SheetContent side="right" title="Live edit" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Live edit</h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tick a field to edit it in the table: double-click its cell, Enter saves, Esc cancels. Menu and Status switch with one click. Drag the handle at the left of a row to reorder within the same parent.
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
                    // a field can only be edited where it is shown
                    if (on) setVisibleCols((cols) => ({ ...cols, [key === "menu" ? "menu" : key]: true }));
                  }}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
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
