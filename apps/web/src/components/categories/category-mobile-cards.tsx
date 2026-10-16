"use client";

import { MoreHorizontal, Pencil, Plus, Archive } from "lucide-react";
import type { Category } from "@/lib/mock-data/categories";
import { getCategoryDepth } from "@/lib/category-utils";
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
  categories: Category[];
  allCategories: Category[];
  onEdit: (category: Category) => void;
  onTurnOff: (category: Category) => void;
  onAddChild: (category: Category) => void;
};

export function CategoryMobileCards({
  categories,
  allCategories,
  onEdit,
  onTurnOff,
  onAddChild,
}: Props) {
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium">No categories found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {categories.map((c) => {
        const depth = getCategoryDepth(c, allCategories);
        const iconUrl = resolveMediaUrl(c.iconMediaId, c.iconUrl);
        return (
          <div
            key={c.id}
            className="flex gap-3 rounded-lg border border-input bg-card p-3"
            style={{ marginLeft: depth * 8 }}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
            ) : (
              <span className="h-10 w-10 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                Menu: {c.caption} · /{c.slug}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs">{c.productCount} products</span>
                {c.showInTopMenu && <Badge variant="outline" className="text-[10px]">Menu Yes</Badge>}
                <ActiveBadge active={c.active} />
              </div>
            </div>
            <MobileCardActions
              entity={{
                type: "category",
                id: c.id,
                label: c.name,
                subtitle: `/${c.slug}`,
              }}
            >
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
                  <DropdownMenuItem onClick={() => onAddChild(c)}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> Add subcategory
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTurnOff(c)} className="text-destructive">
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
