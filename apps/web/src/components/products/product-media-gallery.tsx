"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, ImageOff, Play, Star, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/lib/mock-data/products";

type ProductMediaGalleryProps = {
  media: ProductMedia[];
  productName: string;
  className?: string;
  compact?: boolean;
  /** 1:1 main image (drawer) */
  square?: boolean;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
};

export function ProductMediaGallery({
  media,
  productName,
  className,
  compact,
  square,
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: ProductMediaGalleryProps) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState(0);
  const isControlled = controlledIndex !== undefined;
  const activeIndex = isControlled ? controlledIndex : uncontrolledIndex;
  const videoRef = useRef<HTMLVideoElement>(null);

  const setActiveIndex = useCallback(
    (index: number) => {
      if (isControlled) onActiveIndexChange?.(index);
      else setUncontrolledIndex(index);
    },
    [isControlled, onActiveIndexChange],
  );

  const active = media[activeIndex];
  const hasMultiple = media.length > 1;

  useEffect(() => {
    if (!isControlled) setUncontrolledIndex(0);
  }, [media, isControlled]);

  useEffect(() => {
    if (active?.type !== "video") return;
    const timer = window.setTimeout(() => {
      void videoRef.current?.play().catch(() => undefined);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeIndex, active?.type, active?.id]);

  if (!active) {
    return (
      <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
        <div
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted text-muted-foreground",
            square
              ? "aspect-square max-h-64"
              : compact
                ? "aspect-[4/3] max-h-44"
                : "aspect-square rounded-xl",
          )}
          aria-label="No image"
        >
          <ImageOff className="h-8 w-8" />
          <span className="text-xs">No image</span>
        </div>
      </div>
    );
  }

  const imageCount = media.filter((m) => m.type === "image").length;
  const videoCount = media.filter((m) => m.type === "video").length;

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border bg-muted shadow-sm",
          square
            ? "aspect-square max-h-64"
            : compact
              ? "aspect-[4/3] max-h-44"
              : "aspect-square rounded-xl",
        )}
      >
        {/* image/video count badges — top-right corner */}
        {(imageCount > 0 || videoCount > 0) && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
            {imageCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                <ImageIcon className="h-3 w-3" />
                {imageCount}
              </span>
            )}
            {videoCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                <Video className="h-3 w-3" />
                {videoCount}
              </span>
            )}
          </div>
        )}
        {active.type === "video" ? (
          <video
            key={active.id}
            ref={videoRef}
            src={active.url}
            poster={active.poster}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={active.url}
            alt={active.title ?? productName}
            className="h-full w-full object-cover"
          />
        )}

        {active.isPrimary && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Star className="h-3 w-3 fill-current" />
            Primary
          </span>
        )}

        {active.title && (
          <span
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 text-white",
              compact ? "pb-2 pt-6 text-xs font-medium" : "pb-3 pt-8 text-sm font-medium",
            )}
          >
            {active.title}
          </span>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
          {media.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "relative shrink-0 overflow-hidden rounded-md border-2 transition",
                compact ? "h-11 w-11" : "h-16 w-16 rounded-lg",
                i === activeIndex
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
              aria-label={item.title ?? `Media ${i + 1}`}
              aria-current={i === activeIndex}
            >
              {item.type === "video" ? (
                <>
                  <img
                    src={item.poster ?? item.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-4 w-4 fill-white text-white" />
                  </span>
                  {item.duration && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[9px] font-medium text-white">
                      {item.duration}
                    </span>
                  )}
                </>
              ) : (
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              )}
              {item.isPrimary && (
                <Star className="absolute left-0.5 top-0.5 h-3 w-3 fill-amber-400 text-amber-400 drop-shadow" />
              )}
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <p className="text-xs text-muted-foreground">
          Thumbnails switch preview · videos play inline · select a variant to jump to its primary image
        </p>
      )}
    </div>
  );
}
