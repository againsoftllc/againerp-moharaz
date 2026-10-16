import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { importCatalogImages } from "@/lib/api/catalog-ai";
import { apiMediaToItem, type ApiMedia } from "@/lib/api/catalog-media";

const MAX_IMPORT_IMAGES = 8;

export async function importCatalogImagesFromUrls(
  urls: string[],
  altPrefix?: string,
): Promise<MediaLibraryItem[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, MAX_IMPORT_IMAGES);
  if (!unique.length) return [];

  const result = await importCatalogImages({
    urls: unique,
    altPrefix,
  });

  return result.items.map((row) => apiMediaToItem(row as ApiMedia));
}
