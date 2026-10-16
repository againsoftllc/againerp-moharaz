"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  createUploadedMediaItemsFromFiles,
  filterMediaLibraryItems,
  type MediaLibraryItem,
  type MediaLibraryItemType,
} from "@/lib/mock-data/media-library";
import { filterByMediaUsage, useMediaUsageMap, type MediaUsageFilter } from "@/lib/media/media-usage";
import { describeAcceptTypes, isTypeAllowedForPicker } from "@/lib/media/picker-accept";
import { filterSafeUploadFiles } from "@/lib/media/safe-upload-types";
import { useMediaStore } from "@/lib/store/media-store";
import { useCatalogMedia } from "@/lib/api/use-catalog-media";
import { apiFetch } from "@/lib/api/client";
import { apiMediaToItem, type ApiMediaListResponse } from "@/lib/api/catalog-media";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MediaLibraryBrowser,
  type MediaLibraryMode,
  type MediaLibraryTab,
} from "@/components/media/media-library-browser";

export type { MediaLibraryMode };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (items: MediaLibraryItem[]) => void;
  mode?: MediaLibraryMode;
  title?: string;
  accept?: MediaLibraryItemType[];
  initialSelectedIds?: string[];
  /** When set, use these items instead of the local media store (API-backed). */
  items?: MediaLibraryItem[];
  /** Persist uploads to API (e.g. product form with useCatalogMedia). */
  onUploadFiles?: (files: File[]) => Promise<MediaLibraryItem[]>;
  onImportItems?: (items: MediaLibraryItem[]) => Promise<MediaLibraryItem[]>;
};

export function MediaLibraryModal({
  open,
  onOpenChange,
  onSelect,
  mode = "multiple",
  title = "Add Media",
  accept,
  initialSelectedIds = [],
  items: itemsProp,
  onUploadFiles,
  onImportItems,
}: Props) {
  const storeItems = useMediaStore((state) => state.items);
  /* The grid pages through the library on the server as it scrolls (the whole library at once froze the
     browser); the caller's / store's items only help find what is already selected. */
  const media = useCatalogMedia();
  const items = media.items;
  // the files already chosen when the picker opened (a product's own images …): shown first in the grid
  const [initialItems, setInitialItems] = useState<MediaLibraryItem[]>([]);
  const knownItems = useMemo(() => {
    const seen = new Set(items.map((item) => item.id));
    const extra = [...initialItems, ...(itemsProp ?? storeItems)].filter((item) => !seen.has(item.id) && !!seen.add(item.id));
    return [...items, ...extra];
  }, [items, initialItems, itemsProp, storeItems]);
  const prependItems = useMediaStore((state) => state.prependItems);
  const patchMediaItem = useMediaStore((state) => state.patchMediaItem);

  const [query, setQuery] = useState("");
  const [usageFilter, setUsageFilter] = useState<MediaUsageFilter>("all");
  const [activeTab, setActiveTab] = useState<MediaLibraryTab>("library");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Reset state when dialog opens. We capture initialSelectedIds at open-time only,
  // so we intentionally exclude it from the dependency array to avoid infinite loops
  // when the caller passes a new array literal on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    setSelectedIds(initialSelectedIds);
    setQuery("");
    setUsageFilter("all");
    setActiveTab("library");
    setFocusedId(initialSelectedIds[0] ?? null);
    setPinnedIds([]);
  }, [open]);

  /* They may lie far down the library, outside the pages loaded so far, so they are asked for by id. */
  const initialKey = initialSelectedIds.join(",");
  useEffect(() => {
    if (!open || !initialKey) {
      setInitialItems([]);
      return;
    }
    let cancelled = false;
    const order = initialKey.split(",");
    apiFetch<ApiMediaListResponse>(`/api/v1/media?ids=${encodeURIComponent(initialKey)}`, { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        const byId = new Map(res.data.map((row) => [row.id, apiMediaToItem(row)]));
        setInitialItems(order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])));
      })
      .catch(() => {
        if (!cancelled) setInitialItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialKey]);

  // only a picker for one kind of file can let the server filter by it
  const serverType = accept?.length === 1 ? accept[0] : undefined;
  const { refetch: refetchMedia } = media;
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void refetchMedia({ query, type: serverType, soft: true }), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, query, serverType, refetchMedia]);

  const usageMap = useMediaUsageMap();

  const filtered = useMemo(() => {
    // the files chosen on opening lead (still subject to the search / filters), then the rest of the library
    const lead = filterByMediaUsage(
      filterMediaLibraryItems(initialItems, { query, types: accept }),
      usageMap,
      usageFilter,
    );
    const leadIds = new Set(lead.map((item) => item.id));
    const searched = filterMediaLibraryItems(items, { query, types: accept }).filter((item) => !leadIds.has(item.id));
    const usageFiltered = [...lead, ...filterByMediaUsage(searched, usageMap, usageFilter)];

    if (!accept?.length || !pinnedIds.length) return usageFiltered;

    const pinned = knownItems.filter(
      (item) =>
        pinnedIds.includes(item.id) &&
        !usageFiltered.some((entry) => entry.id === item.id),
    );

    return [...pinned, ...usageFiltered];
  }, [items, initialItems, knownItems, query, accept, usageMap, usageFilter, pinnedIds]);

  const selectedItems = useMemo(
    () =>
      knownItems.filter(
        (item) =>
          selectedIds.includes(item.id) && isTypeAllowedForPicker(item.type, accept),
      ),
    [knownItems, selectedIds, accept],
  );

  const handleItemClick = (item: MediaLibraryItem) => {
    setFocusedId(item.id);

    if (!isTypeAllowedForPicker(item.type, accept)) {
      return;
    }

    setSelectedIds((prev) => {
      const isSelected = prev.includes(item.id);
      if (mode === "single" || mode === "replace") {
        return isSelected ? [] : [item.id];
      }
      return isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id];
    });
  };

  const applyImportedItems = (imported: MediaLibraryItem[]) => {
    if (!imported.length) return;

    prependItems(imported);
    media.mergeItems(imported);

    const selectable = accept?.length
      ? imported.filter((item) => accept.includes(item.type))
      : imported;
    const savedOnly = accept?.length
      ? imported.filter((item) => !accept.includes(item.type))
      : [];

    if (savedOnly.length) {
      setPinnedIds((prev) => [
        ...savedOnly.map((item) => item.id),
        ...prev.filter((id) => !savedOnly.some((item) => item.id === id)),
      ]);
      toast.success(
        savedOnly.length === 1
          ? `${savedOnly[0].name} saved to Media Library`
          : `${savedOnly.length} files saved to Media Library`,
        {
          description: `This picker accepts ${describeAcceptTypes(accept)} only. Open Media page to use documents here.`,
        },
      );
    }

    setActiveTab("library");

    if (selectable.length) {
      setFocusedId(selectable[0].id);
      setSelectedIds((prev) => {
        const newIds = selectable.map((item) => item.id);
        if (mode === "single" || mode === "replace") return [selectable[0].id];
        return [...prev, ...newIds];
      });
      if (!savedOnly.length) {
        toast.success(
          `${selectable.length} file${selectable.length === 1 ? "" : "s"} added to Media Library`,
        );
      }
    } else if (savedOnly.length) {
      setFocusedId(savedOnly[0].id);
      setSelectedIds([]);
    }
  };

  const handleUpload = async (files: FileList) => {
    const { allowed, rejected } = filterSafeUploadFiles(files);
    if (rejected.length) {
      toast.error(
        `${rejected.length} file${rejected.length === 1 ? "" : "s"} blocked — unsafe file type.`,
      );
    }
    if (!allowed.length) return;

    if (onUploadFiles) {
      setUploading(true);
      try {
        const uploaded = await onUploadFiles(allowed);
        applyImportedItems(uploaded);
        toast.success(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
      return;
    }

    const { items: uploaded, rejected: localRejected } = createUploadedMediaItemsFromFiles(files);
    if (localRejected.length) {
      toast.error(
        `${localRejected.length} file${localRejected.length === 1 ? "" : "s"} blocked — unsafe file type.`,
      );
    }
    if (uploaded.length) applyImportedItems(uploaded);
  };

  const handleImport = async (imported: MediaLibraryItem[]) => {
    if (onImportItems) {
      setUploading(true);
      try {
        const saved = await onImportItems(imported);
        applyImportedItems(saved);
        toast.success(`Imported ${saved.length} item${saved.length === 1 ? "" : "s"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      } finally {
        setUploading(false);
      }
      return;
    }
    applyImportedItems(imported);
  };

  const handleInsert = () => {
    if (!selectedItems.length) return;
    onSelect(selectedItems);
    onOpenChange(false);
  };

  const insertLabel =
    mode === "single" || mode === "replace"
      ? accept?.includes("document") && !accept.includes("image")
        ? "Set file"
        : "Set image"
      : selectedItems.length
        ? `Insert (${selectedItems.length})`
        : "Insert";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-media-library-modal="" className="fixed inset-0 z-[360] bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-media-library-modal=""
          className="fixed left-1/2 top-1/2 z-[360] flex h-[min(88vh,720px)] w-[min(96vw,980px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-none border border-input bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-input px-4 py-3">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
            <MediaLibraryBrowser
              items={filtered}
              query={query}
              onQueryChange={setQuery}
              usageFilter={usageFilter}
              onUsageFilterChange={setUsageFilter}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              selectedIds={selectedIds}
              focusedId={focusedId}
              onItemClick={handleItemClick}
              onItemUpdate={patchMediaItem}
              mode={mode}
              onUpload={handleUpload}
              onImport={handleImport}
              accept={accept}
              compact
              hasMore={media.hasMore}
              loadingMore={media.loadingMore}
              onLoadMore={() => void media.loadMore()}
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-input px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {selectedItems.length
                ? `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} selected`
                : accept?.length
                  ? `Select ${describeAcceptTypes(accept)} · uploads always save to library`
                  : "Select media, edit details on the right, then insert"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={!selectedItems.length} onClick={handleInsert}>
                {insertLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
