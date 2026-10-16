"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MoreHorizontal, MousePointerClick, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AttributeProfileGrid,
  type AttributeProfileGridHandle,
} from "@/components/attributes/attribute-profile-grid";
import { AttributeProfileFormDialog } from "@/components/attributes/attribute-profile-form-dialog";
import { AttributeProfileViewSheet } from "@/components/attributes/attribute-profile-view-sheet";
import type { AttributeProfile } from "@/lib/mock-data/attribute-profiles";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/dropshipping/attributes?${q}` : "/dropshipping/attributes";
}

function AttributeListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, groups, attributes, loading, error, refetch } =
    useCatalogAttributeProfiles();
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

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.delete("view");
      p.set("create", "1");
    });

  const handleEdit = (profile: AttributeProfile) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("view");
      p.set("edit", profile.id);
    });

  const handleView = (profile: AttributeProfile) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
      p.set("view", profile.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  const closeView = () => pushParams((p) => p.delete("view"));

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

  const headerLeftActions = (
    <ListGridHeaderStart title="Attributes">
      {canWrite ? (
        <Button size="sm" onClick={openCreate}>
      New
    </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium">Attributes</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh attributes (API/DB ${apiHealth.status})`}
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
      <Button
        variant="outline"
        size="icon"
        className="relative h-7 w-7"
        onClick={() => gridRef.current?.openFilters()}
        aria-label="Filters"
        title="Filters"
      >
        <Filter className="h-3.5 w-3.5" />
        {advancedFilterCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
            {advancedFilterCount}
          </span>
        )}
      </Button>
      {canWrite && (
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => gridRef.current?.openLiveEdit()}
          aria-label="Live edit"
          title="Live edit"
        >
          <MousePointerClick className="h-3.5 w-3.5" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && !loading ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load attributes from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
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
          footerLeftActions={footerLeftActions}
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

      {canWrite && (
        <AttributeProfileFormDialog
          open={createOpen || !!editProfile}
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
