"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Filter, RefreshCcwDot, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import type { SeoUrlGridHandle } from "@/components/seo/seo-url-grid";
import { SeoStatBar } from "@/components/seo/seo-stat-bar";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { fetchSeoUrls, syncSeoUrls, type ApiSeoUrl, type ApiSeoUrlMeta } from "@/lib/api/seo-urls";
import { cn } from "@/lib/utils";

const SeoUrlGrid = dynamic(
  () => import("@/components/seo/seo-url-grid").then((m) => m.SeoUrlGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SeoUrlsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<SeoUrlGridHandle>(null);
  const [urls, setUrls] = useState<ApiSeoUrl[]>([]);
  const [meta, setMeta] = useState<ApiSeoUrlMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterCount, setFilterCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSeoUrls();
      setUrls(res.data);
      setMeta(res.meta);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load URLs");
      setUrls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await syncSeoUrls();
      toast.success(
        res.synced === 0
          ? "Already up to date"
          : `${res.synced} URL${res.synced === 1 ? "" : "s"} updated`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="URLs">
      {canWrite ? (
        <Button size="sm" className="rounded-none" disabled={syncing} onClick={resync}>
          <RefreshCcwDot className={cn("mr-1 h-3 w-3", syncing && "animate-spin")} /> Resync
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void load();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" /> Filters
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" /> Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {meta && (
        <SeoStatBar
          stats={[
            { label: "URLs", value: String(meta.count) },
            { label: "Active", value: String(meta.active_count) },
            { label: "No-index", value: String(meta.noindex_count) },
            { label: "Redirect", value: String(meta.redirect_count) },
            { label: "Draft", value: String(meta.draft_count) },
          ]}
        />
      )}
      <SeoUrlGrid
        ref={gridRef}
        urls={urls}
        loading={loading}
        onChanged={load}
        onFilterCountChange={handleFilterCount}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
