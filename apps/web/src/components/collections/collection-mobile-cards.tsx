"use client";

import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import {
  COLLECTION_TYPE_LABELS,
  type ProductCollection,
} from "@/lib/mock-data/collections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function StatusBadge({ status }: { status: ProductCollection["status"] }) {
  const variant =
    status === "active" ? "success" : status === "draft" ? "warning" : "muted";
  return (
    <Badge variant={variant}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

type Props = {
  collections: ProductCollection[];
  onEdit: (collection: ProductCollection) => void;
  onArchive: (collection: ProductCollection) => void;
};

export function CollectionMobileCards({ collections, onEdit, onArchive }: Props) {
  if (collections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No collections found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {collections.map((c) => (
        <div key={c.id} className="flex gap-3 rounded-lg border border-input bg-card p-3">
          {c.heroImageUrl ? (
            <img src={c.heroImageUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          ) : (
            <span className="h-10 w-14 shrink-0 rounded bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
            <p className="truncate text-xs text-muted-foreground">/collections/{c.slug}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {COLLECTION_TYPE_LABELS[c.type]}
              </Badge>
              <span className="text-xs">{c.productCount} products</span>
              <StatusBadge status={c.status} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(c)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              {!c.isSystem && (
                <DropdownMenuItem onClick={() => onArchive(c)} className="text-destructive">
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
