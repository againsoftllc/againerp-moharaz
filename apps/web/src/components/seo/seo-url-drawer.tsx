"use client";

import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { updateSeoUrl, type ApiSeoUrl } from "@/lib/api/seo-urls";
import { URL_STATUS_LABELS, type UrlStatus } from "@/lib/mock-data/seo";
import { formatQuantity } from "@/lib/utils";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Edit one storefront URL. `title` and entity type belong to the source record
 * and are refreshed by the sync, so they are shown read-only.
 */
export function SeoUrlDrawer({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ApiSeoUrl | null;
  onSaved?: () => void;
}) {
  const [slug, setSlug] = useState(row?.slug ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState(row?.canonical_url ?? "");
  const [status, setStatus] = useState<UrlStatus>((row?.status as UrlStatus) ?? "active");
  const [indexable, setIndexable] = useState(row?.indexable ?? true);
  const [redirectTo, setRedirectTo] = useState(row?.redirect_to ?? "");
  const [saving, setSaving] = useState(false);

  if (!row) return null;

  const derivedChanged = status !== row.status || indexable !== row.indexable;

  const save = async () => {
    setSaving(true);
    try {
      await updateSeoUrl(row.id, {
        slug,
        canonical_url: canonicalUrl,
        status,
        indexable,
        redirect_to: redirectTo,
      });
      toast.success(`${slug} saved`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the URL");
    } finally {
      setSaving(false);
    }
  };

  const handBack = async () => {
    setSaving(true);
    try {
      await updateSeoUrl(row.id, { status_locked: false });
      toast.success("Status handed back to the entity sync");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unlock the URL");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] flex-col gap-0 overflow-y-auto">
        <div className="border-b border-border pb-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {row.entity_type}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold">{row.title}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{row.slug}</p>
        </div>

        <div className="flex-1 space-y-4 py-4">
          <Field label="Path" hint="Must be unique across every published page.">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="rounded-none font-mono text-[12px]"
            />
          </Field>

          <Field
            label="Canonical URL"
            hint="Leave empty to let the page be its own canonical."
          >
            <Input
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-none text-[12px]"
            />
          </Field>

          <Field label="Status">
            <FilterSelect
              value={status}
              onChange={(next) => setStatus(next as UrlStatus)}
              width="w-full"
              ariaLabel="Status"
              options={(Object.keys(URL_STATUS_LABELS) as UrlStatus[]).map((value) => ({
                value,
                label: URL_STATUS_LABELS[value],
              }))}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={indexable}
              onChange={(e) => setIndexable(e.target.checked)}
            />
            <span>Allow search engines to index this page</span>
          </label>

          <Field label="Redirect to" hint="Only used when the status is Redirect.">
            <Input
              value={redirectTo}
              onChange={(e) => setRedirectTo(e.target.value)}
              placeholder="/new-path"
              className="rounded-none font-mono text-[12px]"
            />
          </Field>

          <div className="border border-border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5">
              {row.status_locked ? (
                <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              ) : (
                <Unlock className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-[11px] font-medium">
                {row.status_locked ? "Status set by hand" : "Status follows the entity"}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {row.status_locked
                ? "The sync will not touch status or indexing on this URL until you hand it back."
                : "Publishing or unpublishing the source record updates this URL automatically."}
              {!row.status_locked && derivedChanged && " Saving these changes will lock it."}
            </p>
            {row.status_locked && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 rounded-none text-[11px]"
                disabled={saving}
                onClick={handBack}
              >
                Hand back to sync
              </Button>
            )}
          </div>

          {row.views_30d > 0 && (
            <Badge variant="outline" className="rounded-none text-[10px]">
              {formatQuantity(row.views_30d)} views in 30 days
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button className="rounded-none" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
