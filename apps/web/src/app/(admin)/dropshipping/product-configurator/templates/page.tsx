"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { ConfiguratorTemplatesList } from "@/components/configurator/admin/configurator-templates-list";
import { ConfiguratorTemplateFormSheet } from "@/components/configurator/admin/configurator-template-form-sheet";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import type { ConfiguratorTemplate } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import {
  createConfiguratorTemplate,
  updateConfiguratorTemplate,
  useConfiguratorTemplates,
} from "@/lib/api/use-configurator-templates";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

function TemplatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator/templates`;
  const { templates, total, loading, error, refetch } = useConfiguratorTemplates();
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

  const editTemplate = useMemo(
    () => (editId ? templates.find((t) => t.id === editId) ?? null : null),
    [editId, templates],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "configurator-templates-api" });
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

  const handleEdit = (template: ConfiguratorTemplate) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", template.id);
      p.set("profile", template.profileId);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editTemplate) {
      toast.error("Template not found");
      closeForm();
    }
  }, [editId, editTemplate, loading]);

  const handleSave = async (data: {
    profileId: string;
    name: string;
    slug?: string;
    description?: string;
    components: ConfiguratorTemplate["components"];
    isFeatured: boolean;
    status: ConfiguratorTemplate["status"];
  }) => {
    const slug = data.slug?.trim() || slugifyConfigurator(data.name);
    try {
      if (createOpen) {
        await createConfiguratorTemplate({
          profileId: data.profileId,
          name: data.name,
          slug,
          description: data.description,
          components: data.components,
          isFeatured: data.isFeatured,
          status: data.status,
        });
        toast.success("Template created");
      } else if (editTemplate) {
        await updateConfiguratorTemplate(editTemplate.id, {
          profileId: data.profileId,
          name: data.name,
          slug,
          description: data.description,
          components: data.components,
          isFeatured: data.isFeatured,
          status: data.status,
        });
        toast.success("Template updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <ConfiguratorAdminPage
      section="Templates"
      title="Build Templates"
      count={loading ? undefined : total}
      description="Pre-configured starter builds customers can load into the configurator."
      createLabel={canWrite ? "Create template" : undefined}
      onCreate={canWrite ? openCreate : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ApiConnectionBadge loading={loading} error={error} productCount={total} />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ConfiguratorTemplatesList
        templates={templates}
        profiles={profiles}
        profileFilter={profileFilter}
        onProfileFilterChange={setProfileFilter}
        loading={loading}
        onTemplatesChanged={() => void refetch()}
        onEdit={handleEdit}
        onCreate={canWrite ? openCreate : undefined}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
          onClick={openCreate}
          aria-label="Create template"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite && (
        <ConfiguratorTemplateFormSheet
          open={createOpen || !!editTemplate}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          template={editTemplate}
          defaultProfileId={profileFilter}
          onSave={(data) => void handleSave(data)}
        />
      )}
    </ConfiguratorAdminPage>
  );
}

export default function ConfiguratorTemplatesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading templates…</div>}>
      <TemplatesContent />
    </Suspense>
  );
}
