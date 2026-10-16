"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronsRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import { AgainFormRow, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, getApiBaseUrl } from "@/lib/api/client";
import {
  apiProductToProduct,
  fetchCatalogProductDetail,
  type ApiProductListResponse,
} from "@/lib/api/catalog-products";
import type { Product } from "@/lib/mock-data/products";
import { cn } from "@/lib/utils";
import type {
  FeaturedDefaultSource,
  FeaturedProductsSection,
  FeaturedTab,
  HomepageContent,
} from "@/lib/website/website-homepage";
import { defaultFeaturedSection, defaultFeaturedTab } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

const DEFAULT_SOURCES: { value: FeaturedDefaultSource; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "New Arrivals" },
  { value: "bestsellers", label: "Best Sellers" },
];

const SEARCH_LIMIT = 10;

function productThumb(url: string | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseUrl()}${url}`;
  return url;
}

function ProductMultiPicker({
  selectedIds,
  disabled,
  onChange,
}: {
  selectedIds: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [cache, setCache] = useState<Record<string, Product>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  // Resolve selected chips (max handful) without loading the whole catalog.
  useEffect(() => {
    let cancelled = false;
    const missing = selectedIds.filter((id) => !cache[id]);
    if (missing.length === 0) return;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const detail = await fetchCatalogProductDetail(id);
            return detail ? ([id, detail as Product] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setCache((prev) => {
        const next = { ...prev };
        for (const row of entries) {
          if (row) next[row[0]] = row[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join("|")]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // On open / search: fetch max 10 (empty query = latest published).
  useEffect(() => {
    if (disabled || !open) return;
    let cancelled = false;
    setSearching(true);
    const q = query.trim();
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const qs = new URLSearchParams({
            status: "published",
            per_page: String(SEARCH_LIMIT),
          });
          if (q) qs.set("q", q);
          const res = await apiFetch<ApiProductListResponse>(
            `/api/v1/catalog/products?${qs.toString()}`,
          );
          if (cancelled) return;
          const mapped = res.data
            .map(apiProductToProduct)
            .filter((p) => !selectedIds.includes(p.id))
            .slice(0, SEARCH_LIMIT);
          setOptions(mapped);
        } catch {
          if (!cancelled) setOptions([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, selectedIds, disabled, open]);

  const selected = selectedIds.map((id) => cache[id]).filter(Boolean) as Product[];

  if (disabled) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
        —
      </p>
    );
  }

  return (
    <div ref={rootRef} className="w-full min-w-0 space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
            >
              {productThumb(p.thumbnail) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productThumb(p.thumbnail)}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="truncate">{p.name}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${p.name}`}
                onClick={() => onChange(selectedIds.filter((id) => id !== p.id))}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">No products selected</p>
      )}

      <div className="w-full min-w-0 rounded-md border border-border bg-background">
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            placeholder="Search products…"
            className="h-7 w-full rounded-none border-0 bg-transparent pl-7 pr-2 text-[11px] shadow-none focus-visible:ring-0"
          />
        </div>
        {open ? (
          <div className="max-h-[140px] space-y-0 overflow-y-auto py-0.5">
            {searching && options.length === 0 ? (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Loading…</p>
            ) : options.length === 0 ? (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">No matches</p>
            ) : (
              options.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex h-7 w-full min-w-0 items-center gap-1.5 px-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    setCache((prev) => ({ ...prev, [p.id]: p }));
                    onChange([...selectedIds, p.id]);
                    setQuery("");
                    setOpen(true);
                  }}
                >
                  {productThumb(p.thumbnail) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={productThumb(p.thumbnail)}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-5 w-5 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[10px] leading-tight text-foreground">
                    {p.name}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SortableTabRow({
  tab,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggleHidden,
}: {
  tab: FeaturedTab;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<FeaturedTab>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });
  const isHidden = Boolean(tab.hidden);
  const isDefault = tab.mode === "default";
  const sourceLabel =
    DEFAULT_SOURCES.find((s) => s.value === tab.defaultSource)?.label ?? tab.defaultSource;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card",
        isDragging && "z-10 opacity-90 shadow-md ring-1 ring-[#00a09d]/40",
        expanded && "border-[#00a09d]/40",
        isHidden && "opacity-60",
      )}
    >
      <div className="flex items-stretch gap-1 p-1.5">
        <button
          type="button"
          className="inline-flex shrink-0 touch-none items-center px-0.5 text-muted-foreground hover:text-foreground"
          aria-label={`Drag tab ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none hover:bg-muted/40"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-[12px] font-medium text-foreground">
              {tab.title || `Tab ${index + 1}`}
              {isHidden ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (hidden)
                </span>
              ) : null}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {isDefault
                ? `Default · ${sourceLabel}`
                : `Custom · ${tab.productIds.length} product${tab.productIds.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Duplicate"
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-muted",
            isHidden ? "text-muted-foreground" : "text-foreground",
          )}
          aria-label={isHidden ? "Show tab" : "Hide tab"}
          title={isHidden ? "Show on live" : "Hide from live"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-2.5 py-2.5">
          <AgainFormRow label="Title">
            <Input
              value={tab.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className="h-8 text-[13px]"
              placeholder="Featured"
            />
          </AgainFormRow>

          <div className="space-y-2">
            <div
              className={cn(
                "space-y-2 rounded-md border border-border p-2.5",
                isDefault && "border-[#00a09d]/50 bg-[#00a09d]/5",
              )}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${tab.id}`}
                  className="shrink-0"
                  checked={isDefault}
                  onChange={() => onUpdate({ mode: "default" })}
                />
                <span className="text-[12px] font-medium text-foreground">Default</span>
                <FieldHelpTip label="Products load automatically from the storefront feed" />
              </label>
              <Select
                value={tab.defaultSource}
                onValueChange={(v) =>
                  onUpdate({
                    mode: "default",
                    defaultSource: v as FeaturedDefaultSource,
                  })
                }
                disabled={!isDefault}
              >
                <SelectTrigger className="h-8 w-full text-[12px]" disabled={!isDefault}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[300]">
                  {DEFAULT_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-[12px]">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className={cn(
                "space-y-2 rounded-md border border-border p-2.5",
                !isDefault && "border-[#00a09d]/50 bg-[#00a09d]/5",
              )}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${tab.id}`}
                  className="shrink-0"
                  checked={!isDefault}
                  onChange={() => onUpdate({ mode: "custom" })}
                />
                <span className="text-[12px] font-medium text-foreground">Custom products</span>
                {isDefault ? (
                  <FieldHelpTip label="Disabled while Default is selected" />
                ) : null}
              </label>
              <ProductMultiPicker
                selectedIds={tab.productIds}
                disabled={isDefault}
                onChange={(productIds) => onUpdate({ mode: "custom", productIds })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LiveEditFeaturedDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<FeaturedProductsSection>(
    content.featured ?? defaultFeaturedSection(),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (open) setSection(content.featured ?? defaultFeaturedSection());
  }, [open, content.featured]);

  useEffect(() => {
    if (open) setExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pushSection = useCallback(
    (
      next:
        | FeaturedProductsSection
        | ((prev: FeaturedProductsSection) => FeaturedProductsSection),
    ) => {
      setSection((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        queueMicrotask(() => {
          onChange?.({ ...content, featured: resolved });
        });
        return resolved;
      });
    },
    [content, onChange],
  );

  const updateTab = useCallback(
    (index: number, patch: Partial<FeaturedTab>) => {
      pushSection((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t, i) => (i === index ? { ...t, ...patch } : t)),
      }));
    },
    [pushSection],
  );

  const removeTab = useCallback(
    (index: number) => {
      pushSection((prev) => {
        const removed = prev.tabs[index];
        if (removed && expandedId === removed.id) setExpandedId(null);
        return { ...prev, tabs: prev.tabs.filter((_, i) => i !== index) };
      });
    },
    [pushSection, expandedId],
  );

  const duplicateTab = useCallback(
    (index: number) => {
      pushSection((prev) => {
        const source = prev.tabs[index];
        if (!source) return prev;
        const copy = defaultFeaturedTab({
          title: source.title,
          mode: source.mode,
          defaultSource: source.defaultSource,
          productIds: [...source.productIds],
          hidden: false,
        });
        const next = [...prev.tabs];
        next.splice(index + 1, 0, copy);
        setExpandedId(copy.id);
        return { ...prev, tabs: next };
      });
    },
    [pushSection],
  );

  const tabIds = useMemo(() => section.tabs.map((t) => t.id), [section.tabs]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.tabs.findIndex((t) => t.id === active.id);
    const newIndex = section.tabs.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    pushSection({
      ...section,
      tabs: arrayMove(section.tabs, oldIndex, newIndex),
    });
  };

  const addTab = () => {
    const tab = defaultFeaturedTab({ title: "New tab" });
    pushSection((prev) => ({ ...prev, tabs: [...prev.tabs, tab] }));
    setExpandedId(tab.id);
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Featured products"
      resizable
      defaultWidth={420}
      widthStorageKey="website-live-edit-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
            trailing={<LiveEditDrawerSaveButton onSave={onSave} saving={saving} />}
          >
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close drawer"
            title="Close"
            onClick={() => onOpenChange(false)}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
          <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Website</span>
          <span className="text-muted-foreground">/</span>
          <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
            Most Wanted
          </span>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Common
              </p>
              <AgainFormRow label="Title">
                <Input
                  value={section.title}
                  onChange={(e) => pushSection({ ...section, title: e.target.value })}
                  className="h-8 text-[13px]"
                  placeholder="Most Wanted"
                />
              </AgainFormRow>
              <AgainFormRow label="Sub Title">
                <Input
                  value={section.subtitle}
                  onChange={(e) => pushSection({ ...section, subtitle: e.target.value })}
                  className="h-8 text-[13px]"
                  placeholder="Explore Our Best-Selling Deal"
                />
              </AgainFormRow>
              <AgainFormRow label="Autoplay" help="1000 = 1s · 0 = off">
                <AgainUnderlineInput
                  value={String(section.autoplayMs ?? 0)}
                  onChange={(v) => {
                    const n = Number.parseInt(v, 10);
                    pushSection({
                      ...section,
                      autoplayMs: Number.isFinite(n) ? Math.max(0, Math.min(60_000, n)) : 0,
                    });
                  }}
                />
              </AgainFormRow>
            </div>

            <div className="space-y-2">
              {section.tabs.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={tabIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {section.tabs.map((tab, index) => (
                        <SortableTabRow
                          key={tab.id}
                          tab={tab}
                          index={index}
                          expanded={expandedId === tab.id}
                          onToggle={() =>
                            setExpandedId((cur) => (cur === tab.id ? null : tab.id))
                          }
                          onUpdate={(patch) => updateTab(index, patch)}
                          onToggleHidden={() => updateTab(index, { hidden: !tab.hidden })}
                          onDuplicate={() => duplicateTab(index)}
                          onRemove={() => removeTab(index)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}

              <div className="flex items-center justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[12px]"
                  onClick={addTab}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
