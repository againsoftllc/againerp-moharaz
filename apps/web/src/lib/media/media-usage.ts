import type { Brand } from "@/lib/mock-data/brands";
import type { Category } from "@/lib/mock-data/categories";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { useBrandStore } from "@/lib/store/brand-store";
import { useCategoryStore } from "@/lib/store/category-store";
import { useMediaStore } from "@/lib/store/media-store";
import { useMemo } from "react";

export type MediaUsageRef = {
  entityType: "category" | "brand";
  entityId: string;
  entityLabel: string;
  fieldLabel: string;
};

function addUsageRef(
  map: Map<string, MediaUsageRef[]>,
  mediaId: string,
  ref: MediaUsageRef,
) {
  const list = map.get(mediaId) ?? [];
  list.push(ref);
  map.set(mediaId, list);
}

function extractHtmlMediaIds(html: string): string[] {
  const ids: string[] = [];
  const regex = /data-media-id=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function buildUrlToMediaIdMap(items: MediaLibraryItem[]) {
  const map = new Map<string, string>();
  for (const item of items) {
    if (!map.has(item.url)) map.set(item.url, item.id);
  }
  return map;
}

function resolveLegacyMediaId(
  mediaId: string | undefined,
  url: string | undefined,
  urlToId: Map<string, string>,
) {
  if (mediaId) return mediaId;
  if (url) return urlToId.get(url);
  return undefined;
}

export function buildMediaUsageMap(
  categories: Category[],
  brands: Brand[],
  mediaItems: MediaLibraryItem[],
): Map<string, MediaUsageRef[]> {
  const map = new Map<string, MediaUsageRef[]>();
  const urlToId = buildUrlToMediaIdMap(mediaItems);

  for (const category of categories) {
    const iconId = resolveLegacyMediaId(category.iconMediaId, category.iconUrl, urlToId);
    if (iconId) {
      addUsageRef(map, iconId, {
        entityType: "category",
        entityId: category.id,
        entityLabel: category.name,
        fieldLabel: "Icon",
      });
    }

    const bannerId = resolveLegacyMediaId(category.bannerMediaId, category.bannerUrl, urlToId);
    if (bannerId) {
      addUsageRef(map, bannerId, {
        entityType: "category",
        entityId: category.id,
        entityLabel: category.name,
        fieldLabel: "Banner",
      });
    }

    if (category.description) {
      for (const mediaId of extractHtmlMediaIds(category.description)) {
        addUsageRef(map, mediaId, {
          entityType: "category",
          entityId: category.id,
          entityLabel: category.name,
          fieldLabel: "Description",
        });
      }
    }
  }

  for (const brand of brands) {
    const logoId = resolveLegacyMediaId(brand.logoMediaId, brand.logoUrl, urlToId);
    if (logoId) {
      addUsageRef(map, logoId, {
        entityType: "brand",
        entityId: brand.id,
        entityLabel: brand.name,
        fieldLabel: "Logo",
      });
    }

    const bannerId = resolveLegacyMediaId(brand.bannerMediaId, brand.bannerUrl, urlToId);
    if (bannerId) {
      addUsageRef(map, bannerId, {
        entityType: "brand",
        entityId: brand.id,
        entityLabel: brand.name,
        fieldLabel: "Banner",
      });
    }

    if (brand.description) {
      for (const mediaId of extractHtmlMediaIds(brand.description)) {
        addUsageRef(map, mediaId, {
          entityType: "brand",
          entityId: brand.id,
          entityLabel: brand.name,
          fieldLabel: "Description",
        });
      }
    }
  }

  return map;
}

export function getMediaUsageCount(
  usageMap: Map<string, MediaUsageRef[]>,
  mediaId: string,
): number {
  return usageMap.get(mediaId)?.length ?? 0;
}

export function getMediaUsageRefs(
  usageMap: Map<string, MediaUsageRef[]>,
  mediaId: string,
): MediaUsageRef[] {
  return usageMap.get(mediaId) ?? [];
}

export function useMediaUsageMap() {
  const categories = useCategoryStore((state) => state.categories);
  const brands = useBrandStore((state) => state.brands);
  const mediaItems = useMediaStore((state) => state.items);

  return useMemo(
    () => buildMediaUsageMap(categories, brands, mediaItems),
    [categories, brands, mediaItems],
  );
}

export type MediaUsageFilter = "all" | "used" | "unused";

export function filterByMediaUsage(
  items: MediaLibraryItem[],
  usageMap: Map<string, MediaUsageRef[]>,
  usageFilter: MediaUsageFilter,
): MediaLibraryItem[] {
  if (usageFilter === "all") return items;
  return items.filter((item) => {
    const count = getMediaUsageCount(usageMap, item.id);
    return usageFilter === "used" ? count > 0 : count === 0;
  });
}
