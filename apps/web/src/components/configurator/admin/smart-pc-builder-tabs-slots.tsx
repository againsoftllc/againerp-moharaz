"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api/client";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { createCatalogMediaBatch, uploadCatalogMediaFiles, useCatalogMedia } from "@/lib/api/use-catalog-media";
import { searchCatalogProducts } from "@/lib/api/catalog-products";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import type { Category } from "@/lib/mock-data/categories";
import {
  useConfiguratorCategories,
  createConfiguratorCategory,
  updateConfiguratorCategory,
  deleteConfiguratorCategory,
} from "@/lib/api/use-configurator-categories";
import {
  useConfiguratorSlotTabs,
  createConfiguratorSlotTab,
  updateConfiguratorSlotTab,
  deleteConfiguratorSlotTab,
} from "@/lib/api/use-configurator-slot-tabs";
import {
  useConfiguratorFiltersByCategory,
  type ConfiguratorFilterField,
} from "@/lib/api/use-configurator-filters";
import { loadOverviewBySlot, type OverviewSlot } from "@/lib/api/configurator-overview";
import {
  createCategoryOverride,
  deleteCategoryOverride,
  listCategoryOverrides,
} from "@/lib/api/configurator-lookups";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import { Chip, SlotIconView, Tok, isIconImage, prettyCode, typeChipFor } from "@/components/configurator/admin/pcb-ui";
import type { ConfiguratorCategory, SlotCondition, SlotKind, SlotSort } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";

const ICONS = [
  "memory",
  "developer_board",
  "storage",
  "videogame_asset",
  "power",
  "dns",
  "ac_unit",
  "desktop_windows",
  "keyboard",
  "mouse",
  "headset",
  "battery_charging_full",
  "settings_input_component",
];

const COPS: Record<SlotCondition["op"], string> = {
  has: "মান আছে",
  eq: "=",
  neq: "≠",
  in: "∈ (যেকোনো একটা)",
};

const SORT_LABEL: Record<SlotSort, string> = {
  popular: "Most popular",
  low: "দাম কম থেকে বেশি",
  high: "দাম বেশি থেকে কম",
};

type PickedProduct = { id: string; name: string };
type PreviewResult = {
  shown: { id: string; name: string; via: "include" | "rule"; in_stock: boolean }[];
  hidden: { id: string; name: string; why: { type: "exclude" } | { type: "condition"; field: string; op: SlotCondition["op"]; v?: string | null } }[];
};

export function SmartPcBuilderTabsSlots() {
  const { profiles } = useConfiguratorProfiles();
  const pcBuilderProfile = profiles.find((p) => p.slug === "pc-builder");
  const profileId = pcBuilderProfile?.id;
  const setBadges = useSmartPcBuilderNavStore((s) => s.setBadges);

  const { tabs, loading: tabsLoading, refetch: refetchTabs } = useConfiguratorSlotTabs(profileId);
  const { categories, loading: catsLoading, refetch: refetchCats } = useConfiguratorCategories(profileId);
  const { categories: catalogCategories } = useCatalogCategories();
  const { profiles: attributeProfiles } = useCatalogAttributeProfiles();

  const [activeTabId, setActiveTabId] = useState<string>("");
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) setActiveTabId(tabs[0].id);
  }, [activeTabId, tabs]);

  const [editingTab, setEditingTab] = useState<{ id: string | null; name: string } | null>(null);
  const [editing, setEditing] = useState<ConfiguratorCategory | null>(null);

  const inTab = useMemo(
    () => categories.filter((c) => c.tabId === activeTabId).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, activeTabId],
  );

  // Live "দেখাবে" count + issue count per slot — the same numbers Overview shows.
  const [stats, setStats] = useState<Record<string, OverviewSlot>>({});
  // loaded slot by slot (as on Overview), so each row's numbers show as soon as they're ready
  const loadStats = () => {
    let total = 0;
    return loadOverviewBySlot({
      onSlots: (slots) => setBadges({ "tabs-slots": slots.length }),
      onSlot: (_id, o) => {
        if (!o) return;
        total += o.total;
        setStats((prev) => ({ ...prev, ...Object.fromEntries(o.slots.map((s) => [s.id, s])) }));
        setBadges({ overview: total });
      },
    }).catch(() => setStats({}));
  };
  useEffect(() => {
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { byId: fieldsById } = useConfiguratorFiltersByCategory(inTab.map((c) => c.id));
  const fieldName = (slotId: string, code: string) =>
    fieldsById[slotId]?.find((f) => f.code === code)?.name ?? prettyCode(code);

  // A slot shows its attribute profile; slots without one fall back to their catalog category.
  const sourceName = (slot: ConfiguratorCategory) => {
    if (slot.attributeProfileId) return attributeProfiles.find((p) => p.id === slot.attributeProfileId)?.name ?? "প্রোফাইল";
    if (!slot.catalogCategorySlug) return "—";
    return catalogCategories.find((c) => c.slug === slot.catalogCategorySlug)?.name ?? slot.catalogCategorySlug;
  };

  const moveTab = async (index: number) => {
    const cur = tabs[index];
    const other = tabs[index - 1];
    if (!other) return;
    try {
      await Promise.all([
        updateConfiguratorSlotTab(cur.id, { sortOrder: other.sortOrder }),
        updateConfiguratorSlotTab(other.id, { sortOrder: cur.sortOrder }),
      ]);
      await refetchTabs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  };

  const moveSlot = async (index: number, dir: -1 | 1) => {
    const other = inTab[index + dir];
    const cur = inTab[index];
    if (!other) return;
    try {
      await Promise.all([
        updateConfiguratorCategory(cur.id, { sortOrder: other.sortOrder }),
        updateConfiguratorCategory(other.id, { sortOrder: cur.sortOrder }),
      ]);
      await refetchCats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  };

  const newSlot = (): ConfiguratorCategory => ({
    id: "",
    profileId: profileId ?? "",
    profileName: "PC Builder",
    name: "",
    slug: "",
    sortOrder: inTab.length + 1,
    isRequired: false,
    selectionMode: "single",
    catalogCategorySlug: "",
    productCount: 0,
    status: "active",
    updatedAt: "",
    tabId: activeTabId,
    kind: "product",
    icon: "settings_input_component",
    conditions: [],
    specs: [],
    minSelect: 0,
    maxSelect: 1,
    defaultSort: "popular",
  });

  if (!profileId) {
    return <p className="p-4 text-sm text-muted-foreground">Loading PC Builder profile…</p>;
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const btn = "h-7 w-8 rounded-none border border-border bg-muted/40 p-0 text-sm hover:bg-muted";

  return (
    <div>
      <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
        কাস্টমার বিল্ডারে ট্যাব দেখবে (যেমন Core Components, Peripherals, Power & Extras), প্রতিটা ট্যাবে স্লট। প্রতিটা স্লটে কোন প্রোডাক্ট আসবে, সেটা ঠিক হয়{" "}
        <b>ক্যাটাগরি + চেনার ফিল্টার</b> দিয়ে। Overview ট্যাব সিস্টেম নিজে দেখায়।
      </p>
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="self-start rounded-none border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <h2 className="text-[15px] font-semibold">ট্যাব</h2>
            <Button size="sm" variant="outline" className="h-7 rounded-none text-xs" onClick={() => setEditingTab({ id: null, name: "" })}>
              + ট্যাব
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 p-3">
            {tabsLoading && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading…</p>}
            {tabs.map((tab, i) => (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTabId(tab.id)}
                onKeyDown={(e) => e.key === "Enter" && setActiveTabId(tab.id)}
                className={`flex cursor-pointer items-center justify-between gap-2 border px-2.5 py-2 text-xs ${
                  tab.id === activeTabId ? "border-primary bg-primary/10" : "border-border bg-background"
                }`}
              >
                <span className="truncate">
                  <b>{tab.name}</b> <span className="text-muted-foreground">· {tab.slotCount} স্লট</span>
                </span>
                <span className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className={btn} disabled={i === 0} onClick={() => void moveTab(i)} aria-label="Move up">
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" className={btn} onClick={() => setEditingTab({ id: tab.id, name: tab.name })} aria-label="Rename">
                    ✎
                  </Button>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">ক্রম বদলালে কাস্টমারের দিকেও ক্রম বদলাবে।</p>
          </div>
        </section>

        <section className="rounded-none border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">{activeTab?.name ?? "—"} ট্যাবের স্লট</h2>
            <Button size="sm" onClick={() => setEditing(newSlot())}>
              + নতুন স্লট
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">ক্রম</th>
                  <th className="px-3 py-2">আইকন · স্লট</th>
                  <th className="px-3 py-2">ধরন · ক্যাটাগরি</th>
                  <th className="px-3 py-2">চেনার শর্ত</th>
                  <th className="px-3 py-2">কার্ডে যে স্পেক</th>
                  <th className="px-3 py-2">দেখাবে</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {catsLoading && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>
                )}
                {!catsLoading && inTab.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">এই ট্যাবে কোনো স্লট নেই</td></tr>
                )}
                {inTab.map((slot, i) => {
                  const stat = stats[slot.id];
                  return (
                    <tr key={slot.id} className="border-b border-border/60 align-top">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Button size="sm" variant="ghost" className={btn} disabled={i === 0} onClick={() => void moveSlot(i, -1)} aria-label="Move up">↑</Button>{" "}
                        <Button size="sm" variant="ghost" className={btn} disabled={i === inTab.length - 1} onClick={() => void moveSlot(i, 1)} aria-label="Move down">↓</Button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="mr-1.5 inline-flex align-middle"><SlotIconView icon={slot.icon} size={22} /></span>
                        <b>{slot.name}</b>
                        <div className="text-xs text-muted-foreground">
                          {(slot.minSelect ?? 0) >= 1 ? "Required" : "Optional"} · {slot.minSelect ?? 0}–{slot.maxSelect ?? 1}টি
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <Chip cls={slot.kind === "product" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>
                            {slot.kind === "product" ? "Product" : slot.kind === "service" ? "Service" : "Toggle"}
                          </Chip>
                          <Chip cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">{sourceName(slot)}</Chip>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {slot.conditions.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {slot.conditions.map((c, ci) => (
                              <span key={ci} className="inline-flex flex-wrap items-center gap-1.5">
                                {ci > 0 && <span className="font-mono text-[11px] font-semibold text-primary">AND</span>}
                                <Tok>{fieldName(slot.id, c.f)}</Tok>
                                <span className="font-mono font-semibold text-primary">{COPS[c.op]}</span>
                                {c.op !== "has" && <Tok>{c.v}</Tok>}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {slot.specs.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            slot.specs.map((code) => <Tok key={code}>{fieldName(slot.id, code)}</Tok>)
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <b>{stat ? stat.shown : "…"}</b>
                        {stat && stat.issue_count > 0 && (
                          <div>
                            <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">{stat.issue_count}</Chip>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => setEditing(slot)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editingTab && (
        <TabDrawer
          tab={editingTab}
          slotCount={editingTab.id ? (tabs.find((t) => t.id === editingTab.id)?.slotCount ?? 0) : 0}
          onClose={() => setEditingTab(null)}
          onSave={async (name) => {
            try {
              if (editingTab.id) {
                await updateConfiguratorSlotTab(editingTab.id, { name });
              } else {
                const created = await createConfiguratorSlotTab({ profileId, name, sortOrder: tabs.length + 1 });
                setActiveTabId(created.id);
              }
              await refetchTabs();
              setEditingTab(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Save failed");
            }
          }}
          onDelete={
            editingTab.id
              ? async () => {
                  try {
                    await deleteConfiguratorSlotTab(editingTab.id as string);
                    if (activeTabId === editingTab.id) setActiveTabId("");
                    await refetchTabs();
                    setEditingTab(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Delete failed");
                  }
                }
              : undefined
          }
        />
      )}

      {editing && (
        <SlotEditorDrawer
          slot={editing}
          tabs={tabs}
          catalogCategories={catalogCategories}
          attributeProfiles={attributeProfiles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetchCats();
            void refetchTabs();
            void loadStats();
          }}
        />
      )}
    </div>
  );
}

function TabDrawer({
  tab,
  slotCount,
  onClose,
  onSave,
  onDelete,
}: {
  tab: { id: string | null; name: string };
  slotCount: number;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(tab.name);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">{tab.id ? "ট্যাব এডিট" : "নতুন ট্যাব"}</h2>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ট্যাবের নাম</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Extras" autoFocus />
        </div>
        {tab.id && (
          <p className="text-xs text-muted-foreground">
            এই ট্যাবে {slotCount}টি স্লট আছে। মুছতে হলে আগে স্লটগুলো অন্য ট্যাবে সরান।
          </p>
        )}
        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          {onDelete && (
            <Button variant="outline" size="sm" className="text-destructive" disabled={slotCount > 0} onClick={() => void onDelete()}>
              মুছুন
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              if (!name.trim()) {
                toast.error("নাম দিন");
                return;
              }
              void onSave(name.trim());
            }}
          >
            সেভ করুন
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SlotEditorDrawer({
  slot,
  tabs,
  catalogCategories,
  attributeProfiles,
  onClose,
  onSaved,
}: {
  slot: ConfiguratorCategory;
  tabs: { id: string; name: string }[];
  catalogCategories: Category[];
  attributeProfiles: { id: string; name: string; productCount: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // The icon image comes from the admin media library, so it is kept there and can be re-picked.
  const [mediaOpen, setMediaOpen] = useState(false);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const [draft, setDraft] = useState<ConfiguratorCategory>({
    ...slot,
    minSelect: slot.minSelect ?? (slot.isRequired ? 1 : 0),
    maxSelect: slot.maxSelect ?? 1,
    defaultSort: slot.defaultSort ?? "popular",
  });
  const [saving, setSaving] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);

  // Manual include / exclude, staged until Save. `rows` remembers the saved override ids.
  const [include, setInclude] = useState<PickedProduct[]>([]);
  const [exclude, setExclude] = useState<PickedProduct[]>([]);
  const [savedOverrides, setSavedOverrides] = useState<{ id: string; product_id: string; action: "include" | "exclude" }[]>([]);
  useEffect(() => {
    if (!slot.id) return;
    let cancelled = false;
    void listCategoryOverrides()
      .then((rows) => {
        if (cancelled) return;
        const mine = rows.filter((r) => r.category_id === slot.id && (r.action === "include" || r.action === "exclude"));
        setSavedOverrides(mine.map((r) => ({ id: r.id, product_id: r.product_id, action: r.action as "include" | "exclude" })));
        setInclude(mine.filter((r) => r.action === "include").map((r) => ({ id: r.product_id, name: r.product_name ?? r.product_id })));
        setExclude(mine.filter((r) => r.action === "exclude").map((r) => ({ id: r.product_id, name: r.product_name ?? r.product_id })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slot.id]);

  const slugForFields = slot.slug || draft.slug || slugifyConfigurator(draft.name);
  // Fields follow the category picked in ①: category -> its attribute profile -> the profile's
  // attributes. (Slots whose category has no profile fall back to the slot-name mapping.)
  const [allFields, setAllFields] = useState<ConfiguratorFilterField[]>([]);
  // The category the fields on screen were actually loaded for — so a category change waits for
  // ITS fields, not the previous category's.
  const [fieldsFor, setFieldsFor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const forCategory = draft.attributeProfileId || draft.catalogCategorySlug || "";
    void apiFetch<{ data: ConfiguratorFilterField[] }>(
      `/api/v1/configurator/categories/filters-for?slug=${encodeURIComponent(slugForFields)}&catalog_category_slug=${encodeURIComponent(draft.catalogCategorySlug ?? "")}&profile_id=${encodeURIComponent(draft.attributeProfileId ?? "")}`,
    )
      .then((res) => {
        if (cancelled) return;
        setAllFields(res.data);
        setFieldsFor(forCategory);
      })
      .catch(() => {
        if (cancelled) return;
        setAllFields([]);
        setFieldsFor(forCategory);
      });
    return () => {
      cancelled = true;
    };
  }, [slugForFields, draft.catalogCategorySlug, draft.attributeProfileId]);
  const fields = allFields.filter((f) => f.source !== "special");

  // When the admin picks a different category, start the identifying condition over from that
  // category's first field (the old field may not exist on the new profile).
  const [categoryPicked, setCategoryPicked] = useState(false);
  useEffect(() => {
    if (!categoryPicked || fieldsFor !== (draft.attributeProfileId || draft.catalogCategorySlug || "")) return;
    setCategoryPicked(false);
    setDraft((d) => ({ ...d, conditions: fields[0] ? [{ f: fields[0].code, op: "has" }] : [], specs: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryPicked, fieldsFor, draft.catalogCategorySlug, draft.attributeProfileId]);
  const fieldByCode = (code: string) => fields.find((f) => f.code === code);

  // Live preview of the DRAFT: shown, plus hidden with the reason.
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewKey = JSON.stringify([draft.catalogCategorySlug, draft.attributeProfileId, draft.conditions, include.map((p) => p.id), exclude.map((p) => p.id)]);
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      apiFetch<{ data: PreviewResult }>("/api/v1/configurator/categories/preview-draft", {
        method: "POST",
        body: JSON.stringify({
          category_id: draft.id || null,
          slug: slugForFields,
          catalog_category_slug: draft.catalogCategorySlug ?? "",
          attribute_profile_id: draft.attributeProfileId ?? "",
          conditions: draft.conditions,
          include: include.map((p) => p.id),
          exclude: exclude.map((p) => p.id),
        }),
      })
        .then((res) => !cancelled && setPreview(res.data))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setPreviewLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // Product search for the include / exclude picker — the same catalog search the product form's
  // "paired products" picker uses, so any product can be found by name or SKU.
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<(PickedProduct & { sku?: string; thumbnail?: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchCatalogProducts(term, 20);
        if (!cancelled) setResults(rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, thumbnail: r.thumbnail })));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const taken = new Set([...include, ...exclude].map((p) => p.id));
  const selectable = results.filter((r) => !taken.has(r.id));
  const addPicked = (product: PickedProduct, to: "include" | "exclude") => {
    const row = { id: product.id, name: product.name };
    if (to === "include") setInclude((l) => [...l, row]);
    else setExclude((l) => [...l, row]);
  };

  const setCondition = (i: number, patch: Partial<SlotCondition>) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.map((c, ci) => (ci === i ? { ...c, ...patch } : c)) }));

  const whyText = (why: PreviewResult["hidden"][number]["why"]) => {
    if (why.type === "exclude") return "Exclude লিস্টে আছে";
    const name = fieldByCode(why.field)?.name ?? prettyCode(why.field);
    return `শর্ত মেলেনি: ${name} ${COPS[why.op]}${why.op !== "has" && why.v ? ` ${why.v}` : ""}`;
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("স্লটের নাম দিন");
      return;
    }
    setSaving(true);
    try {
      const min = Math.max(0, draft.minSelect ?? 0);
      const max = Math.max(1, draft.maxSelect ?? 1, min);
      const body = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || slugifyConfigurator(draft.name),
        description: draft.description,
        sortOrder: draft.sortOrder,
        isRequired: min >= 1,
        selectionMode: (max > 1 ? "multiple" : "single") as ConfiguratorCategory["selectionMode"],
        catalogCategorySlug: draft.catalogCategorySlug,
        attributeProfileId: draft.attributeProfileId || null,
        status: draft.status,
        tabId: draft.tabId,
        kind: draft.kind,
        icon: draft.icon,
        conditions: draft.conditions,
        specs: draft.specs,
        minSelect: min,
        maxSelect: max,
        defaultSort: draft.defaultSort,
      };
      const saved = draft.id
        ? await updateConfiguratorCategory(draft.id, body)
        : await createConfiguratorCategory({ profileId: draft.profileId, ...body });

      // Apply the staged include / exclude changes.
      const wanted = [
        ...include.map((p) => ({ product_id: p.id, action: "include" as const })),
        ...exclude.map((p) => ({ product_id: p.id, action: "exclude" as const })),
      ];
      const same = (a: { product_id: string; action: string }, b: { product_id: string; action: string }) =>
        a.product_id === b.product_id && a.action === b.action;
      for (const row of savedOverrides) {
        if (!wanted.some((w) => same(w, row))) await deleteCategoryOverride(row.id);
      }
      for (const w of wanted) {
        if (!savedOverrides.some((row) => same(w, row))) {
          await createCategoryOverride({ category_id: saved.id, product_id: w.product_id, action: w.action });
        }
      }
      toast.success("স্লট সেভ হয়েছে");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    try {
      await deleteConfiguratorCategory(draft.id);
      toast.success("স্লট মুছে ফেলা হয়েছে");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const sectionLabel = "text-xs font-semibold text-muted-foreground";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[620px]">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">
            {draft.id ? "স্লট এডিট" : "নতুন স্লট"}: {draft.name || "—"}
          </h2>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">স্লটের নাম (কাস্টমার যা দেখবে)</Label>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="যেমন: Processor" />
        </div>

        <div className="space-y-1">
          <span className={sectionLabel}>① কোন অ্যাট্রিবিউট প্রোফাইলের প্রোডাক্ট</span>
          {/* The slot takes every product that carries this attribute profile, whatever its category. */}
          <Select
            value={draft.attributeProfileId ?? ""}
            onChange={(e) => {
              setDraft((d) => ({ ...d, attributeProfileId: e.target.value || null }));
              setCategoryPicked(true);
            }}
            className="h-9 w-full text-sm"
            aria-label="Attribute profile"
          >
            <option value="">— প্রোফাইল বাছুন —</option>
            {attributeProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.productCount} প্রোডাক্ট)
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-muted-foreground">
            এই প্রোফাইল যে প্রোডাক্টে সেট করা, সেগুলোই এই স্লটে আসবে। একই প্রোফাইল একাধিক ক্যাটাগরির প্রোডাক্টে থাকতে পারে, তাই ক্যাটাগরি নিয়ে ঝামেলা নেই।
          </p>
          {!draft.attributeProfileId && (
            <div className="mt-1.5 space-y-1 border border-dashed border-border p-2">
              <span className="text-[11px] text-muted-foreground">
                প্রোফাইল না থাকলে (যেমন Keyboard, Mouse) ক্যাটাগরি দিয়ে প্রোডাক্ট আনুন:
              </span>
              <CategoryCombobox
                categories={catalogCategories}
                value={catalogCategories.find((c) => c.slug === draft.catalogCategorySlug)?.id ?? ""}
                onChange={(id) => {
                  const cat = catalogCategories.find((c) => c.id === id);
                  setDraft((d) => ({ ...d, catalogCategorySlug: cat?.slug ?? "" }));
                  setCategoryPicked(true);
                }}
                placeholder="ক্যাটাগরি খুঁজুন…"
                className="w-full"
              />
              {draft.catalogCategorySlug && !catalogCategories.some((c) => c.slug === draft.catalogCategorySlug) && (
                <p className="text-[11px] text-amber-600">
                  এই ক্যাটাগরি ({draft.catalogCategorySlug}) আর ক্যাটালগে পাওয়া যাচ্ছে না। নতুন করে বাছুন।
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <span className={sectionLabel}>② চেনার শর্ত (প্রথম লাইনটাই মূল চেনার ফিল্টার)</span>
          <div className="grid gap-2 border border-border bg-muted/20 p-2.5">
            {draft.conditions.map((c, i) => {
              const chip = typeChipFor(fieldByCode(c.f));
              return (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  {i > 0 && <span className="font-mono text-[11px] font-semibold text-primary">AND</span>}
                  <Select
                    value={c.f}
                    onChange={(e) => setCondition(i, { f: e.target.value, v: "" })}
                    className="h-8 w-48 text-xs"
                    aria-label="Filter"
                  >
                    {!fieldByCode(c.f) && <option value={c.f}>{prettyCode(c.f)}</option>}
                    {fields.map((f) => (
                      <option key={f.code} value={f.code}>{f.name}</option>
                    ))}
                  </Select>
                  {chip && <Chip cls={chip.cls}>{chip.label}</Chip>}
                  <Select
                    value={c.op}
                    onChange={(e) => setCondition(i, { op: e.target.value as SlotCondition["op"], v: "" })}
                    className="h-8 w-40 text-xs"
                    aria-label="Operator"
                  >
                    {(Object.keys(COPS) as SlotCondition["op"][]).map((op) => (
                      <option key={op} value={op}>{COPS[op]}</option>
                    ))}
                  </Select>
                  {c.op !== "has" && (
                    <Input
                      value={c.v ?? ""}
                      onChange={(e) => setCondition(i, { v: e.target.value })}
                      placeholder={c.op === "in" ? "কমা দিয়ে" : "মান"}
                      className="h-8 w-36 text-xs"
                    />
                  )}
                  {i > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, ci) => ci !== i) }))}
                      aria-label="Remove condition"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              );
            })}
            <div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-none text-xs"
                onClick={() => setDraft((d) => ({ ...d, conditions: [...d.conditions, { f: fields[0]?.code ?? "", op: "has" }] }))}
              >
                + AND শর্ত
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            উদাহরণ: RAM স্লটে <Tok>RAM Form Factor = DIMM</Tok> দিলে ল্যাপটপ র‍্যাম (SO-DIMM) বাদ যাবে।
          </p>
        </div>

        <div className="space-y-1">
          <span className={sectionLabel}>③ কাস্টমারের দিকে যেভাবে দেখাবে</span>
          <div className="grid gap-2.5 border border-border bg-muted/20 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">আইকন</span>
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, icon: ic }))}
                  aria-label={`Icon ${ic}`}
                  title={ic}
                  className={`h-7 w-7 border text-[15px] ${ic === draft.icon ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <SlotIconView icon={ic} size={20} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  void refetchMedia();
                  setMediaOpen(true);
                }}
                className={`flex h-7 items-center gap-1 border px-2 text-xs ${isIconImage(draft.icon) ? "border-primary bg-primary/10" : "border-border"}`}
              >
                {isIconImage(draft.icon) ? <SlotIconView icon={draft.icon} size={18} /> : null}
                {isIconImage(draft.icon) ? "বদলান" : "SVG/PNG আপলোড"}
              </button>
              {isIconImage(draft.icon) && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setDraft((d) => ({ ...d, icon: "settings_input_component" }))}>
                  ছবি সরান
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                ট্যাব
                <Select value={draft.tabId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, tabId: e.target.value }))} className="h-8 w-36 text-xs">
                  {tabs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                ধরন
                <Select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as SlotKind }))} className="h-8 w-52 text-xs">
                  <option value="product">Product (প্রোডাক্ট লিস্ট)</option>
                  <option value="service">Service (OS, ওয়ারেন্টি)</option>
                  <option value="toggle">Toggle (Build it for me)</option>
                </Select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                ডিফল্ট সর্ট
                <Select
                  value={draft.defaultSort ?? "popular"}
                  onChange={(e) => setDraft((d) => ({ ...d, defaultSort: e.target.value as SlotSort }))}
                  className="h-8 w-44 text-xs"
                >
                  {(Object.keys(SORT_LABEL) as SlotSort[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABEL[k]}</option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={(draft.minSelect ?? 0) >= 1}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, minSelect: e.target.checked ? Math.max(1, d.minSelect ?? 0) : 0 }))
                  }
                />
                বাধ্যতামূলক
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                কমপক্ষে
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={draft.minSelect ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, minSelect: Math.max(0, Number(e.target.value) || 0) }))}
                  className="h-8 w-16 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                সর্বোচ্চ
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.maxSelect ?? 1}
                  onChange={(e) => setDraft((d) => ({ ...d, maxSelect: Math.max(1, Number(e.target.value) || 1) }))}
                  className="h-8 w-16 text-xs"
                />
                টি
              </label>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">প্রোডাক্ট কার্ডে যে স্পেক ট্যাগ দেখাবে (ক্রম অনুযায়ী)</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {draft.specs.map((code) => (
                  <Chip key={code} cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                    {fieldByCode(code)?.name ?? prettyCode(code)}
                    <button
                      type="button"
                      className="ml-1"
                      aria-label="Remove"
                      onClick={() => setDraft((d) => ({ ...d, specs: d.specs.filter((s) => s !== code) }))}
                    >
                      ✕
                    </button>
                  </Chip>
                ))}
                <Select
                  value=""
                  onChange={(e) => e.target.value && setDraft((d) => ({ ...d, specs: [...d.specs, e.target.value] }))}
                  className="h-8 w-44 text-xs"
                  aria-label="Add spec"
                >
                  <option value="">+ ফিল্টার যোগ</option>
                  {fields.filter((f) => !draft.specs.includes(f.code)).map((f) => (
                    <option key={f.code} value={f.code}>{f.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <span className={sectionLabel}>④ হাতে যোগ বা বাদ (প্রোডাক্টে কিছু বদলায় না)</span>
          <div ref={searchBoxRef} className="relative">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="প্রোডাক্টের নাম বা SKU লিখে খুঁজুন…"
              className="text-xs"
            />
            {searchOpen && search.trim().length >= 2 && (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto border border-input bg-background shadow-lg">
                {searching ? (
                  <p className="px-3 py-2 text-[12px] text-muted-foreground">খুঁজছি…</p>
                ) : selectable.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-muted-foreground">কোনো প্রোডাক্ট পাওয়া যায়নি</p>
                ) : (
                  selectable.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted">
                      {row.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.thumbnail} alt="" className="h-7 w-7 shrink-0 object-contain" />
                      ) : (
                        <span className="h-7 w-7 shrink-0 bg-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-foreground">{row.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{row.sku}</span>
                      </span>
                      <Button size="sm" variant="outline" className="h-6 rounded-none px-2 text-[11px]" onClick={() => addPicked(row, "include")}>
                        + Include
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 rounded-none px-2 text-[11px]" onClick={() => addPicked(row, "exclude")}>
                        − Exclude
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {include.map((p) => (
              <Chip key={`i-${p.id}`} cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                + {p.name}
                <button type="button" className="ml-1" aria-label="Remove" onClick={() => setInclude((l) => l.filter((x) => x.id !== p.id))}>✕</button>
              </Chip>
            ))}
            {exclude.map((p) => (
              <Chip key={`x-${p.id}`} cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">
                − {p.name}
                <button type="button" className="ml-1" aria-label="Remove" onClick={() => setExclude((l) => l.filter((x) => x.id !== p.id))}>✕</button>
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <span className={sectionLabel}>
            Live Preview: {previewLoading ? "…" : `${preview?.shown.length ?? 0}টি প্রোডাক্ট দেখাবে`}
          </span>
          <div className="grid max-h-64 gap-1 overflow-auto">
            {preview?.shown.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border border-border bg-background px-2.5 py-1.5 text-xs">
                <span>{p.name}</span>
                <span className="flex gap-1">
                  {p.via === "include" && <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Include</Chip>}
                  {!p.in_stock && <Chip cls="bg-muted text-muted-foreground">Out of stock</Chip>}
                </span>
              </div>
            ))}
            {preview?.hidden.map((p) => (
              <div key={p.id} className="border border-dashed border-border bg-background px-2.5 py-1.5 text-xs opacity-80">
                <div>{p.name}</div>
                <div className="text-[11.5px] text-destructive">{whyText(p.why)}</div>
              </div>
            ))}
            {preview && preview.shown.length === 0 && preview.hidden.length === 0 && (
              <p className="text-[11px] text-muted-foreground">এই ক্যাটাগরিতে কোনো প্রোডাক্ট পাওয়া যায়নি।</p>
            )}
          </div>
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          {draft.id && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => void remove()}>
              {armedDelete ? "নিশ্চিত? আবার চাপুন" : "স্লট মুছুন"}
            </Button>
          )}
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "সেভ করুন"}
          </Button>
        </div>

        <MediaLibraryModal
          open={mediaOpen}
          onOpenChange={setMediaOpen}
          items={mediaItems}
          mode="single"
          title="স্লটের আইকন বেছে নিন"
          accept={["image"]}
          initialSelectedIds={mediaItems.filter((m) => m.url === draft.icon).map((m) => m.id)}
          onSelect={(picked) => {
            const item = picked[0];
            if (item?.url) setDraft((d) => ({ ...d, icon: item.url }));
          }}
          onUploadFiles={async (files) => {
            const uploaded = await uploadCatalogMediaFiles(files);
            await refetchMedia();
            return uploaded;
          }}
          onImportItems={async (items) => {
            const saved = await createCatalogMediaBatch(items);
            await refetchMedia();
            return saved;
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
