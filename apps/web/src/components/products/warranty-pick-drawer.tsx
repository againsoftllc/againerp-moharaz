"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warranties: string[];
  selectedWarranty?: string;
  onSelect: (warranty: string) => void;
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (from: string, to: string) => Promise<void> | void;
  onDelete?: (name: string) => Promise<void> | void;
};

export function WarrantyPickDrawer({
  open,
  onOpenChange,
  warranties,
  selectedWarranty,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const lastSaved = useRef("");
  const editRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const rows = useMemo(
    () => warranties.filter((w) => (q ? w.toLowerCase().includes(q) : true)),
    [warranties, q],
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDraft("");
      setSaving(false);
      setEditingKey(null);
      setEditDraft("");
      if (liveTimer.current) clearTimeout(liveTimer.current);
    }
  }, [open]);

  useEffect(() => {
    if (editingKey) editRef.current?.focus();
  }, [editingKey]);

  async function submitInline() {
    const name = draft.trim();
    if (!name || !onCreate || saving) return;
    setSaving(true);
    try {
      await onCreate(name);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(warranty: string) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setEditingKey(warranty);
    setEditDraft(warranty);
    lastSaved.current = warranty;
  }

  function scheduleLiveRename(name: string) {
    setEditDraft(name);
    if (!onRename) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const next = name.trim();
      if (!next || next.toLowerCase() === lastSaved.current.toLowerCase()) return;
      void onRename(lastSaved.current, next);
      lastSaved.current = next;
      setEditingKey(next);
    }, 350);
  }

  async function commitEdit() {
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const next = editDraft.trim();
    const from = lastSaved.current;
    setEditingKey(null);
    if (!next || next.toLowerCase() === from.toLowerCase() || !onRename) return;
    await onRename(from, next);
  }

  function cancelEdit() {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    skipBlur.current = true;
    setEditingKey(null);
    setEditDraft("");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearch("");
      }}
    >
      <SheetContent
        side="right"
        title="Warranties"
        resizable
        closeButton="inside"
        className="z-[260] w-[280px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <p className="text-[12px] font-semibold">Warranties</p>
          </div>
          <div className="flex shrink-0 items-center border-b border-input px-2 py-1.5">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search warranties…"
              className="h-6 w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="px-1">
              {onCreate && !searching ? (
                <div className="px-1 py-0.5">
                  <input
                    value={draft}
                    disabled={saving}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitInline();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setDraft("");
                      }
                    }}
                    placeholder="New warranty, press Enter…"
                    className="h-6 w-full rounded-none border border-dashed border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
                  />
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">No warranties</p>
              ) : (
                rows.map((warranty) => {
                  const isSelected =
                    selectedWarranty?.toLowerCase() === warranty.toLowerCase();
                  const isEditing = editingKey?.toLowerCase() === warranty.toLowerCase();
                  return (
                    <div
                      key={warranty}
                      className={cn(
                        "flex w-full items-center gap-0.5 pr-1 text-left text-[12px] hover:bg-accent",
                        isSelected && "bg-accent/50 font-medium",
                      )}
                    >
                      <span className="inline-block h-7 w-4 shrink-0" />
                      {isEditing ? (
                        <input
                          ref={editRef}
                          value={editDraft}
                          onChange={(e) => scheduleLiveRename(e.target.value)}
                          onBlur={() => {
                            if (skipBlur.current) {
                              skipBlur.current = false;
                              return;
                            }
                            void commitEdit();
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEdit();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          className="mr-1 h-6 min-w-0 flex-1 rounded-none border border-input bg-background px-1.5 text-[12px] outline-none focus:border-foreground/40"
                        />
                      ) : (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                          onClick={() => onSelect(warranty)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            if (onRename) startEdit(warranty);
                          }}
                        >
                          <span className="truncate">{warranty}</span>
                        </button>
                      )}
                      {onRename && !searching && !isEditing ? (
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${warranty}`}
                          title="Edit warranty"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(warranty);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : null}
                      {onDelete && !searching ? (
                        <button
                          type="button"
                          className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label={`Delete ${warranty}`}
                          title="Delete warranty"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              !window.confirm(
                                `Delete “${warranty}”? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            void onDelete(warranty);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
