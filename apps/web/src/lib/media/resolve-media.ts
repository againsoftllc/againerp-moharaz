import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import { useMediaStore } from "@/lib/store/media-store";

export function getMediaItem(mediaId: string | null | undefined): MediaLibraryItem | undefined {
  if (!mediaId) return undefined;
  return useMediaStore.getState().getById(mediaId);
}

export function resolveMediaUrl(
  mediaId: string | null | undefined,
  fallbackUrl?: string,
): string | undefined {
  const raw = getMediaItem(mediaId)?.url ?? fallbackUrl;
  if (!raw) return undefined;
  return publicMediaUrl(raw) || raw;
}

export function resolveMediaAlt(
  mediaId: string | null | undefined,
  fallback?: string,
): string | undefined {
  const item = getMediaItem(mediaId);
  return item?.alt ?? item?.title ?? fallback;
}

export function useMediaItem(mediaId: string | null | undefined) {
  return useMediaStore((state) =>
    mediaId ? state.items.find((item) => item.id === mediaId) : undefined,
  );
}
