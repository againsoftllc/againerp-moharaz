"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import type { MediaLibraryItem, MediaLibraryItemType } from "@/lib/mock-data/media-library";
import { useMediaItem } from "@/lib/media/resolve-media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MediaLibraryModal } from "@/components/media/media-library-modal";

type Props = {
  value?: string;
  mediaId?: string;
  onChange: (item: MediaLibraryItem | undefined) => void;
  aspect?: "square" | "banner";
  accept?: MediaLibraryItemType[];
  emptyLabel?: string;
  modalTitle?: string;
};

export function MediaField({
  value,
  mediaId,
  onChange,
  aspect = "square",
  accept = ["image"],
  emptyLabel = "Add image",
  modalTitle = "Select image",
}: Props) {
  const [open, setOpen] = useState(false);
  const liveItem = useMediaItem(mediaId);
  const previewUrl = liveItem?.url ?? value;

  return (
    <>
      <div className="rounded-md border border-dashed border-input bg-muted/20 p-2">
        {previewUrl ? (
          <div className="space-y-2">
            <img
              src={previewUrl}
              alt={liveItem?.alt ?? ""}
              className={cn(
                "rounded-md object-cover",
                aspect === "square" ? "mx-auto h-16 w-16" : "h-20 w-full",
              )}
            />
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setOpen(true)}>
                Change
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full flex-col items-center gap-1 py-4 text-xs text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-5 w-5" />
            {emptyLabel}
          </button>
        )}
      </div>

      <MediaLibraryModal
        open={open}
        onOpenChange={setOpen}
        mode="single"
        title={modalTitle}
        accept={accept}
        initialSelectedIds={mediaId ? [mediaId] : []}
        onSelect={(items) => onChange(items[0])}
      />
    </>
  );
}
