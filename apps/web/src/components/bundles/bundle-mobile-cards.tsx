"use client";

import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import {
  BUNDLE_STATUS_LABELS,
  formatBdt,
  type ProductBundle,
} from "@/lib/mock-data/bundles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  bundles: ProductBundle[];
  onView: (bundle: ProductBundle) => void;
  onEdit: (bundle: ProductBundle) => void;
  onArchive: (bundle: ProductBundle) => void;
};

function StatusBadge({ status }: { status: ProductBundle["status"] }) {
  const variant =
    status === "published" ? "success" : status === "draft" ? "warning" : "muted";
  return <Badge variant={variant}>{BUNDLE_STATUS_LABELS[status]}</Badge>;
}

export function BundleMobileCards({ bundles, onView, onEdit, onArchive }: Props) {
  if (bundles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No bundles found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {bundles.map((b) => (
        <div key={b.id} className="flex gap-3 rounded-lg border border-input bg-card p-3">
          <button type="button" onClick={() => onView(b)} className="shrink-0">
            {b.thumbnail ? (
              <img src={b.thumbnail} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <span className="block h-12 w-12 rounded bg-muted" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{b.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{b.sku}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">{formatBdt(b.bundlePrice)}</span>
              <span className="text-xs text-muted-foreground">{b.componentCount} items</span>
              <StatusBadge status={b.status} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(b)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              {b.status !== "archived" && (
                <DropdownMenuItem onClick={() => onArchive(b)} className="text-destructive">
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
