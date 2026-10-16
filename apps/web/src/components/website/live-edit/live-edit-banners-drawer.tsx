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
  Trash2,
} from "lucide-react";
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
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { cn } from "@/lib/utils";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type {
  BannerSlide,
  BannersSection,
  HeroObjectFit,
  HomepageContent,
} from "@/lib/website/website-homepage";
import { BANNER_SECTION_ASPECT, defaultBannerSlide } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

type PickerMode = { kind: "replace"; index: number } | null;

function bannerPreviewUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseUrl()}${url}`;
  return `${getStorefrontBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function readImageSize(url: string): Promise<{ width: number; height: number } | null> {
  if (!url || typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function FitToggle({
  value,
  onChange,
}: {
  value: HeroObjectFit;
  onChange: (fit: HeroObjectFit) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-white/20 bg-black/55 p-0.5 backdrop-blur-sm">
      {(["fill", "fit"] as const).map((fit) => (
        <button
          key={fit}
          type="button"
          className={cn(
            "h-7 rounded px-2 text-[11px] font-medium capitalize transition-colors",
            value === fit
              ? "bg-white text-foreground shadow-sm"
              : "text-white/80 hover:text-white",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onChange(fit);
          }}
        >
          {fit}
        </button>
      ))}
    </div>
  );
}

const SECTION_DESIGN_W = 660;
const SECTION_DESIGN_H = Math.round(SECTION_DESIGN_W / BANNER_SECTION_ASPECT);

function SortableBannerRow({
  slide,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggleHidden,
  onChangeImage,
}: {
  slide: BannerSlide;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<BannerSlide>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onChangeImage: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const preview = bannerPreviewUrl(slide.imageUrl);
  const fit = slide.objectFit ?? "fill";
  const isHidden = Boolean(slide.hidden);

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
          aria-label={`Drag banner ${index + 1}`}
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
          <div className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded border border-border bg-muted/40">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className={cn("h-full w-full", fit === "fit" ? "object-contain" : "object-cover")}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                Empty
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-[12px] font-medium text-foreground">
              Banner {index + 1}
              {isHidden ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(hidden)</span>
              ) : null}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{slide.href || "No link"}</p>
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
          aria-label={`Duplicate banner ${index + 1}`}
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
          aria-label={isHidden ? `Show banner ${index + 1}` : `Hide banner ${index + 1}`}
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
          aria-label={`Delete banner ${index + 1}`}
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
          <div
            className="relative overflow-hidden rounded-md border border-border bg-muted/40"
            style={{ aspectRatio: `${SECTION_DESIGN_W} / ${SECTION_DESIGN_H}` }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={slide.alt || `Banner ${index + 1}`}
                className={cn(
                  "h-full w-full",
                  fit === "fit" ? "object-contain" : "object-cover",
                )}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                No image
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/25" />

            <div className="absolute left-2 top-2 z-[2]">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
                aria-label="Change image"
                title="Change image"
                onClick={onChangeImage}
              >
                <ImageUp className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="absolute right-2 top-2 z-[2]">
              <FitToggle value={fit} onChange={(objectFit) => onUpdate({ objectFit })} />
            </div>
          </div>

          <AgainFormRow label="Link">
            <Input
              value={slide.href}
              onChange={(e) => onUpdate({ href: e.target.value })}
              className="h-8 text-[13px]"
              placeholder="/offers"
            />
          </AgainFormRow>
        </div>
      ) : null}
    </div>
  );
}

export function LiveEditBannersDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<BannersSection>(
    content.banners ?? { slides: [] },
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerMode>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (open) setSection(content.banners ?? { slides: [] });
  }, [open, content.banners]);

  useEffect(() => {
    if (open) setExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pushSection = useCallback(
    (next: BannersSection | ((prev: BannersSection) => BannersSection)) => {
      setSection((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        queueMicrotask(() => {
          onChange?.({ ...content, banners: resolved });
        });
        return resolved;
      });
    },
    [content, onChange],
  );

  const updateSlide = useCallback(
    (index: number, patch: Partial<BannerSlide>) => {
      pushSection((prev) => ({
        ...prev,
        slides: prev.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      }));
    },
    [pushSection],
  );

  const removeSlide = useCallback(
    (index: number) => {
      pushSection((prev) => {
        const removed = prev.slides[index];
        if (removed && expandedId === removed.id) setExpandedId(null);
        return { ...prev, slides: prev.slides.filter((_, i) => i !== index) };
      });
    },
    [pushSection, expandedId],
  );

  const duplicateSlide = useCallback(
    (index: number) => {
      pushSection((prev) => {
        const source = prev.slides[index];
        if (!source) return prev;
        const copy = defaultBannerSlide({
          imageUrl: source.imageUrl,
          href: source.href,
          alt: source.alt,
          objectFit: source.objectFit,
          imageWidth: source.imageWidth,
          imageHeight: source.imageHeight,
          hidden: false,
        });
        const next = [...prev.slides];
        next.splice(index + 1, 0, copy);
        setExpandedId(copy.id);
        return { ...prev, slides: next };
      });
    },
    [pushSection],
  );

  const slideIds = useMemo(() => section.slides.map((s) => s.id), [section.slides]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.slides.findIndex((s) => s.id === active.id);
    const newIndex = section.slides.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    pushSection({
      ...section,
      slides: arrayMove(section.slides, oldIndex, newIndex),
    });
  };

  const addSlide = () => {
    const item = defaultBannerSlide();
    pushSection((prev) => ({ ...prev, slides: [...prev.slides, item] }));
    setExpandedId(item.id);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextSlides = [...section.slides];
      let changed = false;
      for (let i = 0; i < nextSlides.length; i++) {
        const slide = nextSlides[i];
        if (!slide.imageUrl || (slide.imageWidth && slide.imageHeight)) continue;
        const size = await readImageSize(bannerPreviewUrl(slide.imageUrl));
        if (cancelled || !size) continue;
        nextSlides[i] = { ...slide, imageWidth: size.width, imageHeight: size.height };
        changed = true;
      }
      if (!cancelled && changed) {
        const next = { ...section, slides: nextSlides };
        setSection(next);
        onChange?.({ ...content, banners: next });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.slides.map((s) => s.imageUrl).join("|")]);

  const handleMediaSelect = async (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    const item = items[0];
    const preview = bannerPreviewUrl(item.url);
    const size = await readImageSize(preview);
    updateSlide(picker.index, {
      imageUrl: item.url,
      alt: item.alt || item.title || item.name || section.slides[picker.index]?.alt || "",
      imageWidth: size?.width ?? null,
      imageHeight: size?.height ?? null,
      objectFit: "fill",
    });
    const id = section.slides[picker.index]?.id;
    if (id) setExpandedId(id);
    setPicker(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Banners section"
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
              Banners
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-2">
              {section.slides.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {section.slides.map((slide, index) => (
                        <SortableBannerRow
                          key={slide.id}
                          slide={slide}
                          index={index}
                          expanded={expandedId === slide.id}
                          onToggle={() =>
                            setExpandedId((prev) => (prev === slide.id ? null : slide.id))
                          }
                          onUpdate={(patch) => updateSlide(index, patch)}
                          onRemove={() => removeSlide(index)}
                          onDuplicate={() => duplicateSlide(index)}
                          onToggleHidden={() => updateSlide(index, { hidden: !slide.hidden })}
                          onChangeImage={() => {
                            void refetchMedia();
                            setPicker({ kind: "replace", index });
                          }}
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
                  onClick={addSlide}
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
        title="Change banner image"
        accept={["image"]}
        initialSelectedIds={[]}
        onSelect={(items) => {
          void handleMediaSelect(items);
        }}
        onUploadFiles={async (files) => {
          const uploaded = await uploadCatalogMediaFiles(files);
          await refetchMedia();
          return uploaded;
        }}
      />
    </>
  );
}
