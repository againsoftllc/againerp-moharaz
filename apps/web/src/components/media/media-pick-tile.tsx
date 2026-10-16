"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import { filterSafeUploadFiles } from "@/lib/media/safe-upload-types";
import { uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";

type Props = {
  url: string;
  alt: string;
  disabled?: boolean;
  onPick: () => void;
  onChange: (next: string) => void;
  className?: string;
  /** When false, filled tiles have no X (inherited invoice image). */
  clearable?: boolean;
};

/** Single-image pick tile — same square Add cell as product `MediaGallery`. */
export function MediaPickTile({
  url,
  alt,
  disabled = false,
  onPick,
  onChange,
  className,
  clearable = true,
}: Props) {
  const fileDragDepth = useRef(0);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const hasExternalFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const uploadAndSet = async (files: File[]) => {
    const { allowed, rejected } = filterSafeUploadFiles(files);
    const images = allowed.filter((file) => file.type.toLowerCase().startsWith("image/"));
    if (rejected.length || files.length !== images.length) {
      toast.error("Use an image file (PNG, JPG, WebP, SVG, or GIF)");
    }
    if (!images.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadCatalogMediaFiles(images.slice(0, 1));
      const next = uploaded[0]?.url;
      if (next) onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("relative w-28 shrink-0", className)}>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={onPick}
        onDragEnter={(e) => {
          if (disabled || !hasExternalFiles(e)) return;
          e.preventDefault();
          fileDragDepth.current += 1;
          setFileDropActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
          if (fileDragDepth.current === 0) setFileDropActive(false);
        }}
        onDragOver={(e) => {
          if (disabled || !hasExternalFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          fileDragDepth.current = 0;
          setFileDropActive(false);
          if (disabled) return;
          void uploadAndSet(Array.from(e.dataTransfer.files ?? []));
        }}
        className={cn(
          "group flex min-w-0 w-full flex-col overflow-hidden rounded-none border text-xs transition",
          url ? "border-border bg-card" : "border-dashed",
          fileDropActive
            ? "border-[#00a09d] bg-[#00a09d]/10 text-foreground"
            : url
              ? "text-foreground"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          (disabled || uploading) && "pointer-events-none opacity-70",
        )}
        aria-label={url ? `Change ${alt}` : `Add ${alt}`}
      >
        <div className="relative w-full bg-muted/40">
          <div className="block w-full pt-[100%]" aria-hidden />
          {url && !fileDropActive ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicMediaUrl(url)}
              alt={alt}
              className="absolute inset-0 h-full w-full object-contain p-1"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
              <span className="text-[10px] leading-tight">
                {uploading ? "Uploading…" : fileDropActive ? "Drop" : url ? "Change" : "Add"}
              </span>
            </div>
          )}
        </div>
      </button>
      {url && !disabled && clearable ? (
        <button
          type="button"
          className="absolute right-1 top-1 z-[2] inline-flex h-5 w-5 items-center justify-center rounded-none bg-black/60 text-white"
          aria-label={`Remove ${alt}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
