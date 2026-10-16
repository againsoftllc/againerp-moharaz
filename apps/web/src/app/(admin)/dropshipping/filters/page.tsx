"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CatalogFilterGrid,
  type CatalogFilterGridHandle,
} from "@/components/filters/catalog-filter-grid";
import { CatalogFilterFormDialog } from "@/components/filters/catalog-filter-form-dialog";
import type { CatalogFacetFilter } from "@/lib/mock-data/catalog-filters";
import {
  createCatalogFilter,
  patchCatalogFilter,
  updateCatalogFilter,
  useCatalogFilters,
} from "@/lib/api/use-catalog-filters";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/dropshipping/filters?${q}` : "/dropshipping/filters";
}

function CatalogFiltersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filters, loading, error, refetch } = useCatalogFilters();
  const { attributes } = useCatalogAttributeProfiles();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<CatalogFilterGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");

  const filterableAttributes = useMemo(
    () => attributes.filter((a) => a.isFilterable),
    [attributes],
  );

  const editFilter = useMemo(
    () => (editId ? filters.find((f) => f.id === editId) ?? null : null),
    [editId, filters],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-filters-api" });
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
      p.set("create", "1");
    });

  const handleEdit = (filter: CatalogFacetFilter) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", filter.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editFilter) {
      toast.error("Filter not found");
      closeForm();
    }
  }, [editId, editFilter, loading]);

  const handleSave = async (data: Partial<CatalogFacetFilter>) => {
    try {
      if (createOpen) {
        await createCatalogFilter({
          name: data.name ?? "New Filter",
          paramKey: data.paramKey ?? "new_filter",
          displayType: data.displayType ?? "multi_select",
          source: data.source ?? "attribute",
          attributeId: data.attributeId,
          attributeName: data.attributeName ?? "—",
          isActive: data.isActive ?? true,
          storefrontVisible: data.storefrontVisible ?? true,
          categoryScope: data.categoryScope ?? "All categories",
          urlExample: data.urlExample,
        });
        toast.success("Filter created");
      } else if (editFilter) {
        await updateCatalogFilter(editFilter.id, {
          name: data.name,
          paramKey: data.paramKey,
          displayType: data.displayType,
          source: data.source,
          attributeId: data.attributeId,
          attributeName: data.attributeName,
          isActive: data.isActive,
          storefrontVisible: data.storefrontVisible,
          categoryScope: data.categoryScope,
          urlExample: data.urlExample,
        });
        toast.success("Filter updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleLiveChange = async (data: Partial<CatalogFacetFilter> & { id: string }) => {
    try {
      await patchCatalogFilter(data.id, data);
      await refetch();
    } catch {
      // silent while form is open
    }
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Filters">
      {canWrite ? (
        <Button size="sm" onClick={openCreate}>
      New
    </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium">Filters</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh filters (API/DB ${apiHealth.status})`}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => toast.info("Preview — coming soon")}>
            Preview
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
          <p className="font-medium text-destructive">Could not load filters from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <CatalogFilterGrid
          ref={gridRef}
          filters={filters}
          filterableAttributes={filterableAttributes}
          loading={loading}
          onFiltersChanged={() => void refetch()}
          onEdit={handleEdit}
          onCreate={openCreate}
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
          aria-label="Add filter"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite && (
        <CatalogFilterFormDialog
          open={createOpen || !!editFilter}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          filter={editFilter}
          attributeOptions={filterableAttributes.map((a) => ({ id: a.id, name: a.name }))}
          onSave={(data) => void handleSave(data)}
          onLiveChange={(data) => void handleLiveChange(data)}
        />
      )}
    </div>
  );
}

export default function CatalogFiltersPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<ContentDataSkeleton label="Loading filters…" />}>
          <CatalogFiltersContent />
        </Suspense>
    </div>
  );
}
