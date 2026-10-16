"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getCategoryAncestorNames } from "@/lib/category-utils";
import {
  buildCategoryTree,
  type Category,
  type CategoryNode,
} from "@/lib/mock-data/categories";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  selectedId?: string;
  selectedIds?: string[];
  multiple?: boolean;
  onSelect: (id: string, name: string) => void;
  /** Inline create under a category. Drawer stays open. */
  onCreate?: (parentId: string | null, name: string) => Promise<void> | void;
  onRename?: (node: CategoryNode, name: string) => Promise<void> | void;
  onDelete?: (node: CategoryNode) => Promise<void> | void;
};

function collectAncestorIds(id: string, items: Category[]): string[] {
  const ids: string[] = [];
  let parentId = items.find((c) => c.id === id)?.parentId ?? null;
  while (parentId) {
    ids.push(parentId);
    parentId = items.find((c) => c.id === parentId)?.parentId ?? null;
  }
  return ids;
}

function collectExpandableIds(nodes: CategoryNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length) {
      ids.push(node.id);
      ids.push(...collectExpandableIds(node.children));
    }
  }
  return ids;
}

function pruneTree(nodes: CategoryNode[], keep: Set<string>): CategoryNode[] {
  return nodes
    .filter((n) => keep.has(n.id))
    .map((n) => ({ ...n, children: pruneTree(n.children, keep) }));
}

function InlineCategoryInput({
  value,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="py-0.5 pr-1">
      <input
        ref={ref}
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Name, press Enter…"
        className="h-6 w-full rounded-none border border-dashed border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
    </div>
  );
}

function CategoryTreeNodes({
  nodes,
  selectedIds,
  multiple,
  expanded,
  searching,
  addingUnderId,
  draft,
  saving,
  onToggle,
  onPick,
  onStartAdd,
  onStartEdit,
  onDelete,
  onDraftChange,
  onSubmitAdd,
  onCancelAdd,
  editingId,
  editDraft,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
}: {
  nodes: CategoryNode[];
  selectedIds: string[];
  multiple: boolean;
  expanded: Set<string>;
  searching: boolean;
  addingUnderId: string | null;
  draft: string;
  saving: boolean;
  onToggle: (id: string) => void;
  onPick: (node: CategoryNode) => void;
  onStartAdd?: (id: string) => void;
  onStartEdit?: (node: CategoryNode) => void;
  onDelete?: (node: CategoryNode) => void;
  onDraftChange: (value: string) => void;
  onSubmitAdd: () => void;
  onCancelAdd: () => void;
  editingId: string | null;
  editDraft: string;
  onEditChange: (node: CategoryNode, name: string) => void;
  onCommitEdit: (node: CategoryNode) => void;
  onCancelEdit: () => void;
}) {
  return (
    <div>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = searching || expanded.has(node.id);
        const showChildren = hasChildren && isOpen;
        const showInput = addingUnderId === node.id && !searching;
        const showNested = showChildren || showInput;
        const isSelected = selectedIds.includes(node.id);

        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex w-full items-center gap-0.5 pr-1 text-left text-[12px] hover:bg-accent",
                isSelected && "bg-accent/50 font-medium",
              )}
            >
              {hasChildren && !searching ? (
                <button
                  type="button"
                  className="flex h-7 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                  onClick={() => onToggle(node.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="inline-block h-7 w-4 shrink-0" />
              )}
              {editingId === node.id ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => onEditChange(node, e.target.value)}
                  onBlur={() => onCommitEdit(node)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onCommitEdit(node);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      onCancelEdit();
                    }
                  }}
                  className="mr-1 h-6 min-w-0 flex-1 rounded-none border border-input bg-background px-1.5 text-[12px] outline-none focus:border-foreground/40"
                />
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                  onClick={() => onPick(node)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    onStartEdit?.(node);
                  }}
                >
                  {multiple ? (
                    <span
                      className={cn(
                        "flex h-3 w-3 shrink-0 items-center justify-center border border-border text-[8px]",
                        isSelected && "border-[#00a09d] bg-[#00a09d] text-white",
                      )}
                      aria-hidden
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  ) : null}
                  <span className="truncate">{node.name}</span>
                </button>
              )}
              {onStartAdd && !searching ? (
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground",
                    showInput && "bg-muted text-foreground",
                  )}
                  aria-label={`Add category under ${node.name}`}
                  title="Add category"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartAdd(node.id);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </button>
              ) : null}
              {onStartEdit && !searching && editingId !== node.id ? (
                <button
                  type="button"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Edit ${node.name}`}
                  title="Edit category"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEdit(node);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              ) : null}
              {onDelete && !searching ? (
                <button
                  type="button"
                  className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Delete ${node.name}`}
                  title="Delete category"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            {showNested && (
              <div className="ml-[7px] border-l border-input pl-2.5">
                {showInput ? (
                  <InlineCategoryInput
                    value={draft}
                    saving={saving}
                    onChange={onDraftChange}
                    onSubmit={onSubmitAdd}
                    onCancel={onCancelAdd}
                  />
                ) : null}
                {showChildren ? (
                  <CategoryTreeNodes
                    nodes={node.children}
                    selectedIds={selectedIds}
                    multiple={multiple}
                    expanded={expanded}
                    searching={searching}
                    addingUnderId={addingUnderId}
                    draft={draft}
                    saving={saving}
                    onToggle={onToggle}
                    onPick={onPick}
                    onStartAdd={onStartAdd}
                    onStartEdit={onStartEdit}
                    onDelete={onDelete}
                    onDraftChange={onDraftChange}
                    onSubmitAdd={onSubmitAdd}
                    onCancelAdd={onCancelAdd}
                    editingId={editingId}
                    editDraft={editDraft}
                    onEditChange={onEditChange}
                    onCommitEdit={onCommitEdit}
                    onCancelEdit={onCancelEdit}
                  />
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CategoryPickDrawer({
  open,
  onOpenChange,
  categories,
  selectedId,
  selectedIds,
  multiple = false,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingUnderId, setAddingUnderId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rootDraft, setRootDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipBlur = useRef(false);

  const checkedIds = selectedIds?.length
    ? selectedIds
    : selectedId
      ? [selectedId]
      : [];
  const active = useMemo(() => categories.filter((c) => c.active), [categories]);
  const tree = useMemo(() => buildCategoryTree(active), [active]);
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const displayTree = useMemo(() => {
    if (!q) return tree;

    const matchIds = new Set(
      active
        .filter((c) => {
          const ancestors = getCategoryAncestorNames(c, active);
          return (
            c.name.toLowerCase().includes(q) ||
            (c.caption || "").toLowerCase().includes(q) ||
            ancestors.some((a) => a.toLowerCase().includes(q))
          );
        })
        .map((c) => c.id),
    );
    const keep = new Set<string>();
    for (const id of matchIds) {
      keep.add(id);
      for (const aid of collectAncestorIds(id, active)) keep.add(aid);
    }
    return pruneTree(tree, keep);
  }, [q, tree, active]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setAddingUnderId(null);
      setDraft("");
      setRootDraft("");
      setSaving(false);
      setEditingId(null);
      setEditDraft("");
      if (liveTimer.current) clearTimeout(liveTimer.current);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setExpanded((prev) => {
      const next = new Set(collectExpandableIds(tree));
      if (addingUnderId) next.add(addingUnderId);
      for (const id of prev) next.add(id);
      return next;
    });
  }, [open, tree, addingUnderId]);

  async function submitCreate(parentId: string | null, name: string, after?: () => void) {
    const next = name.trim();
    if (!next || !onCreate || saving) return;
    setSaving(true);
    try {
      await onCreate(parentId, next);
      after?.();
    } finally {
      setSaving(false);
    }
  }

  async function submitInline() {
    if (!addingUnderId) return;
    await submitCreate(addingUnderId, draft, () => setDraft(""));
  }

  async function submitRoot() {
    await submitCreate(null, rootDraft, () => setRootDraft(""));
  }

  function startEdit(node: CategoryNode) {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setEditingId(node.id);
    setEditDraft(node.name);
  }

  function scheduleLiveRename(node: CategoryNode, name: string) {
    setEditDraft(name);
    if (!onRename) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const next = name.trim();
      if (next && next !== node.name) void onRename(node, next);
    }, 350);
  }

  async function commitEdit(node: CategoryNode) {
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    const next = editDraft.trim();
    setEditingId(null);
    if (!next || next === node.name || !onRename) return;
    await onRename(node, next);
  }

  function cancelEdit() {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    skipBlur.current = true;
    setEditingId(null);
    setEditDraft("");
  }

  function startAdd(id: string) {
    setAddingUnderId((prev) => {
      if (prev === id) {
        setDraft("");
        return null;
      }
      setDraft("");
      return id;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
        title="Categories"
        resizable
        closeButton="inside"
        className="z-[260] w-[280px] min-w-[160px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-3 py-2 pr-10">
            <p className="text-[12px] font-semibold">Categories</p>
          </div>
          <div className="flex shrink-0 items-center border-b border-input px-2 py-1.5">
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="h-6 w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="px-1">
              {onCreate && !searching ? (
                <div className="px-1 py-0.5">
                  <input
                    value={rootDraft}
                    disabled={saving}
                    onChange={(e) => setRootDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitRoot();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setRootDraft("");
                      }
                    }}
                    placeholder="Add new category, press Enter…"
                    aria-label="Add new category"
                    className="h-6 w-full rounded-none border border-dashed border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
                  />
                </div>
              ) : null}
              {displayTree.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-muted-foreground">
                  {onCreate && !searching
                    ? "No categories yet — type a name above and press Enter."
                    : "No categories"}
                </p>
              ) : (
                <CategoryTreeNodes
                  nodes={displayTree}
                  selectedIds={checkedIds}
                  multiple={multiple}
                  expanded={expanded}
                  searching={searching}
                  addingUnderId={addingUnderId}
                  draft={draft}
                  saving={saving}
                  onToggle={(id) =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onPick={(node) => {
                    onSelect(node.id, node.name);
                    if (!multiple) onOpenChange(false);
                  }}
                  onStartAdd={onCreate ? startAdd : undefined}
                  onStartEdit={onRename ? startEdit : undefined}
                  onDelete={
                    onDelete
                      ? (node) => {
                          const extra = node.children.length
                            ? " and its subcategories"
                            : "";
                          if (
                            !window.confirm(
                              `Delete “${node.name}”${extra}? This cannot be undone.`,
                            )
                          ) {
                            return;
                          }
                          void onDelete(node);
                        }
                      : undefined
                  }
                  onDraftChange={setDraft}
                  onSubmitAdd={() => void submitInline()}
                  onCancelAdd={() => {
                    setAddingUnderId(null);
                    setDraft("");
                  }}
                  editingId={editingId}
                  editDraft={editDraft}
                  onEditChange={scheduleLiveRename}
                  onCommitEdit={(node) => {
                    if (skipBlur.current) {
                      skipBlur.current = false;
                      return;
                    }
                    void commitEdit(node);
                  }}
                  onCancelEdit={cancelEdit}
                />
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
