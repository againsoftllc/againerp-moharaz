"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MousePointerClick, Plus, RefreshCw, Settings2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BundleGridHandle } from "@/components/bundles/bundle-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import type { ProductBundle } from "@/lib/mock-data/bundles";
import { useBundleStore } from "@/lib/store/bundle-store";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";

const BundleGrid = dynamic(
  () => import("@/components/bundles/bundle-grid").then((module) => module.BundleGrid),
  {
    ssr: false,
    loading: () => <ContentDataSkeleton label="Loading bundles…" />,
  },
);

const BundleFormDialog = dynamic(
  () =>
    import("@/components/bundles/bundle-form-dialog").then(
      (module) => module.BundleFormDialog,
    ),
  { ssr: false },
);

const BundleViewDrawer = dynamic(
  () =>
    import("@/components/bundles/bundle-view-drawer").then(
      (module) => module.BundleViewDrawer,
    ),
  { ssr: false },
);

function buildBundlesUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/website/bundles?${query}` : "/website/bundles";
}

function BundleListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bundles = useBundleStore((s) => s.bundles);
  const upsertBundle = useBundleStore((s) => s.upsertBundle);
  const loadBundles = useBundleStore((s) => s.loadBundles);
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<BundleGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [gridKey, setGridKey] = useState(0);

  useEffect(() => {
    void loadBundles();
  }, [loadBundles]);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editBundle = useMemo(
    () => (editId ? bundles.find((b) => b.id === editId) ?? null : null),
    [editId, bundles],
  );
  const viewBundle = useMemo(
    () => (viewId ? bundles.find((b) => b.id === viewId) ?? null : null),
    [viewId, bundles],
  );

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildBundlesUrl(params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (bundle: ProductBundle) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", bundle.id);
    });
  };

  const handleView = (bundle: ProductBundle) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", bundle.id);
    });
  };

  const closeForm = () => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
    });
  };

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  const closeView = () => {
    pushParams((params) => {
      params.delete("view");
    });
  };

  useEffect(() => {
    if (editId && !editBundle) {
      toast.error("Bundle not found");
      closeForm();
    }
  }, [editId, editBundle]);

  useEffect(() => {
    if (viewId && !viewBundle && !editId && !createOpen) {
      toast.error("Bundle not found");
      closeView();
    }
  }, [viewId, viewBundle, editId, createOpen]);

  // the drawer stays open (with what was typed) when the save fails
  const handleSave = async (data: Partial<ProductBundle>) => {
    try {
      if (createOpen) {
        await upsertBundle(data);
        toast.success(data.status === "published" ? "Bundle created — it's on the website" : "Bundle created as a draft");
      } else if (editBundle) {
        await upsertBundle({ id: editBundle.id, ...data });
        toast.success("Bundle updated");
      }
      setGridKey((k) => k + 1);
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the bundle");
    }
  };

  const refetch = () => {
    setGridKey((k) => k + 1);
    apiHealth.recheck();
    toast.message("Bundles refreshed");
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Bundles">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
          New
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
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={refetch}>
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          {canWrite ? (
            <DropdownMenuItem onClick={() => gridRef.current?.openLiveEdit()}>
              <MousePointerClick className="mr-1.5 h-3 w-3" />
              Live edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            <Upload className="mr-1.5 h-3 w-3" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <BundleGrid
        key={gridKey}
        ref={gridRef}
        onView={handleView}
        onEdit={canWrite ? handleEdit : undefined}
        onAdvancedFilterCountChange={setAdvancedFilterCount}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add bundle"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <BundleViewDrawer
        open={!!viewBundle && !createOpen && !editBundle}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        bundle={viewBundle}
        onEdit={canWrite ? handleEdit : undefined}
      />

      {canWrite && (createOpen || !!editBundle) && (
        <BundleFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          bundle={editBundle}
          onSave={(d) => void handleSave(d)}
        />
      )}
    </div>
  );
}

export default function BundlesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading bundles…" />}>
        <BundleListContent />
      </Suspense>
    </div>
  );
}
