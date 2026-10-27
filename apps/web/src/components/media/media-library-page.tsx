"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cloud, HardDrive, MoreHorizontal, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { MediaLibraryPanel } from "@/components/media/media-library-panel";
import {
  filterMediaLibraryItems,
  getMediaFileStorage,
  type MediaLibraryItem,
  type MediaLibraryItemType,
} from "@/lib/mock-data/media-library";
import { filterByMediaUsage, useMediaUsageMap, type MediaUsageFilter } from "@/lib/media/media-usage";
import { filterSafeUploadFiles } from "@/lib/media/safe-upload-types";
import { useMediaStore } from "@/lib/store/media-store";
import {
  useCatalogMedia,
  createCatalogMediaBatch,
  deleteCatalogMediaItem,
  deleteCatalogMediaBulk,
  migrateCatalogMedia,
  patchCatalogMediaItem,
  uploadCatalogMediaFiles,
} from "@/lib/api/use-catalog-media";
import { useCloudflarePlugin, updateCloudflarePlugin } from "@/lib/api/use-cloudflare-plugin";
import {
  cloudflareStorageLabel,
  isCloudflarePluginActive,
  isCloudflareR2Configured,
} from "@/lib/plugins/cloudflare";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useModuleSettings } from "@/lib/workspace/use-module-settings";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

type MediaLibraryPageProps = {
  /** Footer label next to refresh (default: Media). */
  title?: string;
};

function parseMediaType(raw: string | null): "all" | MediaLibraryItemType {
  if (raw === "image" || raw === "video" || raw === "document") return raw;
  return "all";
}

function MediaLibraryPageContent({ title = "Media" }: MediaLibraryPageProps) {
  const canWrite = useAdminCanWrite();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeFromUrl = parseMediaType(searchParams.get("type"));
  const { items, total, loading, loadingMore, hasMore, error, refetch, loadMore, mergeItems } = useCatalogMedia();
  const { plugin: cloudflarePlugin, refetch: refetchCloudflare } = useCloudflarePlugin();
  const apiHealth = useApiHealth();
  const setItems = useMediaStore((state) => state.setItems);
  const prependStoreItems = useMediaStore((state) => state.prependItems);
  const patchMediaItemLocal = useMediaStore((state) => state.patchMediaItem);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MediaLibraryItemType>(typeFromUrl);
  const [usageFilter, setUsageFilter] = useState<MediaUsageFilter>("all");
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [savingStorage, setSavingStorage] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Media settings → "Default library tab" applies when the URL doesn't pick a type.
  const hasTypeParam = searchParams.has("type");
  const { values: mediaSettings, loaded: mediaSettingsLoaded } = useModuleSettings("media");
  const defaultType = parseMediaType(String(mediaSettings.defaultType ?? "all"));
  useEffect(() => {
    if (hasTypeParam) setTypeFilter(typeFromUrl);
    else if (mediaSettingsLoaded) setTypeFilter(defaultType);
  }, [hasTypeParam, typeFromUrl, mediaSettingsLoaded, defaultType]);

  const handleTypeFilterChange = (next: "all" | MediaLibraryItemType) => {
    setTypeFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("type");
    else params.set("type", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const r2Available = isCloudflareR2Configured(cloudflarePlugin);
  const storageTarget =
    r2Available && cloudflarePlugin?.mediaStorage === "r2" ? "r2" : "local";

  const handleStorageTargetChange = async (next: "local" | "r2") => {
    if (!canWrite || savingStorage) return;
    if (next === "r2" && !r2Available) {
      toast.error("Connect Cloudflare R2 before switching storage");
      return;
    }
    if (next === storageTarget) return;

    setSavingStorage(true);
    try {
      await updateCloudflarePlugin({ mediaStorage: next });
      await refetchCloudflare();
      toast.success(
        next === "r2"
          ? "New uploads will go to Cloudflare R2"
          : "New uploads will go to local storage",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update storage");
    } finally {
      setSavingStorage(false);
    }
  };

  const handleMigrate = async (ids: string[], target: "local" | "r2") => {
    if (!canWrite || migrating || !ids.length) return;
    if (target === "r2" && !r2Available) {
      toast.error("Connect Cloudflare R2 before migrating");
      return;
    }

    const selected = items.filter((item) => ids.includes(item.id));
    const actionable = selected.filter((item) => {
      if (item.provider === "youtube" || item.provider === "vimeo") return false;
      const storage = getMediaFileStorage(item);
      return target === "r2" ? storage !== "r2" : storage === "r2";
    });

    if (!actionable.length) {
      toast.message(
        target === "r2"
          ? "No non-R2 files in selection to move"
          : "No R2 files in selection to move to local",
      );
      return;
    }

    const label = target === "r2" ? "Cloudflare R2" : "local storage";
    const confirmed = window.confirm(
      `Move ${actionable.length} file${actionable.length === 1 ? "" : "s"} to ${label}?`,
    );
    if (!confirmed) return;

    setMigrating(true);
    try {
      const result = await migrateCatalogMedia(
        actionable.map((item) => item.id),
        target,
        actionable,
      );
      if (result.moved > 0) {
        toast.success(
          `Moved ${result.moved} file${result.moved === 1 ? "" : "s"} to ${label}`,
        );
      }
      if (result.skipped > 0 && result.moved === 0 && result.failed === 0) {
        toast.message(`Nothing to move (${result.skipped} skipped)`);
      }
      if (result.failed > 0) {
        toast.error(
          result.errors[0] ||
            `Failed to move ${result.failed} file${result.failed === 1 ? "" : "s"}`,
        );
      }
      void refetch({ query, type: serverType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  useEffect(() => {
    if (!canWrite && activeTab === "upload") {
      setActiveTab("library");
    }
  }, [canWrite, activeTab]);

  useEffect(() => {
    if (items.length) setItems(items);
  }, [items, setItems]);

  // search and type filter run on the server: the grid holds only the pages loaded so far
  const serverType = typeFilter === "all" ? undefined : typeFilter;
  const searchedOnce = useRef(false);
  useEffect(() => {
    if (!searchedOnce.current && !query.trim() && !serverType) return; // the hook's own first load covers this
    searchedOnce.current = true;
    const timer = setTimeout(() => void refetch({ query, type: serverType, soft: true }), 300);
    return () => clearTimeout(timer);
  }, [query, serverType, refetch]);

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-media-api" });
    }
  }, [error]);

  const usageMap = useMediaUsageMap();

  const filtered = useMemo(() => {
    const searched = filterMediaLibraryItems(items, {
      query,
      types: typeFilter === "all" ? undefined : [typeFilter],
    });
    return filterByMediaUsage(searched, usageMap, usageFilter);
  }, [items, query, typeFilter, usageMap, usageFilter]);

  const handleItemClick = (item: MediaLibraryItem) => {
    setFocusedId(item.id);
    setSelectedIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    );
  };

  const applyImportedItems = (imported: MediaLibraryItem[]) => {
    setActiveTab("library");
    if (imported.length) {
      mergeItems(imported);
      prependStoreItems(imported);
    }
    if (imported[0]) {
      setFocusedId(imported[0].id);
      setSelectedIds([imported[0].id]);
    }
    void refetch({ query, type: serverType, soft: true });
  };

  const handleUpload = async (files: FileList) => {
    const { allowed, rejected } = filterSafeUploadFiles(files);
    if (rejected.length) {
      toast.error(
        `${rejected.length} file${rejected.length === 1 ? "" : "s"} blocked — unsafe file type.`,
      );
    }
    if (!allowed.length) return;

    try {
      const uploaded = await uploadCatalogMediaFiles(allowed);
      toast.success(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`);
      applyImportedItems(uploaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleImport = async (imported: MediaLibraryItem[]) => {
    try {
      const saved = await createCatalogMediaBatch(imported);
      toast.success(`Imported ${saved.length} item${saved.length === 1 ? "" : "s"}`);
      applyImportedItems(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} file${ids.length === 1 ? "" : "s"}? This will also remove them from Cloudflare R2.`,
    );
    if (!confirmed) return;
    try {
      if (ids.length === 1) {
        await deleteCatalogMediaItem(ids[0]);
      } else {
        await deleteCatalogMediaBulk(ids);
      }
      toast.success(`Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}`);
      setSelectedIds([]);
      setFocusedId(null);
      void refetch({ query, type: serverType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleItemUpdate = async (
    id: string,
    patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>,
  ) => {
    try {
      const updated = await patchCatalogMediaItem(id, patch);
      patchMediaItemLocal(id, {
        name: updated.name,
        title: updated.title,
        alt: updated.alt,
      });
      void refetch({ query, type: serverType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const headerLeftActions = (
    <>
      {isCloudflarePluginActive(cloudflarePlugin) && (
        <Badge variant="outline" className="hidden gap-1 rounded-none lg:inline-flex">
          {cloudflarePlugin?.mediaStorage === "r2" ? (
            <Cloud className="h-3 w-3 text-orange-500" />
          ) : (
            <HardDrive className="h-3 w-3" />
          )}
          {cloudflareStorageLabel(cloudflarePlugin)}
        </Badge>
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          void refetch({ query, type: serverType });
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh media (API/DB ${apiHealth.status})`}
        title={
          apiHealth.status === "connected"
            ? "API and database connected"
            : apiHealth.status === "partial"
              ? "API connected, database not connected"
              : apiHealth.status === "disconnected"
                ? "API/database not connected"
                : "Checking connection…"
        }
        className={cn(
          "h-9 w-9 rounded-none",
          apiHealth.status === "connected" &&
            "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400",
          apiHealth.status === "partial" &&
            "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400",
          apiHealth.status === "disconnected" &&
            "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-700 dark:text-red-400",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-none" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isCloudflarePluginActive(cloudflarePlugin) ? (
            <DropdownMenuItem asChild>
              <Link href="/workspace/plugins/cloudflare">Cloudflare settings</Link>
            </DropdownMenuItem>
          ) : null}
          {canWrite && selectedIds.length > 0 && r2Available ? (
            <DropdownMenuItem
              disabled={migrating}
              onClick={() => void handleMigrate(selectedIds, "r2")}
            >
              <Cloud className="mr-2 h-3.5 w-3.5" />
              Move selected to R2
            </DropdownMenuItem>
          ) : null}
          {canWrite && selectedIds.length > 0 ? (
            <DropdownMenuItem
              disabled={migrating}
              onClick={() => void handleMigrate(selectedIds, "local")}
            >
              <HardDrive className="mr-2 h-3.5 w-3.5" />
              Move selected to Local
            </DropdownMenuItem>
          ) : null}
          {canWrite && selectedIds.length > 0 ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void handleDelete(selectedIds)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete selected ({selectedIds.length})
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canWrite ? (
        <Button
          size="sm"
          className="h-9 rounded-none"
          onClick={() => setActiveTab("upload")}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload files
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && !loading ? (
        <div className="m-3 rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load media from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <MediaLibraryPanel
          title={title || "Media"}
          items={filtered}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          query={query}
          onQueryChange={setQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={handleTypeFilterChange}
          usageFilter={usageFilter}
          onUsageFilterChange={setUsageFilter}
          storageTarget={storageTarget}
          onStorageTargetChange={(next) => void handleStorageTargetChange(next)}
          r2Available={r2Available}
          storageDisabled={!canWrite || savingStorage}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedIds={selectedIds}
          focusedId={focusedId}
          onItemClick={handleItemClick}
          onItemUpdate={handleItemUpdate}
          onDelete={canWrite ? (ids) => void handleDelete(ids) : undefined}
          onMigrateToR2={
            canWrite && r2Available ? (ids) => void handleMigrate(ids, "r2") : undefined
          }
          onMigrateToLocal={canWrite ? (ids) => void handleMigrate(ids, "local") : undefined}
          migrateDisabled={migrating}
          onUpload={canWrite ? (files) => void handleUpload(files) : undefined}
          onImport={canWrite ? (imported) => void handleImport(imported) : undefined}
          loading={loading}
          total={total}
          onClearSelection={() => setSelectedIds([])}
          headerLeftActions={headerLeftActions}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}

/** Shared Media Library screen — used by `/workspace/media` and `/hrm/media-library`. */
export function MediaLibraryPage({ title = "Media" }: MediaLibraryPageProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading media…" />}>
        <MediaLibraryPageContent title={title} />
      </Suspense>
    </div>
  );
}
