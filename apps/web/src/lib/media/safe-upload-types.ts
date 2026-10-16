import type { MediaLibraryItemType } from "@/lib/mock-data/media-library";

/** Extensions safe to upload — no executables, scripts, or HTML. */
export const SAFE_DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "csv",
  "rtf",
  "odt",
  "ods",
  "ppt",
  "pptx",
] as const;

export const SAFE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"] as const;

export const SAFE_VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "ogv"] as const;

const SAFE_MIME_PREFIXES = ["image/", "video/"] as const;

const SAFE_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/rtf",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** HTML `accept` value for file picker + drag-drop hint. */
export const SAFE_FILE_INPUT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  ...SAFE_DOCUMENT_MIMES,
  ...SAFE_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isSafeDocumentExtension(ext: string): boolean {
  return (SAFE_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSafeImageExtension(ext: string): boolean {
  return (SAFE_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSafeVideoExtension(ext: string): boolean {
  return (SAFE_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function classifySafeUpload(file: File): MediaLibraryItemType | null {
  const ext = getFileExtension(file.name);
  const mime = file.type.toLowerCase();

  if (mime.startsWith("image/") && isSafeImageExtension(ext)) return "image";
  if (mime.startsWith("video/") && isSafeVideoExtension(ext)) return "video";
  if (SAFE_DOCUMENT_MIMES.has(mime) || isSafeDocumentExtension(ext)) return "document";

  if (isSafeImageExtension(ext)) return "image";
  if (isSafeVideoExtension(ext)) return "video";
  if (isSafeDocumentExtension(ext)) return "document";

  return null;
}

export function isSafeUploadFile(file: File): boolean {
  return classifySafeUpload(file) !== null;
}

export function resolveUploadMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = getFileExtension(file.name);
  return EXTENSION_TO_MIME[ext] ?? "application/octet-stream";
}

export function getDocumentKindLabel(fileName: string, mimeType?: string): string {
  const ext = getFileExtension(fileName);
  if (ext === "pdf" || mimeType === "application/pdf") return "PDF";
  if (ext === "docx" || ext === "doc") return "DOC";
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "ods") return "XLS";
  if (ext === "txt") return "TXT";
  if (ext === "pptx" || ext === "ppt") return "PPT";
  if (ext === "rtf") return "RTF";
  return "DOC";
}

export function filterSafeUploadFiles(files: FileList | File[]): {
  allowed: File[];
  rejected: File[];
} {
  const list = Array.from(files);
  const allowed: File[] = [];
  const rejected: File[] = [];

  for (const file of list) {
    if (isSafeUploadFile(file)) allowed.push(file);
    else rejected.push(file);
  }

  return { allowed, rejected };
}

export const SAFE_UPLOAD_HINT =
  "Images (JPG, PNG, WebP), videos (MP4, WebM), and safe documents (PDF, DOCX, Excel, TXT, CSV). Executables and scripts are blocked.";
