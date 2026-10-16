"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  archiveEcommerceItem,
  PUBLISH_STATUS_LABELS,
  publishEcommerceItem,
  rejectEcommerceReview,
  restoreEcommerceItem,
  submitEcommerceForReview,
  syncEcommerceFromCatalog,
  unpublishEcommerceItem,
  type ApiEcommerceItem,
  type EcommercePublishStatus,
} from "@/lib/api/ecommerce-items";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Props = {
  itemId: string;
  ecommerce: ApiEcommerceItem;
  canWrite: boolean;
  onUpdated: (row: ApiEcommerceItem) => void;
};

const STATUS_STYLE: Partial<Record<EcommercePublishStatus, string>> = {
  draft: "border-muted-foreground/30 bg-muted/40",
  review: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  archived: "border-border bg-muted/30 text-muted-foreground",
  hidden: "border-border bg-muted/30",
};

export function EcommercePublishPanel({ itemId, ecommerce, canWrite, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<ApiEcommerceItem>) => {
    setBusy(true);
    try {
      const row = await fn();
      onUpdated(row);
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const status = ecommerce.publish_status;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("capitalize", STATUS_STYLE[status])}>
          {PUBLISH_STATUS_LABELS[status]}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {ecommerce.visibility}
        </Badge>
        {ecommerce.featured ? <Badge variant="secondary">Featured</Badge> : null}
        {ecommerce.is_active ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Live on storefront</Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Slug" value={ecommerce.slug || "—"} mono />
        <InfoCard label="Store price" value={formatCurrency(Number(ecommerce.selling_price))} />
        <InfoCard
          label="Compare at"
          value={
            ecommerce.compare_at_price
              ? formatCurrency(Number(ecommerce.compare_at_price))
              : "—"
          }
        />
        <InfoCard label="SEO title" value={ecommerce.seo_title || "—"} />
        <InfoCard
          label="Last updated"
          value={formatDateTime(ecommerce.updated_at)}
        />
      </div>

      {canWrite ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run("Synced from catalog", () => syncEcommerceFromCatalog(itemId))}
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Sync from catalog
          </Button>

          {status === "draft" ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run("Submitted for review", () => submitEcommerceForReview(itemId))
              }
            >
              Submit for review
            </Button>
          ) : null}

          {status === "review" ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run("Published to storefront", () => publishEcommerceItem(itemId))
                }
              >
                Publish
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run("Returned to draft", () => rejectEcommerceReview(itemId))}
              >
                Reject to draft
              </Button>
            </>
          ) : null}

          {status === "published" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run("Unpublished", () => unpublishEcommerceItem(itemId))}
            >
              Unpublish
            </Button>
          ) : null}

          {status !== "archived" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run("Archived", () => archiveEcommerceItem(itemId))}
            >
              Archive
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run("Restored to draft", () => restoreEcommerceItem(itemId))}
            >
              Restore to draft
            </Button>
          )}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Admin edits catalog product content; use <strong>Sync from catalog</strong> then run the
        publish workflow before the item appears on the storefront.
      </p>
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-input p-3 text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold", mono && "font-mono text-[11px]")}>{value}</p>
    </div>
  );
}
