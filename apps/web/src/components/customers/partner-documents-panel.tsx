"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  createCollabComment,
  deleteCollabFile,
  fetchCollabComments,
  fetchCollabFiles,
  uploadCollabFile,
  type CollabComment,
  type CollabFile,
} from "@/lib/api/collaboration";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/utils";

/** AgainPOS "Documents & Note" tab: free-text notes + file attachments,
 * merged into one feed (newest first) — same generic collaboration
 * framework used elsewhere (entity_type is free text, already proven with
 * "customer"; works identically for "supplier"). */
export function PartnerDocumentsPanel({
  entityType,
  entityId,
  readOnly,
}: {
  entityType: "customer" | "supplier";
  entityId: string;
  readOnly?: boolean;
}) {
  const [comments, setComments] = useState<CollabComment[]>([]);
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCollabComments(entityType, entityId), fetchCollabFiles(entityType, entityId)])
      .then(([c, f]) => {
        if (cancelled) return;
        setComments(c);
        setFiles(f);
      })
      .catch(() => {
        if (!cancelled) {
          setComments([]);
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const postNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setPosting(true);
    try {
      const created = await createCollabComment(entityType, entityId, { comment: body });
      setComments((prev) => [created, ...prev]);
      setNoteText("");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setPosting(false);
    }
  };

  const uploadFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const created = await uploadCollabFile(entityType, entityId, file, "document");
      setFiles((prev) => [created, ...prev]);
      toast.success(`"${file.name}" uploaded`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async (file: CollabFile) => {
    try {
      await deleteCollabFile(entityType, entityId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      toast.error("Delete failed");
    }
  };

  type FeedItem =
    | { kind: "note"; at: string; comment: CollabComment }
    | { kind: "file"; at: string; file: CollabFile };
  const feed: FeedItem[] = [
    ...comments.map((c) => ({ kind: "note" as const, at: c.created_at, comment: c })),
    ...files.map((f) => ({ kind: "file" as const, at: f.created_at, file: f })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {!readOnly ? (
        <div className="shrink-0 space-y-2 rounded-none border border-border/70 bg-muted/20 p-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            placeholder="Write a note…"
            className="w-full resize-none rounded-none border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/40"
          />
          <div className="flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void uploadFile(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 rounded-none px-2 text-[11px]"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1 h-3 w-3" /> {uploading ? "Uploading…" : "Attach file"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 rounded-none px-2 text-[11px]"
              disabled={posting || !noteText.trim()}
              onClick={() => void postNote()}
            >
              Post note
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No documents or notes yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {feed.map((item) =>
              item.kind === "note" ? (
                <li key={`note_${item.comment.id}`} className="rounded-none border border-border/70 bg-background/50 p-2">
                  <p className="whitespace-pre-wrap text-[12px] text-foreground">{item.comment.comment}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatTimeAgo(item.comment.created_at)}</p>
                </li>
              ) : (
                <li
                  key={`file_${item.file.id}`}
                  className="flex items-center justify-between gap-2 rounded-none border border-border/70 bg-background/50 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.file.storage_ref}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[12px] text-[#00a09d] hover:underline"
                    >
                      {item.file.filename}
                    </a>
                    <p className="text-[10px] text-muted-foreground">{formatTimeAgo(item.file.created_at)}</p>
                  </div>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 rounded-none p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void removeFile(item.file)}
                      aria-label={`Delete ${item.file.filename}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
