"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MousePointerClick, Plus, RefreshCw, Settings2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BrandGridHandle } from "@/components/brands/brand-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
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

const BrandGrid = dynamic(
  () => import("@/components/brands/brand-grid").then((module) => module.BrandGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening brands…" />,
  },
);

const BrandFormDialog = dynamic(
  () =>
    import("@/components/brands/brand-form-dialog").then((module) => module.BrandFormDialog),
  { ssr: false },
);

const BrandViewSheet = dynamic(
  () =>
    import("@/components/brands/brand-view-sheet").then((module) => module.BrandViewSheet),
  { ssr: false },
);

function buildBrandsUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/website/brands?${query}` : "/website/brands";
}

function BrandListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brands, loading, error, refetch } = useCatalogBrands({
    channel: "catalog",
  });
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

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildBrandsUrl(params), { scroll: false });
  };

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (brand: Brand) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", brand.id);
    });
  };

  const handleView = (brand: Brand) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", brand.id);
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
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
          channel: "catalog",
        });
        toast.success("Brand created");
      } else if (editBrand) {
        await updateCatalogBrand(editBrand.id, {
          name: data.name,
          slug: data.slug,
          active: data.active,
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
      // silent — form still open; user can retry on save
    }
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
    <ListGridHeaderStart title="Brands">
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
          <DropdownMenuItem onClick={() => brandGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          {canWrite ? (
            <DropdownMenuItem onClick={() => brandGridRef.current?.openLiveEdit()}>
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
          <p className="font-medium text-destructive">Could not load brands from API</p>
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
        <BrandGrid
          ref={brandGridRef}
          brands={brands}
          loading={loading && brands.length === 0}
          channel="catalog"
          onBrandsChanged={() => void refetch()}
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

      {canWrite && (createOpen || !!editBrand) && (
        <BrandFormDialog
          open
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
      <Suspense fallback={<ListGridOpenFallback label="Opening brands…" />}>
        <BrandListContent />
      </Suspense>
    </div>
  );
}
