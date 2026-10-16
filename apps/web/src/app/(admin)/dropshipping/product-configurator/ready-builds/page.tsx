"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Chip, ProductPicker, SlotIconView } from "@/components/configurator/admin/pcb-ui";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useConfiguratorCategories } from "@/lib/api/use-configurator-categories";
import { useConfiguratorSlotTabs } from "@/lib/api/use-configurator-slot-tabs";
import { getSlotProducts } from "@/lib/api/configurator-slot-products";
import { uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import type { BuildComponentContext } from "@/lib/compatibility/types";
import {
  type ReadyBuild,
  type ReadyBuildItem,
  type ReadyBuildSlot,
  type ReadyBuildWrite,
  createReadyBuild,
  deleteReadyBuild,
  listReadyBuilds,
  publishReadyBuild,
  updateReadyBuild,
} from "@/lib/api/configurator-ready-builds";

const MODES: ReadyBuildSlot["mode"][] = ["hidden", "locked", "list", "any"];
const MODE_LABELS: Record<ReadyBuildSlot["mode"], { label: string }> = {
  hidden: { label: "⊘ লুকানো" },
  locked: { label: "🔒 Locked" },
  list: { label: "☰ এই তালিকা থেকে" },
  any: { label: "↺ যেকোনো মানানসই" },
};
const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

type SlotProduct = {
  id: string;
  name: string;
  price: number;
  in_stock: boolean;
  attributes?: Record<string, string>;
};

// Same slot → component-profile map the backend publish gate uses
// (SLOT_TO_COMPONENT in pc_builder_rules.py).
const SLOT_TO_COMPONENT: Record<string, string> = {
  cpu: "cap_cpu",
  motherboard: "cap_mobo",
  memory: "cap_ram",
  ram: "cap_ram",
  "cpu-cooler": "cap_cooler",
  casing: "cap_case",
  "power-supply": "cap_psu",
  "graphics-card": "cap_gpu",
  storage: "cap_storage",
  monitor: "cap_monitor",
};

/** "6দিন 0ঘ 3মি" until the end of `endDate` (inclusive); null once it has passed. */
function countdown(endDate: string): string | null {
  const ms = Date.parse(`${endDate}T23:59:59`) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return `${d}দিন ${h}ঘ ${m}মি`;
}

function emptyDraft(profileId: string, categoryIds: string[]): ReadyBuildWrite {
  return {
    profile_id: profileId,
    name: "",
    status: "draft",
    images: [],
    tags: [],
    category: "",
    fps_label: "",
    discount_type: "none",
    discount_value: 0,
    starts_at: null,
    ends_at: null,
    show_timer: true,
    discount_on_change: true,
    slots: categoryIds.map((category_id, i) => ({ category_id, mode: "hidden", sort_order: i, items: [] })),
  };
}

export function ReadyBuildsContent() {
  const { profiles } = useConfiguratorProfiles();
  const pcBuilderProfile = profiles.find((p) => p.slug === "pc-builder");
  const { categories } = useConfiguratorCategories(pcBuilderProfile?.id);

  // Slots in the same order customers see them: by tab, then by slot order.
  const { tabs } = useConfiguratorSlotTabs(pcBuilderProfile?.id);
  const groupedCategories = useMemo(() => {
    const tabIndex = new Map(tabs.map((t, i) => [t.id, i]));
    const tabName = new Map(tabs.map((t) => [t.id, t.name]));
    return [...categories]
      .sort((a, b) => {
        const ta = a.tabId ? (tabIndex.get(a.tabId) ?? 999) : 999;
        const tb = b.tabId ? (tabIndex.get(b.tabId) ?? 999) : 999;
        return ta - tb || a.sortOrder - b.sortOrder;
      })
      .map((cat) => ({ cat, tabName: (cat.tabId && tabName.get(cat.tabId)) || "" }));
  }, [categories, tabs]);

  const [builds, setBuilds] = useState<ReadyBuild[]>([]);
  const [editing, setEditing] = useState<ReadyBuildWrite | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);
  const [error, setError] = useState("");

  // Per-slot products from the same endpoint the storefront uses, so the picker
  // only offers parts that actually belong in that slot.
  const [slotProducts, setSlotProducts] = useState<Record<string, SlotProduct[]>>({});
  useEffect(() => {
    if (categories.length === 0) return;
    let cancelled = false;
    getSlotProducts()
      .then((slots) => {
        if (cancelled) return;
        setSlotProducts(Object.fromEntries(slots.map((s) => [s.id, s.products as SlotProduct[]])));
      })
      .catch(() => !cancelled && setSlotProducts({}));
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const load = () => listReadyBuilds().then((r) => setBuilds(r.data)).catch(() => setBuilds([]));
  useEffect(() => { load(); }, []);

  const startCreate = () => {
    if (!pcBuilderProfile || categories.length === 0) return;
    setEditingId(null);
    setEditing(emptyDraft(pcBuilderProfile.id, categories.map((c) => c.id)));
    setError("");
  };

  const startEdit = (b: ReadyBuild) => {
    setEditingId(b.id);
    const byCategoryId = new Map(b.slots.map((s) => [s.category_id, s]));
    setEditing({
      ...b,
      slots: categories.map((c, i) => byCategoryId.get(c.id) ?? { category_id: c.id, mode: "hidden", sort_order: i, items: [] }),
    });
    setError("");
  };

  // Copy opens an unsaved draft: no id/slug (server assigns), items and slots
  // stripped of their ids so saving creates fresh rows instead of touching the original.
  const startCopy = (b: ReadyBuild) => {
    const byCategoryId = new Map(b.slots.map((s) => [s.category_id, s]));
    setEditingId(null);
    setEditing({
      profile_id: b.profile_id,
      name: `${b.name} (copy)`,
      status: "draft",
      images: [...b.images],
      tags: [...b.tags],
      category: b.category,
      fps_label: b.fps_label,
      discount_type: b.discount_type,
      discount_value: b.discount_value,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      show_timer: b.show_timer,
      discount_on_change: b.discount_on_change,
      slots: categories.map((c, i) => {
        const src = byCategoryId.get(c.id);
        return {
          category_id: c.id,
          mode: src?.mode ?? "hidden",
          sort_order: i,
          items: (src?.items ?? []).map((it) => ({
            product_id: it.product_id,
            build_price: it.build_price,
            is_default: it.is_default,
          })),
        };
      }),
    });
    setError("");
  };

  const setSlot = (categoryId: string, patch: Partial<ReadyBuildSlot>) => {
    setEditing((d) => d && { ...d, slots: d.slots.map((s) => (s.category_id === categoryId ? { ...s, ...patch } : s)) });
  };

  const addItem = (categoryId: string) => {
    setSlot(categoryId, {
      items: [
        ...(editing?.slots.find((s) => s.category_id === categoryId)?.items ?? []),
        { product_id: "", build_price: null, is_default: false } as ReadyBuildItem,
      ],
    });
  };

  const setItem = (categoryId: string, index: number, patch: Partial<ReadyBuildItem>) => {
    const slot = editing?.slots.find((s) => s.category_id === categoryId);
    if (!slot) return;
    const items = slot.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    setSlot(categoryId, { items });
  };

  const removeItem = (categoryId: string, index: number) => {
    const slot = editing?.slots.find((s) => s.category_id === categoryId);
    if (!slot) return;
    setSlot(categoryId, { items: slot.items.filter((_, i) => i !== index) });
  };

  // Live preview of what the customer sees for the default parts. Mirrors
  // compute_totals in ready_build_service.py (default item per non-hidden slot,
  // build price falling back to catalog, discount only inside its date window).
  const summary = (() => {
    if (!editing) return null;
    let regular = 0;
    let price = 0;
    for (const slot of editing.slots) {
      if (slot.mode === "hidden") continue;
      const item = slot.items.find((i) => i.is_default && i.product_id) ?? slot.items.find((i) => i.product_id);
      if (!item) continue;
      const catalog = (slotProducts[slot.category_id] ?? []).find((p) => p.id === item.product_id)?.price ?? item.catalog_price ?? 0;
      regular += catalog;
      price += item.build_price ?? catalog;
    }
    const today = new Date().toISOString().slice(0, 10);
    const live =
      editing.discount_type !== "none" &&
      !(editing.starts_at && editing.starts_at > today) &&
      !(editing.ends_at && editing.ends_at < today);
    const whole = !live
      ? 0
      : editing.discount_type === "pct"
        ? Math.round(price * editing.discount_value) / 100
        : editing.discount_value;
    const final = Math.max(0, price - whole);
    return { regular, price, whole, final, saved: regular - final, outOfWindow: editing.discount_type !== "none" && !live };
  })();

  // Rule check on the default parts, evaluated against the unsaved form so the
  // admin sees what the publish gate will say before pressing Publish.
  const evaluateBuild = useCompatibilityRuleStore((s) => s.evaluateBuild);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);
  const rulesLoaded = useCompatibilityRuleStore((s) => s.loaded);
  useEffect(() => {
    if (!rulesLoaded) void fetchRules();
  }, [rulesLoaded, fetchRules]);

  const ruleCheck = useMemo(() => {
    if (!editing) return null;
    const missing: string[] = [];
    const components: BuildComponentContext[] = [];
    for (const cat of categories) {
      const slot = editing.slots.find((s) => s.category_id === cat.id);
      const item = slot && slot.mode !== "hidden" ? (slot.items.find((i) => i.is_default && i.product_id) ?? slot.items.find((i) => i.product_id)) : undefined;
      if (!item) {
        if (cat.isRequired) missing.push(cat.name);
        continue;
      }
      const profileId = SLOT_TO_COMPONENT[cat.slug];
      const product = (slotProducts[cat.id] ?? []).find((p) => p.id === item.product_id);
      if (!profileId || !product) continue;
      components.push({
        componentProfileId: profileId,
        componentName: product.name,
        productId: product.id,
        attributes: product.attributes ?? {},
      });
    }
    const result = rulesLoaded ? evaluateBuild("pc-builder", components) : null;
    const errors = (result?.results ?? []).filter((r) => r.status === "incompatible").map((r) => r.message || r.ruleName);
    const warnings = (result?.results ?? []).filter((r) => r.status === "warning").map((r) => r.message || r.ruleName);
    return { missing, errors, warnings, evaluated: result !== null };
  }, [editing, categories, slotProducts, rulesLoaded, evaluateBuild]);

  // Per-build health for the list: stock problems (a locked default part out of
  // stock, or every option of a list slot out of stock) and rule errors on the
  // default parts. Rule errors use the same client engine as the edit panel.
  const buildHealth = useMemo(() => {
    const out: Record<string, { stock: string | null; ruleErrors: number }> = {};
    for (const b of builds) {
      let stock: string | null = null;
      const components: BuildComponentContext[] = [];
      for (const cat of categories) {
        const slot = b.slots.find((s) => s.category_id === cat.id);
        if (!slot || slot.mode === "hidden") continue;
        const products = slotProducts[cat.id] ?? [];
        const inStock = (pid: string) => products.find((p) => p.id === pid)?.in_stock !== false;
        const items = slot.items.filter((i) => i.product_id);
        if (!stock && slot.mode === "locked" && items[0] && !inStock(items[0].product_id)) {
          stock = `${cat.name}: ${items[0].product_name ?? "পার্ট"} স্টকে নেই`;
        }
        if (!stock && slot.mode === "list" && items.length > 0 && items.every((i) => !inStock(i.product_id))) {
          stock = `${cat.name}: সব বিকল্প স্টকে নেই`;
        }
        const def = items.find((i) => i.is_default) ?? items[0];
        const product = def ? products.find((p) => p.id === def.product_id) : undefined;
        const profileId = SLOT_TO_COMPONENT[cat.slug];
        if (def && product && profileId) {
          components.push({ componentProfileId: profileId, componentName: product.name, productId: product.id, attributes: product.attributes ?? {} });
        }
      }
      const result = rulesLoaded && components.length > 0 ? evaluateBuild("pc-builder", components) : null;
      out[b.id] = { stock, ruleErrors: (result?.results ?? []).filter((r) => r.status === "incompatible").length };
    }
    return out;
  }, [builds, categories, slotProducts, rulesLoaded, evaluateBuild]);

  const [tagDraft, setTagDraft] = useState("");
  const allTags = [...new Set(builds.flatMap((b) => b.tags))];
  const addTag = (raw: string) => {
    const tag = raw.trim();
    setTagDraft("");
    if (!tag) return;
    setEditing((d) => d && (d.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? d : { ...d, tags: [...d.tags, tag] }));
  };

  const [query, setQuery] = useState("");
  const visibleBuilds = builds.filter((b) => !query.trim() || b.name.toLowerCase().includes(query.trim().toLowerCase()));

  const [uploading, setUploading] = useState(false);
  const uploadImages = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadCatalogMediaFiles(files);
      const urls = uploaded.map((m) => m.url).filter(Boolean);
      setEditing((d) => d && { ...d, images: [...d.images, ...urls] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const closeEditor = () => {
    setEditing(null);
    setEditingId(null);
    setArmedDelete(false);
    setError("");
  };

  /** Brand prefix off the front of a part name, for the one-line parts summary. */
  const shortName = (name: string) =>
    name.replace(/^(AMD|Intel|ASUS|Gigabyte|GIGABYTE|MSI|G\.Skill|Corsair|Kingston|TeamGroup|MAXSUN|Sapphire)\s/i, "");
  const partsSummary = (b: ReadyBuild) =>
    ["cpu", "graphics-card", "memory"]
      .map((slug) => {
        const cat = categories.find((c) => c.slug === slug);
        const slot = cat ? b.slots.find((s) => s.category_id === cat.id) : undefined;
        if (!slot || slot.mode === "hidden") return null;
        const def = slot.items.find((i) => i.is_default) ?? slot.items[0];
        return def?.product_name ? shortName(def.product_name) : null;
      })
      .filter(Boolean)
      .join(" · ");

  // Mode change keeps the slot's rows consistent: hidden has none, locked/any exactly one (the
  // default), list one or more with exactly one default.
  const changeMode = (categoryId: string, mode: ReadyBuildSlot["mode"]) => {
    const slot = editing?.slots.find((s) => s.category_id === categoryId);
    if (!slot) return;
    let items = slot.items;
    if (mode === "hidden") items = [];
    else {
      if (mode !== "list") items = items.slice(0, 1);
      if (items.length === 0) items = [{ product_id: "", build_price: null, is_default: true } as ReadyBuildItem];
      if (!items.some((i) => i.is_default)) items = items.map((it, i) => ({ ...it, is_default: i === 0 }));
      if (mode !== "list") items = items.map((it) => ({ ...it, is_default: true }));
    }
    setSlot(categoryId, { mode, items });
  };

  const persistDraft = async (): Promise<string> => {
    // Status always goes up as "draft": going live is the separate, gated publish call.
    const body = { ...(editing as ReadyBuildWrite), status: "draft" as const };
    if (editingId) {
      await updateReadyBuild(editingId, body);
      return editingId;
    }
    const res = await createReadyBuild(body);
    return res.data.id;
  };

  const saveDraft = async () => {
    if (!editing || !editing.name.trim()) {
      setError("বিল্ডের নাম দিন");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await persistDraft();
      toast.success("Draft সেভ হয়েছে");
      closeEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "সেভ হয়নি");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!editing || !editing.name.trim()) {
      setError("বিল্ডের নাম দিন");
      return;
    }
    if (ruleCheck && (ruleCheck.errors.length > 0 || ruleCheck.missing.length > 0)) {
      setError("রুল Error বা বাধ্যতামূলক স্লট খালি, আগে ঠিক করুন");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await persistDraft();
      await publishReadyBuild(id);
      toast.success("Publish হয়েছে, Storefront-এ দেখা যাবে");
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish হয়নি");
    } finally {
      setSaving(false);
      await load();
    }
  };

  const removeBuild = async () => {
    if (!editingId) return;
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    try {
      await deleteReadyBuild(editingId);
      toast.success("বিল্ড মুছে ফেলা হয়েছে");
      closeEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "মোছা যায়নি");
    }
  };

  const dateNote = (b: ReadyBuild) => {
    const today = new Date().toISOString().slice(0, 10);
    if (b.discount_type === "none") return null;
    if (b.starts_at && b.starts_at > today) return "ডিসকাউন্ট শুরু হবে";
    if (b.ends_at && b.ends_at < today) return "ডিসকাউন্টের মেয়াদ শেষ";
    return null;
  };

  const sectionLabel = "text-xs font-semibold text-muted-foreground";

  return (
    <div>
      <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
        এডমিন নিজে বিল্ড বানিয়ে প্রতিটা পার্টে আলাদা দাম, পুরো বিল্ডে % বা Fixed ডিসকাউন্ট আর মেয়াদ দিতে পারবেন। প্রতিটা স্লটে ঠিক করবেন কাস্টমার কী বদলাতে পারবে।
        Publish করলে বিল্ড Storefront-এর লিস্টে চলে যায়।
      </p>

      {!editing && error && (
        <div className="mb-3 rounded-none border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      <section className="rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 বিল্ডের নাম খুঁজুন"
              aria-label="Search builds"
              className="h-9 w-64 rounded-none text-xs"
            />
            <span className="text-xs text-muted-foreground">{builds.length}টি বিল্ড</span>
          </div>
          <Button size="sm" onClick={startCreate}>+ নতুন বিল্ড</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-24 px-4 py-2">ছবি</th>
                <th className="px-3 py-2">বিল্ড</th>
                <th className="px-3 py-2">ট্যাগ · ক্যাটাগরি</th>
                <th className="px-3 py-2">দাম</th>
                <th className="px-3 py-2">সাশ্রয়</th>
                <th className="px-3 py-2">মেয়াদ</th>
                <th className="px-3 py-2">স্ট্যাটাস</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleBuilds.map((b) => {
                const saved = b.totals ? b.totals.regular - b.totals.final : 0;
                const health = buildHealth[b.id];
                const note = dateNote(b);
                const left = b.ends_at ? countdown(b.ends_at) : null;
                return (
                  <tr key={b.id} className="border-b border-border/60 align-top">
                    <td className="px-4 py-3">
                      {b.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.images[0]} alt="" className="h-[52px] w-[68px] border border-border object-cover" />
                      ) : (
                        <div className="grid h-[52px] w-[68px] place-items-center border border-border bg-gradient-to-br from-primary/10 to-cyan-500/10 text-xl">🖥</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <b>{b.name}</b>
                      <div className="text-xs text-muted-foreground">{partsSummary(b)}</div>
                      {(health?.ruleErrors ?? 0) > 0 && (
                        <Chip cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">{health.ruleErrors} রুল Error</Chip>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {b.tags.map((t) => (
                          <Chip key={t} cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">{t}</Chip>
                        ))}
                      </div>
                      {b.category && <div className="text-xs text-muted-foreground">{b.category}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {b.totals ? (
                        <>
                          <b>{taka(b.totals.final)}</b>
                          {saved > 0 && <div className="text-xs text-muted-foreground line-through">{taka(b.totals.regular)}</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {saved > 0 ? <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">−{taka(saved)}</Chip> : "—"}
                      <div className="text-xs text-muted-foreground">
                        {b.discount_type === "pct"
                          ? `প্রোডাক্ট দাম + ${b.discount_value}%`
                          : b.discount_type === "fixed"
                            ? `প্রোডাক্ট দাম + ${taka(b.discount_value)}`
                            : "শুধু প্রোডাক্ট দাম"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {b.ends_at ? (
                        <>
                          {b.ends_at} পর্যন্ত
                          {b.show_timer && left && b.discount_type !== "none" && (
                            <div><Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">⏱ {left}</Chip></div>
                          )}
                        </>
                      ) : b.starts_at ? (
                        `${b.starts_at} থেকে`
                      ) : (
                        <span className="text-xs text-muted-foreground">মেয়াদ নেই</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {b.status === "draft" ? (
                        <Chip cls="bg-muted text-muted-foreground">Draft</Chip>
                      ) : health?.stock ? (
                        <>
                          <Chip cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">Out of stock</Chip>
                          <div className="text-xs text-destructive">{health.stock}</div>
                        </>
                      ) : (
                        <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Published</Chip>
                      )}
                      {note && <div className="text-xs text-muted-foreground">{note}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => startEdit(b)}>Edit</Button>{" "}
                      <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => startCopy(b)}>Copy</Button>
                    </td>
                  </tr>
                );
              })}
              {visibleBuilds.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {builds.length === 0 ? "কোনো বিল্ড নেই" : "কোনো বিল্ড মেলেনি"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Sheet open={!!editing} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[1120px]">
          {editing && (
            <>
              <div className="border-b border-input px-5 py-4">
                <h2 className="text-lg font-semibold">{editingId ? `বিল্ড এডিট: ${editing.name}` : "নতুন বিল্ড"}</h2>
              </div>

              <div className="grid flex-1 gap-4 overflow-auto p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
                <div className="space-y-1.5">
                  <span className={sectionLabel}>পার্টস · প্রতিটা স্লটে মোড আর &quot;বিল্ডে দাম&quot;</span>
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">স্লট</th>
                          <th className="px-3 py-2">মোড</th>
                          <th className="px-3 py-2">প্রোডাক্ট · আসল দাম · বিল্ডে দাম</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedCategories.map(({ cat, tabName }, idx) => {
                          const slot = editing.slots.find((s) => s.category_id === cat.id);
                          if (!slot) return null;
                          const startsGroup = idx === 0 || groupedCategories[idx - 1].tabName !== tabName;
                          const products = slotProducts[cat.id] ?? [];
                          return (
                            <Fragment key={cat.id}>
                              {startsGroup && tabName && (
                                <tr><td colSpan={3} className="bg-muted/40 px-3 py-1.5 font-semibold">{tabName}</td></tr>
                              )}
                              <tr className="border-b border-border/60 align-top">
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <span className="mr-1 inline-flex align-middle"><SlotIconView icon={cat.icon} size={18} /></span>
                                  {cat.name}
                                  {cat.isRequired && <div className="text-xs text-muted-foreground">Required</div>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <Select
                                    value={slot.mode}
                                    onChange={(e) => changeMode(cat.id, e.target.value as ReadyBuildSlot["mode"])}
                                    className="h-8 w-44 text-xs"
                                    aria-label="Mode"
                                  >
                                    {MODES.map((m) => (
                                      <option key={m} value={m}>{MODE_LABELS[m].label}</option>
                                    ))}
                                  </Select>
                                </td>
                                <td className="px-3 py-2.5">
                                  {slot.mode === "hidden" ? (
                                    <span className="text-xs text-muted-foreground">
                                      {cat.isRequired ? "⚠ বাধ্যতামূলক স্লট, লুকালে Publish হবে না" : "কাস্টমার এই বিল্ডে এটা যোগ করতে পারবে না"}
                                    </span>
                                  ) : (
                                    <div className="grid gap-1.5">
                                      {slot.items.map((item, i) => {
                                        const picked = products.find((p) => p.id === item.product_id);
                                        const catalog = picked?.price ?? item.catalog_price;
                                        return (
                                          <div key={i} className="flex items-center gap-1.5">
                                            {slot.mode === "list" ? (
                                              <input
                                                type="radio"
                                                name={`def-${cat.id}`}
                                                checked={item.is_default}
                                                title="ডিফল্ট"
                                                aria-label="Default"
                                                onChange={() => setSlot(cat.id, { items: slot.items.map((it, idx2) => ({ ...it, is_default: idx2 === i })) })}
                                              />
                                            ) : (
                                              <span title="ডিফল্ট">★</span>
                                            )}
                                            <div className="flex min-w-0 flex-1">
                                              <ProductPicker
                                                products={products.filter((p) => p.id === item.product_id || !slot.items.some((it) => it.product_id === p.id))}
                                                value={item.product_id}
                                                label={cat.name}
                                                onChange={(id) => {
                                                  const next = products.find((p) => p.id === id);
                                                  setItem(cat.id, i, { product_id: id, build_price: next ? next.price : null });
                                                }}
                                              />
                                            </div>
                                            <span className="w-16 shrink-0 text-xs text-muted-foreground">{catalog != null ? taka(catalog) : ""}</span>
                                            <Input
                                              type="number"
                                              value={item.build_price ?? ""}
                                              onChange={(e) => setItem(cat.id, i, { build_price: e.target.value ? Number(e.target.value) : null })}
                                              className="h-8 w-24 text-xs"
                                              title="বিল্ডে দাম"
                                              aria-label="Build price"
                                            />
                                            {slot.mode === "list" && slot.items.length > 1 && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-destructive"
                                                onClick={() => {
                                                  const rest = slot.items.filter((_, idx2) => idx2 !== i);
                                                  setSlot(cat.id, { items: rest.some((r) => r.is_default) ? rest : rest.map((r, k) => ({ ...r, is_default: k === 0 })) });
                                                }}
                                                aria-label="Remove"
                                              >
                                                ✕
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {slot.mode === "list" && (
                                        <div>
                                          <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => addItem(cat.id)}>
                                            + বিকল্প যোগ
                                          </Button>
                                        </div>
                                      )}
                                      {slot.mode === "any" && (
                                        <div className="text-xs text-muted-foreground">
                                          কাস্টমার রুল মেনে যেকোনোটা নিতে পারবে। ডিফল্ট ছাড়া অন্যগুলোতে সাধারণ দাম।
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    🔒 Locked = বদলানো যাবে না · ☰ তালিকা = শুধু এখানে দেওয়া বিকল্প (◉ = ডিফল্ট) · ↺ মানানসই = রুল মেনে যেকোনোটা · ⊘ লুকানো = স্লটটাই থাকবে না
                  </p>
                </div>

                <div className="grid content-start gap-4">
                  {error && (
                    <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">বিল্ডের নাম</Label>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="যেমন: AMD Ryzen Power Up Gaming PC"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className={sectionLabel}>ছবি</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {editing.images.map((src, i) => (
                        <div key={`${src}-${i}`} className="relative h-[54px] w-[72px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-[54px] w-[72px] border border-border object-cover" />
                          <button
                            type="button"
                            className="absolute right-0.5 top-0.5 bg-background/90 px-1 text-[11px] leading-4 text-destructive"
                            aria-label="Remove image"
                            onClick={() => setEditing((d) => d && { ...d, images: d.images.filter((_, idx) => idx !== i) })}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <label className="cursor-pointer border border-border px-2 py-1.5 text-xs hover:bg-muted/40">
                        {uploading ? "আপলোড হচ্ছে…" : "+ ছবি আপলোড"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={uploading}
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            void uploadImages(files);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className={sectionLabel}>ব্যবহারের ধরন (ট্যাগ)</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {editing.tags.map((t, i) => (
                        <Chip key={`${t}-${i}`} cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                          {t}
                          <button
                            type="button"
                            className="ml-1"
                            aria-label={`Remove tag ${t}`}
                            onClick={() => setEditing({ ...editing, tags: editing.tags.filter((_, idx) => idx !== i) })}
                          >
                            ✕
                          </button>
                        </Chip>
                      ))}
                      <Input
                        value={tagDraft}
                        list="ready-build-tags"
                        placeholder="+ ট্যাগ, Enter"
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== ",") return;
                          e.preventDefault();
                          addTag(tagDraft);
                        }}
                        onBlur={() => addTag(tagDraft)}
                        className="h-8 w-36 text-xs"
                      />
                      <datalist id="ready-build-tags">
                        {allTags.filter((t) => !editing.tags.includes(t)).map((t) => <option key={t} value={t} />)}
                      </datalist>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Game FPS
                      <Input value={editing.fps_label ?? ""} onChange={(e) => setEditing({ ...editing, fps_label: e.target.value })} className="h-8 w-20 text-xs" />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      ক্যাটাগরি
                      <Input
                        value={editing.category ?? ""}
                        list="ready-build-categories"
                        onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                        className="h-8 w-36 text-xs"
                      />
                      <datalist id="ready-build-categories">
                        {[...new Set(builds.map((b) => b.category).filter(Boolean))].map((c) => <option key={c as string} value={c as string} />)}
                      </datalist>
                    </label>
                  </div>

                  <div className="grid gap-2 border border-border bg-muted/20 p-3">
                    <span className={sectionLabel}>ডিসকাউন্ট ও মেয়াদ</span>
                    {summary && (
                      <div className="text-xs text-muted-foreground">
                        প্রতিটা পার্টের &quot;বিল্ডে দাম&quot; থেকে সাশ্রয়:{" "}
                        <b className="text-emerald-600">{taka(summary.regular - summary.price)}</b>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">পুরো বিল্ডে বাড়তি</span>
                      <Select
                        value={editing.discount_type}
                        onChange={(e) => setEditing({ ...editing, discount_type: e.target.value as ReadyBuildWrite["discount_type"] })}
                        className="h-8 w-32 text-xs"
                        aria-label="Discount type"
                      >
                        <option value="none">নেই</option>
                        <option value="pct">% শতাংশ</option>
                        <option value="fixed">৳ Fixed</option>
                      </Select>
                      {editing.discount_type !== "none" && (
                        <Input
                          type="number"
                          value={editing.discount_value}
                          onChange={(e) => setEditing({ ...editing, discount_value: Number(e.target.value) || 0 })}
                          className="h-8 w-24 text-xs"
                          aria-label="Discount value"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        শুরু
                        <Input type="date" value={editing.starts_at ?? ""} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })} className="h-8 text-xs" />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        শেষ
                        <Input type="date" value={editing.ends_at ?? ""} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })} className="h-8 text-xs" />
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={editing.show_timer} onChange={(e) => setEditing({ ...editing, show_timer: e.target.checked })} />
                      কাস্টমারকে টাইমার দেখাও
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={editing.discount_on_change} onChange={(e) => setEditing({ ...editing, discount_on_change: e.target.checked })} />
                      কাস্টমার পার্ট বদলালেও পুরো-বিল্ড ডিসকাউন্ট থাকবে
                    </label>
                    {summary && (
                      <div className="grid gap-0.5 border border-border bg-background p-3">
                        <span className="text-xs text-muted-foreground">কাস্টমার ডিফল্ট বিল্ডে দেখবে</span>
                        <div>
                          <b className="text-xl">{taka(summary.final)}</b>{" "}
                          {summary.saved > 0 && (
                            <>
                              <s className="text-xs text-muted-foreground">{taka(summary.regular)}</s>{" "}
                              <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">−{taka(summary.saved)}</Chip>
                            </>
                          )}
                        </div>
                        {summary.outOfWindow && (
                          <span className="text-xs text-muted-foreground">মেয়াদের বাইরে, তাই পুরো-বিল্ড ডিসকাউন্ট এখন নেই</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className={sectionLabel}>রুল চেক (ডিফল্ট পার্টস)</span>
                    {ruleCheck && (ruleCheck.missing.length > 0 || ruleCheck.errors.length > 0 || ruleCheck.warnings.length > 0) ? (
                      <div className="grid gap-0.5 text-xs">
                        {ruleCheck.missing.map((n) => (
                          <div key={`m-${n}`} className="text-destructive">✕ {n} বেছে নিন, এটা বাধ্যতামূলক</div>
                        ))}
                        {ruleCheck.errors.map((m, i) => (
                          <div key={`e-${i}`} className="text-destructive">✕ {m}</div>
                        ))}
                        {ruleCheck.warnings.map((m, i) => (
                          <div key={`w-${i}`} className="text-amber-600">⚠ {m}</div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          {ruleCheck?.evaluated ? "সব রুল Pass ✓" : "রুল লোড হচ্ছে…"}
                        </Chip>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-input px-5 py-3">
                <Button variant="outline" size="sm" onClick={closeEditor}>বাতিল</Button>
                {editingId && (
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => void removeBuild()}>
                    {armedDelete ? "নিশ্চিত? আবার চাপুন" : "মুছুন"}
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={saving} onClick={() => void saveDraft()}>Draft সেভ</Button>
                <Button size="sm" disabled={saving} onClick={() => void publish()}>Publish</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function ReadyBuildsPage() {
  redirect("/workspace/plugins/smart-pc-builder");
}
