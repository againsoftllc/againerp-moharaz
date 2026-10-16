"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  amountWithSymbol,
  type CurrencyOption,
  type CurrencySymbolPosition,
} from "@/lib/localisation/currency-options";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencies: CurrencyOption[];
  selectedCode?: string;
  onSelect: (code: string) => void;
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (code: string, name: string) => Promise<void> | void;
  onDelete?: (code: string) => Promise<void> | void;
  onSetSymbol?: (code: string, symbol: string) => Promise<void> | void;
  onSetPosition?: (code: string, position: CurrencySymbolPosition) => Promise<void> | void;
};

function PositionToggle({
  value,
  onChange,
}: {
  value: CurrencySymbolPosition;
  onChange: (next: CurrencySymbolPosition) => void;
}) {
  return (
    <span className="inline-flex shrink-0 border border-border">
      <button
        type="button"
        className={cn(
          "h-6 px-1.5 text-[10px] leading-none",
          value === "before"
            ? "bg-primary/10 font-semibold text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        title="Symbol left of amount"
        onClick={(e) => {
          e.stopPropagation();
          onChange("before");
        }}
      >
        Left
      </button>
      <button
        type="button"
        className={cn(
          "h-6 border-l border-border px-1.5 text-[10px] leading-none",
          value === "after"
            ? "bg-primary/10 font-semibold text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
        title="Symbol right of amount"
        onClick={(e) => {
          e.stopPropagation();
          onChange("after");
        }}
      >
        Right
      </button>
    </span>
  );
}

export function CurrencyPickDrawer({
  open,
  onOpenChange,
  currencies,
  selectedCode,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSetSymbol,
  onSetPosition,
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
      currencies.filter((row) =>
        q
          ? row.name.toLowerCase().includes(q) ||
            row.code.toLowerCase().includes(q) ||
            (row.symbol ?? "").toLowerCase().includes(q)
          : true,
      ),
    [currencies, q],
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

  function startEdit(row: CurrencyOption) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setEditingKey(row.code);
    setEditDraft(row.name);
    lastSaved.current = row.name;
  }

  function scheduleLiveRename(code: string, name: string) {
    setEditDraft(name);
    if (!onRename) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const next = name.trim();
      if (!next || next.toLowerCase() === lastSaved.current.toLowerCase()) return;
      void onRename(code, next);
      lastSaved.current = next;
    }, 350);
  }

  async function commitEdit(code: string) {
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const next = editDraft.trim();
    setEditingKey(null);
    if (!next || next.toLowerCase() === lastSaved.current.toLowerCase() || !onRename) return;
    await onRename(code, next);
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
        title="Currencies"
        resizable
        closeButton="inside"
        className="z-[280] w-[320px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <p className="text-[12px] font-semibold">Currencies</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Click the symbol box to edit it. Left / Right is where it sits on amounts.
            </p>
          </div>
          <div className="flex shrink-0 items-center border-b border-input px-2 py-1.5">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currencies…"
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
                    placeholder="USD — US Dollar, press Enter…"
                    className="h-6 w-full rounded-none border border-dashed border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
                  />
                </div>
              ) : null}
              {rows.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">No currencies</p>
              ) : (
                rows.map((row) => {
                  const isSelected =
                    selectedCode?.toLowerCase() === row.code.toLowerCase();
                  const isEditing = editingKey === row.code;
                  const canEdit = Boolean(onRename);
                  const canDelete = Boolean(onDelete);
                  const position = row.position === "after" ? "after" : "before";
                  return (
                    <div
                      key={row.code}
                      className={cn(
                        "border-b border-border/60 px-1 py-1 last:border-b-0",
                        isSelected && "bg-accent/50",
                      )}
                    >
                      <div className="flex w-full items-center gap-1 text-left text-[12px]">
                        {onSetSymbol ? (
                          <input
                            value={row.symbol ?? ""}
                            onChange={(e) => {
                              void onSetSymbol(row.code, e.target.value.slice(0, 6));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.currentTarget.select()}
                            placeholder="৳"
                            aria-label={`${row.code} symbol`}
                            title="Click and type to change the symbol"
                            className="h-6 w-10 shrink-0 rounded-none border border-input bg-background px-1 text-center text-[13px] font-medium outline-none hover:border-foreground/40 focus:border-foreground"
                          />
                        ) : (
                          <span className="w-8 shrink-0 text-center text-[13px] font-medium">
                            {row.symbol || row.code}
                          </span>
                        )}
                        {isEditing ? (
                          <input
                            ref={editRef}
                            value={editDraft}
                            onChange={(e) => scheduleLiveRename(row.code, e.target.value)}
                            onBlur={() => {
                              if (skipBlur.current) {
                                skipBlur.current = false;
                                return;
                              }
                              void commitEdit(row.code);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void commitEdit(row.code);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            className="h-6 min-w-0 flex-1 rounded-none border border-input bg-background px-1.5 text-[12px] outline-none focus:border-foreground/40"
                          />
                        ) : (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate py-0.5 text-left hover:underline"
                            onClick={() => onSelect(row.code)}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              if (canEdit) startEdit(row);
                            }}
                          >
                            {row.code} — {row.name}
                          </button>
                        )}
                        {canEdit && !searching && !isEditing ? (
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${row.name}`}
                            title="Edit currency"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(row);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        ) : null}
                        {canDelete && !searching ? (
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                            aria-label={`Delete ${row.name}`}
                            title="Delete currency"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  `Delete “${row.name}”? This cannot be undone.`,
                                )
                              ) {
                                return;
                              }
                              void onDelete?.(row.code);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 pl-8">
                        <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                          {amountWithSymbol(1234, row)}
                        </span>
                        {onSetPosition ? (
                          <PositionToggle
                            value={position}
                            onChange={(next) => {
                              void onSetPosition(row.code, next);
                            }}
                          />
                        ) : null}
                      </div>
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
