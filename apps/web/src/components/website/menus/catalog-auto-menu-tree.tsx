"use client";

import { useEffect, useState } from "react";
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
  FileText,
  FolderOpen,
  GripVertical,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { Input } from "@/components/ui/input";
import { createCatalogBrand } from "@/lib/api/use-catalog-brands";
import {
  createCatalogCategory,
  useCatalogCategories,
} from "@/lib/api/use-catalog-categories";
import { cn } from "@/lib/utils";
import type { MenuAutoType, WebsiteMenuItem } from "@/lib/website/website-menus";
import { autoTypeLabel } from "@/lib/website/website-menus";

function isSyncedAutoItem(item: WebsiteMenuItem, autoType: MenuAutoType) {
  return item.linkType === autoType && Boolean(item.linkRefId);
}

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

function collectExpandableIds(items: WebsiteMenuItem[], into: Set<string>) {
  for (const item of items) {
    if (item.children.length > 0) {
      into.add(item.id);
      collectExpandableIds(item.children, into);
    }
  }
}

function categoryToMenuItem(
  cat: {
    id: string;
    name: string;
    slug: string;
  },
  hidden = false,
): WebsiteMenuItem {
  return {
    id: `cat-${cat.id}`,
    label: cat.name,
    linkType: "category",
    linkRefId: cat.id,
    href: `/${cat.slug.replace(/^\//, "")}`,
    hidden,
    children: [],
  };
}

function brandToMenuItem(
  brand: {
    id: string;
    name: string;
    slug: string;
  },
  hidden = false,
): WebsiteMenuItem {
  return {
    id: `brand-${brand.id}`,
    label: brand.name,
    linkType: "brand",
    linkRefId: brand.id,
    href: `/${brand.slug.replace(/^\//, "")}`,
    hidden,
    children: [],
  };
}

function SyncedIcon({ autoType }: { autoType: MenuAutoType }) {
  if (autoType === "brand") {
    return <Tag className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />;
  }
  if (autoType === "page") {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  return <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />;
}

function SortableTreeRow({
  item,
  autoType,
  expanded,
  onToggleExpand,
  onToggleHidden,
  onChange,
  onRemove,
}: {
  item: WebsiteMenuItem;
  autoType: MenuAutoType;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleHidden: () => void;
  onChange: (patch: Partial<WebsiteMenuItem>) => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const synced = isSyncedAutoItem(item, autoType);
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
        )}
      >
        <button
          type="button"
          className="inline-flex shrink-0 touch-none items-center text-muted-foreground hover:text-foreground"
          aria-label={`Drag ${item.label}`}
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

        {synced ? (
          <SyncedIcon autoType={autoType} />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}

        {synced ? (
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {item.label}
          </span>
        ) : (
          <Input
            value={item.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="h-6 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus-visible:ring-1"
            placeholder="Label"
          />
        )}

        {synced ? (
          <span
            className="hidden max-w-[140px] shrink-0 truncate text-[10px] text-muted-foreground sm:inline"
            title={item.href}
          >
            {item.href}
          </span>
        ) : (
          <Input
            value={item.href}
            onChange={(e) => onChange({ href: e.target.value })}
            className="h-6 w-[110px] shrink-0 border-0 bg-transparent px-1 text-[10px] text-muted-foreground shadow-none focus-visible:ring-1 sm:w-[140px]"
            placeholder="/url"
          />
        )}

        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={isHidden ? "Show" : "Hide"}
          title={isHidden ? "Show on storefront" : "Hide from storefront"}
          onClick={onToggleHidden}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>

        {onRemove ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove custom item"
            title="Remove"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="inline-flex h-6 w-6 shrink-0" />
        )}
      </div>
    </div>
  );
}

function AddEntityButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      onClick={onClick}
    >
      <Plus className="h-3 w-3" />
      {label}
    </button>
  );
}

type Props = {
  items: WebsiteMenuItem[];
  onChange: (items: WebsiteMenuItem[]) => void;
  autoType?: MenuAutoType;
  /** When true, newly added category/brand rows start hidden. */
  newItemsHidden?: boolean;
};

type AddTarget = {
  menuParentId: string | null;
  catalogParentId: string | null;
};

export function CatalogAutoMenuTree({
  items,
  onChange,
  autoType = "category",
  newItemsHidden = false,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<AddTarget>({
    menuParentId: null,
    catalogParentId: null,
  });
  const { categories, refetch: refetchCategories } = useCatalogCategories({
    channel: "dropshipping",
  });
  const canAddCategory = autoType === "category";
  const canAddBrand = autoType === "brand";
  const canAddEntity = canAddCategory || canAddBrand;
  const entityLabel = autoTypeLabel(autoType).toLowerCase();

  useEffect(() => {
    setExpandedIds((prev) => {
      const all = new Set<string>();
      collectExpandableIds(items, all);
      if (prev.size === 0) return all;
      const next = new Set(prev);
      for (const id of all) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
  }, [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange(reorderSiblings(items, String(active.id), String(over.id)));
  };

  const openAddCategory = (menuParent: WebsiteMenuItem | null) => {
    setAddTarget({
      menuParentId: menuParent?.id ?? null,
      catalogParentId:
        menuParent && isSyncedAutoItem(menuParent, "category") ? menuParent.linkRefId : null,
    });
    setAddCategoryOpen(true);
  };

  const openAddBrand = () => {
    setAddBrandOpen(true);
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
            const synced = isSyncedAutoItem(item, autoType);
            return (
              <div key={item.id}>
                <SortableTreeRow
                  item={item}
                  autoType={autoType}
                  expanded={expanded}
                  onToggleExpand={() => toggleExpand(item.id)}
                  onToggleHidden={() =>
                    onChange(mapItems(items, item.id, (row) => ({ ...row, hidden: !row.hidden })))
                  }
                  onChange={(patch) =>
                    onChange(mapItems(items, item.id, (row) => ({ ...row, ...patch })))
                  }
                  onRemove={
                    synced ? undefined : () => onChange(mapItems(items, item.id, () => null))
                  }
                />
                {expanded ? (
                  <>
                    {item.children.length > 0 ? renderLevel(item.children, true) : null}
                    {canAddCategory ? (
                      <div
                        className={cn(
                          item.children.length === 0 && "ml-5 border-l border-border pl-2",
                        )}
                      >
                        <AddEntityButton
                          label="Add category"
                          onClick={() => openAddCategory(item)}
                        />
                      </div>
                    ) : null}
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
    <>
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">
          Drag to reorder · eye to hide
          {canAddCategory
            ? " · Add category opens the category form · new categories sync in"
            : canAddBrand
              ? " · Add brand opens the brand form · new brands sync in"
              : ` · new ${entityLabel}s sync in automatically`}
          .
        </p>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-[12px] text-muted-foreground">
            No {entityLabel}s yet
            {canAddEntity
              ? " — add one below, or create them in Catalog."
              : " — create them in Website → Pages."}
          </p>
        ) : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {renderLevel(items, false)}
        </DndContext>
        {canAddCategory ? (
          <AddEntityButton label="Add category" onClick={() => openAddCategory(null)} />
        ) : null}
        {canAddBrand ? <AddEntityButton label="Add brand" onClick={openAddBrand} /> : null}
      </div>

      {canAddCategory ? (
        <CategoryFormDialog
          open={addCategoryOpen}
          onOpenChange={setAddCategoryOpen}
          mode="create"
          categories={categories}
          defaultParentId={addTarget.catalogParentId}
          onSave={async (data) => {
            try {
              const created = await createCatalogCategory({
                name: data.name ?? "",
                caption: data.caption ?? data.name ?? "",
                slug: data.slug ?? "",
                parentId: data.parentId ?? null,
                active: data.active ?? true,
                showInTopMenu: data.showInTopMenu ?? false,
                description: data.description,
                metaTitle: data.metaTitle,
                metaDescription: data.metaDescription,
                metaKeywords: data.metaKeywords,
                iconUrl: data.iconUrl,
                bannerUrl: data.bannerUrl,
                iconMediaId: data.iconMediaId,
                bannerMediaId: data.bannerMediaId,
                channel: "dropshipping",
              });
              await refetchCategories();
              const menuItem = categoryToMenuItem(created, newItemsHidden);
              const next = appendChild(items, addTarget.menuParentId, menuItem);
              onChange(next);
              if (addTarget.menuParentId) {
                setExpandedIds((prev) => new Set(prev).add(addTarget.menuParentId!));
              }
              setAddCategoryOpen(false);
              toast.success("Category created");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to create category");
            }
          }}
        />
      ) : null}

      {canAddBrand ? (
        <BrandFormDialog
          open={addBrandOpen}
          onOpenChange={setAddBrandOpen}
          mode="create"
          onSave={async (data) => {
            try {
              const created = await createCatalogBrand({
                name: data.name ?? "",
                slug: data.slug ?? "",
                active: data.active ?? true,
                description: data.description,
                websiteUrl: data.websiteUrl,
                metaTitle: data.metaTitle,
                metaDescription: data.metaDescription,
                metaKeywords: data.metaKeywords,
                logoUrl: data.logoUrl,
                bannerUrl: data.bannerUrl,
                logoMediaId: data.logoMediaId,
                bannerMediaId: data.bannerMediaId,
                channel: "dropshipping",
              });
              const menuItem = brandToMenuItem(created, newItemsHidden);
              onChange([...items, menuItem]);
              setAddBrandOpen(false);
              toast.success("Brand created");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to create brand");
            }
          }}
        />
      ) : null}
    </>
  );
}
