"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { getMediaFileStorage } from "@/lib/mock-data/media-library";
import { MediaTileCover } from "@/components/media/media-tile-cover";
import { filterSafeUploadFiles } from "@/lib/media/safe-upload-types";

type Props = {
  items: MediaLibraryItem[];
  onReorder: (items: MediaLibraryItem[]) => void;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  /** Upload dropped local files into media library + return saved items. */
  onUploadFiles?: (files: File[]) => Promise<MediaLibraryItem[]>;
};

export function MediaGallery({
  items,
  onReorder,
  onRemove,
  onAddMore,
  onUploadFiles,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragItem = useRef<number | null>(null);
  const fileDragDepth = useRef(0);

  const onDragStart = (index: number) => {
    dragItem.current = index;
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const onDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = dragItem.current;
    if (sourceIndex === null || sourceIndex === targetIndex) {
      setDragOverId(null);
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
    dragItem.current = null;
    setDragOverId(null);
  };

  const onDragEnd = () => {
    dragItem.current = null;
    setDragOverId(null);
  };

  const hasExternalFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileDragDepth.current = 0;
    setFileDropActive(false);

    if (!onUploadFiles) return;

    const raw = Array.from(e.dataTransfer.files ?? []);
    if (raw.length === 0) return;

    const { allowed, rejected } = filterSafeUploadFiles(raw);
    const mediaFiles = allowed.filter((f) => {
      const kind = f.type.toLowerCase();
      if (kind.startsWith("image/") || kind.startsWith("video/")) return true;
      return /\.(jpe?g|png|gif|webp|avif|bmp|mp4|webm|mov|m4v|ogv)$/i.test(f.name);
    });

    if (rejected.length || mediaFiles.length < allowed.length) {
      toast.error("Some files were skipped — only images and videos are allowed");
    }
    if (mediaFiles.length === 0) {
      toast.error("Drop image or video files");
      return;
    }

    setUploading(true);
    try {
      await onUploadFiles(mediaFiles);
      toast.success(
        mediaFiles.length === 1
          ? "1 file added"
          : `${mediaFiles.length} files added`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-3 content-start items-start gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {items.map((item, index) => {
        const storage = getMediaFileStorage(item);
        const showStorage = item.provider !== "youtube" && item.provider !== "vimeo";

        return (
          <div
            key={item.id}
            draggable={!uploading}
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => onDragOver(e, item.id)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            className={cn(
              "group flex min-w-0 w-full cursor-grab flex-col overflow-hidden rounded-none border border-border bg-card transition",
              dragOverId === item.id && "border-primary ring-1 ring-primary",
            )}
          >
            <div className="relative w-full shrink-0 overflow-hidden bg-muted">
              <div className="block w-full pt-[100%]" aria-hidden />
              <MediaTileCover item={item} />

              <div className="absolute left-1 top-1 z-[2] flex flex-wrap gap-0.5">
                {index === 0 ? (
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-none bg-amber-500 text-white"
                    title="Featured"
                    aria-label="Featured"
                  >
                    <Star className="h-2.5 w-2.5 fill-current" />
                  </span>
                ) : null}
                {showStorage ? (
                  <span
                    className={cn(
                      "rounded-none px-1 text-[9px] font-medium text-white",
                      storage === "r2"
                        ? "bg-orange-600"
                        : storage === "remote"
                          ? "bg-sky-700"
                          : "bg-slate-700",
                    )}
                  >
                    {storage === "r2" ? "R2" : storage === "remote" ? "URL" : "LOCAL"}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="absolute right-1 top-1 z-[2] rounded-none bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={uploading}
        onClick={onAddMore}
        onDragEnter={(e) => {
          if (!onUploadFiles || !hasExternalFiles(e)) return;
          e.preventDefault();
          fileDragDepth.current += 1;
          setFileDropActive(true);
        }}
        onDragLeave={(e) => {
          if (!onUploadFiles || !hasExternalFiles(e)) return;
          e.preventDefault();
          fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
          if (fileDragDepth.current === 0) setFileDropActive(false);
        }}
        onDragOver={(e) => {
          if (!onUploadFiles || !hasExternalFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          void handleFileDrop(e);
        }}
        className={cn(
          "flex min-w-0 w-full flex-col overflow-hidden rounded-none border border-dashed text-xs transition",
          fileDropActive
            ? "border-[#00a09d] bg-[#00a09d]/10 text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          uploading && "pointer-events-none opacity-70",
        )}
        aria-label="Add media — click to browse library, or drop files here"
      >
        <div className="relative w-full bg-muted/40">
          <div className="block w-full pt-[100%]" aria-hidden />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <span className="text-[10px] leading-tight">
              {uploading
                ? "Uploading…"
                : fileDropActive
                  ? "Drop"
                  : items.length === 0
                    ? "Add"
                    : "Add more"}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
