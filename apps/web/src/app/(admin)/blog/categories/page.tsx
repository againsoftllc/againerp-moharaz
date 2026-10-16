"use client";

import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BlogCategoryGrid } from "@/components/blog/blog-category-grid";
import { BlogCategoryFormDrawer } from "@/components/blog/blog-category-form-drawer";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import { Button } from "@/components/ui/button";
import type { BlogCategory } from "@/lib/blog/blog-category";
import { useBlogCategories } from "@/lib/api/use-blog-categories";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

function buildUrl(basePath: string, params: URLSearchParams) {
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}

function CategoryListContent() {
  const router = useRouter();
  // Also mounted at /website/blog/categories — stay on whichever path this is
  // currently rendered under instead of always jumping to /blog/categories.
  const pathname = usePathname() || "/blog/categories";
  const searchParams = useSearchParams();
  const { categories, loading, error, refetch, saveCategory } = useBlogCategories();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");

  const editCategory = useMemo(
    () => (editId ? categories.find((c) => c.id === editId) ?? null : null),
    [editId, categories],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "blog-categories-api" });
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(pathname, p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.set("create", "1");
    });

  const handleEdit = (category: BlogCategory) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", category.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editCategory) {
      toast.error("Category not found");
      closeForm();
    }
  }, [editId, editCategory, loading]);

  const formOpen = createOpen || !!editCategory;

  const headerRightActions = canWrite ? (
    <Button size="sm" className="gap-1.5" onClick={openCreate}>
      <Plus className="h-4 w-4" />
      Add
    </Button>
  ) : null;

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium text-foreground">Categories</span>
      <ApiRefreshButton
        status={apiHealth.status}
        loading={loading}
        onRefresh={() => {
          void refetch();
          apiHealth.recheck();
        }}
        disabled={loading}
      />
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {error && !loading ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load categories from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <BlogCategoryGrid
          categories={categories}
          loading={loading}
          onEdit={handleEdit}
          footerLeftActions={footerLeftActions}
          headerRightActions={headerRightActions}
          className="min-h-0 flex-1"
        />
      )}

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-[270] h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add category"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite ? (
        <BlogCategoryFormDrawer
          open={formOpen}
          mode={createOpen ? "create" : "edit"}
          category={editCategory}
          categories={categories}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          onSave={async (data) => {
            await saveCategory(createOpen ? null : editCategory?.id ?? null, data);
            await refetch();
          }}
        />
      ) : null}
    </div>
  );
}

export default function BlogCategoriesPage() {
  return (
    <div className="flex h-[calc(100dvh-2.75rem-1.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden lg:h-[calc(100dvh-2.75rem-2rem)]">
              <Suspense fallback={<ContentDataSkeleton label="Loading categories…" />}>
          <CategoryListContent />
        </Suspense>
    </div>
  );
}
