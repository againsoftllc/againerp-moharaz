import { refreshHtmlMediaRefs } from "@/lib/media/media-html-sync";
import { useBrandStore } from "@/lib/store/brand-store";
import { useCategoryStore } from "@/lib/store/category-store";
import { useMediaStore } from "@/lib/store/media-store";

/** Push latest media url/alt into every entity that references this media id. */
export function propagateMediaUpdate(mediaId: string) {
  const item = useMediaStore.getState().getById(mediaId);
  if (!item) return;

  const { categories, patchCategory } = useCategoryStore.getState();
  for (const category of categories) {
    const patch: Record<string, string | undefined> = {};

    if (category.iconMediaId === mediaId) {
      patch.iconUrl = item.url;
    }
    if (category.bannerMediaId === mediaId) {
      patch.bannerUrl = item.url;
    }
    if (category.description?.includes(`data-media-id="${mediaId}"`)) {
      patch.description = refreshHtmlMediaRefs(category.description, mediaId, item);
    }

    if (Object.keys(patch).length) {
      patchCategory(category.id, patch);
    }
  }

  const { brands, patchBrand } = useBrandStore.getState();
  for (const brand of brands) {
    const patch: Record<string, string | undefined> = {};

    if (brand.logoMediaId === mediaId) {
      patch.logoUrl = item.url;
    }
    if (brand.bannerMediaId === mediaId) {
      patch.bannerUrl = item.url;
    }
    if (brand.description?.includes(`data-media-id="${mediaId}"`)) {
      patch.description = refreshHtmlMediaRefs(brand.description, mediaId, item);
    }

    if (Object.keys(patch).length) {
      patchBrand(brand.id, patch);
    }
  }
}
