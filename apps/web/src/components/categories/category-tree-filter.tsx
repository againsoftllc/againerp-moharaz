"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildCategoryTree, type Category, type CategoryNode } from "@/lib/mock-data/categories";
import { getProductCategoryDisplay } from "@/lib/category-utils";
import { cn } from "@/lib/utils";

/**
 * Category names a filter on `name` must match: the category itself plus every sub-category under it, so picking
 * a parent ("Laptop") also lists products filed under its children ("HP Laptop"). Shared by every category filter.
 */
export function categoryNamesWithDescendants(name: string, categories: Category[]): Set<string> {
  const names = new Set<string>([name]);
  const roots = categories.filter((c) => c.name === name).map((c) => c.id);
  const queue = [...roots];
  const seen = new Set(queue);
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const child of categories) {
      if (child.parentId === parentId && !seen.has(child.id)) {
        seen.add(child.id);
        names.add(child.name);
        queue.push(child.id);
      }
    }
  }
  return names;
}

function ancestorIds(name: string, categories: Category[]): string[] {
  const ids: string[] = [];
  let current = categories.find((c) => c.name === name);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = categories.find((c) => c.id === current!.parentId);
  }
  return ids;
}

type Props = {
  categories: Category[];
  /** Selected category name, or `allValue` for no filter. */
  value: string;
  onChange: (name: string) => void;
  /** What "no filter" is in the caller's state — "all" (default) or "". */
  allValue?: string;
  allLabel?: string;
  width?: string;
  className?: string;
  ariaLabel?: string;
  /** Flip the menu above the trigger when there is no room below (use inside drawers). */
  avoidCollisions?: boolean;
};

/**
 * The one category filter: a searchable dropdown that shows the category tree (expand / collapse, sub-categories
 * indented under their parent). Search flattens to matching categories with their parent path.
 */
export function CategoryTreeFilter({
  categories,
  value,
  onChange,
  allValue = "all",
  allLabel = "All categories",
  width = "w-[172px]",
  className,
  ariaLabel = "Category",
  avoidCollisions = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const isAll = value === allValue || value === "";

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };

  const query = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return categories.filter((c) => {
      const { label, parentPath } = getProductCategoryDisplay(c.name, categories);
      return [c.name, c.caption, label, parentPath ?? "", c.slug].join(" ").toLowerCase().includes(query);
    });
  }, [categories, query]);

  const renderNodes = (nodes: CategoryNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(node.id);
      const selected = !isAll && value === node.name;
      return (
        <div key={node.id}>
          <div
            className={cn(
              "flex items-center gap-0.5 rounded-sm py-1 pr-2 text-[12px] hover:bg-accent",
              selected && "bg-accent",
            )}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-label={isOpen ? "Collapse" : "Expand"}
                className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => toggle(node.id)}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              title={node.name}
              onClick={() => select(node.name)}
            >
              {node.caption && depth > 0 ? node.caption : node.name}
            </button>
            {selected ? <Check className="h-3 w-3 shrink-0" /> : null}
          </div>
          {hasChildren && isOpen ? renderNodes(node.children, depth + 1) : null}
        </div>
      );
    });

  const triggerLabel = isAll ? allLabel : getProductCategoryDisplay(value, categories).label;

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
        // opening reveals the selected category by expanding the branch it sits in
        else if (!isAll) setExpanded((prev) => new Set([...prev, ...ancestorIds(value, categories)]));
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={ariaLabel}
          title={isAll ? allLabel : value}
          className={cn(
            "justify-between gap-1 rounded-none px-2 text-left font-normal shadow-sm",
            width,
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        avoidCollisions={avoidCollisions}
        collisionPadding={8}
        className="w-[max(var(--radix-dropdown-menu-trigger-width),240px)] overflow-hidden p-0"
      >
        <div className="border-b border-input p-1" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category…"
              className="h-6 rounded-none pl-6 text-[11px]"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-0.5">
          {!query ? (
            <div
              className={cn(
                "flex items-center rounded-sm py-1 pl-5 pr-2 text-[12px] hover:bg-accent",
                isAll && "bg-accent",
              )}
            >
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => select(allValue)}>
                {allLabel}
              </button>
              {isAll ? <Check className="h-3 w-3 shrink-0" /> : null}
            </div>
          ) : null}
          {query ? (
            matches.length === 0 ? (
              <p className="px-2 py-2.5 text-[11px] text-muted-foreground">No categories found</p>
            ) : (
              matches.map((category) => {
                const { label, parentPath } = getProductCategoryDisplay(category.name, categories);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] hover:bg-accent",
                      !isAll && value === category.name && "bg-accent",
                    )}
                    onClick={() => select(category.name)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      {parentPath ? (
                        <span className="truncate text-[10px] text-muted-foreground">{parentPath}</span>
                      ) : null}
                      <span className="truncate">{label}</span>
                    </span>
                    {!isAll && value === category.name ? <Check className="h-3 w-3 shrink-0" /> : null}
                  </button>
                );
              })
            )
          ) : tree.length === 0 ? (
            <p className="px-2 py-2.5 text-[11px] text-muted-foreground">No categories found</p>
          ) : (
            renderNodes(tree, 0)
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
