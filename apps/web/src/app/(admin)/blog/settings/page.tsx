"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BlogSettingsForm } from "@/components/blog/blog-settings-form";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import { Button } from "@/components/ui/button";
import type { BlogSettings } from "@/lib/blog/blog-settings";
import { useBlogSettings } from "@/lib/api/use-blog-settings";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";

export default function BlogSettingsPage() {
  const canWrite = useAdminCanWrite();
  const { settings, loading, error, refetch, saveSettings } = useBlogSettings();
  const [values, setValues] = useState<BlogSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(settings);
    setDirty(false);
  }, [settings]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "blog-settings-api" });
  }, [error]);

  const patch = useCallback((patchValues: Partial<BlogSettings>) => {
    setValues((prev) => ({ ...prev, ...patchValues }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveSettings({
        enabled: values.enabled,
        postsPerPage: values.postsPerPage,
        commentsEnabled: values.commentsEnabled,
        moderateComments: values.moderateComments,
        rssEnabled: values.rssEnabled,
        rssItemsLimit: values.rssItemsLimit,
        defaultAuthor: values.defaultAuthor,
        showRelatedProducts: values.showRelatedProducts,
        seoIndexBlog: values.seoIndexBlog,
        blogBaseSlug: values.blogBaseSlug,
      });
      setDirty(false);
      toast.success("Blog settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [saveSettings, values]);

  const handleDiscard = useCallback(() => {
    setValues(settings);
    setDirty(false);
    toast.message("Changes discarded");
  }, [settings]);

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col bg-background text-foreground lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="mb-1 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-subtitle">AgainERP › Blog</p>
          <h1 className="page-title text-foreground">Configuration</h1>
          <div className="mt-1.5">
            <ApiConnectionBadge loading={loading} error={error} productCount={1} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          {canWrite ? (
            <>
              <Button variant="outline" size="sm" onClick={handleDiscard} disabled={!dirty || saving}>
                Discard
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || saving}>
                Save
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        ) : (
          <BlogSettingsForm values={values} onChange={patch} disabled={!canWrite || saving} />
        )}
      </div>
    </div>
  );
}
