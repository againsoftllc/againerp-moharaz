"use client";

import { MoreHorizontal, Pencil, Archive, Eye, ImageOff } from "lucide-react";
import type { Product } from "@/lib/mock-data/products";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WebsiteBadge } from "@/components/products/website-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileCardActions } from "@/components/activity/mobile-card-actions";

function StatusBadge({ status }: { status: Product["status"] }) {
  const variant =
    status === "published" ? "success" : status === "draft" ? "warning" : "muted";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

type Props = {
  products: Product[];
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onArchive: (product: Product) => void;
};

export function ProductMobileCards({ products, onView, onEdit, onArchive }: Props) {

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No products found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {products.map((p) => (
        <div
          key={p.id}
          className="flex gap-3 rounded-lg border border-input bg-card p-3"
        >
          <button
            type="button"
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onView(p)}
            aria-label={`View ${p.name}`}
          >
            {p.thumbnail ? (
              <img src={p.thumbnail} alt="" className="h-14 w-14 rounded-md object-cover" />
            ) : (
              <span
                className="flex h-14 w-14 items-center justify-center rounded-md bg-muted text-muted-foreground"
                aria-label="No image"
              >
                <ImageOff className="h-5 w-5" />
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.sku}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{formatCurrency(p.price)}</span>
              <span className="text-xs text-muted-foreground">Stock {p.stock}</span>
              <WebsiteBadge product={p} size="sm" />
              <StatusBadge status={p.status} />
            </div>
          </div>
          <MobileCardActions
            entity={{
              type: "product",
              id: p.id,
              label: p.name,
              subtitle: `SKU ${p.sku}`,
            }}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onView(p)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(p)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onArchive(p)} className="text-destructive">
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </MobileCardActions>
        </div>
      ))}
    </div>
  );
}
