import type { MediaLibraryItemType } from "@/lib/mock-data/media-library";

const ACCEPT_LABELS: Record<MediaLibraryItemType, string> = {
  image: "images",
  video: "videos",
  document: "documents",
};

export function describeAcceptTypes(accept?: MediaLibraryItemType[]): string {
  if (!accept?.length) return "all file types";
  return accept.map((type) => ACCEPT_LABELS[type]).join(", ");
}

export function isTypeAllowedForPicker(
  type: MediaLibraryItemType,
  accept?: MediaLibraryItemType[],
): boolean {
  if (!accept?.length) return true;
  return accept.includes(type);
}
