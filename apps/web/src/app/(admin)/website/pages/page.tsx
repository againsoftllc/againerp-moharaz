"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, Plus, RefreshCw, Settings2, Upload } from "lucide-react";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WebsiteManagedPage } from "@/lib/website/pages/types";
import type { WebsitePagesGridHandle } from "@/components/website/pages/website-pages-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useWebsitePages } from "@/lib/api/use-website-pages";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const WebsitePagesGrid = dynamic(
  () =>
    import("@/components/website/pages/website-pages-grid").then(
      (module) => module.WebsitePagesGrid,
    ),
  {
    ssr: false,
    loading: () => <ContentDataSkeleton label="Loading pages…" />,
  },
);

const WebsitePageFormDialog = dynamic(
  () =>
    import("@/components/website/pages/website-page-form-dialog").then(
      (module) => module.WebsitePageFormDialog,
    ),
  { ssr: false },
);

const WebsitePageViewDialog = dynamic(
  () =>
    import("@/components/website/pages/website-page-view-dialog").then(
      (module) => module.WebsitePageViewDialog,
    ),
  { ssr: false },
);

function buildPagesUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/website/pages?${query}` : "/website/pages";
}

function WebsitePagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pages, loading, error, refetch } = useWebsitePages();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const pagesGridRef = useRef<WebsitePagesGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editPage = useMemo(
    () => (editId ? pages.find((p) => p.id === editId) ?? null : null),
    [editId, pages],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "website-pages-api" });
    }
  }, [error]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildPagesUrl(params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (page: WebsiteManagedPage) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", page.id);
    });
  };

  const handleView = (page: WebsiteManagedPage) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", page.id);
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

  const handleSaved = () => {
    void refetch();
  };

  useEffect(() => {
    if (editId && !loading && !editPage) {
      toast.error("Page not found");
      closeForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only when missing
  }, [editId, editPage, loading]);

  const viewOpen = !!viewId && !createOpen && !editPage;

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Pages">
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
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => pagesGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {advancedFilterCount}
              </span>
            ) : null}
          </DropdownMenuItem>
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
      {error && !loading ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load pages from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-none"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <WebsitePagesGrid
          ref={pagesGridRef}
          pages={pages}
          loading={loading}
          onView={handleView}
          onEdit={handleEdit}
          onPagesChanged={() => void refetch()}
          onAdvancedFilterCountChange={setAdvancedFilterCount}
          headerLeftActions={headerLeftActions}
          className="min-h-0 flex-1"
        />
      )}

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add page"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {viewOpen && (
        <WebsitePageViewDialog
          open
          onOpenChange={(open) => {
            if (!open) closeView();
          }}
          pageId={viewId}
          onEdit={canWrite ? handleEdit : undefined}
        />
      )}

      {canWrite && (createOpen || !!editPage) && (
        <WebsitePageFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          page={editPage}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default function WebsitePagesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading pages…" />}>
        <WebsitePagesContent />
      </Suspense>
    </div>
  );
}
