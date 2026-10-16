"use client";

import { useCallback, useRef, useState } from "react";
import { Clock, Download, File, FileText, Loader2, Music, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DigitalFile } from "@/lib/api/catalog-products";
import { deleteDigitalFile, uploadDigitalFile } from "@/lib/api/catalog-products";

export type PendingFile = {
  localId: string;
  file: File;
  name: string;
  size: number;
  mime: string;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("video/")) return <Video className="h-4 w-4 text-blue-500" />;
  if (mime.startsWith("audio/")) return <Music className="h-4 w-4 text-purple-500" />;
  if (mime.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

type Props = {
  productId: string | null;
  files: DigitalFile[];
  onFilesChange: (files: DigitalFile[]) => void;
  pendingFiles: PendingFile[];
  onPendingFilesChange: (files: PendingFile[]) => void;
};

export function DigitalFilesSection({
  productId,
  files,
  onFilesChange,
  pendingFiles,
  onPendingFilesChange,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (!picked) return;
      if (inputRef.current) inputRef.current.value = "";

      if (productId) {
        // Edit mode — upload immediately
        setUploading(true);
        try {
          const created = await uploadDigitalFile(productId, picked);
          onFilesChange([...files, created]);
          toast.success(`"${picked.name}" uploaded`);
        } catch {
          toast.error("Upload failed");
        } finally {
          setUploading(false);
        }
      } else {
        // Create mode — queue locally
        const pending: PendingFile = {
          localId: `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file: picked,
          name: picked.name,
          size: picked.size,
          mime: picked.type || "application/octet-stream",
        };
        onPendingFilesChange([...pendingFiles, pending]);
        toast.success(`"${picked.name}" queued — will upload on save`);
      }
    },
    [productId, files, onFilesChange, pendingFiles, onPendingFilesChange],
  );

  const handleDelete = async (f: DigitalFile) => {
    if (!productId) return;
    setDeletingId(f.id);
    try {
      await deleteDigitalFile(productId, f.id);
      onFilesChange(files.filter((x) => x.id !== f.id));
      toast.success(`"${f.file_name}" removed`);
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const removePending = (localId: string) => {
    onPendingFilesChange(pendingFiles.filter((p) => p.localId !== localId));
  };

  const isEmpty = files.length === 0 && pendingFiles.length === 0;

  const uploadButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-none"
      disabled={uploading}
      onClick={() => inputRef.current?.click()}
    >
      {uploading ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Upload className="mr-1.5 h-3.5 w-3.5" />
      )}
      {uploading ? "Uploading…" : "Upload file"}
    </Button>
  );

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" className="hidden" onChange={handleFileSelect} />

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-none border border-dashed border-input bg-muted/20 px-4 py-8 text-center">
          <Download className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No files attached yet</p>
          <p className="text-xs text-muted-foreground">Upload PDFs, ZIPs, videos, software and more (max 500 MB)</p>
          <div className="mt-2">{uploadButton}</div>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60 rounded-none border border-input text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileIcon mime={f.mime_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.file_size)} · {f.mime_type}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 rounded-none p-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === f.id}
                  onClick={() => handleDelete(f)}
                  aria-label={`Delete ${f.file_name}`}
                >
                  {deletingId === f.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </li>
            ))}

            {pendingFiles.map((p) => (
              <li key={p.localId} className="flex items-center gap-3 px-3 py-2.5 opacity-70">
                <FileIcon mime={p.mime} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <p className="text-xs text-amber-500">{formatBytes(p.size)} · will upload on save</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 rounded-none p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removePending(p.localId)}
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          {uploadButton}
        </>
      )}
    </div>
  );
}

/** Call this after product creation to flush pending files. */
export async function flushPendingDigitalFiles(
  productId: string,
  pendingFiles: PendingFile[],
): Promise<DigitalFile[]> {
  const results: DigitalFile[] = [];
  for (const p of pendingFiles) {
    try {
      const created = await uploadDigitalFile(productId, p.file);
      results.push(created);
    } catch {
      toast.error(`Failed to upload "${p.name}"`);
    }
  }
  return results;
}
