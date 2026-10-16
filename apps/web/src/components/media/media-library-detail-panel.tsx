"use client";

import { FileText, Trash2, Video } from "lucide-react";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { getMediaFileStorage } from "@/lib/mock-data/media-library";
import type { MediaUsageRef } from "@/lib/media/media-usage";
import {
  externalVideoCoverUrl,
  publicMediaUrl,
} from "@/lib/media/public-media-url";
import { getDocumentKindLabel } from "@/lib/media/safe-upload-types";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  item: MediaLibraryItem | null;
  usageCount?: number;
  usageRefs?: MediaUsageRef[];
  onUpdate?: (patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>) => void;
  onDelete?: (id: string) => void;
};

function isPlayableVideoUrl(url: string) {
  const path = url.split(/[?#]/)[0] ?? url;
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(path);
}

function MediaDetailPreview({ item }: { item: MediaLibraryItem }) {
  const src = publicMediaUrl(item.url);

  if (item.type === "image") {
    return (
      <div className="flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.alt ?? item.title}
          className="block h-auto w-auto max-h-80 max-w-full"
        />
      </div>
    );
  }

  if (item.type === "video") {
    const isEmbed = item.provider === "youtube" || item.provider === "vimeo";
    if (
      !isEmbed &&
      (isPlayableVideoUrl(src) || Boolean(item.mimeType?.startsWith("video/")))
    ) {
      return (
        <div className="flex items-center justify-center bg-black p-2">
          <video
            src={src}
            controls
            className="block h-auto w-auto max-h-80 max-w-full"
          />
        </div>
      );
    }

    const cover = externalVideoCoverUrl(item.url, item.provider) ?? src;
    return (
      <div className="relative flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" className="block h-auto w-auto max-h-80 max-w-full" />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <Video className="h-10 w-10 text-white drop-shadow" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex aspect-[3/4] min-h-[200px] flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
      <FileText className="h-12 w-12" />
      <span className="text-xs font-medium uppercase">
        {getDocumentKindLabel(item.name, item.mimeType)}
      </span>
      <span className="px-3 text-center text-[10px] text-muted-foreground">Safe document preview</span>
    </div>
  );
}

export function MediaLibraryDetailPanel({ item, usageCount = 0, usageRefs = [], onUpdate, onDelete }: Props) {
  const readOnly = !onUpdate;
  if (!item) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-input bg-muted/10 px-4 text-center">
        <p className="text-sm font-medium text-foreground">Attachment details</p>
        <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
          Grid shows 1:1 thumbnails. Select a file to preview its actual ratio here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="overflow-hidden rounded-lg border border-input bg-muted/20">
        <MediaDetailPreview item={item} />
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor={`media-title-${item.id}`} className="text-xs">
            Title
          </Label>
          <Input
            id={`media-title-${item.id}`}
            className="mt-1 h-8 text-xs"
            value={item.title}
            readOnly={readOnly}
            onChange={(e) => onUpdate?.({ title: e.target.value })}
            placeholder="Display title"
          />
        </div>

        <div>
          <Label htmlFor={`media-name-${item.id}`} className="text-xs">
            File name
          </Label>
          <Input
            id={`media-name-${item.id}`}
            className="mt-1 h-8 text-xs"
            value={item.name}
            readOnly={readOnly}
            onChange={(e) => onUpdate?.({ name: e.target.value })}
            placeholder="asset-1.jpg"
          />
          {(item.titleLinkedToName !== false || item.altLinkedToName !== false) && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Rename file → title/alt auto-update until you edit them separately.
            </p>
          )}
        </div>

        {(item.type === "image" || item.type === "video") && (
          <div>
            <Label htmlFor={`media-alt-${item.id}`} className="text-xs">
              Alt text
            </Label>
            <Input
              id={`media-alt-${item.id}`}
              className="mt-1 h-8 text-xs"
              value={item.alt ?? ""}
              readOnly={readOnly}
              onChange={(e) => onUpdate?.({ alt: e.target.value })}
              placeholder="Describe this media for accessibility"
            />
          </div>
        )}

        <dl className="space-y-1.5 rounded-md border border-input bg-muted/10 px-3 py-2 text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Used on site</dt>
            <dd
              className={cn(
                "font-semibold",
                usageCount > 0 ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {usageCount > 0 ? `${usageCount} place${usageCount === 1 ? "" : "s"}` : "Not used"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium capitalize">{item.type}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Size</dt>
            <dd className="font-medium">{item.sizeKb} KB</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd className="font-medium">{formatDate(item.uploadedAt)}</dd>
          </div>
          {item.uploadedBy && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">By</dt>
              <dd className="font-medium">{item.uploadedBy}</dd>
            </div>
          )}
          {item.provider && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-medium capitalize">{item.provider}</dd>
            </div>
          )}
          {item.provider !== "youtube" && item.provider !== "vimeo" ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Storage</dt>
              <dd className="font-medium">
                {getMediaFileStorage(item) === "r2"
                  ? "Cloudflare R2"
                  : getMediaFileStorage(item) === "remote"
                    ? "Remote URL (not downloaded)"
                    : "Local"}
              </dd>
            </div>
          ) : null}
          {item.importedBy && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Imported via</dt>
              <dd className="font-medium uppercase">{item.importedBy}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">MIME</dt>
            <dd className="truncate font-medium">{item.mimeType}</dd>
          </div>
        </dl>

        {usageRefs.length > 0 && (
          <div className="rounded-md border border-input bg-muted/10 px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Used in
            </p>
            <ul className="max-h-28 space-y-1 overflow-y-auto text-[11px]">
              {usageRefs.map((ref, index) => (
                <li key={`${ref.entityType}-${ref.entityId}-${ref.fieldLabel}-${index}`} className="truncate">
                  <span className="font-medium capitalize">{ref.entityType}</span>
                  <span className="text-muted-foreground"> · </span>
                  {ref.entityLabel}
                  <span className="text-muted-foreground"> ({ref.fieldLabel})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete file
          </Button>
        )}

        {item.localPath && (
          <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
            Local: {item.localPath}
          </p>
        )}
        {item.sourceUrl && (
          <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
            Source: {item.sourceUrl}
          </p>
        )}
        <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">Preview: {item.url}</p>
      </div>
    </div>
  );
}
