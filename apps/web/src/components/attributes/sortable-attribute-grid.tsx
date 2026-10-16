"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Filter, GripVertical, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createEmptyBulkAttribute, type BulkAttributeRow } from "@/lib/mock-data/attribute-profiles";
import {
  FILTER_DISPLAY_LABELS,
  type FilterDisplayType,
} from "@/lib/mock-data/catalog-filters";
import type { LockedFilterValuesByAttrId } from "@/lib/api/catalog-attribute-profiles";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

function reorderByKey<T extends { key: string }>(items: T[], fromKey: string, toKey: string): T[] {
  const from = items.findIndex((i) => i.key === fromKey);
  const to = items.findIndex((i) => i.key === toKey);
  if (from < 0 || to < 0 || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const DISPLAY_TYPES = Object.keys(FILTER_DISPLAY_LABELS) as FilterDisplayType[];

const DISPLAY_TYPE_COLORS: Record<FilterDisplayType, string> = {
  multi_select: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  range: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  dynamic: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type Props = {
  attributes: BulkAttributeRow[];
  onChange: (attributes: BulkAttributeRow[]) => void;
  /** Values that products still use — cannot delete/rename until cleared on products. */
  lockedValuesByAttrId?: LockedFilterValuesByAttrId;
};

type EditingValue = { attrKey: string; index: number; draft: string };

export function SortableAttributeGrid({
  attributes,
  onChange,
  lockedValuesByAttrId = {},
}: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<EditingValue | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing?.attrKey, editing?.index]);

  const isLocked = (attr: BulkAttributeRow, val: string) => {
    const attrId = attr.id;
    if (!attrId) return false;
    return (lockedValuesByAttrId[attrId] ?? []).includes(val);
  };

  const update = (key: string, patch: Partial<BulkAttributeRow>) =>
    onChange(attributes.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const remove = (key: string) => onChange(attributes.filter((a) => a.key !== key));

  const add = () => onChange([...attributes, createEmptyBulkAttribute()]);

  const handleDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    onChange(reorderByKey(attributes, dragKey, targetKey));
    setDragKey(null);
    setOverKey(null);
  };

  const addValue = (key: string) => {
    const draft = (valueDrafts[key] ?? "").trim();
    if (!draft) return;
    const attr = attributes.find((a) => a.key === key);
    if (!attr) return;
    if (attr.predefinedValues.includes(draft)) {
      setValueDrafts((d) => ({ ...d, [key]: "" }));
      return;
    }
    update(key, { predefinedValues: [...attr.predefinedValues, draft] });
    setValueDrafts((d) => ({ ...d, [key]: "" }));
    inputRefs.current[key]?.focus();
  };

  const removeValue = (attrKey: string, val: string) => {
    const attr = attributes.find((a) => a.key === attrKey);
    if (!attr) return;
    if (isLocked(attr, val)) {
      toast.error(`“${val}” is used on products — remove it from those products first`);
      return;
    }
    update(attrKey, { predefinedValues: attr.predefinedValues.filter((v) => v !== val) });
  };

  const startEditValue = (attrKey: string, index: number, val: string) => {
    const attr = attributes.find((a) => a.key === attrKey);
    if (attr && isLocked(attr, val)) {
      toast.error(`“${val}” is used on products — clear it from products before editing`);
      return;
    }
    setEditing({ attrKey, index, draft: val });
  };

  const commitEditValue = () => {
    if (!editing) return;
    const { attrKey, index, draft } = editing;
    const next = draft.trim();
    const attr = attributes.find((a) => a.key === attrKey);
    if (!attr) {
      setEditing(null);
      return;
    }
    const previous = attr.predefinedValues[index];
    if (previous && isLocked(attr, previous) && next !== previous) {
      toast.error(`“${previous}” is used on products — clear it from products first`);
      setEditing(null);
      return;
    }
    if (!next) {
      if (previous && isLocked(attr, previous)) {
        toast.error(`“${previous}” is used on products — clear it from products first`);
        setEditing(null);
        return;
      }
      update(attrKey, {
        predefinedValues: attr.predefinedValues.filter((_, i) => i !== index),
      });
      setEditing(null);
      return;
    }
    const duplicate = attr.predefinedValues.some((v, i) => i !== index && v === next);
    if (duplicate) {
      setEditing(null);
      return;
    }
    const predefinedValues = attr.predefinedValues.map((v, i) => (i === index ? next : v));
    update(attrKey, { predefinedValues });
    setEditing(null);
  };

  const cancelEditValue = () => setEditing(null);

  const toggleFilter = (key: string, attr: BulkAttributeRow) => {
    if (attr.filterable) {
      update(key, { filterable: false });
      return;
    }
    update(key, {
      filterable: true,
      filterDisplayType: attr.filterDisplayType || "multi_select",
      storefrontFilterVisible: attr.storefrontFilterVisible ?? true,
    });
  };

  return (
    <div className="space-y-0.5 py-0.5">
      {attributes.map((attr) => (
        <div
          key={attr.key}
          onDragOver={(e) => { e.preventDefault(); setOverKey(attr.key); }}
          onDragLeave={() => setOverKey((k) => (k === attr.key ? null : k))}
          onDrop={() => handleDrop(attr.key)}
          className={cn(
            overKey === attr.key && dragKey !== attr.key && "rounded-none ring-2 ring-primary/30",
          )}
        >
          <div
            draggable
            onDragStart={() => setDragKey(attr.key)}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            className={cn(
              "flex cursor-grab items-center gap-1.5 rounded-none px-1 py-0.5 hover:bg-muted/40 active:cursor-grabbing",
              dragKey === attr.key && "opacity-50",
            )}
          >
            <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <Input
              value={attr.name}
              onChange={(e) => update(attr.key, { name: e.target.value })}
              placeholder="Attribute name"
              className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() => toggleFilter(attr.key, attr)}
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-none px-1 py-0.5 text-[10px] font-medium transition-colors",
                attr.filterable
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                  : "text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground",
              )}
              aria-pressed={attr.filterable}
              title="Use as storefront filter"
            >
              <Filter className="h-2.5 w-2.5" />
              Filter
            </button>
            {attr.filterable && (
              <>
                <label className="sr-only" htmlFor={`filter-type-${attr.key}`}>
                  Filter display type
                </label>
                <select
                  id={`filter-type-${attr.key}`}
                  value={attr.filterDisplayType || "multi_select"}
                  onChange={(e) =>
                    update(attr.key, {
                      filterDisplayType: e.target.value as FilterDisplayType,
                    })
                  }
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    "h-5 max-w-[7.5rem] shrink-0 cursor-pointer rounded-none border-0 px-1.5 text-[10px] font-medium outline-none",
                    DISPLAY_TYPE_COLORS[attr.filterDisplayType || "multi_select"],
                  )}
                  title="How this filter shows on the storefront"
                >
                  {DISPLAY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {FILTER_DISPLAY_LABELS[type]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    update(attr.key, {
                      storefrontFilterVisible: !(attr.storefrontFilterVisible ?? true),
                    });
                  }}
                  className={cn(
                    "shrink-0 rounded-none p-0.5",
                    attr.storefrontFilterVisible !== false
                      ? "text-emerald-600"
                      : "text-muted-foreground/40",
                  )}
                  title={
                    attr.storefrontFilterVisible !== false
                      ? "Visible on storefront"
                      : "Hidden on storefront"
                  }
                >
                  {attr.storefrontFilterVisible !== false ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => remove(attr.key)}
              className="h-5 w-5 shrink-0 rounded-none p-0 text-muted-foreground/40 hover:text-destructive"
              aria-label="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {attr.filterable && (
            <div className="ml-4 border-l border-input pl-2.5 py-1">
              <div className="flex flex-wrap gap-1">
                {attr.predefinedValues.map((val, index) => {
                  const locked = isLocked(attr, val);
                  const isEditing =
                    editing?.attrKey === attr.key && editing.index === index;
                  if (isEditing) {
                    return (
                      <input
                        key={`${attr.key}-${index}-edit`}
                        ref={editInputRef}
                        type="text"
                        value={editing.draft}
                        onChange={(e) =>
                          setEditing((cur) =>
                            cur ? { ...cur, draft: e.target.value } : cur,
                          )
                        }
                        onBlur={() => {
                          if (skipBlurCommit.current) {
                            skipBlurCommit.current = false;
                            return;
                          }
                          commitEditValue();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEditValue();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            skipBlurCommit.current = true;
                            cancelEditValue();
                          }
                        }}
                        className="h-[21px] min-w-[4rem] rounded-none border border-sky-400 bg-background px-1.5 text-[10px] font-medium text-sky-800 outline-none ring-1 ring-sky-400 dark:text-sky-200"
                      />
                    );
                  }
                  return (
                    <span
                      key={`${attr.key}-${index}-${val}`}
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-none border px-1.5 py-0.5 text-[10px] font-medium",
                        locked
                          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                          : "border-sky-200 bg-sky-100/80 text-sky-800 dark:border-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
                      )}
                      title={
                        locked
                          ? "Used on products — remove from products before deleting"
                          : "Click to edit"
                      }
                    >
                      {attr.filterDisplayType === "color" ? (
                        <span
                          className="mr-0.5 inline-block h-2.5 w-2.5 shrink-0 border border-border"
                          style={{
                            backgroundColor: /^#?[0-9a-fA-F]{3,8}$/.test(val.replace(/\s/g, ""))
                              ? val.startsWith("#")
                                ? val
                                : `#${val}`
                              : undefined,
                          }}
                          aria-hidden
                        />
                      ) : null}
                      {locked ? (
                        <span className="inline-flex max-w-[10rem] items-center gap-0.5 truncate">
                          <Lock className="h-2.5 w-2.5 shrink-0 opacity-70" />
                          {val}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditValue(attr.key, index, val)}
                          className="max-w-[10rem] truncate text-left hover:underline"
                        >
                          {val}
                        </button>
                      )}
                      {locked ? null : (
                        <button
                          type="button"
                          onClick={() => removeValue(attr.key, val)}
                          className="ml-0.5 rounded-none hover:text-destructive"
                          aria-label={`Remove ${val}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
                <input
                  ref={(el) => { inputRefs.current[attr.key] = el; }}
                  type="text"
                  value={valueDrafts[attr.key] ?? ""}
                  onChange={(e) => setValueDrafts((d) => ({ ...d, [attr.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addValue(attr.key); }
                  }}
                  placeholder={attr.predefinedValues.length === 0 ? "Type a value, press Enter…" : "Add more…"}
                  className="h-6 min-w-[120px] flex-1 rounded-none border border-dashed border-sky-300 bg-transparent px-1.5 text-[11px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-sky-700"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-1.5 rounded-none px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add attribute
      </button>
    </div>
  );
}

export function reorderGroupsByKey<T extends { key: string }>(
  groups: T[],
  fromKey: string,
  toKey: string,
): T[] {
  return reorderByKey(groups, fromKey, toKey);
}
