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
import { ChevronDown, ChevronsRight, Copy, Eye, EyeOff, GripVertical, ImageUp, Trash2 } from "lucide-react";
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
import { AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { cn } from "@/lib/utils";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type {
  HeroObjectFit,
  HeroSection,
  HeroSlide,
  HomepageContent,
} from "@/lib/website/website-homepage";
import { defaultHeroSlide, HERO_SECTION_ASPECT } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  sectionSize: { width: number; height: number };
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

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** e.g. 1000×500 → "2:1", 2000×1000 → "2:1" */
function formatRatio(width: number, height: number): string {
  if (!width || !height) return "—";
  const w = Math.round(width);
  const h = Math.round(height);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function aspectOf(width: number, height: number): number | null {
  if (!width || !height) return null;
  return width / height;
}

/** Same aspect within ~2% — e.g. section 2:1 and image 2:1 */
function ratiosMatch(
  sectionW: number,
  sectionH: number,
  imageW: number | null | undefined,
  imageH: number | null | undefined,
): boolean | null {
  const a = aspectOf(sectionW, sectionH);
  const b = imageW && imageH ? aspectOf(imageW, imageH) : null;
  if (a == null || b == null) return null;
  return Math.abs(a - b) / a < 0.02;
}

/** Design aspect for hero section (1880×1060). */
const SECTION_DESIGN_W = 1880;
const SECTION_DESIGN_H = Math.round(SECTION_DESIGN_W / HERO_SECTION_ASPECT);

function SortableBannerRow({
  slide,
  index,
  expanded,
  sectionSize,
  onToggle,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggleHidden,
  onChangeImage,
}: {
  slide: HeroSlide;
  index: number;
  expanded: boolean;
  sectionSize: { width: number; height: number };
  onToggle: () => void;
  onUpdate: (patch: Partial<HeroSlide>) => void;
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
  const sectionLabel =
    sectionSize.width > 0
      ? `${sectionSize.width} × ${sectionSize.height} px`
      : "—";
  // Section ratio is always the hero design aspect (same as live preview box).
  const sectionRatio = formatRatio(SECTION_DESIGN_W, SECTION_DESIGN_H);
  const imageLabel =
    slide.imageWidth && slide.imageHeight
      ? `${slide.imageWidth} × ${slide.imageHeight} px`
      : "—";
  const imageRatio =
    slide.imageWidth && slide.imageHeight
      ? formatRatio(slide.imageWidth, slide.imageHeight)
      : "—";
  const match = ratiosMatch(
    SECTION_DESIGN_W,
    SECTION_DESIGN_H,
    slide.imageWidth,
    slide.imageHeight,
  );

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
          <div className="relative h-12 w-[84px] shrink-0 overflow-hidden rounded border border-border bg-muted/40">
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
            <p className="truncate text-[10px] text-muted-foreground">
              {slide.href || "No link"}
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
          <div className="relative aspect-[1880/1060] overflow-hidden rounded-md border border-border bg-muted/40">
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

          <div className="space-y-1.5 rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-snug">
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Section</p>
                <p>{sectionLabel}</p>
                <p>
                  Ratio{" "}
                  <span className="font-semibold text-foreground">{sectionRatio}</span>
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Image</p>
                <p>{imageLabel}</p>
                <p>
                  Ratio{" "}
                  <span className="font-semibold text-foreground">{imageRatio}</span>
                </p>
              </div>
            </div>
            {match === true ? (
              <p className="rounded bg-[#00a09d]/15 px-2 py-1 text-[10px] font-medium text-[#00a09d]">
                Same ratio as section ({sectionRatio}) — Fill will cover without stretch
              </p>
            ) : match === false ? (
              <p className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Image {imageRatio} ≠ section {sectionRatio} — Fill crops · Fit letterboxes
              </p>
            ) : null}
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

export function LiveEditHeroDrawer({ open,
  onOpenChange,
  content,
  sectionSize,
  onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [hero, setHero] = useState<HeroSection>(content.hero);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (open) setHero(content.hero);
  }, [open, content.hero]);

  useEffect(() => {
    if (open) setExpandedId(null);
    // Only reset expand state when drawer opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pushHero = useCallback(
    (next: HeroSection) => {
      setHero(next);
      onChange?.({ ...content, hero: next });
    },
    [content, onChange],
  );

  const updateSlide = useCallback(
    (index: number, patch: Partial<HeroSlide>) => {
      pushHero({
        ...hero,
        slides: hero.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      });
    },
    [hero, pushHero],
  );

  const removeSlide = useCallback(
    (index: number) => {
      const removed = hero.slides[index];
      const nextSlides = hero.slides.filter((_, i) => i !== index);
      pushHero({ ...hero, slides: nextSlides });
      if (removed && expandedId === removed.id) setExpandedId(null);
    },
    [hero, pushHero, expandedId],
  );

  const duplicateSlide = useCallback(
    (index: number) => {
      const source = hero.slides[index];
      if (!source) return;
      const copy = defaultHeroSlide({
        imageUrl: source.imageUrl,
        href: source.href,
        alt: source.alt,
        objectFit: source.objectFit,
        imageWidth: source.imageWidth,
        imageHeight: source.imageHeight,
        hidden: false,
      });
      const nextSlides = [...hero.slides];
      nextSlides.splice(index + 1, 0, copy);
      pushHero({ ...hero, slides: nextSlides });
      setExpandedId(copy.id);
    },
    [hero, pushHero],
  );

  const slideIds = useMemo(() => hero.slides.map((s) => s.id), [hero.slides]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = hero.slides.findIndex((s) => s.id === active.id);
    const newIndex = hero.slides.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    pushHero({
      ...hero,
      slides: arrayMove(hero.slides, oldIndex, newIndex),
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextSlides = [...hero.slides];
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
        const next = { ...hero, slides: nextSlides };
        setHero(next);
        onChange?.({ ...content, hero: next });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.slides.map((s) => s.imageUrl).join("|")]);

  const applyMediaItem = async (item: MediaLibraryItem) => {
    const preview = bannerPreviewUrl(item.url);
    const size = await readImageSize(preview);
    return {
      imageUrl: item.url,
      alt: item.alt || item.title || item.name || "",
      imageWidth: size?.width ?? null,
      imageHeight: size?.height ?? null,
      objectFit: "fill" as HeroObjectFit,
    };
  };

  const handleMediaSelect = async (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }

    const patch = await applyMediaItem(items[0]);
    updateSlide(picker.index, {
      ...patch,
      alt: patch.alt || hero.slides[picker.index]?.alt || "",
    });
    const id = hero.slides[picker.index]?.id;
    if (id) setExpandedId(id);
    setPicker(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Hero section"
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
              Hero banners
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              {/* Common options */}
              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Common
                </p>
                <AgainFormRow label="Autoplay" help="Milliseconds · 0 = off">
                  <AgainUnderlineInput
                    value={String(hero.autoplayMs)}
                    onChange={(v) => {
                      const n = Number.parseInt(v, 10);
                      pushHero({
                        ...hero,
                        autoplayMs: Number.isFinite(n) ? Math.max(0, n) : 0,
                      });
                    }}
                  />
                </AgainFormRow>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Banners
                  <span className="ml-1 font-normal normal-case text-muted-foreground/80">
                    · drag · duplicate · eye hide
                  </span>
                </p>

                {hero.slides.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-card/60 px-3 py-8 text-center text-[13px] text-muted-foreground">
                    No banners left. Restore from a previous save, or re-seed homepage content.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {hero.slides.map((slide, index) => (
                          <SortableBannerRow
                            key={slide.id}
                            slide={slide}
                            index={index}
                            expanded={expandedId === slide.id}
                            sectionSize={sectionSize}
                            onToggle={() =>
                              setExpandedId((prev) => (prev === slide.id ? null : slide.id))
                            }
                            onUpdate={(patch) => updateSlide(index, patch)}
                            onRemove={() => removeSlide(index)}
                            onDuplicate={() => duplicateSlide(index)}
                            onToggleHidden={() =>
                              updateSlide(index, { hidden: !slide.hidden })
                            }
                            onChangeImage={() => {
                              void refetchMedia();
                              setPicker({ kind: "replace", index });
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
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
