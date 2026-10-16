"use client";

import { Play } from "lucide-react";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import {
  externalVideoCoverUrl,
  publicMediaUrl,
  videoCoverSrc,
} from "@/lib/media/public-media-url";
import { applyImageFallback } from "@/lib/media/image-fallback";
import { cn } from "@/lib/utils";

type Props = {
  item: Pick<MediaLibraryItem, "type" | "url" | "provider" | "alt" | "name">;
  className?: string;
  showPlayOverlay?: boolean;
};

/**
 * Square tile cover: images via <img>, file videos via muted <video> first frame,
 * YouTube/Vimeo via platform thumbnail.
 */
export function MediaTileCover({ item, className, showPlayOverlay = true }: Props) {
  const hideBroken = (el: HTMLElement) => {
    el.style.visibility = "hidden";
  };

  if (item.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={publicMediaUrl(item.url)}
        alt={item.alt ?? item.name}
        className={cn("absolute inset-0 z-[1] h-full w-full object-cover", className)}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={applyImageFallback}
      />
    );
  }

  if (item.type === "video") {
    const cover = externalVideoCoverUrl(item.url, item.provider);
    if (cover) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className={cn("absolute inset-0 z-[1] h-full w-full object-cover", className)}
          loading="lazy"
          onError={(event) => hideBroken(event.currentTarget)}
        />
      );
    }

    return (
      <>
        <video
          src={videoCoverSrc(item.url)}
          muted
          playsInline
          preload="metadata"
          className={cn("absolute inset-0 z-[1] h-full w-full object-cover", className)}
          onError={(event) => hideBroken(event.currentTarget)}
        />
        {showPlayOverlay ? (
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/25">
            <Play className="h-6 w-6 fill-white text-white drop-shadow" />
          </div>
        ) : null}
      </>
    );
  }

  return null;
}
