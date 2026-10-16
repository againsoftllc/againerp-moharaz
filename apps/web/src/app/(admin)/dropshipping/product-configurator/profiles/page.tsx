"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { ConfiguratorProfilesList } from "@/components/configurator/admin/configurator-profiles-list";
import { ConfiguratorProfileFormSheet } from "@/components/configurator/admin/configurator-profile-form-sheet";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import type { ConfiguratorProfile } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import {
  createConfiguratorProfile,
  updateConfiguratorProfile,
  useConfiguratorProfiles,
} from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

function ProfilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator/profiles`;
  const { profiles, total, loading, error, refetch } = useConfiguratorProfiles();
  const canWrite = useAdminCanWrite();

  const buildUrl = (params: URLSearchParams) => {
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");

  const editProfile = useMemo(
    () => (editId ? profiles.find((p) => p.id === editId) ?? null : null),
    [editId, profiles],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "configurator-profiles-api" });
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

  const handleEdit = (profile: ConfiguratorProfile) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", profile.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editProfile) {
      toast.error("Profile not found");
      closeForm();
    }
  }, [editId, editProfile, loading]);

  const handleSave = async (data: {
    name: string;
    slug?: string;
    profileType: ConfiguratorProfile["profileType"];
    status: ConfiguratorProfile["status"];
    description?: string;
    isDefault: boolean;
  }) => {
    const slug = data.slug?.trim() || slugifyConfigurator(data.name);
    try {
      if (createOpen) {
        await createConfiguratorProfile({
          name: data.name,
          slug,
          profileType: data.profileType,
          status: data.status,
          description: data.description,
          isDefault: data.isDefault,
        });
        toast.success("Profile created");
      } else if (editProfile) {
        await updateConfiguratorProfile(editProfile.id, {
          name: data.name,
          slug,
          profileType: data.profileType,
          status: data.status,
          description: data.description,
          isDefault: data.isDefault,
        });
        toast.success("Profile updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <ConfiguratorAdminPage
      section="Profiles"
      title="Configurator Profiles"
      count={loading ? undefined : total}
      description="Define builder types — PC Builder, Laptop Builder, CCTV Builder. Each profile owns categories, rules, and templates."
      createLabel={canWrite ? "Create profile" : undefined}
      onCreate={canWrite ? openCreate : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ApiConnectionBadge loading={loading} error={error} productCount={total} />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ConfiguratorProfilesList
        profiles={profiles}
        loading={loading}
        onProfilesChanged={() => void refetch()}
        onEdit={handleEdit}
        onCreate={canWrite ? openCreate : undefined}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
          onClick={openCreate}
          aria-label="Create profile"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite && (
        <ConfiguratorProfileFormSheet
          open={createOpen || !!editProfile}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          profile={editProfile}
          onSave={(data) => void handleSave(data)}
        />
      )}
    </ConfiguratorAdminPage>
  );
}

export default function ConfiguratorProfilesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading profiles…</div>}>
      <ProfilesContent />
    </Suspense>
  );
}
