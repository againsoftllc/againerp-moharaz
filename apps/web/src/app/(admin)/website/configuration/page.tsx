"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPrimaryWorkspaceSite } from "@/lib/api/workspace-sites";
import { SiteSettingsForm } from "@/components/settings/site-settings-form";
import { Button } from "@/components/ui/button";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/**
 * Website → Configuration is the primary storefront site settings
 * (same form as /website/configuration/sites/{id}) — no duplicate config UI.
 */
export default function WebsiteConfigurationPage() {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const site = await getPrimaryWorkspaceSite();
        if (!cancelled) setSiteId(site.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No primary site");
          setSiteId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-2">
        <ContentDataSkeleton rows={8} showFilters={false} />
      </div>
    );
  }

  if (error || !siteId) {
    return (
      <div className="rounded-none border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">{error || "No primary site configured"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Create or set a primary site under Configuration → Sites.
        </p>
        <Button variant="outline" size="sm" asChild className="mt-3 rounded-none">
          <Link href="/website/configuration/sites">Open Sites</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Storefront brand, domain, and deploy URLs for the primary site. Same settings as{" "}
        <Link href={`/website/configuration/sites/${siteId}`} className="underline">
          Configuration → Sites
        </Link>
        .
      </p>
      <SiteSettingsForm siteId={siteId} />
    </div>
  );
}
