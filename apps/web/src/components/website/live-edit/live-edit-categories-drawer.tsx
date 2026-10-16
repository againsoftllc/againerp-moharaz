"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
  ChevronsRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImageUp,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCatalogCategory,
  useCatalogCategories,
} from "@/lib/api/use-catalog-categories";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import { getApiBaseUrl } from "@/lib/api/client";
import type { Category } from "@/lib/mock-data/categories";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { cn } from "@/lib/utils";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type {
  CategoriesSection,
  CategoryCarouselItem,
  HomepageContent,
} from "@/lib/website/website-homepage";
import { defaultCategoriesSection, defaultCategoryItem } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

type PickerMode = { kind: "replace"; index: number } | null;

function resolvePreviewUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseUrl()}${url}`;
  return `${getStorefrontBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function catalogThumb(cat: Category | undefined): string {
  return resolvePreviewUrl(cat?.bannerUrl || cat?.iconUrl || "");
}

function itemThumb(item: CategoryCarouselItem, cat: Category | undefined): string {
  if (item.imageUrl) return resolvePreviewUrl(item.imageUrl);
  return catalogThumb(cat);
}

function SortableCategoryRow({
  item,
  index,
  expanded,
  category,
  categories,
  onToggle,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggleHidden,
  onChangeImage,
  onResetImage,
}: {
  item: CategoryCarouselItem;
  index: number;
  expanded: boolean;
  category: Category | undefined;
  categories: Category[];
  onToggle: () => void;
  onUpdate: (patch: Partial<CategoryCarouselItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onChangeImage: () => void;
  onResetImage: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const isHidden = Boolean(item.hidden);
  const thumb = itemThumb(item, category);
  const hasOverride = Boolean(item.imageUrl);
  const defaultHref = category ? `/${category.slug}` : "/";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card",
        isDragging && "z-10 opacity-90 shadow-md ring-1 ring-[#00a09d]/40",
        expanded && "border-[#00a09d]/40",
        isHidden && "opacity-60",
      )}
    >
      <div className="flex items-stretch gap-1 p-1.5">
        <button
          type="button"
          className="inline-flex shrink-0 touch-none items-center px-0.5 text-muted-foreground hover:text-foreground"
          aria-label={`Drag category ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none hover:bg-muted/40"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                —
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-[12px] font-medium text-foreground">
              Category {index + 1}
              {isHidden ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (hidden)
                </span>
              ) : null}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {category?.name || (item.categoryId ? "Missing category" : "Not connected")}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Duplicate category ${index + 1}`}
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-muted",
            isHidden ? "text-muted-foreground" : "text-foreground",
          )}
          aria-label={isHidden ? `Show category ${index + 1}` : `Hide category ${index + 1}`}
          title={isHidden ? "Show on live" : "Hide from live"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete category ${index + 1}`}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2 border-t border-border px-2.5 py-2.5">
          <div className="relative aspect-[5/4] overflow-hidden rounded-md border border-border bg-muted/40">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt={category?.name || `Category ${index + 1}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                No image
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/25" />

            <div className="absolute left-2 top-2 z-[2] flex gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
                aria-label="Change image"
                title="Change image"
                onClick={onChangeImage}
              >
                <ImageUp className="h-3.5 w-3.5" />
              </button>
              {hasOverride ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
                  aria-label="Use catalog image"
                  title="Use catalog image"
                  onClick={onResetImage}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <AgainFormRow label="Category">
            <CategoryCombobox
              categories={categories}
              value={item.categoryId}
              onChange={(id) => onUpdate({ categoryId: id })}
              className="w-full"
            />
          </AgainFormRow>

          <AgainFormRow label="Link">
            <Input
              value={item.href ?? ""}
              onChange={(e) => onUpdate({ href: e.target.value })}
              className="h-8 text-[13px]"
              placeholder={defaultHref}
            />
          </AgainFormRow>
          <p className="text-[11px] text-muted-foreground">
            Leave blank to use{" "}
            <span className="font-medium text-foreground">{defaultHref}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function LiveEditCategoriesDrawer({ open,
  onOpenChange,
  content,
  onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<CategoriesSection>(
    content.categories ?? defaultCategoriesSection(),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryForIndex, setAddCategoryForIndex] = useState<number | null>(null);
  const { categories, refetch: refetchCategories } = useCatalogCategories({
    channel: "dropshipping",
  });
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (open) setSection(content.categories ?? defaultCategoriesSection());
  }, [open, content.categories]);

  useEffect(() => {
    if (open) setExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const pushSection = useCallback(
    (next: CategoriesSection | ((prev: CategoriesSection) => CategoriesSection)) => {
      setSection((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        queueMicrotask(() => {
          onChange?.({
            ...content,
            categories: resolved,
          });
        });
        return resolved;
      });
    },
    [content, onChange],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<CategoryCarouselItem>) => {
      pushSection((prev) => ({
        ...prev,
        items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      }));
    },
    [pushSection],
  );

  const removeItem = useCallback(
    (index: number) => {
      const removed = section.items[index];
      pushSection({
        ...section,
        items: section.items.filter((_, i) => i !== index),
      });
      if (removed && expandedId === removed.id) setExpandedId(null);
    },
    [section, pushSection, expandedId],
  );

  const duplicateItem = useCallback(
    (index: number) => {
      const source = section.items[index];
      if (!source) return;
      const copy = defaultCategoryItem(source.categoryId);
      copy.imageUrl = source.imageUrl ?? "";
      copy.href = source.href ?? "";
      const next = [...section.items];
      next.splice(index + 1, 0, { ...copy, hidden: false });
      pushSection({ ...section, items: next });
      setExpandedId(copy.id);
    },
    [section, pushSection],
  );

  const itemIds = useMemo(() => section.items.map((i) => i.id), [section.items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.items.findIndex((s) => s.id === active.id);
    const newIndex = section.items.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    pushSection({
      ...section,
      items: arrayMove(section.items, oldIndex, newIndex),
    });
  };

  const addItem = () => {
    const first = categories.find((c) => c.active);
    const item = defaultCategoryItem(first?.id ?? "");
    pushSection({
      ...section,
      items: [...section.items, item],
    });
    setExpandedId(item.id);
  };

  const handleMediaSelect = (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    updateItem(picker.index, { imageUrl: items[0].url });
    const id = section.items[picker.index]?.id;
    if (id) setExpandedId(id);
    setPicker(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Categories section"
        resizable
        defaultWidth={420}
        widthStorageKey="website-live-edit-drawer-width"
      >
        <AgainDrawerLayout>
          <AgainDrawerControlBar
            trailing={<LiveEditDrawerSaveButton onSave={onSave} saving={saving} />}
          >
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close drawer"
              title="Close"
              onClick={() => onOpenChange(false)}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Website</span>
            <span className="text-muted-foreground">/</span>
            <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
              Categories
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-2">
              {section.items.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {section.items.map((item, index) => (
                        <SortableCategoryRow
                          key={item.id}
                          item={item}
                          index={index}
                          expanded={expandedId === item.id}
                          category={categoryById.get(item.categoryId)}
                          categories={categories}
                          onToggle={() =>
                            setExpandedId((cur) => (cur === item.id ? null : item.id))
                          }
                          onUpdate={(patch) => updateItem(index, patch)}
                          onToggleHidden={() => updateItem(index, { hidden: !item.hidden })}
                          onDuplicate={() => duplicateItem(index)}
                          onRemove={() => removeItem(index)}
                          onChangeImage={() => {
                            void refetchMedia();
                            setPicker({ kind: "replace", index });
                          }}
                          onResetImage={() => updateItem(index, { imageUrl: "" })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}

              <div className="flex items-center justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[12px]"
                  onClick={addItem}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>
          </AgainDrawerScrollBody>
        </AgainDrawerLayout>
      </AgainDrawerPanel>

      <MediaLibraryModal
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null);
          else void refetchMedia();
        }}
        items={mediaItems}
        mode="single"
        title="Change category image"
        accept={["image"]}
        initialSelectedIds={[]}
        onSelect={(items) => {
          handleMediaSelect(items);
        }}
        onUploadFiles={async (files) => {
          const uploaded = await uploadCatalogMediaFiles(files);
          await refetchMedia();
          return uploaded;
        }}
      />

      <CategoryFormDialog
        open={addCategoryOpen}
        onOpenChange={(next) => {
          setAddCategoryOpen(next);
          if (!next) setAddCategoryForIndex(null);
        }}
        mode="create"
          categories={categories}
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
            if (addCategoryForIndex != null) {
              updateItem(addCategoryForIndex, { categoryId: created.id });
            }
            toast.success("Category created");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create category");
          }
        }}
      />
    </>
  );
}
