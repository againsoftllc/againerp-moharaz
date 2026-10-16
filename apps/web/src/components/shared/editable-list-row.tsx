"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function EditableListRow({
  label,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  label: string;
  selected?: boolean;
  onSelect: () => void;
  onRename?: (next: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === label || !onRename) return;
    onRename(next);
  }

  function cancel() {
    skipBlur.current = true;
    setEditing(false);
    setDraft(label);
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-0.5 pr-1 text-left text-[11px] hover:bg-accent",
        selected && "bg-accent/60 font-medium",
      )}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="mr-1 h-6 min-w-0 flex-1 rounded-none border border-input bg-background px-1.5 text-[11px] outline-none"
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center px-2.5 py-1 text-left"
          onClick={onSelect}
        >
          <span className="truncate">{label}</span>
        </button>
      )}
      {onRename && !editing ? (
        <button
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${label}`}
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(label);
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      ) : null}
      {onDelete && !editing ? (
        <button
          type="button"
          className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label={`Delete ${label}`}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
