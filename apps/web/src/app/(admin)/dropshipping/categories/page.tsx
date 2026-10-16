"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MoreHorizontal, MousePointerClick, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getCategoryAncestorNames } from "@/lib/category-utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryGrid, type CategoryGridHandle } from "@/components/categories/category-grid";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryViewSheet } from "@/components/categories/category-view-sheet";
import type { Category } from "@/lib/mock-data/categories";
import {
  createCatalogCategory,
  patchCatalogCategory,
  updateCatalogCategory,
  useCatalogCategories,
} from "@/lib/api/use-catalog-categories";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/dropshipping/categories?${q}` : "/dropshipping/categories";
}

function CategoryListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories, loading, error, refetch } = useCatalogCategories({
    channel: "dropshipping",
  });
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const categoryGridRef = useRef<CategoryGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editCategory = useMemo(
    () => (editId ? categories.find((c) => c.id === editId) ?? null : null),
    [editId, categories],
  );
  const viewCategory = useMemo(
    () => (viewId ? categories.find((c) => c.id === viewId) ?? null : null),
    [viewId, categories],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-categories-api" });
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

  const handleEdit = (cat: Category) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("view");
      p.set("edit", cat.id);
    });

  const handleView = (cat: Category) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
      p.set("view", cat.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  const closeView = () => pushParams((p) => p.delete("view"));

  useEffect(() => {
    if (editId && !loading && !editCategory) {
      toast.error("Category not found");
      closeForm();
    }
  }, [editId, editCategory, loading]);

  useEffect(() => {
    if (viewId && !viewCategory && !editId && !createOpen && !loading) {
      toast.error("Category not found");
      closeView();
    }
  }, [viewId, viewCategory, editId, createOpen, loading]);

  const handleSave = async (data: Partial<Category>) => {
    try {
      if (createOpen) {
        await createCatalogCategory({
          name: data.name ?? "New Category",
          caption: data.caption ?? data.name ?? "New",
          slug: data.slug ?? "new-category",
          parentId: data.parentId ?? null,
          active: data.active ?? true,
          showInTopMenu: data.showInTopMenu ?? false,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          iconUrl: data.iconUrl,
          bannerUrl: data.bannerUrl,
          iconMediaId: data.iconMediaId,
          bannerMediaId: data.bannerMediaId,
          channel: "dropshipping",
        });
        toast.success("Category created");
      } else if (editCategory) {
        await updateCatalogCategory(editCategory.id, {
          name: data.name,
          caption: data.caption,
          slug: data.slug,
          parentId: data.parentId,
          active: data.active,
          showInTopMenu: data.showInTopMenu,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          iconUrl: data.iconUrl,
          bannerUrl: data.bannerUrl,
          iconMediaId: data.iconMediaId,
          bannerMediaId: data.bannerMediaId,
        });
        toast.success("Category updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleLiveChange = async (data: Partial<Category> & { id: string }) => {
    try {
      await patchCatalogCategory(data.id, data);
      await refetch();
    } catch {
      // silent — form still open; user can retry on save
    }
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Categories">
      {canWrite ? (
        <Button size="sm" onClick={openCreate}>
      New
    </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium">Categories</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
        aria-label={`Refresh categories (API/DB ${apiHealth.status})`}
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
        onClick={() => categoryGridRef.current?.openFilters()}
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
          onClick={() => categoryGridRef.current?.openLiveEdit()}
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
          <p className="font-medium text-destructive">Could not load categories from API</p>
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
        <CategoryGrid
          ref={categoryGridRef}
          categories={categories}
          loading={loading}
          channel="dropshipping"
          onCategoriesChanged={() => void refetch()}
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
          aria-label="Add category"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <CategoryViewSheet
        open={!!viewCategory && !createOpen && !editCategory}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
        category={viewCategory}
        allCategories={categories}
        onEdit={canWrite ? handleEdit : undefined}
      />

      {canWrite && (
        <CategoryFormDialog
          open={createOpen || !!editCategory}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          category={editCategory}
          categories={categories}
          defaultParentId={null}
          onSave={(data) => void handleSave(data)}
          onLiveChange={(data) => void handleLiveChange(data)}
        />
      )}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<ContentDataSkeleton label="Loading categories…" />}>
          <CategoryListContent />
        </Suspense>
    </div>
  );
}
