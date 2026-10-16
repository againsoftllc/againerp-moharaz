"use client";

import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import type { Brand } from "@/lib/mock-data/brands";
import { resolveMediaUrl } from "@/lib/media/resolve-media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileCardActions } from "@/components/activity/mobile-card-actions";

function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "muted"}>{active ? "On" : "Off"}</Badge>;
}

type Props = {
  brands: Brand[];
  onEdit: (brand: Brand) => void;
  onTurnOff: (brand: Brand) => void;
};

export function BrandMobileCards({ brands, onEdit, onTurnOff }: Props) {
  if (brands.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No brands found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {brands.map((b) => {
        const logoUrl = resolveMediaUrl(b.logoMediaId, b.logoUrl);
        return (
        <div key={b.id} className="flex gap-3 rounded-lg border border-input bg-card p-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{b.name}</p>
            <p className="truncate text-xs text-muted-foreground">/brands/{b.slug}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs">{b.productCount} products</span>
              <ActiveBadge active={b.active} />
            </div>
          </div>
          <MobileCardActions
            entity={{ type: "brand", id: b.id, label: b.name, subtitle: `/${b.slug}` }}
          >
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
                <DropdownMenuItem onClick={() => onTurnOff(b)} className="text-destructive">
                  <Archive className="mr-2 h-3.5 w-3.5" /> Turn off
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </MobileCardActions>
        </div>
        );
      })}
    </div>
  );
}
