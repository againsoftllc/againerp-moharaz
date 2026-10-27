"use client";

import { useRef, useState } from "react";
import { Link2, Loader2, Sparkles, Upload } from "lucide-react";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { filterSafeUploadFiles, SAFE_FILE_INPUT_ACCEPT, SAFE_UPLOAD_HINT } from "@/lib/media/safe-upload-types";
import { importMediaFromInput } from "@/lib/media/media-import";
import { useModuleSettings } from "@/lib/workspace/use-module-settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type MediaUploadMethod = "files" | "url" | "ai";

type Props = {
  onUploadFiles?: (files: FileList) => void;
  onImport?: (items: MediaLibraryItem[]) => void;
  compact?: boolean;
};

export function MediaLibraryUploadPanel({ onUploadFiles, onImport, compact }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<MediaUploadMethod>("files");
  const [aiPrompt, setAiPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlRows, setUrlRows] = useState<string[]>([""]);
  const [aiOpen, setAiOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const maxUploadMb = Number(useModuleSettings("media").values.maxUploadMb) || 0;

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || !onUploadFiles) return;

    const { allowed: safe, rejected } = filterSafeUploadFiles(files);
    if (rejected.length) {
      toast.error(
        `${rejected.length} file${rejected.length === 1 ? "" : "s"} blocked — only safe images, videos, PDF, DOCX, Excel, TXT, and CSV allowed.`,
      );
    }
    // Media settings → "Max upload size" (the server enforces it too).
    const tooLarge = maxUploadMb > 0 ? safe.filter((file) => file.size > maxUploadMb * 1024 * 1024) : [];
    if (tooLarge.length) {
      toast.error(
        `${tooLarge.map((file) => file.name).join(", ")} ${tooLarge.length === 1 ? "is" : "are"} larger than the ${maxUploadMb} MB limit in Media settings.`,
      );
    }
    const allowed = safe.filter((file) => !tooLarge.includes(file));
    if (!allowed.length) return;

    const transfer = new DataTransfer();
    allowed.forEach((file) => transfer.items.add(file));
    onUploadFiles(transfer.files);
  };

  const runImport = async (raw: string, mode: "ai" | "url") => {
    if (!raw.trim()) {
      toast.error(mode === "ai" ? "Paste a page or image URL first" : "Enter at least one URL");
      return;
    }

    setLoading(true);
    try {
      const { items: imported, failed } = await importMediaFromInput(raw, mode);
      for (const miss of failed) toast.error(`${miss.url}: ${miss.reason}`);
      if (!imported.length) {
        if (!failed.length) toast.error("No valid URLs found");
        return;
      }
      onImport?.(imported);
      toast.success(
        mode === "ai"
          ? `Found ${imported.length} image${imported.length === 1 ? "" : "s"} on the page — added to Media Library`
          : `${imported.length} item${imported.length === 1 ? "" : "s"} added to Media Library — select from the grid`,
      );
      if (mode === "ai") {
        setAiPrompt("");
        setAiOpen(false);
      } else {
        setUrlRows([""]);
        setUrlInput("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUrlImport = () => {
    const combined = [urlInput, ...urlRows].filter(Boolean).join("\n");
    void runImport(combined, "url");
  };

  const openAiPanel = () => {
    setMethod("ai");
    setAiOpen(true);
  };

  return (
    <div className={cn("flex min-h-[220px] flex-1 flex-col gap-3", compact ? "text-xs" : "text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openAiPanel}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 transition-colors",
            method === "ai" && aiOpen
              ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
              : "border-input hover:bg-accent",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Upload
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("url");
            setAiOpen(false);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 transition-colors",
            method === "url"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input hover:bg-accent",
          )}
        >
          <Link2 className="h-3.5 w-3.5" />
          URL
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("files");
            setAiOpen(false);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 transition-colors",
            method === "files"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input hover:bg-accent",
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          Select file
        </button>
      </div>

      {method === "ai" && aiOpen && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-sm font-medium">AI media import</p>
              <p className="text-[11px] text-muted-foreground">
                Paste a product or gallery page link, or direct image URLs. The images the page shows are added to the library.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-input bg-background shadow-sm">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={`Example:\nhttps://supplier-site.com/product/blue-jacket\nhttps://cdn.example.com/images/front.jpg\nhttps://cdn.example.com/images/back.jpg`}
              rows={5}
              className="min-h-[120px] resize-y border-0 text-xs focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 border-t border-input px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                One URL per line · page scrape or direct image links
              </p>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={loading}
                onClick={() => void runImport(aiPrompt, "ai")}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {method === "url" && (
        <div className="rounded-xl border border-input bg-muted/10 p-3">
          <p className="mb-2 text-sm font-medium">Import from 3rd-party URL</p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Load image, video, YouTube, Vimeo, or safe document links (PDF, DOCX, Excel, TXT).
          </p>
          <div className="space-y-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://cdn.shop.com/product.jpg"
              className="h-8 text-xs"
            />
            {urlRows.map((row, index) => (
              <Input
                key={index}
                value={row}
                onChange={(e) =>
                  setUrlRows((prev) => prev.map((value, i) => (i === index ? e.target.value : value)))
                }
                placeholder={
                  index === 0
                    ? "https://www.youtube.com/watch?v=..."
                    : `Additional URL ${index + 1}`
                }
                className="h-8 text-xs"
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setUrlRows((prev) => [...prev, ""])}
              >
                + Add URL
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={loading}
                onClick={handleUrlImport}
              >
                {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Import to library
              </Button>
            </div>
          </div>
        </div>
      )}

      {method === "files" && (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-none border border-dashed border-input bg-muted/20 px-4 py-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Drag & drop files here</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">{SAFE_UPLOAD_HINT}</p>
          {onUploadFiles && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
            >
              Select files
            </Button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={SAFE_FILE_INPUT_ACCEPT}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
