"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import {
  PROFILE_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/configurator/types";
import { useConfiguratorProfile } from "@/lib/api/use-configurator-profiles";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

export default function ConfiguratorProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator`;
  const { profile, loading, error } = useConfiguratorProfile(id);
  const canWrite = useAdminCanWrite();

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "configurator-profile-detail-api" });
  }, [error]);

  if (!loading && !profile && !error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Profile not found.</p>
        <Button variant="outline" size="sm" className="rounded-none" asChild>
          <Link href={`${base}/profiles`}>Back to profiles</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 rounded-none px-2" asChild>
            <Link href={`${base}/profiles`}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Link>
          </Button>
          {profile && canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              onClick={() => router.push(`${base}/profiles?edit=${profile.id}`)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
        <h1 className="page-title mt-2">{loading ? "Loading…" : profile?.name ?? "Profile"}</h1>
        <div className="mt-1.5">
          <ApiConnectionBadge loading={loading} error={error} productCount={profile ? 1 : 0} />
        </div>
      </div>

      {profile && (
        <div className="rounded-none border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="rounded-none"
              variant={
                profile.status === "active"
                  ? "success"
                  : profile.status === "draft"
                    ? "warning"
                    : "muted"
              }
            >
              {STATUS_LABELS[profile.status]}
            </Badge>
            <Badge className="rounded-none" variant="outline">
              {PROFILE_TYPE_LABELS[profile.profileType]}
            </Badge>
            {profile.isDefault && (
              <Badge className="rounded-none" variant="outline">
                Default
              </Badge>
            )}
          </div>

          {profile.description && (
            <p className="mt-3 text-sm text-muted-foreground">{profile.description}</p>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Slug</dt>
              <dd className="text-sm">{profile.slug}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Categories</dt>
              <dd className="text-sm">{profile.categoryCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Rules</dt>
              <dd className="text-sm">{profile.ruleCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Templates</dt>
              <dd className="text-sm">{profile.templateCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Builds</dt>
              <dd className="text-sm">{profile.buildCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Updated</dt>
              <dd className="text-sm">{profile.updatedAt}</dd>
            </div>
          </dl>

          <p className="mt-4 text-[11px] text-muted-foreground">
            Storefront: <span className="font-mono">/builders/{profile.slug}</span>
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href={`${base}/categories?profile=${profile.id}`}>Manage categories</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href={`${base}/rules`}>Compatibility rules</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href={`${base}/templates?profile=${profile.id}`}>Templates</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-none" asChild>
              <Link href="/website/categories">Catalog categories</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
