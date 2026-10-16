"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { ConfiguratorCategoriesList } from "@/components/configurator/admin/configurator-categories-list";
import { ConfiguratorCategoryFormSheet } from "@/components/configurator/admin/configurator-category-form-sheet";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import type { ConfiguratorCategory } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import {
  createConfiguratorCategory,
  updateConfiguratorCategory,
  useConfiguratorCategories,
} from "@/lib/api/use-configurator-categories";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

function CategoriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator/categories`;
  const { categories, total, loading, error, refetch } = useConfiguratorCategories();
  const { profiles } = useConfiguratorProfiles();
  const canWrite = useAdminCanWrite();

  const buildUrl = (params: URLSearchParams) => {
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const profileParam = searchParams.get("profile");

  const profileFilter = profileParam ?? profiles[0]?.id ?? "";

  const editCategory = useMemo(
    () => (editId ? categories.find((c) => c.id === editId) ?? null : null),
    [editId, categories],
  );

  const profileName = profiles.find((p) => p.id === profileFilter)?.name ?? "Profile";

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "configurator-categories-api" });
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const setProfileFilter = (id: string) =>
    pushParams((p) => {
      p.set("profile", id);
    });

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.set("create", "1");
    });

  const handleEdit = (category: ConfiguratorCategory) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", category.id);
      p.set("profile", category.profileId);
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

  const handleSave = async (data: {
    profileId: string;
    name: string;
    slug?: string;
    description?: string;
    sortOrder: number;
    isRequired: boolean;
    selectionMode: ConfiguratorCategory["selectionMode"];
    status: ConfiguratorCategory["status"];
  }) => {
    const slug = data.slug?.trim() || slugifyConfigurator(data.name);
    try {
      if (createOpen) {
        await createConfiguratorCategory({
          profileId: data.profileId,
          name: data.name,
          slug,
          description: data.description,
          sortOrder: data.sortOrder,
          isRequired: data.isRequired,
          selectionMode: data.selectionMode,
          status: data.status,
        });
        toast.success("Category created");
      } else if (editCategory) {
        await updateConfiguratorCategory(editCategory.id, {
          profileId: data.profileId,
          name: data.name,
          slug,
          description: data.description,
          sortOrder: data.sortOrder,
          isRequired: data.isRequired,
          selectionMode: data.selectionMode,
          status: data.status,
        });
        toast.success("Category updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <ConfiguratorAdminPage
      section="Categories"
      title="Component Categories"
      count={loading ? undefined : total}
      description="Component slots per builder profile — CPU, Motherboard, RAM. Map catalog products and set required/optional."
      createLabel={canWrite ? "Create category" : undefined}
      onCreate={canWrite ? openCreate : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ApiConnectionBadge loading={loading} error={error} productCount={total} />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ConfiguratorCategoriesList
        categories={categories}
        profiles={profiles}
        profileFilter={profileFilter}
        onProfileFilterChange={setProfileFilter}
        loading={loading}
        onCategoriesChanged={() => void refetch()}
        onEdit={handleEdit}
        onCreate={canWrite ? openCreate : undefined}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
          onClick={openCreate}
          aria-label="Create category"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite && (
        <ConfiguratorCategoryFormSheet
          open={createOpen || !!editCategory}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          category={editCategory}
          defaultProfileId={profileFilter}
          profileName={profileName}
          onSave={(data) => void handleSave(data)}
        />
      )}
    </ConfiguratorAdminPage>
  );
}

export default function ConfiguratorCategoriesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading categories…</div>}>
      <CategoriesContent />
    </Suspense>
  );
}
