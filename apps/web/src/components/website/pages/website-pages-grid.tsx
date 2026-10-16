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
  Copy,
  ExternalLink,
  Eye,
  Globe,
  MousePointerClick,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createWebsitePage,
  deleteWebsitePage,
  updateWebsitePage,
} from "@/lib/api/website-pages";
import type {
  WebsiteManagedPage,
  WebsitePageStatus,
} from "@/lib/website/pages/types";
import {
  WEBSITE_PAGE_AUTHORS,
  WEBSITE_PAGE_FILTER_OPTIONS,
  WEBSITE_PAGE_LANGUAGE_LABELS,
  WEBSITE_PAGE_LAYOUT_LABELS,
  WEBSITE_PAGE_STATUS_LABELS,
  WEBSITE_PAGE_TYPE_LABELS,
  WEBSITE_PAGE_VISIBILITY_LABELS,
} from "@/lib/website/pages/types";
import {
  canDeletePage,
  liveEditAdminUrl,
  slugifyPageName,
  storefrontUrlForPage,
  supportsLiveEdit,
} from "@/lib/website/pages/page-actions";
import {
  countAdvancedPageFilters,
  DEFAULT_WEBSITE_PAGES_FILTERS,
  filterWebsitePages,
  type WebsitePagesListFilters,
} from "@/lib/website/pages/filter-pages";
import { cn, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WebsitePagesMobileCards } from "@/components/website/pages/website-pages-mobile-cards";


const COLUMN_KEYS = [
  "url",
  "slug",
  "pageType",
  "status",
  "visibility",
  "language",
  "template",
  "layout",
  "seoStatus",
  "description",
  "lastUpdated",
  "updatedBy",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  url: "URL",
  slug: "Slug",
  pageType: "Type",
  status: "Status",
  visibility: "Visibility",
  language: "Language",
  template: "Template",
  layout: "Layout",
  seoStatus: "SEO",
  description: "Description",
  lastUpdated: "Updated",
  updatedBy: "Updated By",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  url: true,
  slug: false,
  pageType: true,
  status: true,
  visibility: true,
  language: true,
  template: false,
  layout: false,
  seoStatus: false,
  description: false,
  lastUpdated: true,
  updatedBy: true,
};

const FILTER_VISIBILITY_KEYS = [
  "search",
  "status",
  "pageType",
  "visibility",
  "language",
  "category",
  "author",
] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  status: "Status",
  pageType: "Type",
  visibility: "Visibility",
  language: "Language",
  category: "Category",
  author: "Author",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  status: true,
  pageType: true,
  visibility: true,
  language: false,
  category: false,
  author: false,
};

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer rounded-none", className)} />;
}


function StatusBadge({ status }: { status: WebsitePageStatus }) {
  const variant =
    status === "published"
      ? "success"
      : status === "archived"
        ? "muted"
        : "warning";
  return (
    <Badge variant={variant} className="capitalize">
      {WEBSITE_PAGE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

type Props = {
  pages: WebsiteManagedPage[];
  loading?: boolean;
  onView: (page: WebsiteManagedPage) => void;
  onEdit: (page: WebsiteManagedPage) => void;
  onPagesChanged?: () => void;
  onAdvancedFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

export type WebsitePagesGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
};

export const WebsitePagesGrid = forwardRef<WebsitePagesGridHandle, Props>(
  function WebsitePagesGrid(
    {
      pages,
      loading = false,
      onView,
      onEdit,
      onPagesChanged,
      onAdvancedFilterCountChange,
      headerLeftActions,
      footerLeftActions,
      className,
    },
    ref,
  ) {
    const canWrite = useAdminCanWrite();
    const [rowData, setRowData] = useState(pages);
    const [filters, setFilters] = useState<WebsitePagesListFilters>(DEFAULT_WEBSITE_PAGES_FILTERS);
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [columnSheetOpen, setColumnSheetOpen] = useState(false);
    const [visibleCols, setVisibleCols] = useUserScopedState(
      "website-pages-grid:columns",
      DEFAULT_VISIBLE,
    );
    const [visibleFilters, setVisibleFilters] = useUserScopedState(
      "website-pages-grid:filters",
      DEFAULT_VISIBLE_FILTERS,
    );
    const resolvedVisibleFilters = useMemo(
      () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
      [visibleFilters],
    );
    const [selected, setSelected] = useState<WebsiteManagedPage[]>([]);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [archiveTargets, setArchiveTargets] = useState<WebsiteManagedPage[]>([]);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteTargets, setDeleteTargets] = useState<WebsiteManagedPage[]>([]);
    const [deleting, setDeleting] = useState(false);
    const gridApiRef = useRef<GridApi<WebsiteManagedPage> | null>(null);

    useEffect(() => {
      setRowData(pages);
    }, [pages]);

    const filtered = useMemo(
      () => filterWebsitePages(rowData, filters),
      [rowData, filters],
    );
    const advancedCount = countAdvancedPageFilters(filters);

    useEffect(() => {
      onAdvancedFilterCountChange?.(advancedCount);
    }, [advancedCount, onAdvancedFilterCountChange]);

    useImperativeHandle(
      ref,
      () => ({
        openFilters: () => setFilterSheetOpen(true),
        openColumns: () => setColumnSheetOpen(true),
      }),
      [],
    );

    const openLiveEdit = useCallback((page: WebsiteManagedPage) => {
      const url = liveEditAdminUrl(page);
      if (!url) {
        toast.info("Live Edit is available for the Home Page (opens storefront editor)");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    }, []);

    const openStorefront = useCallback((page: WebsiteManagedPage) => {
      window.open(storefrontUrlForPage(page), "_blank", "noopener,noreferrer");
    }, []);

    const setStatus = useCallback(
      async (targets: WebsiteManagedPage[], status: WebsitePageStatus) => {
        try {
          await Promise.all(targets.map((t) => updateWebsitePage(t.id, { status })));
          setRowData((rows) =>
            rows.map((r) =>
              targets.some((t) => t.id === r.id) ? { ...r, status } : r,
            ),
          );
          const label =
            status === "published"
              ? "Published"
              : status === "draft"
                ? "Set to draft"
                : status === "archived"
                  ? "Archived"
                  : "Updated";
          toast.success(
            `${label} ${targets.length} page${targets.length > 1 ? "s" : ""}`,
          );
          setSelected([]);
          onPagesChanged?.();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Status update failed");
        }
      },
      [onPagesChanged],
    );

    const duplicatePage = useCallback(
      async (target: WebsiteManagedPage) => {
        try {
          const baseSlug = slugifyPageName(`${target.name} copy`) || `${target.slug}-copy`;
          await createWebsitePage({
            name: `${target.name} (copy)`,
            slug: baseSlug,
            pageType: target.pageType === "system" ? "custom" : target.pageType,
            description: target.description,
            language: target.language,
            layout: target.layout,
            template: target.template,
            visibility: target.visibility,
            status: "draft",
            scheduledAt: null,
            seo: {
              metaTitle: target.seo.metaTitle,
              metaDescription: target.seo.metaDescription,
              ogImage: target.seo.ogImage,
              canonicalUrl: null,
              indexable: target.seo.indexable,
            },
          });
          toast.success(`Duplicated "${target.name}"`);
          onPagesChanged?.();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Duplicate failed");
        }
      },
      [onPagesChanged],
    );

    const openArchiveConfirm = useCallback((targets: WebsiteManagedPage[]) => {
      setArchiveTargets(targets);
      setArchiveOpen(true);
    }, []);

    const openDeleteConfirm = useCallback((targets: WebsiteManagedPage[]) => {
      const deletable = targets.filter(canDeletePage);
      if (!deletable.length) {
        toast.error("Selected pages cannot be deleted (system/home)");
        return;
      }
      if (deletable.length < targets.length) {
        toast.info("Some system/home pages were skipped");
      }
      setDeleteTargets(deletable);
      setDeleteOpen(true);
    }, []);

    const deletePages = useCallback(
      async (targets: WebsiteManagedPage[]) => {
        if (!targets.length) return;
        setDeleting(true);
        try {
          const results = await Promise.allSettled(
            targets.map((t) => deleteWebsitePage(t.id)),
          );
          const removedIds = new Set(
            targets
              .filter((_, i) => results[i]?.status === "fulfilled")
              .map((t) => t.id),
          );
          setRowData((rows) => rows.filter((r) => !removedIds.has(r.id)));
          const ok = removedIds.size;
          const failed = results.filter((r) => r.status === "rejected").length;
          if (ok) toast.success(`Deleted ${ok} page${ok > 1 ? "s" : ""}`);
          if (failed) toast.error(`${failed} page${failed > 1 ? "s" : ""} could not be deleted`);
          onPagesChanged?.();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Delete failed");
        } finally {
          setDeleting(false);
          setDeleteOpen(false);
          setDeleteTargets([]);
          setSelected([]);
        }
      },
      [onPagesChanged],
    );

    const PageRowMenu = useCallback(
      ({ data }: { data: WebsiteManagedPage }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onView(data)}>
              <Eye className="mr-1.5 h-3 w-3" /> View
            </DropdownMenuItem>
            {supportsLiveEdit(data) ? (
              <DropdownMenuItem onClick={() => openLiveEdit(data)}>
                <MousePointerClick className="mr-1.5 h-3 w-3" /> Live Edit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => openStorefront(data)}>
              <ExternalLink className="mr-1.5 h-3 w-3" /> Open storefront
            </DropdownMenuItem>
            {canWrite ? (
              <>
                <DropdownMenuItem onClick={() => onEdit(data)}>
                  <Pencil className="mr-1.5 h-3 w-3" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {data.status !== "published" ? (
                  <DropdownMenuItem onClick={() => void setStatus([data], "published")}>
                    <Globe className="mr-1.5 h-3 w-3" /> Publish
                  </DropdownMenuItem>
                ) : null}
                {data.status !== "draft" ? (
                  <DropdownMenuItem onClick={() => void setStatus([data], "draft")}>
                    Set draft
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => void duplicatePage(data)}>
                  <Copy className="mr-1.5 h-3 w-3" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openArchiveConfirm([data])}>
                  <Archive className="mr-1.5 h-3 w-3" /> Archive
                </DropdownMenuItem>
                {canDeletePage(data) ? (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => openDeleteConfirm([data])}
                  >
                    <Trash2 className="mr-1.5 h-3 w-3" /> Delete
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      [
        canWrite,
        duplicatePage,
        onEdit,
        onView,
        openArchiveConfirm,
        openDeleteConfirm,
        openLiveEdit,
        openStorefront,
        setStatus,
      ],
    );

    const columnDefs = useMemo<ColDef<WebsiteManagedPage>[]>(
      () => [
        {
          colId: "actions",
          headerName: "",
          width: 44,
          maxWidth: 44,
          pinned: "left",
          sortable: false,
          resizable: false,
          suppressMovable: true,
          headerComponent: GridFullscreenHeader,
          cellRenderer: (p: ICellRendererParams<WebsiteManagedPage>) =>
            p.data ? <PageRowMenu data={p.data} /> : null,
        },
        {
          headerCheckboxSelection: true,
          checkboxSelection: true,
          width: 44,
          maxWidth: 44,
          pinned: "left",
          sortable: false,
          resizable: false,
          suppressMovable: true,
          headerName: "",
        },
        {
          field: "name",
          headerName: "Name",
          flex: 1.6,
          minWidth: 180,
          cellRenderer: (p: ICellRendererParams<WebsiteManagedPage>) => {
            if (!p.data) return null;
            return (
              <button
                type="button"
                className="flex max-w-full items-center gap-1.5 truncate text-left font-medium text-foreground hover:underline"
                onClick={() => (canWrite ? onEdit(p.data!) : onView(p.data!))}
              >
                <span className="truncate">{p.data.name}</span>
                {p.data.flags.isHome ? (
                  <Badge variant="default" className="shrink-0 text-[10px]">
                    Home
                  </Badge>
                ) : null}
                {p.data.pageType === "category" ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Category
                  </Badge>
                ) : null}
              </button>
            );
          },
        },
        {
          field: "url",
          headerName: "URL",
          flex: 1.2,
          minWidth: 140,
          hide: !visibleCols.url,
          cellClass: "font-mono text-xs",
        },
        {
          field: "slug",
          headerName: "Slug",
          width: 120,
          hide: !visibleCols.slug,
          cellClass: "font-mono text-xs",
        },
        {
          field: "pageType",
          headerName: "Type",
          width: 130,
          hide: !visibleCols.pageType,
          valueFormatter: (p) =>
            p.value ? WEBSITE_PAGE_TYPE_LABELS[p.value as WebsiteManagedPage["pageType"]] ?? p.value : "",
        },
        {
          field: "status",
          headerName: "Status",
          width: 110,
          hide: !visibleCols.status,
          cellRenderer: (p: ICellRendererParams<WebsiteManagedPage>) =>
            p.data ? <StatusBadge status={p.data.status} /> : null,
        },
        {
          field: "visibility",
          headerName: "Visibility",
          width: 120,
          hide: !visibleCols.visibility,
          valueFormatter: (p) =>
            p.value
              ? WEBSITE_PAGE_VISIBILITY_LABELS[p.value as WebsiteManagedPage["visibility"]] ??
                p.value
              : "",
        },
        {
          field: "language",
          headerName: "Language",
          width: 100,
          hide: !visibleCols.language,
          valueFormatter: (p) =>
            p.value
              ? WEBSITE_PAGE_LANGUAGE_LABELS[p.value as WebsiteManagedPage["language"]] ?? p.value
              : "",
        },
        {
          field: "template",
          headerName: "Template",
          width: 120,
          hide: !visibleCols.template,
        },
        {
          field: "layout",
          headerName: "Layout",
          width: 100,
          hide: !visibleCols.layout,
          valueFormatter: (p) =>
            p.value
              ? WEBSITE_PAGE_LAYOUT_LABELS[p.value as WebsiteManagedPage["layout"]] ?? p.value
              : "",
        },
        {
          field: "seoStatus",
          headerName: "SEO",
          width: 90,
          hide: !visibleCols.seoStatus,
          cellRenderer: (p: ICellRendererParams<WebsiteManagedPage>) =>
            p.data ? (
              <Badge
                variant={
                  p.data.seoStatus === "complete"
                    ? "success"
                    : p.data.seoStatus === "partial"
                      ? "warning"
                      : "muted"
                }
                className="capitalize"
              >
                {p.data.seoStatus}
              </Badge>
            ) : null,
        },
        {
          field: "description",
          headerName: "Description",
          flex: 1.2,
          minWidth: 140,
          hide: !visibleCols.description,
          tooltipField: "description",
        },
        {
          field: "lastUpdated",
          headerName: "Updated",
          width: 110,
          hide: !visibleCols.lastUpdated,
          valueFormatter: (p) => formatDate(p.value),
        },
        {
          field: "updatedBy",
          headerName: "Updated By",
          flex: 1,
          minWidth: 110,
          hide: !visibleCols.updatedBy,
        },
      ],
      [
        PageRowMenu,
        canWrite,
        onEdit,
        onView,
        visibleCols,
      ],
    );

    const toggleVisibleFilter = (key: FilterVisibilityKey, enabled: boolean) => {
      setVisibleFilters((v) => {
        const merged = { ...DEFAULT_VISIBLE_FILTERS, ...v, [key]: enabled };
        return Object.fromEntries(
          FILTER_VISIBILITY_KEYS.map((k) => [k, merged[k]]),
        ) as Record<FilterVisibilityKey, boolean>;
      });
      if (!enabled) {
        setFilters((f) => ({
          ...f,
          ...(key === "search" ? { search: "" } : {}),
          ...(key === "status" ? { status: "all" as const } : {}),
          ...(key === "pageType" ? { pageType: "all" as const } : {}),
          ...(key === "visibility" ? { visibility: "all" as const } : {}),
          ...(key === "language" ? { language: "all" as const } : {}),
          ...(key === "category" ? { category: "all" as const } : {}),
          ...(key === "author" ? { author: "all" as const } : {}),
        }));
      }
    };

    const resetAllFilters = () => {
      setFilters(DEFAULT_WEBSITE_PAGES_FILTERS);
      setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
    };

    return (
      <AgainListGrid<WebsiteManagedPage>
        className={className}
        rowData={filtered}
        columnDefs={columnDefs}
        loading={loading}
        headerLeftActions={headerLeftActions}
        footerLeftActions={footerLeftActions}
        filterBar={
          <>
            {resolvedVisibleFilters.search ? (
              <Input
                placeholder="Search name, URL…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-[220px] shrink-0 rounded-none"
              />
            ) : null}
            {resolvedVisibleFilters.status ? (
              <FilterSelect
                value={filters.status}
                onChange={(status) =>
                  setFilters((f) => ({
                    ...f,
                    status: status as WebsitePagesListFilters["status"],
                  }))
                }
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Status"
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "published", label: "Published" },
                  { value: "draft", label: "Draft" },
                  { value: "review", label: "In Review" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            ) : null}
            {resolvedVisibleFilters.pageType ? (
              <FilterSelect
                value={filters.pageType}
                onChange={(pageType) =>
                  setFilters((f) => ({
                    ...f,
                    pageType: pageType as WebsitePagesListFilters["pageType"],
                  }))
                }
                width="w-[150px]"
                className="shrink-0"
                ariaLabel="Page type"
                options={[
                  { value: "all", label: "All types" },
                  { value: "website", label: "Website" },
                  { value: "landing", label: "Landing" },
                  { value: "category", label: "Category" },
                  { value: "brand", label: "Brand" },
                  { value: "product_listing", label: "Product listing" },
                  { value: "blog", label: "Blog" },
                  { value: "system", label: "System" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            ) : null}
            {resolvedVisibleFilters.visibility ? (
              <FilterSelect
                value={filters.visibility}
                onChange={(visibility) =>
                  setFilters((f) => ({
                    ...f,
                    visibility: visibility as WebsitePagesListFilters["visibility"],
                  }))
                }
                width="w-[150px]"
                className="shrink-0"
                ariaLabel="Visibility"
                options={[
                  { value: "all", label: "All visibility" },
                  { value: "public", label: "Public" },
                  { value: "private", label: "Private" },
                  { value: "logged_in", label: "Logged in" },
                  { value: "customer_group", label: "Customer group" },
                ]}
              />
            ) : null}
            {resolvedVisibleFilters.language ? (
              <FilterSelect
                value={filters.language}
                onChange={(language) =>
                  setFilters((f) => ({
                    ...f,
                    language: language as WebsitePagesListFilters["language"],
                  }))
                }
                width="w-[130px]"
                className="shrink-0"
                ariaLabel="Language"
                options={[
                  { value: "all", label: "All languages" },
                  { value: "en", label: "English" },
                  { value: "bn", label: "Bengali" },
                  { value: "ar", label: "Arabic" },
                ]}
              />
            ) : null}
            {resolvedVisibleFilters.category ? (
              <FilterSelect
                value={filters.category}
                onChange={(category) =>
                  setFilters((f) => ({
                    ...f,
                    category: category as WebsitePagesListFilters["category"],
                  }))
                }
                width="w-[150px]"
                className="shrink-0"
                ariaLabel="Category filter"
                options={WEBSITE_PAGE_FILTER_OPTIONS.map((o) => ({
                  value: o.key,
                  label: o.label,
                }))}
              />
            ) : null}
            {resolvedVisibleFilters.author ? (
              <FilterSelect
                value={filters.author}
                onChange={(author) => setFilters((f) => ({ ...f, author }))}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Author"
                options={[
                  { value: "all", label: "All authors" },
                  ...WEBSITE_PAGE_AUTHORS.map((a) => ({ value: a, label: a })),
                ]}
              />
            ) : null}
          </>
        }
        banner={
          selected.length > 0 && canWrite ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs font-medium">{selected.length} selected</span>
              <Button size="sm" onClick={() => void setStatus(selected, "published")}>
                <Globe className="mr-1.5 h-3.5 w-3.5" />
                Publish
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void setStatus(selected, "draft")}
              >
                Set draft
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openArchiveConfirm(selected)}
              >
                Bulk archive
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
                variant="outline"
                size="sm"
                onClick={() => toast.success("Export started (mock CSV)")}
              >
                Export selected
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
        emptyTitle="No pages match your filters"
        emptyHint="Create a page or clear filters"
        onResetFilters={() => setFilters(DEFAULT_WEBSITE_PAGES_FILTERS)}
        onOpenColumns={() => setColumnSheetOpen(true)}
        apiRef={gridApiRef}
        gridProps={{
          rowSelection: "multiple",
          suppressRowClickSelection: true,
          onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
        }}
        mobile={
          loading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-none border border-input p-3">
                  <Shimmer className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <WebsitePagesMobileCards
                pages={filtered.slice(0, 50)}
                onView={onView}
                onEdit={onEdit}
                onLiveEdit={openLiveEdit}
                onOpenStorefront={openStorefront}
                onPublish={(p) => void setStatus([p], "published")}
                onDraft={(p) => void setStatus([p], "draft")}
                onArchive={(p) => openArchiveConfirm([p])}
                onDuplicate={(p) => void duplicatePage(p)}
                onDelete={(p) => openDeleteConfirm([p])}
              />
              {filtered.length > 50 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Showing 50 of {filtered.length} — use desktop for full list
                </p>
              ) : null}
            </>
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
              {FILTER_VISIBILITY_KEYS.map((key) => (
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

        <Dialog.Root open={archiveOpen} onOpenChange={setArchiveOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
              <Dialog.Title className="text-base font-semibold">Archive pages?</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {archiveTargets.length === 1
                  ? `"${archiveTargets[0]?.name}" will be archived.`
                  : `${archiveTargets.length} pages will be archived.`}
              </Dialog.Description>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setArchiveOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    void setStatus(archiveTargets, "archived").then(() => {
                      setArchiveOpen(false);
                      setArchiveTargets([]);
                    });
                  }}
                >
                  Archive
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!deleting) setDeleteOpen(open);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
              <Dialog.Title className="text-base font-semibold">Delete pages?</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {deleteTargets.length === 1
                  ? `"${deleteTargets[0]?.name}" will be permanently deleted. This cannot be undone.`
                  : `${deleteTargets.length} pages will be permanently deleted. This cannot be undone.`}
              </Dialog.Description>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void deletePages(deleteTargets)}
                >
                  {deleting ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </AgainListGrid>
    );
  },
);
