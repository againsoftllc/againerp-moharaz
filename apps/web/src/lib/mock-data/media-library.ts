export type MediaLibraryItemType = "image" | "video" | "document";

export type MediaProvider = "direct" | "r2" | "youtube" | "vimeo" | "external";

/** Where the binary is stored (upload destination), not video host. */
export type MediaFileStorage = "local" | "r2" | "remote";

export function getMediaFileStorage(item: {
  provider?: MediaProvider | string;
  localPath?: string;
  url?: string;
  importedBy?: string;
}): MediaFileStorage {
  if (item.provider === "r2") return "r2";
  if (item.localPath?.startsWith("r2://")) return "r2";
  if (item.provider === "external" || item.provider === "youtube" || item.provider === "vimeo") {
    return "remote";
  }

  const url = item.url ?? "";
  const localPath = item.localPath ?? "";
  // URL/AI imports historically stored a fake `/storage/media/imported/...` path
  // even though no file exists on disk.
  const fakeImportPath = localPath.startsWith("/storage/media/imported/");
  const hasRealLocalDisk =
    Boolean(localPath) && !localPath.startsWith("r2://") && !fakeImportPath;
  const isOurUpload =
    url.includes("/uploads/media/") ||
    (hasRealLocalDisk && localPath.includes("/storage/media/uploads/"));

  if (
    !isOurUpload &&
    /^https?:\/\//i.test(url) &&
    !url.includes("/uploads/media/")
  ) {
    return "remote";
  }

  if (
    (item.importedBy === "url" || item.importedBy === "ai" || fakeImportPath) &&
    /^https?:\/\//i.test(url) &&
    !url.includes("/uploads/media/") &&
    !url.includes("r2.dev") &&
    !url.includes(".r2.")
  ) {
    return "remote";
  }

  return "local";
}

export type MediaLibraryItem = {
  id: string;
  name: string;
  title: string;
  folder: string;
  url: string;
  type: MediaLibraryItemType;
  mimeType: string;
  sizeKb: number;
  uploadedAt: string;
  alt?: string;
  sourceUrl?: string;
  localPath?: string;
  importedBy?: "file" | "url" | "ai";
  provider?: MediaProvider;
  uploadedBy?: string;
  /** When true, title auto-syncs from file name on rename */
  titleLinkedToName?: boolean;
  /** When true, alt auto-syncs from file name on rename */
  altLinkedToName?: boolean;
};

export function deriveLabelsFromFileName(fileName: string): { title: string; alt: string } {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return { title: base, alt: base };
}

export function applyMediaItemPatch(
  item: MediaLibraryItem,
  patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>,
): MediaLibraryItem {
  let next: MediaLibraryItem = { ...item, ...patch };

  if (patch.name !== undefined && patch.name !== item.name) {
    const { title, alt } = deriveLabelsFromFileName(patch.name);
    if (item.titleLinkedToName !== false) next.title = title;
    if (item.altLinkedToName !== false) next.alt = alt;
    if (next.localPath) {
      const slash = next.localPath.lastIndexOf("/");
      next.localPath =
        slash >= 0 ? `${next.localPath.slice(0, slash + 1)}${patch.name}` : patch.name;
    }
  }

  if ("title" in patch && patch.title !== undefined) {
    next.titleLinkedToName = false;
  }

  if ("alt" in patch && patch.alt !== undefined) {
    next.altLinkedToName = false;
  }

  return next;
}

export const mediaLibraryItems: MediaLibraryItem[] = Array.from({ length: 24 }, (_, i) => {
  const isVideo = i % 5 === 0;
  const isDoc = i % 7 === 0 && !isVideo;
  const folder = i % 3 === 0 ? "Products" : i % 3 === 1 ? "Banners" : "Blog";
  const isBanner = !isDoc && !isVideo && folder === "Banners";
  const uploaders = ["Admin", "Sadia Rahman", "Rahim Hossain", "Karim Ali"];
  const baseName = isDoc
    ? `document-${i + 1}.pdf`
    : isVideo
      ? `clip-${i + 1}.mp4`
      : isBanner
        ? `banner-${i + 1}.jpg`
        : `asset-${i + 1}.jpg`;
  const { title: derivedTitle, alt: derivedAlt } = deriveLabelsFromFileName(baseName);

  return {
    id: `media_${i}`,
    name: baseName,
    title: derivedTitle,
    folder: isDoc ? "Documents" : folder,
    url: isDoc
      ? "https://placehold.co/480x480/f5f5f5/666?text=PDF"
      : isVideo
        ? `https://picsum.photos/seed/mediavid${i}/480/480`
        : isBanner
          ? `https://picsum.photos/seed/banner${i}/800/200`
          : `https://picsum.photos/seed/media${i}/480/480`,
    type: isDoc ? "document" : isVideo ? "video" : "image",
    mimeType: isDoc ? "application/pdf" : isVideo ? "video/mp4" : "image/jpeg",
    sizeKb: 120 + i * 18,
    uploadedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    alt: derivedAlt,
    uploadedBy: uploaders[i % uploaders.length],
    titleLinkedToName: true,
    altLinkedToName: true,
  };
});

export function filterMediaLibraryItems(
  items: MediaLibraryItem[],
  {
    query = "",
    types,
  }: {
    query?: string;
    types?: MediaLibraryItemType[];
  },
) {
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    if (types?.length && !types.includes(item.type)) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      (item.alt?.toLowerCase().includes(q) ?? false)
    );
  });
}

function resolveUploadedBy(importedBy?: "file" | "url" | "ai") {
  if (importedBy === "ai") return "AI Agent";
  if (importedBy === "url") return "Admin";
  if (importedBy === "file") return "You";
  return "Admin";
}

import {
  classifySafeUpload,
  filterSafeUploadFiles,
  getDocumentKindLabel,
  resolveUploadMimeType,
} from "@/lib/media/safe-upload-types";

export function createUploadedMediaItem(file: File): MediaLibraryItem | null {
  const mediaType = classifySafeUpload(file);
  if (!mediaType) return null;

  const { title, alt } = deriveLabelsFromFileName(file.name);

  return {
    id: `media_upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    title,
    folder: mediaType === "document" ? "Documents" : "Uploads",
    url: URL.createObjectURL(file),
    type: mediaType,
    mimeType: resolveUploadMimeType(file),
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    uploadedAt: new Date().toISOString(),
    alt: mediaType === "document" ? title : alt,
    importedBy: "file",
    uploadedBy: resolveUploadedBy("file"),
    localPath: `/storage/media/uploads/${file.name}`,
    titleLinkedToName: true,
    altLinkedToName: mediaType !== "document",
  };
}

export function createUploadedMediaItemsFromFiles(files: FileList | File[]) {
  const { allowed, rejected } = filterSafeUploadFiles(files);
  const items = allowed
    .map((file) => createUploadedMediaItem(file))
    .filter((item): item is MediaLibraryItem => item !== null);
  return { items, rejected };
}

function slugFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.split("/").filter(Boolean).pop() ?? "imported-asset";
    return pathPart.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  } catch {
    return "imported-asset";
  }
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtube-nocookie.com")) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts");
      if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function extractVimeoId(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("vimeo.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function isDirectImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(url);
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url);
}

function isDocumentUrl(url: string) {
  return /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods)(\?.*)?$/i.test(url);
}

type ExternalUrlMeta = {
  type: MediaLibraryItemType;
  provider: MediaProvider;
  previewUrl: string;
  title: string;
  name: string;
  mimeType: string;
};

function classifyExternalUrl(sourceUrl: string): ExternalUrlMeta | null {
  if (!isHttpUrl(sourceUrl)) return null;

  const youtubeId = extractYouTubeId(sourceUrl);
  if (youtubeId) {
    return {
      type: "video",
      provider: "youtube",
      previewUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      title: `YouTube video ${youtubeId}`,
      name: `youtube-${youtubeId}.mp4`,
      mimeType: "video/youtube",
    };
  }

  const vimeoId = extractVimeoId(sourceUrl);
  if (vimeoId) {
    return {
      type: "video",
      provider: "vimeo",
      previewUrl: `https://vumbnail.com/${vimeoId}.jpg`,
      title: `Vimeo video ${vimeoId}`,
      name: `vimeo-${vimeoId}.mp4`,
      mimeType: "video/vimeo",
    };
  }

  if (isDocumentUrl(sourceUrl)) {
    const slug = slugFromUrl(sourceUrl);
    const ext = sourceUrl.match(/\.([a-z0-9]+)(\?.*)?$/i)?.[1]?.toLowerCase() ?? "pdf";
    return {
      type: "document",
      provider: "direct",
      previewUrl: `https://placehold.co/480x480/f5f5f5/666?text=${getDocumentKindLabel(`${slug}.${ext}`)}`,
      title: slug.replace(/-/g, " "),
      name: `${slug}.${ext}`,
      mimeType:
        ext === "pdf"
          ? "application/pdf"
          : ext === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : ext === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : ext === "txt"
                ? "text/plain"
                : ext === "csv"
                  ? "text/csv"
                  : "application/octet-stream",
    };
  }

  if (isDirectVideoUrl(sourceUrl)) {
    const slug = slugFromUrl(sourceUrl);
    return {
      type: "video",
      provider: "direct",
      previewUrl: sourceUrl,
      title: slug.replace(/-/g, " "),
      name: `${slug}.mp4`,
      mimeType: "video/mp4",
    };
  }

  if (isDirectImageUrl(sourceUrl)) {
    const slug = slugFromUrl(sourceUrl);
    const ext = sourceUrl.match(/\.([a-z0-9]+)(\?.*)?$/i)?.[1]?.toLowerCase() ?? "jpg";
    return {
      type: "image",
      provider: "direct",
      previewUrl: sourceUrl,
      title: slug.replace(/-/g, " "),
      name: `${slug}.${ext}`,
      mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    };
  }

  return {
    type: "image",
    provider: "external",
    previewUrl: sourceUrl,
    title: slugFromUrl(sourceUrl).replace(/-/g, " ") || "Imported media",
    name: `${slugFromUrl(sourceUrl) || "imported-media"}.jpg`,
    mimeType: "image/jpeg",
  };
}

export function createImportedMediaItem({
  sourceUrl,
  previewUrl,
  importedBy = "url",
  index = 0,
  type,
  provider,
  title,
  name,
  mimeType,
}: {
  sourceUrl: string;
  previewUrl: string;
  importedBy?: "url" | "ai";
  index?: number;
  type?: MediaLibraryItemType;
  provider?: MediaProvider;
  title?: string;
  name?: string;
  mimeType?: string;
}) {
  const slug = slugFromUrl(sourceUrl);
  const resolvedType = type ?? (isDocumentUrl(sourceUrl) ? "document" : isDirectVideoUrl(sourceUrl) || extractYouTubeId(sourceUrl) ? "video" : "image");
  const ext = resolvedType === "video" ? "mp4" : resolvedType === "document" ? "pdf" : "jpg";
  const resolvedName = name ?? `${slug || "imported"}${index > 0 ? `-${index + 1}` : ""}.${ext}`;
  const resolvedTitle = title ?? deriveLabelsFromFileName(resolvedName).title;
  const { alt: derivedAlt } = deriveLabelsFromFileName(resolvedName);

  return {
    id: `media_import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: resolvedName,
    title: resolvedTitle,
    folder: "Imports",
    url: previewUrl,
    type: resolvedType,
    mimeType:
      mimeType ??
      (resolvedType === "video"
        ? "video/mp4"
        : resolvedType === "document"
          ? "application/pdf"
          : "image/jpeg"),
    sizeKb: 180 + index * 24,
    uploadedAt: new Date().toISOString(),
    alt: derivedAlt,
    sourceUrl,
    // No fake disk path — hotlinked until uploaded/migrated
    localPath: undefined,
    importedBy,
    provider: provider ?? (extractYouTubeId(sourceUrl) ? "youtube" : extractVimeoId(sourceUrl) ? "vimeo" : "external"),
    uploadedBy: resolveUploadedBy(importedBy),
    titleLinkedToName: true,
    altLinkedToName: true,
  } satisfies MediaLibraryItem;
}

function importSingleExternalUrl(sourceUrl: string, importedBy: "url" | "ai", index = 0) {
  const meta = classifyExternalUrl(sourceUrl);
  if (!meta) return null;

  return createImportedMediaItem({
    sourceUrl,
    previewUrl: meta.previewUrl,
    importedBy,
    index,
    type: meta.type,
    provider: meta.provider,
    title: meta.title,
    name: meta.name,
    mimeType: meta.mimeType,
  });
}

export function parseMediaInputLines(raw: string) {
  return raw
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function mockImportMediaFromInput(
  raw: string,
  mode: "ai" | "url",
): Promise<MediaLibraryItem[]> {
  const lines = parseMediaInputLines(raw);
  if (!lines.length) return [];

  await new Promise((resolve) => setTimeout(resolve, mode === "ai" ? 1200 : 500));

  const items: MediaLibraryItem[] = [];

  for (const line of lines) {
    if (!isHttpUrl(line)) continue;

    if (mode === "ai" && !isDirectImageUrl(line) && !isDirectVideoUrl(line) && !isDocumentUrl(line) && !extractYouTubeId(line) && !extractVimeoId(line)) {
      const host = slugFromUrl(line) || "website";
      const scrapeCount = 3 + (line.length % 3);
      for (let i = 0; i < scrapeCount; i++) {
        items.push(
          createImportedMediaItem({
            sourceUrl: line,
            previewUrl: `https://picsum.photos/seed/ai${host}${i}/900/900`,
            importedBy: "ai",
            index: i,
            type: "image",
            provider: "external",
          }),
        );
      }
      continue;
    }

    const imported = importSingleExternalUrl(line, mode);
    if (imported) items.push(imported);
  }

  return items;
}

export function updateMediaLibraryItem(
  items: MediaLibraryItem[],
  id: string,
  patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>,
) {
  return items.map((item) => (item.id === id ? applyMediaItemPatch(item, patch) : item));
}
