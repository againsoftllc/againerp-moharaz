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
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  CheckCircle2,
  Eye,
  Filter,
  ImageOff,
  MousePointerClick,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  BUNDLE_PRICING_LABELS,
  BUNDLE_STATUS_LABELS,
  bundleSavingsPercent,
  type BundleStatus,
  type ProductBundle,
} from "@/lib/mock-data/bundles";
import { useBundleStore } from "@/lib/store/bundle-store";
import { cn, formatCurrency } from "@/lib/utils";
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
import { BundleFormDialog } from "@/components/bundles/bundle-form-dialog";
import { BundleViewDrawer } from "@/components/bundles/bundle-view-drawer";
import { BundleMobileCards } from "@/components/bundles/bundle-mobile-cards";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { Badge } from "@/components/ui/badge";

const COLUMN_KEYS = [
  "thumbnail",
  "sku",
  "type",
  "slug",
  "components",
  "retail",
  "savings",
  "pricing",
  "stock",
  "web",
  "status",
  "updated",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  thumbnail: "Image",
  sku: "SKU",
  type: "Type",
  slug: "Slug",
  components: "Components",
  retail: "Retail total",
  savings: "Savings",
  pricing: "Pricing",
  stock: "Stock",
  web: "Web",
  status: "Status",
  updated: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  thumbnail: true,
  sku: true,
  type: true,
  slug: false,
  components: true,
  retail: true,
  savings: true,
  pricing: false,
  stock: false,
  web: true,
  status: true,
  updated: true,
};

const LIVE_EDIT_TOGGLES = ["name", "status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_TOGGLES)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  name: "Name",
  status: "Status",
};

const LIVE_EDIT_HINTS: Record<LiveEditKey, string> = {
  name: "Double-click cell to edit in grid",
  status: "Click status badge to cycle",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  name: true,
  status: true,
};

const FILTER_KEYS = ["search", "status", "pricing"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  pricing: "Pricing mode",
};

const FILTER_HINTS: Record<FilterKey, string> = {
  search: "Name, SKU, slug diye khujun",
  status: "Draft / published / archived",
  pricing: "Fixed or sum − discount",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  pricing: false,
};

type FilterState = {
  search: string;
  status: string;
  pricing: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  pricing: "all",
};

const STATUS_CYCLE: BundleStatus[] = ["draft", "published", "archived"];

function countAdvancedFilters(f: FilterState): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.status !== "all") n += 1;
  if (f.pricing !== "all") n += 1;
  return n;
}

function applyFilters(rows: ProductBundle[], f: FilterState) {
  const q = f.search.toLowerCase().trim();
  return rows.filter((b) => {
    if (
      q &&
      !b.name.toLowerCase().includes(q) &&
      !b.sku.toLowerCase().includes(q) &&
      !b.slug.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.status !== "all" && b.status !== f.status) return false;
    if (f.pricing !== "all" && b.pricingMode !== f.pricing) return false;
    return true;
  });
}

/** same badge as the product catalogue's Status column */
const statusVariant = (status: BundleStatus) => (status === "published" ? "success" : status === "draft" ? "warning" : "muted");

/** the bundle's own image, else its first product's */
const bundleImage = (b: ProductBundle) => b.thumbnail || b.components.find((c) => c.thumbnail)?.thumbnail || "";

type Props = {
  className?: string;
  addTrigger?: number;
  onView?: (bundle: ProductBundle) => void;
  onEdit?: (bundle: ProductBundle) => void;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
};

export type BundleGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

export const BundleGrid = forwardRef<BundleGridHandle, Props>(function BundleGrid(
  {
    className,
    addTrigger = 0,
    onView: onViewProp,
    onEdit: onEditProp,
    headerLeftActions,
    onAdvancedFilterCountChange,
  },
  ref,
) {
  const gridApiRef = useRef<GridApi<ProductBundle> | null>(null);
  const bundles = useBundleStore((s) => s.bundles);
  const upsertBundle = useBundleStore((s) => s.upsertBundle);
  const patchBundle = useBundleStore((s) => s.patchBundle);
  const deleteBundles = useBundleStore((s) => s.deleteBundles);

  const [toolbarFilters, setToolbarFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editBundle, setEditBundle] = useState<ProductBundle | null>(null);
  const [viewBundle, setViewBundle] = useState<ProductBundle | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState<ProductBundle[]>([]);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useState(DEFAULT_LIVE_EDIT);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ProductBundle[]>([]);

  const filtered = useMemo(
    () => applyFilters(bundles, toolbarFilters),
    [bundles, toolbarFilters],
  );
  const advancedCount = countAdvancedFilters(toolbarFilters);

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
    setEditBundle(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback(
    (bundle: ProductBundle) => {
      if (onEditProp) {
        onEditProp(bundle);
        return;
      }
      setFormMode("edit");
      setEditBundle(bundle);
      setFormOpen(true);
      setViewOpen(false);
    },
    [onEditProp],
  );

  const openView = useCallback(
    (bundle: ProductBundle) => {
      if (onViewProp) {
        onViewProp(bundle);
        return;
      }
      setViewBundle(bundle);
      setViewOpen(true);
    },
    [onViewProp],
  );

  useEffect(() => {
    if (addTrigger > 0) openCreate();
  }, [addTrigger, openCreate]);

  const parentOwnsDialogs = !!onEditProp;

  const cycleStatus = useCallback(
    (bundle: ProductBundle) => {
      const idx = STATUS_CYCLE.indexOf(bundle.status);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      patchBundle(bundle.id, { status: next });
    },
    [patchBundle],
  );

  const archiveBundle = useCallback(
    (bundle: ProductBundle) => {
      patchBundle(bundle.id, { status: "archived" });
      toast.success(`Archived ${bundle.name}`);
    },
    [patchBundle],
  );

  const bulkUpdateStatus = useCallback(
    (targets: ProductBundle[], status: BundleStatus, label: string) => {
      targets.forEach((t) => patchBundle(t.id, { status }));
      toast.success(`${label} (${targets.length})`);
      setSelected([]);
    },
    [patchBundle],
  );

  const openDeleteConfirm = useCallback((targets: ProductBundle[]) => {
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    deleteBundles(deleteTargets.map((t) => t.id));
    toast.success(`Deleted ${deleteTargets.length} bundle${deleteTargets.length > 1 ? "s" : ""}`);
    setDeleteOpen(false);
    setDeleteTargets([]);
    setSelected([]);
  }, [deleteTargets, deleteBundles]);

  const onCellValueChanged = useCallback(
    (e: { data: ProductBundle; colDef: { field?: string } }) => {
      const field = e.colDef.field;
      if (!field || !e.data?.id) return;
      patchBundle(e.data.id, {
        [field]: e.data[field as keyof ProductBundle],
      } as Partial<ProductBundle>);
      toast.success(`Updated ${field}`);
    },
    [patchBundle],
  );

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<ProductBundle>) => {
      if (!data) return null;
      const label = BUNDLE_STATUS_LABELS[data.status];
      const badge = (
        <Badge variant={statusVariant(data.status)} className="max-w-[7rem] shrink-0 truncate leading-4">
          {label}
        </Badge>
      );
      if (!liveEdit.status) return <div className="flex h-full items-center overflow-hidden">{badge}</div>;
      return (
        <button
          type="button"
          className="flex h-full items-center overflow-hidden"
          title="Click to change the status"
          onClick={(e) => {
            e.stopPropagation();
            cycleStatus(data);
          }}
        >
          {badge}
        </button>
      );
    },
    [liveEdit.status, cycleStatus],
  );

  const ImageCell = useCallback(
    ({ data }: ICellRendererParams<ProductBundle>) => {
      if (!data) return null;
      const src = bundleImage(data);
      return (
        <button
          type="button"
          className="flex h-full w-full items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            openView(data);
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-5 w-5 rounded-none bg-white object-contain" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground" title="No image">
              <ImageOff className="h-3 w-3" />
            </span>
          )}
        </button>
      );
    },
    [openView],
  );

  // the drawer stays open (with what was typed) when the save fails
  const handleSave = async (data: Partial<ProductBundle>) => {
    try {
      if (formMode === "create") await upsertBundle(data);
      else if (editBundle) await upsertBundle({ id: editBundle.id, ...data });
      toast.success(formMode === "create" ? "Bundle created" : "Bundle updated");
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the bundle");
    }
  };

  const RowActions = useCallback(
    ({ data }: ICellRendererParams<ProductBundle>) => {
      if (!data) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => openView(data)}>
              <Eye className="mr-2 h-3.5 w-3.5" /> View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(data)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
            {data.status !== "archived" && (
              <DropdownMenuItem onClick={() => archiveBundle(data)} className="text-destructive">
                <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [openView, openEdit, archiveBundle],
  );

  const columnDefs = useMemo<ColDef<ProductBundle>[]>(
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
        // the catalogue's tight icon column (no cell padding, so the icon never overflows into a "…")
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        cellRenderer: RowActions,
      },
      {
        colId: "controls",
        headerCheckboxSelection: true,
        checkboxSelection: true,
        width: 40,
        maxWidth: 40,
        minWidth: 40,
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
        colId: "image",
        headerName: "",
        width: 28,
        maxWidth: 28,
        hide: !visibleCols.thumbnail,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        sortable: false,
        suppressHeaderMenuButton: true,
        cellClass: "product-grid-icon-col",
        cellRenderer: ImageCell,
      },
      {
        field: "name",
        headerName: "Name",
        flex: 2,
        minWidth: 180,
        editable: liveEdit.name,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<ProductBundle>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground hover:text-primary focus-visible:outline-none"
              title={p.data.name}
              onClick={(e) => {
                e.stopPropagation();
                openView(p.data!);
              }}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      {
        field: "sku",
        headerName: "SKU",
        width: 150,
        hide: !visibleCols.sku,
        cellClass: "font-mono text-xs",
        tooltipField: "sku",
      },
      {
        colId: "type",
        field: "category",
        headerName: "Type",
        width: 110,
        hide: !visibleCols.type,
        cellRenderer: (p: ICellRendererParams<ProductBundle>) =>
          p.data ? (
            <div className="flex h-full items-center overflow-hidden">
              <Badge variant="muted" className="max-w-[7rem] shrink-0 truncate">{p.data.category || "General"}</Badge>
            </div>
          ) : null,
      },
      {
        field: "slug",
        headerName: "Slug",
        width: 160,
        hide: !visibleCols.slug,
        tooltipField: "slug",
        cellClass: "text-xs text-muted-foreground",
      },
      {
        colId: "components",
        headerName: "Products",
        width: 260,
        hide: !visibleCols.components,
        valueGetter: (p) => p.data?.components.map((c) => c.productName).join(" + ") ?? "",
        tooltipValueGetter: (p) => p.data?.components.map((c) => `${c.quantity > 1 ? `${c.quantity} × ` : ""}${c.productName}`).join("\n") ?? "",
        cellRenderer: (p: ICellRendererParams<ProductBundle>) =>
          p.data ? (
            <div className="flex h-full flex-nowrap items-center gap-0.5 overflow-hidden">
              <Badge variant="outline" className="shrink-0 tabular-nums">{p.data.components.length}</Badge>
              {p.data.components.map((c) => (
                <Badge key={c.id} variant="muted" className="max-w-[7rem] shrink-0 truncate" title={c.productName}>
                  {c.productName.split(" ").slice(0, 2).join(" ")}
                </Badge>
              ))}
            </div>
          ) : null,
      },
      {
        colId: "retail",
        field: "retailTotal",
        headerName: "Retail",
        width: 120,
        hide: !visibleCols.retail,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: cn(NUMERIC_CELL, "text-muted-foreground"),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        field: "bundlePrice",
        headerName: "Bundle price",
        width: 130,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: cn(NUMERIC_CELL, "font-medium"),
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "savings",
        headerName: "Savings",
        width: 90,
        hide: !visibleCols.savings,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: cn(NUMERIC_CELL, "text-emerald-600 dark:text-emerald-400"),
        valueGetter: (p) => (p.data ? bundleSavingsPercent(p.data) : 0),
        valueFormatter: (p) => (Number(p.value) > 0 ? `−${p.value}%` : "—"),
      },
      {
        colId: "pricing",
        field: "pricingMode",
        headerName: "Pricing",
        width: 130,
        hide: !visibleCols.pricing,
        valueFormatter: (p) =>
          p.value ? BUNDLE_PRICING_LABELS[p.value as keyof typeof BUNDLE_PRICING_LABELS] : "—",
      },
      {
        field: "stock",
        headerName: "Stock",
        width: 72,
        hide: !visibleCols.stock,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
      },
      {
        // published = offered on the website (as long as all its products are on the website too)
        colId: "web",
        headerName: "Web",
        width: 64,
        maxWidth: 72,
        hide: !visibleCols.web,
        valueGetter: (p) => (p.data?.status === "published" ? 1 : 0),
        cellClass: "product-grid-icon-col",
        cellRenderer: (p: ICellRendererParams<ProductBundle>) =>
          p.data ? (
            p.data.status === "published" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="On the website" />
            ) : (
              <span className="text-muted-foreground" aria-label="Not on the website">—</span>
            )
          ) : null,
      },
      {
        colId: "status",
        field: "status",
        headerName: "Status",
        width: 110,
        hide: !visibleCols.status,
        cellRenderer: StatusCell,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "updated",
        field: "updatedAt",
        headerName: "Updated",
        width: 110,
        hide: !visibleCols.updated,
      },
    ],
    [RowActions, visibleCols, liveEdit, StatusCell, ImageCell, openView],
  );

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (!enabled) {
      setToolbarFilters((f) => ({
        ...f,
        ...(key === "search" ? { search: "" } : {}),
        ...(key === "status" ? { status: "all" } : {}),
        ...(key === "pricing" ? { pricing: "all" } : {}),
      }));
    }
  };

  return (
    <AgainListGrid<ProductBundle>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      apiRef={gridApiRef}
      headerLeftActions={headerLeftActions}
      onOpenColumns={() => setColumnSheetOpen(true)}
      filterBar={
        <>
          {visibleFilters.search && (
            <Input
              placeholder="Search name, SKU, slug…"
              value={toolbarFilters.search}
              onChange={(e) => setToolbarFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {visibleFilters.status && (
            <Select
              value={toolbarFilters.status}
              onChange={(e) => setToolbarFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-[140px] shrink-0 rounded-none"
            >
              <option value="all">All status</option>
              {STATUS_CYCLE.map((s) => (
                <option key={s} value={s}>
                  {BUNDLE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
          {visibleFilters.pricing && (
            <Select
              value={toolbarFilters.pricing}
              onChange={(e) => setToolbarFilters((f) => ({ ...f, pricing: e.target.value }))}
              className="w-[160px] shrink-0 rounded-none"
            >
              <option value="all">All pricing</option>
              <option value="fixed">Fixed price</option>
              <option value="sum_discount">Sum − discount</option>
            </Select>
          )}
          {!headerLeftActions && (
            <>
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setFilterSheetOpen(true)}>
                <Filter className="mr-1.5 h-3.5 w-3.5" /> Filters
              </Button>
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setLiveEditSheetOpen(true)}>
                <MousePointerClick className="mr-1.5 h-3.5 w-3.5" /> Live Edit
              </Button>
            </>
          )}
        </>
      }
      banner={
        selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => bulkUpdateStatus(selected, "published", "Published")}
            >
              Publish
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={() => bulkUpdateStatus(selected, "archived", "Archived")}
            >
              Archive
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
      emptyTitle="No bundles match your filters"
      onResetFilters={() => setToolbarFilters(DEFAULT_FILTERS)}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onCellValueChanged,
        onSelectionChanged: (e) => {
          const rows: ProductBundle[] = [];
          e.api.forEachNodeAfterFilterAndSort((node) => {
            if (node.isSelected() && node.data) rows.push(node.data);
          });
          setSelected(rows);
        },
      }}
      mobile={
        <BundleMobileCards
          bundles={filtered}
          onView={openView}
          onEdit={openEdit}
          onArchive={archiveBundle}
        />
      }
    >
      {!parentOwnsDialogs && (
        <>
          <BundleFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            mode={formMode}
            bundle={editBundle}
            onSave={(d) => void handleSave(d)}
          />

          <BundleViewDrawer
            open={viewOpen}
            onOpenChange={setViewOpen}
            bundle={viewBundle}
            onEdit={openEdit}
          />
        </>
      )}

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-[min(320px,100vw)]">
          <h2 className="text-sm font-semibold">Columns</h2>
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
            <Dialog.Title className="text-base font-semibold">Delete bundles?</Dialog.Title>
            <p className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length} bundle{deleteTargets.length > 1 ? "s" : ""} will be removed.
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
});
