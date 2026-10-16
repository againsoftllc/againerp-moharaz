"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { UnitTypeOption } from "@/lib/inventory/unit-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: UnitTypeOption[];
  selectedValue?: string;
  defaultValue?: string;
  onSelect: (value: string) => void;
  onSetDefault?: (value: string) => void;
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (value: string, label: string) => Promise<void> | void;
  onDelete?: (value: string) => Promise<void> | void;
};

export function UnitTypePickDrawer({
  open,
  onOpenChange,
  units,
  selectedValue,
  defaultValue,
  onSelect,
  onSetDefault,
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
    () =>
      units.filter((u) => {
        if (!q) return true;
        return u.label.toLowerCase().includes(q) || u.value.toLowerCase().includes(q);
      }),
    [units, q],
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

  function startEdit(unit: UnitTypeOption) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setEditingKey(unit.value);
    setEditDraft(unit.label);
    lastSaved.current = unit.label;
  }

  function scheduleLiveRename(name: string) {
    setEditDraft(name);
    if (!onRename || !editingKey) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const next = name.trim();
      if (!next || next.toLowerCase() === lastSaved.current.toLowerCase()) return;
      void onRename(editingKey, next);
      lastSaved.current = next;
    }, 350);
  }

  async function commitEdit() {
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const next = editDraft.trim();
    const from = lastSaved.current;
    const key = editingKey;
    setEditingKey(null);
    if (!next || next.toLowerCase() === from.toLowerCase() || !onRename || !key) return;
    await onRename(key, next);
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
        title="Unit types"
        resizable
        closeButton="inside"
        className="z-[260] w-[280px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <p className="text-[12px] font-semibold">Unit types</p>
          </div>
          <div className="flex shrink-0 items-center border-b border-input px-2 py-1.5">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search units…"
              className="h-6 w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="px-1">
              {onCreate && !searching ? (
                <div className="mb-1 px-1 pb-1.5 pt-0.5">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-none border px-1.5",
                      "border-[#00a09d]/40 bg-[#00a09d]/[0.06] focus-within:border-[#00a09d] focus-within:bg-[#00a09d]/10",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-[#00a09d]" aria-hidden />
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
                      placeholder="Add new unit type…"
                      className="h-7 w-full min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#00a09d]/70"
                    />
                    {draft.trim() ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void submitInline()}
                        className="shrink-0 rounded-none bg-[#00a09d] px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-[#00a09d]/90 disabled:opacity-50"
                      >
                        Add
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">No unit types</p>
              ) : (
                rows.map((unit) => {
                  const isDefault = defaultValue === unit.value;
                  const isSelected = selectedValue === unit.value;
                  const isEditing = editingKey === unit.value;
                  return (
                    <div
                      key={unit.value}
                      className={cn(
                        "flex w-full items-center gap-0.5 pr-1 text-left text-[12px] hover:bg-accent",
                        isSelected && "bg-accent/50 font-medium",
                      )}
                    >
                      {onSetDefault && !searching && !isEditing ? (
                        <button
                          type="button"
                          className={cn(
                            "flex h-7 w-5 shrink-0 items-center justify-center",
                            isDefault ? "cursor-default text-amber-400" : "text-muted-foreground/40 hover:text-amber-400",
                          )}
                          title={isDefault ? "Default unit type" : "Set as default"}
                          aria-label={isDefault ? "Default unit type" : `Set ${unit.label} as default`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDefault) onSetDefault(unit.value);
                          }}
                        >
                          <Star className="h-3.5 w-3.5" fill={isDefault ? "currentColor" : "none"} />
                        </button>
                      ) : (
                        <span className="inline-block h-7 w-5 shrink-0" />
                      )}
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
                          onClick={() => onSelect(unit.value)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            if (onRename) startEdit(unit);
                          }}
                        >
                          <span className="truncate">{unit.label}</span>
                          {isDefault ? (
                            <span className="shrink-0 border border-border px-1 text-[9px] font-medium leading-4 text-muted-foreground">
                              Default
                            </span>
                          ) : null}
                        </button>
                      )}
                      {onRename && !searching && !isEditing ? (
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${unit.label}`}
                          title="Edit unit type"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(unit);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : null}
                      {onDelete && !searching ? (
                        <button
                          type="button"
                          className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label={`Delete ${unit.label}`}
                          title="Delete unit type"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              !window.confirm(
                                `Delete “${unit.label}”? This cannot be undone.`,
                              )
                            ) {
                              return;
                            }
                            void onDelete(unit.value);
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
