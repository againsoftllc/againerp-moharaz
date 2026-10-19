"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, List, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryAncestorNames } from "@/lib/category-utils";
import {
  buildCategoryTree,
  flattenCategoryTree,
  type Category,
} from "@/lib/mock-data/categories";

type SingleProps = {
  multiple?: false;
  categories: Category[];
  value: string;
  onChange: (id: string, name: string) => void;
  onList?: () => void;
  placeholder?: string;
  className?: string;
  /** Open the list as soon as it mounts (a grid cell editor). */
  autoOpen?: boolean;
  /** The list is part of the layout under the button instead of a floating menu (inside a popup that must not lose focus). */
  inline?: boolean;
  /** Show the picked categories as chips under the button (multi select; default on). */
  chips?: boolean;
  /** A list filter bar picker: its menu follows the list zoom and the filter font size (globals.css [data-list-filter-menu]). */
  listFilter?: boolean;
};

type MultiProps = {
  multiple: true;
  categories: Category[];
  values: string[];
  onChange: (ids: string[]) => void;
  onList?: () => void;
  placeholder?: string;
  className?: string;
  autoOpen?: boolean;
  inline?: boolean;
  chips?: boolean;
  listFilter?: boolean;
};

type Props = SingleProps | MultiProps;

function collectAncestorIds(id: string, items: Category[]): string[] {
  const ids: string[] = [];
  let parentId = items.find((c) => c.id === id)?.parentId ?? null;
  while (parentId) {
    ids.push(parentId);
    parentId = items.find((c) => c.id === parentId)?.parentId ?? null;
  }
  return ids;
}

export function CategoryCombobox(props: Props) {
  const {
    categories,
    onList,
    placeholder = "Select category",
    className,
    multiple = false,
    autoOpen = false,
    inline = false,
    chips = true,
    listFilter = false,
  } = props;

  const [open, setOpen] = useState(autoOpen);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0, fixed: true });
  const [placed, setPlaced] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Modal dialogs disable pointer events on <body>, so the menu has to live
  // inside the dialog rather than being portalled next to it.
  const hostRef = useRef<HTMLElement | null>(null);

  const selectedIds = multiple
    ? (props as MultiProps).values
    : (props as SingleProps).value
      ? [(props as SingleProps).value]
      : [];
  const selected = categories.filter((c) => selectedIds.includes(c.id));

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories],
  );

  const tree = useMemo(() => buildCategoryTree(activeCategories), [activeCategories]);

  const q = search.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!q) {
      return flattenCategoryTree(tree, 0, expanded);
    }

    const matchIds = new Set(
      activeCategories
        .filter((c) => {
          const ancestors = getCategoryAncestorNames(c, activeCategories);
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
      for (const aid of collectAncestorIds(id, activeCategories)) keep.add(aid);
    }

    const searchExpanded = new Set(
      [...keep].filter((id) =>
        activeCategories.some((c) => c.parentId === id && keep.has(c.id)),
      ),
    );

    const prune = (
      nodes: ReturnType<typeof buildCategoryTree>,
    ): ReturnType<typeof buildCategoryTree> =>
      nodes
        .filter((n) => keep.has(n.id))
        .map((n) => ({ ...n, children: prune(n.children) }));

    return flattenCategoryTree(prune(tree), 0, searchExpanded);
  }, [q, tree, expanded, activeCategories]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || inline) return;

    const host = hostRef.current;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    const height = menuRef.current?.offsetHeight ?? 260;
    const bounds = host
      ? host.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    let top = rect.bottom + 4;
    if (top + height > bounds.bottom - 4) {
      const above = rect.top - height - 4;
      top =
        above >= bounds.top + 4
          ? above
          : Math.max(bounds.top + 4, bounds.bottom - height - 4);
    }

    const left = Math.max(
      bounds.left + 4,
      Math.min(rect.left, bounds.right - width - 4),
    );

    setMenuPos(
      host
        ? {
            top: top - bounds.top + host.scrollTop,
            left: left - bounds.left + host.scrollLeft,
            width,
            fixed: false,
          }
        : { top, left, width, fixed: true },
    );
  }, [inline]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPlaced(false);
      return;
    }
    const host =
      (triggerRef.current?.closest(
        '[role="dialog"], [role="alertdialog"]',
      ) as HTMLElement | null) ?? null;
    hostRef.current = host;
    setPortalTarget(host ?? document.body);
    if (inline) setPlaced(true);
    place();
    setTimeout(() => inputRef.current?.focus(), 50);
    // Expand ancestors of selected + top-level parents that have children
    const next = new Set<string>();
    for (const id of selectedIds) {
      for (const aid of collectAncestorIds(id, activeCategories)) next.add(aid);
    }
    for (const root of tree) {
      if (root.children.length) next.add(root.id);
    }
    setExpanded(next);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening
  }, [open]);

  // Re-place once the menu is in the DOM so its real height decides up/down.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      place();
      setPlaced(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, place, rows.length]);

  // Opening the list shows what is already selected: scroll the first selected row into the middle of the list.
  useEffect(() => {
    if (!open || !placed || search) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>('[data-selected="true"]');
      if (list && row) list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the list opens / is placed (the selection itself may change while it is open)
  }, [open, placed]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleExpand(e: React.SyntheticEvent, id: string) {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggle(cat: Category) {
    if (multiple) {
      const multi = props as MultiProps;
      const next = selectedIds.includes(cat.id)
        ? selectedIds.filter((id) => id !== cat.id)
        : [...selectedIds, cat.id];
      multi.onChange(next);
      return;
    }
    const single = props as SingleProps;
    single.onChange(cat.id, cat.name);
    setOpen(false);
  }

  function clearAll(e: React.SyntheticEvent) {
    e.stopPropagation();
    if (multiple) {
      (props as MultiProps).onChange([]);
      return;
    }
    (props as SingleProps).onChange("", "");
  }

  function removeOne(e: React.SyntheticEvent, id: string) {
    e.stopPropagation();
    if (multiple) {
      (props as MultiProps).onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    (props as SingleProps).onChange("", "");
  }

  const triggerLabel = multiple
    ? selected.length
      ? `${selected.length} selected`
      : placeholder
    : selected[0]?.name || placeholder;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm hover:bg-accent/30",
          selected.length === 0 && "text-muted-foreground",
        )}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <div className="flex h-4 shrink-0 items-center gap-0.5">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearAll}
              onKeyDown={(e) => e.key === "Enter" && clearAll(e)}
              className="inline-flex h-4 w-4 items-center justify-center rounded-none hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          {onList && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onList();
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), onList())}
              className="inline-flex h-4 w-4 items-center justify-center rounded-none bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              title="Category list"
            >
              <List className="h-3 w-3" />
            </span>
          )}
        </div>
      </button>

      {multiple && chips && selected.length > 0 ? (
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {selected.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex max-w-full items-center gap-0.5 border border-border/70 bg-muted/30 px-1 py-px text-[9px] leading-none text-foreground"
            >
              <span className="truncate">{cat.name}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${cat.name}`}
                onClick={(e) => removeOne(e, cat.id)}
              >
                <X className="h-2 w-2" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open && inline ? (
        <div ref={menuRef} className="mt-1 rounded-none border border-border bg-popover text-popover-foreground shadow-sm">
          <div className="flex items-center border-b border-border px-1.5 py-1">
            <Search className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="relative max-h-56 overflow-y-auto py-0.5">
            {rows.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No categories</p>
            ) : (
              rows.map(({ node, depth, hasChildren, expanded: isOpen }) => {
                const isSelected = selectedIds.includes(node.id);
                return (
                  <div
                    key={node.id}
                    data-selected={isSelected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-0.5 pr-1.5 text-left text-[11px] leading-tight hover:bg-accent",
                      isSelected && "bg-accent/50 font-medium",
                    )}
                    style={{ paddingLeft: `${4 + depth * 10}px` }}
                  >
                    {hasChildren && !q ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                        onClick={(e) => toggleExpand(e, node.id)}
                      >
                        <ChevronRight
                          className={cn("h-3 w-3 transition", isOpen && "rotate-90")}
                        />
                      </button>
                    ) : (
                      <span className="inline-block h-5 w-4 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(node)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {open && !inline && portalTarget
        ? createPortal(
            <div
              ref={menuRef}
              data-portal-popover=""
              data-list-filter-menu={listFilter ? "" : undefined}
              className="z-[9999] rounded-none border border-border bg-popover text-popover-foreground shadow-md"
              style={{
                position: menuPos.fixed ? "fixed" : "absolute",
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                pointerEvents: "auto",
                visibility: placed ? "visible" : "hidden",
              }}
            >
              <div className="flex items-center border-b border-border px-1.5 py-1">
                <Search className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div ref={listRef} className="relative max-h-56 overflow-y-auto py-0.5">
                {rows.length === 0 ? (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No categories</p>
                ) : (
                  rows.map(({ node, depth, hasChildren, expanded: isOpen }) => {
                    const isSelected = selectedIds.includes(node.id);
                    return (
                      <div
                        key={node.id}
                        data-selected={isSelected ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-0.5 pr-1.5 text-left text-[11px] leading-tight hover:bg-accent",
                          isSelected && "bg-accent/50 font-medium",
                        )}
                        style={{ paddingLeft: `${4 + depth * 10}px` }}
                      >
                        {hasChildren && !q ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={isOpen ? "Collapse" : "Expand"}
                            onClick={(e) => toggleExpand(e, node.id)}
                          >
                            <ChevronRight
                              className={cn("h-3 w-3 transition", isOpen && "rotate-90")}
                            />
                          </button>
                        ) : (
                          <span className="inline-block h-5 w-4 shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => toggle(node)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
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
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
