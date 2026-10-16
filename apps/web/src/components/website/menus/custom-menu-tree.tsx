"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import { BrandCombobox } from "@/components/brands/brand-combobox";
import { CategoryTreeSelect } from "@/components/categories/category-tree-select";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Brand } from "@/lib/mock-data/brands";
import type { Category } from "@/lib/mock-data/categories";
import { cn } from "@/lib/utils";
import type { MenuLinkType, WebsiteMenuItem } from "@/lib/website/website-menus";
import { defaultMenuItem } from "@/lib/website/website-menus";

function reorderSiblings(
  items: WebsiteMenuItem[],
  activeId: string,
  overId: string,
): WebsiteMenuItem[] {
  const ids = items.map((i) => i.id);
  if (ids.includes(activeId) && ids.includes(overId)) {
    return arrayMove(items, ids.indexOf(activeId), ids.indexOf(overId));
  }
  return items.map((item) => ({
    ...item,
    children: reorderSiblings(item.children, activeId, overId),
  }));
}

function mapItems(
  items: WebsiteMenuItem[],
  id: string,
  fn: (item: WebsiteMenuItem) => WebsiteMenuItem | null,
): WebsiteMenuItem[] {
  const out: WebsiteMenuItem[] = [];
  for (const item of items) {
    if (item.id === id) {
      const next = fn(item);
      if (next) out.push(next);
      continue;
    }
    out.push({ ...item, children: mapItems(item.children, id, fn) });
  }
  return out;
}

function appendChild(
  items: WebsiteMenuItem[],
  parentId: string | null,
  child: WebsiteMenuItem,
): WebsiteMenuItem[] {
  if (parentId === null) return [...items, child];
  return items.map((item) => {
    if (item.id === parentId) {
      return { ...item, children: [...item.children, child] };
    }
    return { ...item, children: appendChild(item.children, parentId, child) };
  });
}

function linkTypeLabel(type: MenuLinkType) {
  switch (type) {
    case "page":
      return "Page";
    case "category":
      return "Category";
    case "brand":
      return "Brand";
    default:
      return "URL";
  }
}

function SortableMenuRow({
  item,
  expanded,
  onToggleExpand,
  onToggleHidden,
  onRemove,
  onPatch,
  pages,
  categories,
  brands,
}: {
  item: WebsiteMenuItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleHidden: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<WebsiteMenuItem>) => void;
  pages: { id: string; name: string; url: string }[];
  categories: Category[];
  brands: Brand[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const isHidden = Boolean(item.hidden);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className={cn(isHidden && "opacity-55")}
    >
      <div
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-1 hover:bg-muted/40",
          isDragging && "bg-muted/60 ring-1 ring-[#00a09d]/35",
          expanded && "bg-muted/30",
        )}
      >
        <button
          type="button"
          className="inline-flex shrink-0 touch-none items-center text-muted-foreground hover:text-foreground"
          aria-label={`Drag ${item.label || "menu"}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 cursor-grab active:cursor-grabbing" />
        </button>

        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={onToggleExpand}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />

        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {item.label || "Untitled"}
        </span>

        {!expanded ? (
          <>
            <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
              {linkTypeLabel(item.linkType)}
            </span>
            <span
              className="hidden max-w-[120px] shrink-0 truncate text-[10px] text-muted-foreground sm:inline"
              title={item.href}
            >
              {item.href || "—"}
            </span>
          </>
        ) : null}

        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={isHidden ? "Show" : "Hide"}
          title={isHidden ? "Show on storefront" : "Hide from storefront"}
          onClick={onToggleHidden}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove"
          title="Remove"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="ml-5 space-y-2 border-l border-border py-2 pl-3">
          <AgainFormRow label="Label">
            <Input
              value={item.label}
              onChange={(e) => onPatch({ label: e.target.value })}
              className="h-8 text-[13px]"
              placeholder="Menu label"
            />
          </AgainFormRow>

          <AgainFormRow label="Link type">
            <Select
              value={item.linkType}
              onValueChange={(v) => {
                const linkType = v as MenuLinkType;
                onPatch({
                  linkType,
                  linkRefId: null,
                  href: linkType === "custom" ? item.href : "",
                });
              }}
            >
              <SelectTrigger className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="page">Page</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="brand">Brand</SelectItem>
                <SelectItem value="custom">Custom URL</SelectItem>
              </SelectContent>
            </Select>
          </AgainFormRow>

          {item.linkType === "page" ? (
            <AgainFormRow label="Page">
              <Select
                value={item.linkRefId || ""}
                onValueChange={(id) => {
                  const page = pages.find((p) => p.id === id);
                  onPatch({
                    linkRefId: id,
                    label: item.label || page?.name || "",
                    href: page?.url || "",
                  });
                }}
              >
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AgainFormRow>
          ) : null}

          {item.linkType === "category" ? (
            <AgainFormRow label="Category">
              <CategoryTreeSelect
                categories={categories}
                value={item.linkRefId || ""}
                onChange={(id, name) =>
                  onPatch({
                    linkRefId: id,
                    label: item.label || name,
                  })
                }
                className="w-full"
              />
            </AgainFormRow>
          ) : null}

          {item.linkType === "brand" ? (
            <AgainFormRow label="Brand">
              <BrandCombobox
                brands={brands}
                value={item.linkRefId || ""}
                onChange={(id, name) =>
                  onPatch({
                    linkRefId: id,
                    label: item.label || name,
                  })
                }
                className="w-full"
              />
            </AgainFormRow>
          ) : null}

          {item.linkType === "custom" ? (
            <AgainFormRow label="URL">
              <Input
                value={item.href}
                onChange={(e) => onPatch({ href: e.target.value })}
                className="h-8 text-[13px]"
                placeholder="/about or https://…"
              />
            </AgainFormRow>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      onClick={onClick}
    >
      <Plus className="h-3 w-3" />
      Add menu
    </button>
  );
}

type Props = {
  items: WebsiteMenuItem[];
  onChange: (items: WebsiteMenuItem[]) => void;
  pages: { id: string; name: string; url: string }[];
  categories: Category[];
  brands: Brand[];
};

export function CustomMenuTree({ items, onChange, pages, categories, brands }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange(reorderSiblings(items, String(active.id), String(over.id)));
  };

  const addMenu = (parentId: string | null) => {
    const child = defaultMenuItem({ label: "New menu", href: "/" });
    onChange(appendChild(items, parentId, child));
    if (parentId) {
      setExpandedIds((prev) => new Set(prev).add(parentId));
    } else {
      setExpandedIds((prev) => new Set(prev).add(child.id));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderLevel = (list: WebsiteMenuItem[], nested: boolean) => {
    const ids = list.map((i) => i.id);
    return (
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={cn(nested && "ml-5 border-l border-border py-0.5 pl-2")}>
          {list.map((item) => {
            const expanded = expandedIds.has(item.id);
            return (
              <div key={item.id}>
                <SortableMenuRow
                  item={item}
                  expanded={expanded}
                  onToggleExpand={() => toggleExpand(item.id)}
                  onToggleHidden={() =>
                    onChange(mapItems(items, item.id, (row) => ({ ...row, hidden: !row.hidden })))
                  }
                  onRemove={() => onChange(mapItems(items, item.id, () => null))}
                  onPatch={(patch) =>
                    onChange(mapItems(items, item.id, (row) => ({ ...row, ...patch })))
                  }
                  pages={pages}
                  categories={categories}
                  brands={brands}
                />
                {expanded ? (
                  <>
                    {item.children.length > 0 ? renderLevel(item.children, true) : null}
                    <div
                      className={cn(item.children.length === 0 && "ml-5 border-l border-border pl-2")}
                    >
                      <AddMenuButton onClick={() => addMenu(item.id)} />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </SortableContext>
    );
  };

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[12px] text-muted-foreground">
          No menus yet — add a page, category, brand, or custom URL.
        </p>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {renderLevel(items, false)}
      </DndContext>
      <AddMenuButton onClick={() => addMenu(null)} />
    </div>
  );
}
