"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  buildCategoryTree,
  type Category,
  type CategoryNode,
} from "@/lib/mock-data/categories";
import { cn } from "@/lib/utils";

type FlatCategory = { id: string; name: string; depth: number };

function flattenTree(nodes: CategoryNode[], depth = 0): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const node of nodes) {
    if (!node.active) continue;
    out.push({ id: node.id, name: node.name, depth });
    out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}

function filterActiveTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes
    .filter((n) => n.active)
    .map((n) => ({ ...n, children: filterActiveTree(n.children) }));
}

function CategoryTreeItems({
  nodes,
  value,
  onSelect,
  expanded,
  onToggle,
}: {
  nodes: CategoryNode[];
  value: string;
  onSelect: (id: string, name: string) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.id);
        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-sm py-1 pr-2 hover:bg-accent",
                value === node.id && "bg-accent",
              )}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.id)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[11px]"
                onClick={() => onSelect(node.id, node.name)}
              >
                {node.name}
              </button>
            </div>
            {hasChildren && isExpanded ? (
              <div className="ml-2 border-l border-dotted border-muted-foreground/40 pl-2">
                <CategoryTreeItems
                  nodes={node.children}
                  value={value}
                  onSelect={onSelect}
                  expanded={expanded}
                  onToggle={onToggle}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

type Props = {
  categories: Category[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  className?: string;
};

/** Expand/collapse category picker — same pattern as service item category select. */
export function CategoryTreeSelect({
  categories,
  value,
  onChange,
  placeholder = "Select category",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(
    () => filterActiveTree(buildCategoryTree(categories)),
    [categories],
  );
  const flatCategories = useMemo(() => flattenTree(tree), [tree]);
  const selected = categories.find((c) => c.id === value);

  useEffect(() => {
    if (open) setExpanded(new Set(flatCategories.map((c) => c.id)));
  }, [open, flatCategories]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searching = search.trim().length > 0;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatCategories;
    return flatCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [search, flatCategories]);

  const selectAndClose = (id: string, name: string) => {
    onChange(id, name);
    setOpen(false);
    setSearch("");
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <div
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm",
          className,
        )}
      >
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition",
                open && "rotate-180",
              )}
            />
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : placeholder}
            </span>
          </button>
        </DropdownMenuTrigger>
        {value ? (
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted"
            onClick={() => onChange("", "")}
            aria-label="Clear category"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <DropdownMenuContent
        align="start"
        className="z-[400] w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden p-0"
      >
        <div className="border-b border-input p-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="h-7 pl-7 text-xs"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No categories found</p>
          ) : searching ? (
            filtered.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className={cn("rounded-sm", value === c.id && "bg-accent")}
                style={{ paddingLeft: 8 + c.depth * 14 }}
                onClick={() => selectAndClose(c.id, c.name)}
              >
                <span className="truncate text-[11px]">{c.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <CategoryTreeItems
              nodes={tree}
              value={value}
              onSelect={selectAndClose}
              expanded={expanded}
              onToggle={toggleExpanded}
            />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
