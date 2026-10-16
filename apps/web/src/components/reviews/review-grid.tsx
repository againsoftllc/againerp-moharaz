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
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  ClipboardList,
  Eye,
  Pencil,
  Power,
  PowerOff,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  countReviewsByStatus,
  type Review,
  type ReviewStatus,
} from "@/lib/mock-data/reviews";
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
import { useActivityStore } from "@/lib/store/activity-store";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { updateCatalogReview } from "@/lib/api/use-catalog-reviews";
import type { UpdateProductReviewInput } from "@/lib/api/catalog-reviews";

const ProductDrawer = dynamic(
  () => import("@/components/products/product-drawer/product-drawer").then((module) => module.ProductDrawer),
  { ssr: false },
);

const COLUMN_KEYS = [
  "reviewId",
  "thumbnail",
  "product",
  "customer",
  "rating",
  "helpfulVotes",
  "verifiedPurchase",
  "moderatedBy",
  "updatedAt",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  reviewId: "Review ID",
  thumbnail: "Image",
  product: "Product",
  customer: "Customer",
  rating: "Rating",
  helpfulVotes: "Helpful",
  verifiedPurchase: "Verified",
  moderatedBy: "Moderated By",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  reviewId: false,
  thumbnail: true,
  product: true,
  customer: true,
  rating: true,
  helpfulVotes: true,
  verifiedPurchase: true,
  moderatedBy: false,
  updatedAt: true,
};

/** what an admin can change straight in the grid (Live edit) — each saves to the ERP on its own */
const LIVE_EDIT_KEYS = ["title", "customer", "rating", "helpfulVotes", "verifiedPurchase", "status", "moderatedBy"] as const;
type LiveEditKey = (typeof LIVE_EDIT_KEYS)[number];

const LIVE_EDIT_LABELS: Record<LiveEditKey, string> = {
  title: "Title",
  customer: "Customer name",
  rating: "Rating",
  helpfulVotes: "Helpful votes",
  verifiedPurchase: "Verified purchase",
  status: "Status",
  moderatedBy: "Moderated by",
};

const DEFAULT_LIVE_EDIT: Record<LiveEditKey, boolean> = {
  title: false,
  customer: false,
  rating: true,
  helpfulVotes: false,
  verifiedPurchase: true,
  status: true,
  moderatedBy: false,
};

const FILTER_KEYS = ["search", "status", "rating"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  rating: "Rating",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  rating: false,
};

type FilterState = {
  search: string;
  status: string;
  rating: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  rating: "all",
};

const STATUS_FILTER_VALUES = [
  "all",
  "enabled",
  "disabled",
  "pending",
  "approved",
  "rejected",
  "archived",
  "spam",
] as const;

function parseStatus(value: string | null | undefined): string {
  if (!value) return "all";
  if (value === "approved") return "enabled";
  if (value === "archived") return "disabled";
  if ((STATUS_FILTER_VALUES as readonly string[]).includes(value)) return value;
  return "all";
}

function isReviewEnabled(status: ReviewStatus) {
  return status === "approved";
}

function statusFromEnabled(enabled: boolean): ReviewStatus {
  return enabled ? "approved" : "archived";
}

function statusLabel(status: ReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "spam") return "Spam";
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
  if (f.rating !== "all") n += 1;
  return n;
}

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer rounded-none", className)} />;
}

function ReviewGridSkeleton({ rows = 10 }: { rows?: number }) {
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

export type ReviewGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

type Props = {
  reviews: Review[];
  loading?: boolean;
  initialStatus?: string | null;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
  onView?: (review: Review) => void;
  onEdit?: (review: Review) => void;
  onStatusChange?: (id: string, status: ReviewStatus) => void | Promise<void>;
  onAdvancedFilterCountChange?: (count: number) => void;
  onStatusTabChange?: (status: string) => void;
};

export const ReviewGrid = forwardRef<ReviewGridHandle, Props>(function ReviewGrid(
  {
    reviews,
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
  const [rowData, setRowData] = useState(reviews);
  // a new list from the page replaces the grid's rows (while rendering, not in an effect)
  const [rowsFrom, setRowsFrom] = useState(reviews);
  if (rowsFrom !== reviews) {
    setRowsFrom(reviews);
    setRowData(reviews);
  }

  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    status: parseStatus(initialStatus),
  }));

  const [statusFrom, setStatusFrom] = useState(initialStatus);
  if (statusFrom !== initialStatus) {
    setStatusFrom(initialStatus);
    setFilters((f) => ({ ...f, status: parseStatus(initialStatus) }));
  }

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [liveEdit, setLiveEdit] = useUserScopedState("review-grid:live-edit", DEFAULT_LIVE_EDIT);
  const resolvedLiveEdit = useMemo(() => ({ ...DEFAULT_LIVE_EDIT, ...liveEdit }), [liveEdit]);
  const liveEditStatus = resolvedLiveEdit.status;
  const [productViewId, setProductViewId] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "review-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "review-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );
  const [selected, setSelected] = useState<Review[]>([]);
  const [starred, setStarred] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const byStatus = countReviewsByStatus(rowData);
    return {
      all: byStatus.all,
      enabled: byStatus.approved ?? 0,
      disabled: (byStatus.all ?? 0) - (byStatus.approved ?? 0),
      pending: byStatus.pending ?? 0,
    };
  }, [rowData]);

  const filtered = useMemo(() => {
    return rowData.filter((r) => {
      if (filters.status === "enabled" && !isReviewEnabled(r.status)) return false;
      if (filters.status === "disabled" && isReviewEnabled(r.status)) return false;
      if (
        filters.status === "pending" ||
        filters.status === "rejected" ||
        filters.status === "spam" ||
        filters.status === "archived"
      ) {
        if (r.status !== filters.status) return false;
      }
      const q = filters.search.toLowerCase().trim();
      if (
        q &&
        !r.product.name.toLowerCase().includes(q) &&
        !r.customer.name.toLowerCase().includes(q) &&
        !r.title.toLowerCase().includes(q) &&
        !r.reviewId.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filters.rating !== "all" && r.rating !== parseInt(filters.rating, 10)) return false;
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

  const openReview = useCallback(
    (review: Review) => {
      if (onView) onView(review);
      else router.push(`${moduleBase}/reviews/${review.id}`);
    },
    [onView, router, moduleBase],
  );

  const updateStatus = useCallback(
    (id: string, status: ReviewStatus) => {
      if (onStatusChange) {
        void onStatusChange(id, status);
        return;
      }
      setRowData((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    },
    [onStatusChange],
  );

  /** a live edit: shown at once, saved to the ERP, put back if the save fails */
  const saveField = useCallback(
    (review: Review, change: Partial<Review>, patch: UpdateProductReviewInput, what: string) => {
      setRowData((rows) => rows.map((r) => (r.id === review.id ? { ...r, ...change } : r)));
      void updateCatalogReview(review.id, patch)
        .then(() => toast.success(`${review.reviewId}: ${what} saved`))
        .catch((err) => {
          setRowData((rows) => rows.map((r) => (r.id === review.id ? review : r)));
          toast.error(err instanceof Error ? err.message : `Couldn't save ${what}`);
        });
    },
    [],
  );

  const onCellValueChanged = useCallback(
    (e: { data: Review; oldValue: unknown; newValue: unknown; colDef: { colId?: string } }) => {
      if (!canWrite || e.oldValue === e.newValue) return;
      const before = { ...e.data };
      const colId = e.colDef.colId;
      if (colId === "title") {
        const title = String(e.newValue ?? "").trim();
        if (!title) return;
        saveField({ ...before, title: String(e.oldValue ?? "") }, { title }, { title }, "title");
      } else if (colId === "customer") {
        const name = String(e.newValue ?? "").trim();
        if (!name) return;
        saveField({ ...before, customer: { ...before.customer, name: String(e.oldValue ?? "") } },
          { customer: { ...before.customer, name } }, { customerName: name }, "customer");
      } else if (colId === "helpfulVotes") {
        const votes = Math.max(0, Math.round(Number(e.newValue) || 0));
        saveField({ ...before, helpfulVotes: Number(e.oldValue) || 0 }, { helpfulVotes: votes }, { helpfulVotes: votes }, "helpful votes");
      } else if (colId === "moderatedBy") {
        const by = String(e.newValue ?? "").trim();
        saveField({ ...before, moderatedBy: String(e.oldValue ?? "") }, { moderatedBy: by }, { moderatedBy: by }, "moderated by");
      }
    },
    [canWrite, saveField],
  );

  const toggleEnabled = useCallback(
    (review: Review, enabled: boolean) => {
      const next = statusFromEnabled(enabled);
      updateStatus(review.id, next);
      if (!onStatusChange) {
        toast.success(`${review.reviewId} → ${enabled ? "Enabled" : "Disabled"}`);
      }
    },
    [updateStatus, onStatusChange],
  );

  const ReviewRowMenu = useCallback(
    ({ data }: { data: Review }) => {
      const openDrawer = useActivityStore.getState().openDrawer;
      const enabled = isReviewEnabled(data.status);
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => openReview(data)}>
              <Eye className="mr-1.5 h-3 w-3" /> View
            </DropdownMenuItem>
            {canWrite && onEdit ? (
              <DropdownMenuItem onClick={() => onEdit(data)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() =>
                openDrawer({
                  type: "review",
                  id: data.id,
                  label: data.reviewId,
                  subtitle: data.product.name,
                })
              }
            >
              <ClipboardList className="mr-1.5 h-3 w-3" /> Activity
            </DropdownMenuItem>
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
    [openReview, onEdit, canWrite, toggleEnabled],
  );

  const ReviewControlsCell = useCallback(
    (p: ICellRendererParams<Review>) => {
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

  const columnDefs = useMemo<ColDef<Review>[]>(
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
        cellRenderer: (p: ICellRendererParams<Review>) =>
          p.data ? <ReviewRowMenu data={p.data} /> : null,
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
        cellRenderer: ReviewControlsCell,
      },
      {
        colId: "reviewId",
        field: "reviewId",
        headerName: "Review ID",
        hide: !visibleCols.reviewId,
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
        cellRenderer: (p: ICellRendererParams<Review>) =>
          p.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.data.product.imageUrl}
              alt=""
              className="h-5 w-5 rounded-none object-cover"
            />
          ) : null,
      },
      {
        colId: "title",
        field: "title",
        headerName: "Title",
        flex: 2,
        minWidth: 160,
        resizable: true,
        tooltipField: "title",
        editable: canWrite && resolvedLiveEdit.title,
        cellEditor: "agTextCellEditor",
        cellRenderer: (p: ICellRendererParams<Review>) =>
          p.data && canWrite && resolvedLiveEdit.title ? (
            <span className="block truncate font-semibold" title="Double-click to edit">{p.data.title}</span>
          ) : p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
              title={p.data.title}
              onClick={(e) => {
                e.stopPropagation();
                openReview(p.data!);
              }}
            >
              {p.data.title}
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
        cellRenderer: (p: ICellRendererParams<Review>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full cursor-pointer truncate text-left text-foreground hover:text-primary focus-visible:outline-none"
              title={`${p.data.product.name} — open product`}
              onClick={(e) => {
                e.stopPropagation();
                if (p.data?.product.id) setProductViewId(p.data.product.id);
              }}
            >
              {p.data.product.name}
            </button>
          ) : null,
      },
      {
        colId: "customer",
        headerName: "Customer",
        hide: !visibleCols.customer,
        width: 150,
        minWidth: 110,
        valueGetter: (p) => p.data?.customer.name,
        valueSetter: (p) => {
          if (!p.data) return false;
          p.data.customer = { ...p.data.customer, name: String(p.newValue ?? "") };
          return true;
        },
        editable: canWrite && resolvedLiveEdit.customer,
        cellEditor: "agTextCellEditor",
        cellRenderer: (p: ICellRendererParams<Review>) => {
          if (!p.data) return null;
          const img = p.data.customer.imageUrl;
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="h-5 w-5 shrink-0 object-cover" />
              ) : null}
              <span className="truncate">{p.data.customer.name}</span>
            </div>
          );
        },
      },
      {
        colId: "rating",
        headerName: "Rating",
        hide: !visibleCols.rating,
        width: 110,
        cellRenderer: (p: ICellRendererParams<Review>) => {
          if (!p.data) return null;
          const review = p.data;
          const live = canWrite && resolvedLiveEdit.rating;
          return (
            <div className="flex h-full items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => {
                const star = (
                  <Star
                    className={cn("h-3 w-3", s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted")}
                  />
                );
                return live ? (
                  <button
                    key={s}
                    type="button"
                    className="cursor-pointer p-px hover:scale-125"
                    aria-label={`Rate ${s} of 5`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (s !== review.rating) saveField(review, { rating: s }, { rating: s }, `rating ${s}★`);
                    }}
                  >
                    {star}
                  </button>
                ) : (
                  <span key={s}>{star}</span>
                );
              })}
            </div>
          );
        },
      },
      {
        colId: "helpfulVotes",
        field: "helpfulVotes",
        headerName: "Helpful",
        hide: !visibleCols.helpfulVotes,
        width: 80,
        editable: canWrite && resolvedLiveEdit.helpfulVotes,
        cellEditor: "agNumberCellEditor",
        cellEditorParams: { min: 0, precision: 0 },
      },
      {
        colId: "verifiedPurchase",
        headerName: "Verified",
        hide: !visibleCols.verifiedPurchase,
        width: 80,
        cellRenderer: (p: ICellRendererParams<Review>) => {
          if (!p.data) return null;
          const review = p.data;
          if (canWrite && resolvedLiveEdit.verifiedPurchase) {
            return (
              <div className="flex h-full items-center">
                <input
                  type="checkbox"
                  checked={review.isVerifiedPurchase}
                  aria-label="Verified purchase"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    saveField(review, { isVerifiedPurchase: e.target.checked }, { isVerifiedPurchase: e.target.checked },
                      e.target.checked ? "verified" : "not verified")
                  }
                  className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-emerald-600 checked:bg-emerald-600"
                />
              </div>
            );
          }
          return review.isVerifiedPurchase ? (
            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        colId: "status",
        headerName: "Status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<Review>) => {
          if (!p.data) return null;
          const enabled = isReviewEnabled(p.data.status);
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
                    ? "Turn on to approve and publish on storefront"
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
      {
        colId: "moderatedBy",
        field: "moderatedBy",
        headerName: "Moderated By",
        hide: !visibleCols.moderatedBy,
        width: 120,
        editable: canWrite && resolvedLiveEdit.moderatedBy,
        cellEditor: "agTextCellEditor",
      },
    ],
    [
      ReviewRowMenu,
      ReviewControlsCell,
      visibleCols,
      canWrite,
      liveEditStatus,
      resolvedLiveEdit,
      openReview,
      toggleEnabled,
      saveField,
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
        ...(key === "rating" ? { rating: "all" } : {}),
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
    <AgainListGrid<Review>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading && rowData.length === 0}
      loadingFallback={<ReviewGridSkeleton />}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search review, product, customer…"
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
                { value: "enabled", label: `Approved (${counts.enabled ?? 0})` },
                { value: "disabled", label: `Not approved (${counts.disabled ?? 0})` },
              ]}
            />
          )}
          {resolvedVisibleFilters.rating && (
            <FilterSelect
              value={filters.rating}
              onChange={(rating) => setFilters((f) => ({ ...f, rating }))}
              width="w-[120px]"
              className="shrink-0"
              ariaLabel="Rating"
              options={[
                { value: "all", label: "All ratings" },
                ...[5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} stars` })),
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
              selected.forEach((r) => updateStatus(r.id, "approved"));
              toast.success(`Enabled ${selected.length} reviews`);
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
              toast.success(`Disabled ${selected.length} reviews`);
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
      emptyTitle="No reviews match your filters"
      emptyHint="Try clearing filters or add a new review"
      onResetFilters={resetAllFilters}
      onOpenColumns={() => setColumnSheetOpen(true)}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        // a live-edit cell edits on double-click; elsewhere a double-click opens the review
        onRowDoubleClicked: (e) => {
          if (e.data && !e.api.getEditingCells().length) openReview(e.data);
        },
        onCellValueChanged,
        stopEditingWhenCellsLoseFocus: true,
      }}
      mobile={
        loading && rowData.length === 0 ? (
          <ReviewGridSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div className="rounded-none border border-dashed border-input bg-card p-8 text-center">
            <p className="text-sm font-medium">No reviews found</p>
            <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {filtered.slice(0, 50).map((review) => (
              <button
                key={review.id}
                type="button"
                className="flex w-full gap-3 rounded-none border border-input bg-card p-3 text-left"
                onClick={() => openReview(review)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={review.product.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{review.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{review.product.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className={
                        isReviewEnabled(review.status)
                          ? "text-emerald-600 dark:text-emerald-400"
                          : undefined
                      }
                    >
                      {isReviewEnabled(review.status) ? "Enable" : "Disable"}
                    </span>
                    <span>·</span>
                    <span>{review.rating}★</span>
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

      {productViewId && (
        <ProductDrawer
          open
          onOpenChange={(open) => {
            if (!open) setProductViewId(null);
          }}
          productId={productViewId}
        />
      )}

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
            {LIVE_EDIT_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={resolvedLiveEdit[key]}
                  onChange={(e) => setLiveEdit((v) => ({ ...DEFAULT_LIVE_EDIT, ...v, [key]: e.target.checked }))}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                {LIVE_EDIT_LABELS[key]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Status: switch in the grid. Rating: click a star. Verified: tick. Title, customer, helpful votes and
            moderated by: double-click the cell. Each change saves at once.
          </p>
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
