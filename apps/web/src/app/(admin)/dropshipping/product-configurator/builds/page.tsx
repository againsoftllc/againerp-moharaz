"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { ConfiguratorBuildsList } from "@/components/configurator/admin/configurator-builds-list";
import { ConfiguratorBuildDetailSheet } from "@/components/configurator/admin/configurator-build-detail-sheet";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import type { SavedBuild } from "@/lib/configurator/types";
import { useConfiguratorBuilds } from "@/lib/api/use-configurator-builds";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

function BuildsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator/builds`;
  const { builds, total, loading, error, refetch } = useConfiguratorBuilds();

  const buildUrl = (params: URLSearchParams) => {
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };

  const viewId = searchParams.get("view");

  const viewingBuild = useMemo(
    () => (viewId ? builds.find((b) => b.id === viewId) ?? null : null),
    [viewId, builds],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "configurator-builds-api" });
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const handleView = (build: SavedBuild) =>
    pushParams((p) => {
      p.set("view", build.id);
    });

  const closeDetail = () =>
    pushParams((p) => {
      p.delete("view");
    });

  useEffect(() => {
    if (viewId && !loading && !viewingBuild) {
      toast.error("Build not found");
      closeDetail();
    }
  }, [viewId, viewingBuild, loading]);

  return (
    <ConfiguratorAdminPage
      section="Saved Builds"
      title="Saved Builds"
      count={loading ? undefined : total}
      description="Customer and guest configurations — compatibility status, order conversion, audit history."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ApiConnectionBadge loading={loading} error={error} productCount={total} />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ConfiguratorBuildsList
        builds={builds}
        loading={loading}
        onBuildsChanged={() => void refetch()}
        onView={handleView}
      />

      <ConfiguratorBuildDetailSheet
        open={!!viewingBuild}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        build={viewingBuild}
      />
    </ConfiguratorAdminPage>
  );
}

export default function ConfiguratorBuildsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading builds…</div>}>
      <BuildsContent />
    </Suspense>
  );
}
