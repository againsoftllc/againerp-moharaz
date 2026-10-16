"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
} from "@/components/again/again-drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warranties: string[];
  selectedWarranty: string;
  onSelect: (warranty: string) => void;
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
};

export function WarrantyFormDrawer({
  open,
  onOpenChange,
  warranties,
  selectedWarranty,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [label, setLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const focusAddInput = () => {
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  useEffect(() => {
    if (open) {
      setLabel("");
      setSelectedId(selectedWarranty || null);
      setEditingId(null);
      setDraftLabel("");
      focusAddInput();
    }
  }, [open, selectedWarranty]);

  const createFromLabel = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      focusAddInput();
      return false;
    }
    onCreate(trimmed);
    setLabel("");
    return true;
  };

  const submit = () => {
    if (!createFromLabel()) {
      onOpenChange(false);
      return;
    }
    onOpenChange(false);
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Warranties"
      nested
      resizable
      defaultWidth={360}
      minWidth={280}
      widthStorageKey="again-warranty-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN)}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            onClick={submit}
          >
            Save
          </button>
          <button
            type="button"
            className={AGAIN_DRAWER_ACTION_BTN}
            onClick={() => onOpenChange(false)}
          >
            Discard
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
            <ul>
              {warranties.map((warranty) => {
                const selected = selectedId === warranty;
                const editing = editingId === warranty;
                return (
                  <li
                    key={warranty}
                    className={cn(
                      "flex items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px]",
                      selected && "bg-[#00a09d]/10",
                    )}
                  >
                    {editing ? (
                      <>
                        <input
                          autoFocus
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onRename(warranty, draftLabel);
                              setEditingId(null);
                              setSelectedId(draftLabel.trim() || warranty);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingId(null);
                              setDraftLabel(warranty);
                            }
                          }}
                          className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none"
                          aria-label="Edit warranty name"
                        />
                        <button
                          type="button"
                          title="Save name"
                          aria-label="Save name"
                          onClick={() => {
                            onRename(warranty, draftLabel);
                            setEditingId(null);
                            setSelectedId(draftLabel.trim() || warranty);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Cancel"
                          aria-label="Cancel edit"
                          onClick={() => {
                            setEditingId(null);
                            setDraftLabel(warranty);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(warranty);
                            onSelect(warranty);
                            setEditingId(null);
                          }}
                          className="min-w-0 flex-1 truncate px-2 py-1 text-left text-black hover:text-[#00a09d] dark:text-foreground"
                        >
                          {warranty}
                        </button>
                        <button
                          type="button"
                          title="Edit warranty"
                          aria-label={`Edit ${warranty}`}
                          onClick={() => {
                            setEditingId(warranty);
                            setDraftLabel(warranty);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete warranty"
                          aria-label={`Delete ${warranty}`}
                          onClick={() => {
                            if (!window.confirm(`Remove warranty "${warranty}"?`)) return;
                            onDelete(warranty);
                            if (selectedId === warranty) setSelectedId(null);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            <div
              role="button"
              tabIndex={0}
              onClick={focusAddInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  focusAddInput();
                }
              }}
              className="flex w-full cursor-text items-center gap-1 rounded-none border-b border-border/50 bg-background/70 px-1 py-1 text-[13px] last:border-b-0 hover:bg-muted/40"
              aria-label="Add new warranty"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-black dark:text-foreground">
                <Plus className="h-4 w-4" />
              </span>
              <input
                ref={addInputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (createFromLabel()) onOpenChange(false);
                  }
                }}
                placeholder="Add new warranty"
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-black outline-none placeholder:text-black/50 dark:text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
