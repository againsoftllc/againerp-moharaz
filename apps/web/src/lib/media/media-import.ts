import { apiFetch } from "@/lib/api/client";
import {
  createImportedMediaItem,
  extractVimeoId,
  extractYouTubeId,
  importSingleExternalUrl,
  isDirectImageUrl,
  isDirectVideoUrl,
  isDocumentUrl,
  isHttpUrl,
  parseMediaInputLines,
  type MediaLibraryItem,
} from "@/lib/mock-data/media-library";

type PageImagesResponse = { url: string; title: string; images: string[] };

/** The images a web page shows, read by the server (product galleries, og:image…). */
export function fetchPageImages(url: string): Promise<PageImagesResponse> {
  return apiFetch<PageImagesResponse>("/api/v1/media/page-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

function isDirectMediaUrl(url: string) {
  return isDirectImageUrl(url) || isDirectVideoUrl(url) || isDocumentUrl(url) || !!extractYouTubeId(url) || !!extractVimeoId(url);
}

/**
 * Library items for pasted URLs. Direct file / video links are added as they are; in "ai" mode a page URL is read
 * by the server and every image it shows is added. Pages that fail are reported in `failed`, never invented.
 */
export async function importMediaFromInput(
  raw: string,
  mode: "ai" | "url",
): Promise<{ items: MediaLibraryItem[]; failed: { url: string; reason: string }[] }> {
  const items: MediaLibraryItem[] = [];
  const failed: { url: string; reason: string }[] = [];

  for (const line of parseMediaInputLines(raw)) {
    if (!isHttpUrl(line)) continue;

    if (mode === "ai" && !isDirectMediaUrl(line)) {
      try {
        const page = await fetchPageImages(line);
        if (!page.images.length) failed.push({ url: line, reason: "no images found on the page" });
        page.images.forEach((src, index) => {
          items.push(
            createImportedMediaItem({
              sourceUrl: src,
              previewUrl: src,
              importedBy: "ai",
              index,
              type: "image",
              provider: "external",
            }),
          );
        });
      } catch (err) {
        failed.push({ url: line, reason: err instanceof Error ? err.message : "could not read the page" });
      }
      continue;
    }

    const imported = importSingleExternalUrl(line, mode);
    if (imported) items.push(imported);
  }

  return { items, failed };
}
