"use client";

import {
  Check,
  FileText,
  Image as ImageIcon,
  Search,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaLibraryItem, MediaLibraryItemType } from "@/lib/mock-data/media-library";
import { getMediaFileStorage } from "@/lib/mock-data/media-library";
import {
  getMediaUsageCount,
  getMediaUsageRefs,
  useMediaUsageMap,
  type MediaUsageFilter,
} from "@/lib/media/media-usage";
import { getDocumentKindLabel } from "@/lib/media/safe-upload-types";
import { isTypeAllowedForPicker } from "@/lib/media/picker-accept";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MediaLibraryDetailPanel } from "@/components/media/media-library-detail-panel";
import { MediaLibraryUploadPanel } from "@/components/media/media-library-upload-panel";
import { MediaTileCover } from "@/components/media/media-tile-cover";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

export type MediaLibraryTab = "library" | "upload";

export type MediaLibraryMode = "single" | "multiple" | "replace";

type Props = {
  items: MediaLibraryItem[];
  query: string;
  onQueryChange: (query: string) => void;
  usageFilter?: MediaUsageFilter;
  onUsageFilterChange?: (filter: MediaUsageFilter) => void;
  activeTab: MediaLibraryTab;
  onTabChange: (tab: MediaLibraryTab) => void;
  selectedIds: string[];
  focusedId: string | null;
  onItemClick: (item: MediaLibraryItem) => void;
  onItemUpdate: (id: string, patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>) => void;
  onDelete?: (ids: string[]) => void;
  mode?: MediaLibraryMode;
  onUpload?: (files: FileList) => void;
  onImport?: (items: MediaLibraryItem[]) => void;
  accept?: MediaLibraryItemType[];
  compact?: boolean;
  hideToolbar?: boolean;
  /** more files on the server than `items` holds: scrolling to the end asks for the next page */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

/* tiles drawn at a time; scrolling near the end draws the next batch (drawing tens of thousands of tiles at once
   froze the browser) */
const TILE_BATCH = 60;

function typeIcon(type: MediaLibraryItemType) {
  if (type === "video") return Video;
  if (type === "document") return FileText;
  return ImageIcon;
}

export function MediaLibraryBrowser({
  items,
  query,
  onQueryChange,
  usageFilter = "all",
  onUsageFilterChange,
  activeTab,
  onTabChange,
  selectedIds,
  focusedId,
  onItemClick,
  onItemUpdate,
  mode = "multiple",
  onUpload,
  onImport,
  onDelete,
  accept,
  compact,
  hideToolbar = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: Props) {
  const canWrite = useAdminCanWrite();
  const focusedItem = items.find((item) => item.id === focusedId) ?? null;
  const usageMap = useMediaUsageMap();
  const [shown, setShown] = useState(TILE_BATCH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // a new search / filter starts again from the top
  useEffect(() => {
    setShown(TILE_BATCH);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [query, usageFilter, activeTab]);

  const visibleItems = items.slice(0, shown);
  const canShowMore = shown < items.length || hasMore;

  // near the end of the grid: draw the next batch, fetching the next page once the loaded ones are all drawn
  useEffect(() => {
    const end = endRef.current;
    if (!end || !canShowMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (shown < items.length) setShown((n) => n + TILE_BATCH);
        else if (hasMore && !loadingMore) onLoadMore?.();
      },
      { root: scrollRef.current, rootMargin: "400px 0px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [canShowMore, shown, items.length, hasMore, loadingMore, onLoadMore]);

  const focusedUsageCount = focusedItem ? getMediaUsageCount(usageMap, focusedItem.id) : 0;
  const focusedUsageRefs = focusedItem ? getMediaUsageRefs(usageMap, focusedItem.id) : [];

  const usageFilters: { id: MediaUsageFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "used", label: "Used" },
    { id: "unused", label: "Unused" },
  ];

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden", compact ? "gap-2" : "gap-3")}>
      {!hideToolbar && (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border pb-2">
        <div className="flex overflow-hidden rounded-none border border-border bg-muted/30 p-0.5 text-xs">
          {canWrite && (
            <button
              type="button"
              onClick={() => onTabChange("upload")}
              className={cn(
                "rounded-none px-3 py-1.5 transition-colors",
                activeTab === "upload"
                  ? "bg-background font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Upload files
            </button>
          )}
          <button
            type="button"
            onClick={() => onTabChange("library")}
            className={cn(
              "rounded-none px-3 py-1.5 transition-colors",
              activeTab === "library"
                ? "bg-background font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Media Library
          </button>
        </div>

        {activeTab === "library" && (
          <>
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 rounded-none pl-8 text-xs"
                placeholder="Search media…"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
              />
            </div>
            {onUsageFilterChange && (
              <div className="flex overflow-hidden rounded-none border border-border bg-muted/30 p-0.5 text-xs">
                {usageFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => onUsageFilterChange(filter.id)}
                    className={cn(
                      "rounded-none px-2.5 py-1.5 transition-colors",
                      usageFilter === filter.id
                        ? "bg-background font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {activeTab === "upload" && canWrite ? (
            <MediaLibraryUploadPanel
              onUploadFiles={onUpload}
              onImport={onImport}
              compact={compact}
            />
          ) : activeTab === "upload" ? null : items.length === 0 ? (
            <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-none border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
              {usageFilter === "unused"
                ? "No unused media — every file is referenced on the site."
                : usageFilter === "used"
                  ? "No used media found for this filter."
                  : "No media found. Upload new files or try a different search."}
            </div>
          ) : (
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              <div className="grid grid-cols-2 content-start items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleItems.map((item) => {
                const selected = selectedIds.includes(item.id);
                const focused = focusedId === item.id;
                const Icon = typeIcon(item.type);
                const usageCount = getMediaUsageCount(usageMap, item.id);
                const selectable = isTypeAllowedForPicker(item.type, accept);
                const fileStorage = getMediaFileStorage(item);
                const showFileStorageBadge =
                  item.provider !== "youtube" && item.provider !== "vimeo";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "group flex min-w-0 w-full flex-col overflow-hidden rounded-none border bg-card text-left transition",
                      !selectable && "opacity-75",
                      selected || focused
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-foreground/40",
                    )}
                  >
                    {/*
                      In-flow pt-[100%] spacer forces a square. aspect-ratio alone
                      collapses inside flex <button> when children are absolute / broken.
                    */}
                    <div className="relative w-full shrink-0 overflow-hidden bg-muted">
                      <div className="block w-full pt-[100%]" aria-hidden />

                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Icon className="h-8 w-8" />
                        {item.type === "document" && (
                          <span className="text-[10px] font-medium uppercase">
                            {getDocumentKindLabel(item.name, item.mimeType)}
                          </span>
                        )}
                      </div>

                      {(item.type === "image" || item.type === "video") ? (
                        <MediaTileCover item={item} />
                      ) : null}

                      <div className="absolute left-1 top-1 z-[2] flex max-w-[calc(100%-2rem)] flex-wrap gap-0.5">
                        {showFileStorageBadge ? (
                          <span
                            className={cn(
                              "rounded-none px-1 text-[9px] font-medium text-white",
                              fileStorage === "r2"
                                ? "bg-orange-600"
                                : fileStorage === "remote"
                                  ? "bg-sky-700"
                                  : "bg-slate-700",
                            )}
                          >
                            {fileStorage === "r2"
                              ? "R2"
                              : fileStorage === "remote"
                                ? "URL"
                                : "LOCAL"}
                          </span>
                        ) : null}
                        {item.folder === "Banners" && item.type === "image" ? (
                          <span className="rounded-none bg-amber-600 px-1 text-[9px] font-medium text-white">
                            BANNER
                          </span>
                        ) : null}
                        {item.type === "document" ? (
                          <span className="rounded-none bg-black/70 px-1 text-[9px] font-medium text-white">
                            {getDocumentKindLabel(item.name, item.mimeType)}
                          </span>
                        ) : null}
                        {item.provider === "youtube" ? (
                          <span className="rounded-none bg-red-600 px-1 text-[9px] font-medium text-white">
                            YOUTUBE
                          </span>
                        ) : null}
                        {item.type === "video" && item.provider !== "youtube" ? (
                          <span className="rounded-none bg-black/70 px-1 text-[9px] font-medium text-white">
                            VIDEO
                          </span>
                        ) : null}
                      </div>

                      <div className="absolute bottom-1 left-1 z-[2] flex flex-wrap gap-0.5">
                        {item.importedBy === "url" ? (
                          <span className="rounded-none bg-sky-600 px-1 text-[9px] font-medium text-white">
                            URL
                          </span>
                        ) : null}
                        {item.importedBy === "ai" ? (
                          <span className="rounded-none bg-violet-600 px-1 text-[9px] font-medium text-white">
                            AI
                          </span>
                        ) : null}
                      </div>

                      <span
                        className={cn(
                          "absolute right-1 top-1 z-[2] rounded-none px-1.5 py-0.5 text-[9px] font-semibold leading-none",
                          usageCount > 0
                            ? "bg-emerald-600 text-white"
                            : "bg-muted-foreground/90 text-white",
                        )}
                      >
                        {usageCount > 0 ? `${usageCount}×` : "0"}
                      </span>

                      <span
                        className={cn(
                          "absolute bottom-1 right-1 z-[2] flex h-5 w-5 items-center justify-center border-2 bg-background transition",
                          !selectable && "hidden",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border opacity-0 group-hover:opacity-100",
                          "rounded-none",
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>

                      {!selectable && (
                        <span className="absolute bottom-1 right-1 z-[2] rounded-none bg-amber-600 px-1 text-[8px] font-medium text-white">
                          SAVED
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 border-t border-border px-1.5 py-1.5">
                      <p className="truncate text-[11px] font-medium leading-tight text-foreground">
                        {item.title || item.name}
                      </p>
                    </div>
                  </button>
                );
              })}
              </div>
              {canShowMore ? (
                <div ref={endRef} className="py-3 text-center text-xs text-muted-foreground">
                  {loadingMore ? "Loading more…" : " "}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <aside className="flex min-h-0 w-56 shrink-0 flex-col overflow-hidden border-l border-border pl-3 sm:w-72">
          <div className="shrink-0">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Attachment details
            </p>
            <p className="mb-2 px-1 text-[10px] text-muted-foreground">Actual ratio preview</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <MediaLibraryDetailPanel
              item={focusedItem}
              usageCount={focusedUsageCount}
              usageRefs={focusedUsageRefs}
              onUpdate={canWrite ? (patch) => {
                if (!focusedItem) return;
                onItemUpdate(focusedItem.id, patch);
              } : undefined}
              onDelete={canWrite && onDelete ? (id) => onDelete([id]) : undefined}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
