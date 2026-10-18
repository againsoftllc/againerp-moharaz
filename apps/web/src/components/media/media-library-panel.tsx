"use client";

import type { ReactNode } from "react";
import { FileText, Image as ImageIcon, LayoutGrid, Search, Video, X } from "lucide-react";
import type { MediaLibraryItem, MediaLibraryItemType } from "@/lib/mock-data/media-library";
import type { MediaUsageFilter } from "@/lib/media/media-usage";
import type { MediaLibraryTab } from "@/components/media/media-library-browser";
import { MediaLibraryBrowser } from "@/components/media/media-library-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { cn, formatQuantity } from "@/lib/utils";

export type MediaStorageTarget = "local" | "r2";

type Props = {
  items: MediaLibraryItem[];
  title?: string;
  query: string;
  onQueryChange: (query: string) => void;
  typeFilter: "all" | MediaLibraryItemType;
  onTypeFilterChange: (type: "all" | MediaLibraryItemType) => void;
  usageFilter: MediaUsageFilter;
  onUsageFilterChange: (filter: MediaUsageFilter) => void;
  /** Where new uploads are stored. R2 option only appears when `r2Available`. */
  storageTarget?: MediaStorageTarget;
  onStorageTargetChange?: (target: MediaStorageTarget) => void;
  r2Available?: boolean;
  storageDisabled?: boolean;
  activeTab: MediaLibraryTab;
  onTabChange: (tab: MediaLibraryTab) => void;
  selectedIds: string[];
  focusedId: string | null;
  onItemClick: (item: MediaLibraryItem) => void;
  onItemUpdate: (id: string, patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>) => void;
  onDelete?: (ids: string[]) => void;
  onMigrateToR2?: (ids: string[]) => void;
  onMigrateToLocal?: (ids: string[]) => void;
  onClearSelection?: () => void;
  migrateDisabled?: boolean;
  onUpload?: (files: FileList) => void;
  onImport?: (items: MediaLibraryItem[]) => void;
  loading?: boolean;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Buttons on the right of the page header (Upload, Refresh, More…). */
  headerLeftActions?: ReactNode;
  /** Extra items on the left of the footer line. */
  footerLeftActions?: ReactNode;
  className?: string;
};

const TYPE_TABS: { id: "all" | MediaLibraryItemType; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Video },
  { id: "document", label: "Documents", icon: FileText },
];

const USAGE_TABS: { id: MediaUsageFilter; label: string }[] = [
  { id: "all", label: "Any usage" },
  { id: "used", label: "Used" },
  { id: "unused", label: "Unused" },
];

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string; icon?: typeof LayoutGrid }[];
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 bg-muted/70 p-0.5">
      {options.map(({ id, label: text, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors",
            value === id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
          <span className={cn(Icon && "max-sm:sr-only")}>{text}</span>
        </button>
      ))}
    </div>
  );
}

export function MediaLibraryPanel({
  items,
  title = "Media",
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  usageFilter,
  onUsageFilterChange,
  storageTarget = "local",
  onStorageTargetChange,
  r2Available = false,
  storageDisabled = false,
  activeTab,
  onTabChange,
  selectedIds,
  focusedId,
  onItemClick,
  onItemUpdate,
  onDelete,
  onMigrateToR2,
  onMigrateToLocal,
  onClearSelection,
  migrateDisabled = false,
  hasMore,
  loadingMore,
  onLoadMore,
  onUpload,
  onImport,
  loading = false,
  total,
  headerLeftActions,
  footerLeftActions,
  className,
}: Props) {
  const filtersActive = Boolean(query.trim()) || typeFilter !== "all" || usageFilter !== "all";

  return (
    <div className={cn("relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background", className)}>
      <div className="shrink-0 space-y-3 px-3 pt-3 sm:px-5 sm:pt-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title">{title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeTab === "upload"
                ? `Upload files to ${storageTarget === "r2" && r2Available ? "Cloudflare R2" : "local storage"}, or import from a link.`
                : loading
                  ? "Loading your files…"
                  : typeof total === "number"
                    ? `${formatQuantity(total)} file${total === 1 ? "" : "s"} in your library`
                    : `${formatQuantity(items.length)} files`}
            </p>
          </div>
          {headerLeftActions ? (
            <div className="flex flex-wrap items-center gap-2">{headerLeftActions}</div>
          ) : null}
        </div>

        {/* Toolbar */}
        {activeTab === "library" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-50 sm:w-72">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="Search name, title, alt…"
                aria-label="Search media"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="h-9 rounded-none pl-8 pr-8 text-xs"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => onQueryChange("")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Segmented
              label="Media type"
              value={typeFilter}
              onChange={onTypeFilterChange}
              options={TYPE_TABS}
            />
            <Segmented
              label="Media usage"
              value={usageFilter}
              onChange={onUsageFilterChange}
              options={USAGE_TABS}
            />
            {onStorageTargetChange ? (
              <div className="flex items-center gap-1.5 sm:ml-auto">
                <span className="text-[11px] text-muted-foreground">New uploads to</span>
                <FilterSelect
                  value={storageTarget}
                  onChange={(next) => {
                    if (storageDisabled) return;
                    onStorageTargetChange(next as MediaStorageTarget);
                  }}
                  width="w-[150px]"
                  className={cn("h-9 shrink-0", storageDisabled && "pointer-events-none opacity-60")}
                  ariaLabel="Media storage destination"
                  options={[
                    { value: "local", label: "Local storage" },
                    ...(r2Available ? [{ value: "r2", label: "Cloudflare R2" }] : []),
                  ]}
                />
              </div>
            ) : null}
            {filtersActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-none text-xs"
                onClick={() => {
                  onTypeFilterChange("all");
                  onUsageFilterChange("all");
                  onQueryChange("");
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => onTabChange("library")}
            >
              ← Back to library
            </Button>
          </div>
        )}

        {/* Selection bar */}
        {selectedIds.length > 0 && activeTab === "library" ? (
          <div className="flex flex-wrap items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium text-foreground">{selectedIds.length} selected</span>
            {onMigrateToR2 && r2Available ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none text-xs"
                disabled={migrateDisabled}
                onClick={() => onMigrateToR2(selectedIds)}
              >
                Move to R2
              </Button>
            ) : null}
            {onMigrateToLocal ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none text-xs"
                disabled={migrateDisabled}
                onClick={() => onMigrateToLocal(selectedIds)}
              >
                Move to Local
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-none text-xs text-destructive hover:text-destructive"
                onClick={() => onDelete(selectedIds)}
              >
                Delete selected
              </Button>
            ) : null}
            {onClearSelection ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 rounded-none text-xs"
                onClick={onClearSelection}
              >
                Clear selection
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Library / upload area */}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-card p-2 sm:p-3">
          {loading ? (
            <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
              Loading media…
            </div>
          ) : (
            <MediaLibraryBrowser
              variant="page"
              items={items}
              query={query}
              onQueryChange={onQueryChange}
              usageFilter={usageFilter}
              onUsageFilterChange={onUsageFilterChange}
              activeTab={activeTab}
              onTabChange={onTabChange}
              selectedIds={selectedIds}
              focusedId={focusedId}
              onItemClick={onItemClick}
              onItemUpdate={onItemUpdate}
              onDelete={onDelete}
              onUpload={onUpload}
              onImport={onImport}
              hideToolbar
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
            />
          )}
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground sm:px-5">
        {footerLeftActions ? <div className="flex items-center gap-2">{footerLeftActions}</div> : null}
        <span className="ml-auto">
          {loading ? "…" : `${formatQuantity(items.length)} loaded`}
          {typeof total === "number" ? ` · ${formatQuantity(total)} total` : ""}
        </span>
      </div>
    </div>
  );
}
