"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import type { BlogCategory } from "@/lib/blog/blog-category";
import {
  buildBlogCategoryTree,
  flattenBlogCategoryTree,
  type BlogCategoryNode,
  type FlatBlogCategory,
} from "@/lib/blog/blog-category-tree";
import { AgainUnderlineField } from "@/components/again/again-form-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function CategoryTreeItems({
  nodes,
  value,
  onSelect,
  expanded,
  onToggle,
}: {
  nodes: BlogCategoryNode[];
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
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground"
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
  categories: BlogCategory[];
  value: string;
  onChange: (id: string, name: string) => void;
  onAdd?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Fallback label when value is set but the category is not in `categories` yet. */
  selectedName?: string;
  /** Include inactive categories (e.g. parent picker). */
  includeInactive?: boolean;
  menuClassName?: string;
};

export function BlogCategoryCombobox({
  categories,
  value,
  onChange,
  onAdd,
  readOnly,
  placeholder = "Select category",
  selectedName,
  includeInactive = false,
  menuClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const pickerCategories = useMemo(
    () => (includeInactive ? categories : categories.filter((c) => c.status === "active")),
    [categories, includeInactive],
  );

  const tree = useMemo(() => buildBlogCategoryTree(pickerCategories), [pickerCategories]);
  const flatCategories = useMemo(() => flattenBlogCategoryTree(tree), [tree]);
  const selected = categories.find((c) => c.id === value);
  const displayName = selected?.name ?? (value ? selectedName : undefined);

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

  if (readOnly) {
    return (
      <AgainUnderlineField readOnly>
        <p className="flex h-[28px] items-center text-[13px] text-foreground">
          {displayName || "—"}
        </p>
      </AgainUnderlineField>
    );
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <AgainUnderlineField active={open}>
        <div className="flex h-8 items-center gap-1">
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none">
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  displayName ? "text-foreground" : "text-muted-foreground/70",
                )}
              >
                {displayName || placeholder}
              </span>
            </button>
          </DropdownMenuTrigger>
          {value ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="Clear category"
              onClick={() => onChange("", "")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onAdd ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-[#00a09d]/40 bg-[#00a09d]/10 text-[#00a09d] hover:bg-[#00a09d]/20 dark:text-[#00a09d]"
              aria-label="Add category"
              title="Add category"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </AgainUnderlineField>

      <DropdownMenuContent
        align="start"
        className={cn(
          "z-[300] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px] overflow-hidden p-0",
          menuClassName,
        )}
      >
        <div className="border-b border-input p-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category…"
              className="h-8 border-0 bg-transparent pl-8 text-[13px] shadow-none focus-visible:ring-0"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">No categories found</p>
          ) : searching ? (
            filtered.map((c: FlatBlogCategory) => (
              <DropdownMenuItem
                key={c.id}
                className={cn("rounded-sm", value === c.id && "bg-accent")}
                style={{ paddingLeft: 8 + c.depth * 14 }}
                onClick={() => selectAndClose(c.id, c.name)}
              >
                <span className="truncate text-[13px]">{c.name}</span>
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
