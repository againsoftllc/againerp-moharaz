"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/mock-data/brands";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  selectedId?: string;
  onSelect: (id: string, name: string) => void;
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (brand: Brand, name: string) => Promise<void> | void;
  onDelete?: (brand: Brand) => Promise<void> | void;
};

export function BrandPickDrawer({
  open,
  onOpenChange,
  brands,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const rows = useMemo(
    () =>
      brands.filter((b) => {
        if (!b.active) return false;
        if (!q) return true;
        return b.name.toLowerCase().includes(q);
      }),
    [brands, q],
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDraft("");
      setSaving(false);
      setEditingId(null);
      setEditDraft("");
      if (liveTimer.current) clearTimeout(liveTimer.current);
    }
  }, [open]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

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

  function startEdit(brand: Brand) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setEditingId(brand.id);
    setEditDraft(brand.name);
  }

  function scheduleLiveRename(brand: Brand, name: string) {
    setEditDraft(name);
    if (!onRename) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const next = name.trim();
      if (next && next !== brand.name) void onRename(brand, next);
    }, 350);
  }

  async function commitEdit(brand: Brand) {
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const next = editDraft.trim();
    setEditingId(null);
    if (!next || next === brand.name || !onRename) return;
    await onRename(brand, next);
  }

  function cancelEdit() {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    skipBlur.current = true;
    setEditingId(null);
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
        title="Brands"
        resizable
        closeButton="inside"
        className="z-[260] w-[280px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <p className="text-[12px] font-semibold">Brands</p>
          </div>
          <div className="flex shrink-0 items-center border-b border-input px-2 py-1.5">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
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
                    placeholder="New brand, press Enter…"
                    className="h-6 w-full rounded-none border border-dashed border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
                  />
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">No brands</p>
              ) : (
                rows.map((brand) => {
                  const isSelected = selectedId === brand.id;
                  const isEditing = editingId === brand.id;
                  return (
                    <div
                      key={brand.id}
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
                          onChange={(e) => scheduleLiveRename(brand, e.target.value)}
                          onBlur={() => {
                            if (skipBlur.current) {
                              skipBlur.current = false;
                              return;
                            }
                            void commitEdit(brand);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEdit(brand);
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
                          onClick={() => onSelect(brand.id, brand.name)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            if (onRename) startEdit(brand);
                          }}
                        >
                          <span className="truncate">{brand.name}</span>
                        </button>
                      )}
                      {onRename && !searching && !isEditing ? (
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${brand.name}`}
                          title="Edit brand"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(brand);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : null}
                      {onDelete && !searching ? (
                        <button
                          type="button"
                          className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label={`Delete ${brand.name}`}
                          title="Delete brand"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              !window.confirm(
                                `Delete “${brand.name}”? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            void onDelete(brand);
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
