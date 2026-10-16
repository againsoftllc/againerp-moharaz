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
import type { AttributeProfileGridHandle } from "@/components/attributes/attribute-profile-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import type { AttributeProfile } from "@/lib/mock-data/attribute-profiles";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";

const AttributeProfileGrid = dynamic(
  () =>
    import("@/components/attributes/attribute-profile-grid").then(
      (module) => module.AttributeProfileGrid,
    ),
  {
    ssr: false,
    loading: () => <ContentDataSkeleton label="Loading attributes…" />,
  },
);

const AttributeProfileFormDialog = dynamic(
  () =>
    import("@/components/attributes/attribute-profile-form-dialog").then(
      (module) => module.AttributeProfileFormDialog,
    ),
  { ssr: false },
);

const AttributeProfileViewSheet = dynamic(
  () =>
    import("@/components/attributes/attribute-profile-view-sheet").then(
      (module) => module.AttributeProfileViewSheet,
    ),
  { ssr: false },
);

function buildAttributesUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/website/attributes?${query}` : "/website/attributes";
}

function AttributeListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, groups, attributes, loading, error, refetch } = useCatalogAttributeProfiles();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<AttributeProfileGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editProfile = useMemo(
    () => (editId ? profiles.find((p) => p.id === editId) ?? null : null),
    [editId, profiles],
  );
  const viewProfile = useMemo(
    () => (viewId ? profiles.find((p) => p.id === viewId) ?? null : null),
    [viewId, profiles],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-attributes-api" });
    }
  }, [error]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildAttributesUrl(params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (profile: AttributeProfile) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", profile.id);
    });
  };

  const handleView = (profile: AttributeProfile) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", profile.id);
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
    if (editId && !loading && !editProfile) {
      toast.error("Profile not found");
      closeForm();
    }
  }, [editId, editProfile, loading]);

  useEffect(() => {
    if (viewId && !viewProfile && !editId && !createOpen && !loading) {
      toast.error("Profile not found");
      closeView();
    }
  }, [viewId, viewProfile, editId, createOpen, loading]);

  const handleSaved = () => {
    void refetch();
    closeForm();
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
    <ListGridHeaderStart title="Attributes">
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
      {error && !loading ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load attributes from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ensure FastAPI is running:{" "}
            <code className="rounded-none bg-muted px-1">uvicorn main:app --port 8000</code>
          </p>
          <Button variant="outline" size="sm" className="mt-3 rounded-none" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <AttributeProfileGrid
          ref={gridRef}
          profiles={profiles}
          groups={groups}
          attributes={attributes}
          loading={loading}
          onProfilesChanged={() => void refetch()}
          onView={handleView}
          onEdit={handleEdit}
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
          aria-label="Add attribute profile"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <AttributeProfileViewSheet
        open={!!viewProfile && !createOpen && !editProfile}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        profile={viewProfile}
        groups={groups}
        attributes={attributes}
        onEdit={canWrite ? handleEdit : undefined}
      />

      {canWrite && (createOpen || !!editProfile) && (
        <AttributeProfileFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          profile={editProfile}
          groups={groups}
          attributes={attributes}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default function AttributesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading attributes…" />}>
        <AttributeListContent />
      </Suspense>
    </div>
  );
}
