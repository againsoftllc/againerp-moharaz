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
import { Eye, Pencil, Star } from "lucide-react";
import type { BlogArticle, BlogArticleStatus } from "@/lib/blog/blog-article";
import { useBlogArticleFavoriteStore } from "@/lib/store/blog-article-favorite-store";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";


const COLUMN_KEYS = [
  "title",
  "categoryName",
  "authorName",
  "status",
  "relatedProductCount",
  "publishedAt",
] as const;

type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  title: "Title",
  categoryName: "Category",
  authorName: "Author",
  status: "Status",
  relatedProductCount: "Products",
  publishedAt: "Published",
};

const DEFAULT_VISIBLE_COLS: Record<ColumnKey, boolean> = {
  title: true,
  categoryName: true,
  authorName: true,
  status: true,
  relatedProductCount: true,
  publishedAt: true,
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

const LIVE_EDIT_KEYS = ["status"] as const;
type LiveEditKey = (typeof LIVE_EDIT_KEYS)[number];

type Props = {
  articles: BlogArticle[];
  loading?: boolean;
  canWrite?: boolean;
  onEdit: (article: BlogArticle) => void;
  onView: (article: BlogArticle) => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onAdvancedFilterCountChange?: (count: number) => void;
  className?: string;
};

export type BlogArticleGridHandle = {
  openFilters: () => void;
  openLiveEdit: () => void;
  openColumns: () => void;
};

function StatusBadge({ status }: { status: BlogArticleStatus }) {
  const variant =
    status === "published" ? "success" : status === "draft" ? "warning" : "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}


function FavoriteStarButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      aria-label={active ? "Unfavorite" : "Favorite"}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <Star
        className={cn("h-3 w-3", active && "fill-amber-400 text-amber-400")}
        aria-hidden
      />
    </button>
  );
}

function countAdvancedFilters(search: string, status: string) {
  let count = 0;
  if (search.trim()) count += 1;
  if (status !== "all") count += 1;
  return count;
}

export const BlogArticleGrid = forwardRef<BlogArticleGridHandle, Props>(function BlogArticleGrid(
  {
    articles,
    loading = false,
    canWrite = false,
    onEdit,
    onView,
    footerLeftActions,
    headerLeftActions,
    onAdvancedFilterCountChange,
    className,
  },
  ref,
) {
  const gridApiRef = useRef<GridApi<BlogArticle> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<BlogArticle[]>([]);
  const starredIds = useBlogArticleFavoriteStore((s) => s.starredIds);
  const toggleFavorite = useBlogArticleFavoriteStore((s) => s.toggle);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE_COLS);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [liveEdit, setLiveEdit] = useState<Record<LiveEditKey, boolean>>({ status: false });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [liveEditSheetOpen, setLiveEditSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openLiveEdit: () => setLiveEditSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
    }),
    [],
  );

  useEffect(() => {
    gridApiRef.current?.refreshCells({ columns: ["controls"], force: true });
  }, [starredIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter((article) => {
      if (status !== "all" && article.status !== status) return false;
      if (!q) return true;
      return (
        article.title.toLowerCase().includes(q) ||
        article.slug.toLowerCase().includes(q) ||
        article.categoryName.toLowerCase().includes(q) ||
        article.authorName.toLowerCase().includes(q)
      );
    });
  }, [articles, search, status]);

  const advancedCount = countAdvancedFilters(search, status);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedCount);
  }, [advancedCount, onAdvancedFilterCountChange]);

  const ArticleRowMenu = useCallback(
    ({ data }: { data: BlogArticle }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onView(data)}>
            <Eye className="mr-2 h-3.5 w-3.5" /> View
          </DropdownMenuItem>
          {canWrite && (
            <DropdownMenuItem onClick={() => onEdit(data)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, onEdit, onView],
  );

  const ArticleControlsCell = useCallback(
    (p: ICellRendererParams<BlogArticle>) => {
      if (!p.data) return null;
      const id = p.data.id;
      const active = Boolean(useBlogArticleFavoriteStore.getState().starredIds[id]);
      return (
        <div
          className="flex h-full items-center gap-[3px]"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <FavoriteStarButton
            active={active}
            onToggle={() => {
              toggleFavorite(id);
              p.api.refreshCells({
                rowNodes: p.node ? [p.node] : undefined,
                columns: ["controls"],
                force: true,
              });
            }}
          />
        </div>
      );
    },
    [toggleFavorite],
  );

  const columnDefs = useMemo<ColDef<BlogArticle>[]>(
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
        cellRenderer: (p: ICellRendererParams<BlogArticle>) =>
          p.data ? <ArticleRowMenu data={p.data} /> : null,
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
        cellRenderer: ArticleControlsCell,
      },
      {
        field: "title",
        headerName: "Title",
        flex: 2,
        minWidth: 160,
        resizable: true,
        hide: !visibleCols.title,
        tooltipField: "title",
        cellRenderer: (p: ICellRendererParams<BlogArticle>) =>
          p.data ? (
            <button
              type="button"
              className="block w-full truncate text-left font-semibold text-foreground hover:underline focus-visible:outline-none"
              title={p.data.title}
              onClick={(e) => {
                e.stopPropagation();
                if (canWrite) onEdit(p.data!);
                else onView(p.data!);
              }}
            >
              {p.data.title}
            </button>
          ) : null,
      },
      {
        field: "categoryName",
        headerName: "Category",
        width: 140,
        minWidth: 100,
        hide: !visibleCols.categoryName,
      },
      {
        field: "authorName",
        headerName: "Author",
        width: 130,
        minWidth: 100,
        hide: !visibleCols.authorName,
      },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        minWidth: 88,
        hide: !visibleCols.status,
        editable: canWrite && liveEdit.status,
        cellEditor: liveEdit.status ? "agSelectCellEditor" : undefined,
        cellEditorParams: liveEdit.status
          ? { values: ["draft", "published", "archived"] }
          : undefined,
        cellRenderer: (p: ICellRendererParams<BlogArticle>) =>
          p.data ? <StatusBadge status={p.data.status} /> : null,
      },
      {
        field: "relatedProductCount",
        headerName: "Products",
        width: 100,
        minWidth: 80,
        type: "numericColumn",
        hide: !visibleCols.relatedProductCount,
      },
      {
        field: "publishedAt",
        headerName: "Published",
        width: 100,
        minWidth: 88,
        hide: !visibleCols.publishedAt,
        valueFormatter: (p) => formatDate(p.value),
      },
    ],
    [ArticleControlsCell, ArticleRowMenu, canWrite, liveEdit.status, onEdit, onView, visibleCols],
  );

  return (
    <AgainListGrid<BlogArticle>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      footerLeftActions={footerLeftActions}
      filterBar={
        <>
          {visibleFilters.search ? (
            <Input
              placeholder="Search title, slug, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px] shrink-0 rounded-none"
            />
          ) : null}
          {visibleFilters.status ? (
            <FilterSelect
              value={status}
              onChange={setStatus}
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ]}
            />
          ) : null}
        </>
      }
      banner={
        selected.length > 0 && canWrite ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium text-foreground">
              {selected.length} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                gridApiRef.current?.deselectAll();
                setSelected([]);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null
      }
      emptyTitle="No articles match your filters"
      emptyHint="Create your first article or clear filters"
      onResetFilters={() => {
        setSearch("");
        setStatus("all");
      }}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      defaultColDef={{ minWidth: 72 }}
      gridProps={{
        autoSizeStrategy: { type: "fitGridWidth" },
        rowSelection: canWrite ? "multiple" : undefined,
        suppressRowClickSelection: true,
        colResizeDefault: "shift",
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which filters show in the toolbar above the list.
          </p>
          <div className="mt-4 space-y-2">
            {FILTER_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleFilters[key]}
                  onChange={(e) =>
                    setVisibleFilters((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-input"
                />
                <span className="font-medium">{FILTER_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
              setSearch("");
              setStatus("all");
            }}
          >
            Reset all filters
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={liveEditSheetOpen} onOpenChange={setLiveEditSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm">
          <h2 className="pr-8 text-base font-semibold">Live edit</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which fields you can edit directly in the grid without opening the form.
          </p>
          <div className="mt-4 space-y-3">
            {LIVE_EDIT_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={liveEdit[key]}
                  onChange={(e) => setLiveEdit((v) => ({ ...v, [key]: e.target.checked }))}
                  className="mt-0.5 rounded border-input"
                  disabled={!canWrite}
                />
                <span>
                  <span className="font-medium capitalize">{key}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Edit status inline in the grid
                  </span>
                </span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Columns</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which columns appear in the articles list.
          </p>
          <div className="mt-4 space-y-2">
            {COLUMN_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleCols[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({ ...v, [key]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-input"
                  disabled={key === "title"}
                />
                <span className="font-medium">{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE_COLS)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
