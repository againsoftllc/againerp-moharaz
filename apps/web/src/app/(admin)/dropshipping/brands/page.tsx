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
import { BrandGrid, type BrandGridHandle } from "@/components/brands/brand-grid";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { BrandViewSheet } from "@/components/brands/brand-view-sheet";
import type { Brand } from "@/lib/mock-data/brands";
import {
  createCatalogBrand,
  patchCatalogBrand,
  updateCatalogBrand,
  useCatalogBrands,
} from "@/lib/api/use-catalog-brands";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/dropshipping/brands?${q}` : "/dropshipping/brands";
}

function BrandListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brands, loading, error, refetch } = useCatalogBrands({ channel: "dropshipping" });
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const brandGridRef = useRef<BrandGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editBrand = useMemo(
    () => (editId ? brands.find((b) => b.id === editId) ?? null : null),
    [editId, brands],
  );
  const viewBrand = useMemo(
    () => (viewId ? brands.find((b) => b.id === viewId) ?? null : null),
    [viewId, brands],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-brands-api" });
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

  const handleEdit = (brand: Brand) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("view");
      p.set("edit", brand.id);
    });

  const handleView = (brand: Brand) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
      p.set("view", brand.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  const closeView = () => pushParams((p) => p.delete("view"));

  useEffect(() => {
    if (editId && !loading && !editBrand) {
      toast.error("Brand not found");
      closeForm();
    }
  }, [editId, editBrand, loading]);

  useEffect(() => {
    if (viewId && !viewBrand && !editId && !createOpen && !loading) {
      toast.error("Brand not found");
      closeView();
    }
  }, [viewId, viewBrand, editId, createOpen, loading]);

  const handleSave = async (data: Partial<Brand>) => {
    try {
      if (createOpen) {
        await createCatalogBrand({
          name: data.name ?? "New Brand",
          slug: data.slug ?? "new-brand",
          active: data.active ?? true,
          status: data.status,
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
          channel: "dropshipping",
        });
        toast.success("Brand created");
      } else if (editBrand) {
        await updateCatalogBrand(editBrand.id, {
          name: data.name,
          slug: data.slug,
          active: data.active,
          status: data.status,
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
        });
        toast.success("Brand updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleLiveChange = async (data: Partial<Brand> & { id: string }) => {
    try {
      await patchCatalogBrand(data.id, data);
      await refetch();
    } catch {
      // silent while form is open
    }
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Brands">
      {canWrite ? (
        <Button size="sm" onClick={openCreate}>
      New
    </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium">Brands</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh brands (API/DB ${apiHealth.status})`}
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
        onClick={() => brandGridRef.current?.openFilters()}
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
          onClick={() => brandGridRef.current?.openLiveEdit()}
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
          <p className="font-medium text-destructive">Could not load brands from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ensure FastAPI is running:{" "}
            <code className="rounded bg-muted px-1">uvicorn main:app --port 8000</code>
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <BrandGrid
          ref={brandGridRef}
          brands={brands}
          loading={loading && brands.length === 0}
          channel="dropshipping"
          onBrandsChanged={() => void refetch()}
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
          aria-label="Add brand"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <BrandViewSheet
        open={!!viewBrand && !createOpen && !editBrand}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        brand={viewBrand}
        onEdit={canWrite ? handleEdit : undefined}
      />

      {canWrite && (
        <BrandFormDialog
          open={createOpen || !!editBrand}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          brand={editBrand}
          onSave={(data) => void handleSave(data)}
          onLiveChange={(data) => void handleLiveChange(data)}
        />
      )}
    </div>
  );
}

export default function BrandsPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<ContentDataSkeleton label="Loading brands…" />}>
          <BrandListContent />
        </Suspense>
    </div>
  );
}
