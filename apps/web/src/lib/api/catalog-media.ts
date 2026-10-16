import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { publicMediaUrl } from "@/lib/media/public-media-url";

export type ApiMedia = {
  id: string;
  company_id: string;
  name: string;
  title: string;
  folder: string;
  url: string;
  media_type: "image" | "video" | "document";
  mime_type: string;
  size_kb: number;
  alt: string | null;
  source_url: string | null;
  local_path: string | null;
  imported_by: string | null;
  provider: string;
  uploaded_by: string | null;
  title_linked_to_name: boolean;
  alt_linked_to_name: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiMediaListResponse = {
  data: ApiMedia[];
  meta: { count: number };
  errors: string[];
};

export type ApiMediaResponse = {
  data: ApiMedia;
  errors: string[];
};

export function apiMediaToItem(row: ApiMedia): MediaLibraryItem {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    folder: row.folder,
    url: publicMediaUrl(row.url),
    type: row.media_type,
    mimeType: row.mime_type,
    sizeKb: row.size_kb,
    uploadedAt: row.created_at,
    alt: row.alt ?? undefined,
    sourceUrl: row.source_url ? publicMediaUrl(row.source_url) : undefined,
    localPath: row.local_path ?? undefined,
    importedBy: (row.imported_by as MediaLibraryItem["importedBy"]) ?? undefined,
    provider: (row.provider as MediaLibraryItem["provider"]) ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    titleLinkedToName: row.title_linked_to_name,
    altLinkedToName: row.alt_linked_to_name,
  };
}

export type CreateMediaInput = {
  name: string;
  title?: string;
  folder?: string;
  url: string;
  type: MediaLibraryItem["type"];
  mimeType: string;
  sizeKb?: number;
  alt?: string;
  sourceUrl?: string;
  localPath?: string;
  importedBy?: string;
  provider?: string;
  uploadedBy?: string;
  titleLinkedToName?: boolean;
  altLinkedToName?: boolean;
};

export function mediaToApiCreate(input: CreateMediaInput) {
  return {
    name: input.name,
    title: input.title ?? input.name,
    folder: input.folder ?? "Uploads",
    url: input.url,
    media_type: input.type,
    mime_type: input.mimeType,
    size_kb: input.sizeKb ?? 0,
    alt: input.alt ?? null,
    source_url: input.sourceUrl ?? null,
    local_path: input.localPath ?? null,
    imported_by: input.importedBy ?? null,
    provider: input.provider ?? "direct",
    uploaded_by: input.uploadedBy ?? null,
    title_linked_to_name: input.titleLinkedToName ?? true,
    alt_linked_to_name: input.altLinkedToName ?? true,
  };
}

export function mediaItemToApiCreate(item: MediaLibraryItem) {
  return mediaToApiCreate({
    name: item.name,
    title: item.title,
    folder: item.folder,
    url: item.url,
    type: item.type,
    mimeType: item.mimeType,
    sizeKb: item.sizeKb,
    alt: item.alt,
    sourceUrl: item.sourceUrl,
    localPath: item.localPath,
    importedBy: item.importedBy,
    provider: item.provider,
    uploadedBy: item.uploadedBy,
    titleLinkedToName: item.titleLinkedToName,
    altLinkedToName: item.altLinkedToName,
  });
}

export function mediaPatchToApi(patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>) {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.alt !== undefined) payload.alt = patch.alt;
  return payload;
}
