"use client";

import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import type { MediaLibraryItem, MediaLibraryItemType } from "@/lib/mock-data/media-library";
import type { MediaUsageFilter } from "@/lib/media/media-usage";
import type { MediaLibraryTab } from "@/components/media/media-library-browser";
import { MediaLibraryBrowser } from "@/components/media/media-library-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn, formatQuantity } from "@/lib/utils";

export type MediaStorageTarget = "local" | "r2";

type Props = {
  items: MediaLibraryItem[];
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
  migrateDisabled?: boolean;
  onUpload?: (files: FileList) => void;
  onImport?: (items: MediaLibraryItem[]) => void;
  loading?: boolean;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

export type MediaLibraryPanelHandle = {
  openFilters: () => void;
};

export const MediaLibraryPanel = forwardRef<MediaLibraryPanelHandle, Props>(function MediaLibraryPanel(
  {
    items,
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
  },
  ref,
) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
  }));

  return (
    <div className={cn("relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden", className)}>
      <div
        data-component="media-library-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0"
      >
        {headerLeftActions ? (
          <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
            {headerLeftActions}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeTab === "library" ? (
            <>
              <Input
                placeholder="Search name, title, alt…"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="w-[220px] shrink-0 rounded-none"
              />
              <FilterSelect
                value={typeFilter}
                onChange={(next) => onTypeFilterChange(next as "all" | MediaLibraryItemType)}
                width="w-[130px]"
                className="shrink-0"
                ariaLabel="Type filter"
                options={[
                  { value: "all", label: "All types" },
                  { value: "image", label: "Images" },
                  { value: "video", label: "Videos" },
                  { value: "document", label: "Documents" },
                ]}
              />
              <FilterSelect
                value={usageFilter}
                onChange={(next) => onUsageFilterChange(next as MediaUsageFilter)}
                width="w-[120px]"
                className="shrink-0"
                ariaLabel="Usage filter"
                options={[
                  { value: "all", label: "All usage" },
                  { value: "used", label: "Used" },
                  { value: "unused", label: "Unused" },
                ]}
              />
              {onStorageTargetChange ? (
                <FilterSelect
                  value={storageTarget}
                  onChange={(next) => {
                    if (storageDisabled) return;
                    onStorageTargetChange(next as MediaStorageTarget);
                  }}
                  width="w-[150px]"
                  className={cn("shrink-0", storageDisabled && "pointer-events-none opacity-60")}
                  ariaLabel="Media storage destination"
                  options={[
                    { value: "local", label: "Local storage" },
                    ...(r2Available ? [{ value: "r2", label: "Cloudflare R2" }] : []),
                  ]}
                />
              ) : null}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Upload files to{" "}
              {storageTarget === "r2" && r2Available ? "Cloudflare R2" : "local storage"}
            </span>
          )}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.length} selected
          </span>
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
              className="h-7 text-xs"
              onClick={() => onDelete(selectedIds)}
            >
              Delete selected
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background px-2 py-2">
        {loading ? (
          <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
            Loading media…
          </div>
        ) : (
          <MediaLibraryBrowser
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

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        {footerLeftActions ? (
          <div className="flex items-center gap-2">{footerLeftActions}</div>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "…" : `${formatQuantity(items.length)} loaded`}
          {typeof total === "number" ? ` · ${formatQuantity(total)} total` : ""}
        </span>
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Narrow the media library by type and usage
            {onStorageTargetChange ? ", and choose where new uploads are stored" : ""}.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Type</span>
              <Select
                value={typeFilter}
                onChange={(e) => onTypeFilterChange(e.target.value as "all" | MediaLibraryItemType)}
                className="w-full rounded-none"
              >
                <option value="all">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="document">Documents</option>
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Usage</span>
              <Select
                value={usageFilter}
                onChange={(e) => onUsageFilterChange(e.target.value as MediaUsageFilter)}
                className="w-full rounded-none"
              >
                <option value="all">All usage</option>
                <option value="used">Used</option>
                <option value="unused">Unused</option>
              </Select>
            </label>
            {onStorageTargetChange ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Store new uploads in</span>
                <Select
                  value={storageTarget}
                  disabled={storageDisabled}
                  onChange={(e) => onStorageTargetChange(e.target.value as MediaStorageTarget)}
                  className="w-full rounded-none"
                >
                  <option value="local">Local storage</option>
                  {r2Available ? <option value="r2">Cloudflare R2</option> : null}
                </Select>
                {!r2Available ? (
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Connect Cloudflare R2 in Plugins to enable R2 storage.
                  </span>
                ) : null}
              </label>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              onTypeFilterChange("all");
              onUsageFilterChange("all");
              onQueryChange("");
            }}
          >
            Reset all filters
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
});
