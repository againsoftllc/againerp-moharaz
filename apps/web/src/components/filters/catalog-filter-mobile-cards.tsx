"use client";

import { MoreHorizontal, Pencil, EyeOff } from "lucide-react";
import {
  FILTER_DISPLAY_LABELS,
  type CatalogFacetFilter,
} from "@/lib/mock-data/catalog-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  filters: CatalogFacetFilter[];
  onEdit: (filter: CatalogFacetFilter) => void;
  onDeactivate: (filter: CatalogFacetFilter) => void;
};

export function CatalogFilterMobileCards({ filters, onEdit, onDeactivate }: Props) {
  if (filters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No filters found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {filters.map((f) => (
        <div key={f.id} className="rounded-lg border border-input bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">?{f.paramKey}=</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {FILTER_DISPLAY_LABELS[f.displayType]}
                </Badge>
                <span className="text-xs text-muted-foreground">{f.attributeName}</span>
                <Badge variant={f.isActive ? "success" : "muted"} className="text-[10px]">
                  {f.isActive ? "Active" : "Inactive"}
                </Badge>
                {f.storefrontVisible && (
                  <Badge variant="secondary" className="text-[10px]">
                    Storefront
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(f)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                {f.isActive && (
                  <DropdownMenuItem onClick={() => onDeactivate(f)} className="text-destructive">
                    <EyeOff className="mr-2 h-3.5 w-3.5" /> Deactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
