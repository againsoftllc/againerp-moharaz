"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useConfiguratorCategories } from "@/lib/api/use-configurator-categories";
import { useConfiguratorSlotTabs } from "@/lib/api/use-configurator-slot-tabs";
import { getSlotProducts, type SlotWithProducts } from "@/lib/api/configurator-slot-products";
import { listReadyBuilds, type ReadyBuild } from "@/lib/api/configurator-ready-builds";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { CAP_BY_SLUG } from "@/lib/configurator/pcb-components";
import type { BuildComponentContext } from "@/lib/compatibility/types";
import { Chip, ProductPicker, SlotIconView } from "@/components/configurator/admin/pcb-ui";

const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

function countdown(endDate: string): string | null {
  const ms = Date.parse(`${endDate}T23:59:59`) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return `${d}দিন ${h}ঘ ${m}মি`;
}

const cpuBrand = (name: string) => (/AMD|Ryzen/i.test(name) ? "AMD" : /Intel|Core/i.test(name) ? "Intel" : "");
const gpuBrand = (name: string) =>
  /RTX|GeForce|GTX/i.test(name) ? "NVIDIA" : /RX |Radeon/i.test(name) ? "AMD Radeon" : /Arc/i.test(name) ? "Intel Arc" : "Other";

type Filters = { min: string; max: string; tags: string[]; cpu: string[]; gpu: string[]; ram: string[] };
const emptyFilters = (): Filters => ({ min: "", max: "", tags: [], cpu: [], gpu: [], ram: [] });

/** What a customer sees at /smart-pc-builder: the published Ready Builds with filters built from
 * their parts, and the "Customize" view. Everything here reads the real builds and catalog. */
export function SmartPcBuilderStorefrontPreview() {
  const { profiles } = useConfiguratorProfiles();
  const profileId = profiles.find((p) => p.slug === "pc-builder")?.id;
  const { categories } = useConfiguratorCategories(profileId);
  const { tabs } = useConfiguratorSlotTabs(profileId);

  const [builds, setBuilds] = useState<ReadyBuild[] | null>(null);
  const [slots, setSlots] = useState<SlotWithProducts[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [customizing, setCustomizing] = useState<ReadyBuild | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listReadyBuilds()
      .then((r) => !cancelled && setBuilds(r.data.filter((b) => b.status === "published")))
      .catch(() => !cancelled && setBuilds([]));
    void getSlotProducts()
      .then((s) => !cancelled && setSlots(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const catBySlug = (slug: string) => categories.find((c) => c.slug === slug);
  const productOf = (categoryId: string, productId: string) => slots.find((s) => s.id === categoryId)?.products.find((p) => p.id === productId);
  const defaultItem = (b: ReadyBuild, categoryId: string) => {
    const slot = b.slots.find((s) => s.category_id === categoryId);
    if (!slot || slot.mode === "hidden") return undefined;
    return slot.items.find((i) => i.is_default && i.product_id) ?? slot.items.find((i) => i.product_id);
  };
  const defaultName = (b: ReadyBuild, slug: string) => {
    const cat = catBySlug(slug);
    return (cat && defaultItem(b, cat.id)?.product_name) || "";
  };
  const ramGb = (b: ReadyBuild) => {
    const cat = catBySlug("memory");
    const item = cat ? defaultItem(b, cat.id) : undefined;
    if (!item || !cat) return 0;
    const cap = Number(productOf(cat.id, item.product_id)?.attributes?.ram_capacity);
    if (cap > 0) return cap;
    const m = (item.product_name ?? "").match(/(\d+)\s*GB/i);
    return m ? Number(m[1]) : 0;
  };

  const facts = useMemo(() => {
    const live = builds ?? [];
    const uniq = (xs: (string | number)[]) => [...new Set(xs.filter(Boolean).map(String))];
    return {
      tags: uniq(live.flatMap((b) => b.tags)),
      cpu: uniq(live.map((b) => cpuBrand(defaultName(b, "cpu")))),
      gpu: uniq(live.map((b) => (defaultName(b, "graphics-card") ? gpuBrand(defaultName(b, "graphics-card")) : "Integrated"))),
      ram: uniq(live.map((b) => ramGb(b))).sort((a, b) => Number(a) - Number(b)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds, categories, slots]);

  const shown = (builds ?? []).filter((b) => {
    const price = b.totals?.final ?? 0;
    if (filters.min && price < Number(filters.min)) return false;
    if (filters.max && price > Number(filters.max)) return false;
    if (filters.tags.length && !filters.tags.some((t) => b.tags.includes(t))) return false;
    if (filters.cpu.length && !filters.cpu.includes(cpuBrand(defaultName(b, "cpu")))) return false;
    const g = defaultName(b, "graphics-card") ? gpuBrand(defaultName(b, "graphics-card")) : "Integrated";
    if (filters.gpu.length && !filters.gpu.includes(g)) return false;
    if (filters.ram.length && !filters.ram.includes(String(ramGb(b)))) return false;
    return true;
  });

  const outOfStock = (b: ReadyBuild) =>
    b.slots.some((s) => {
      const cat = categories.find((c) => c.id === s.category_id);
      if (!cat || s.mode === "hidden") return false;
      const items = s.items.filter((i) => i.product_id);
      const inStock = (pid: string) => productOf(cat.id, pid)?.in_stock !== false;
      return (s.mode === "locked" && items[0] && !inStock(items[0].product_id)) || (s.mode === "list" && items.length > 0 && items.every((i) => !inStock(i.product_id)));
    });

  // The customer-facing card lists the parts of the first tab (Components), as the shop does.
  const firstTabId = tabs[0]?.id;
  const mainSlots = [...categories]
    .filter((c) => c.tabId === firstTabId && c.kind === "product")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const toggle = (key: keyof Pick<Filters, "tags" | "cpu" | "gpu" | "ram">, value: string, on: boolean) =>
    setFilters((f) => ({ ...f, [key]: on ? [...f[key], value] : f[key].filter((x) => x !== value) }));

  const group = (title: string, key: keyof Pick<Filters, "tags" | "cpu" | "gpu" | "ram">, options: string[], fmt?: (v: string) => string) => (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{title}</span>
      {options.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={filters[key].includes(o)} onChange={(e) => toggle(key, o, e.target.checked)} />
            {fmt ? fmt(o) : o}
          </label>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-xs text-muted-foreground">
        কাস্টমার যেভাবে Ready Build-এর লিস্ট দেখবে, ক্যাটাগরি পেজের মতো। ফিল্টারগুলো বিল্ডের পার্ট থেকে নিজে থেকে তৈরি হয়। Customize চাপলে কাস্টমার-ভিউ খুলবে।
      </p>
      <div className="grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <section className="rounded-none border border-border bg-card">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">দাম (৳)</span>
              <div className="flex gap-1.5">
                <Input type="number" placeholder="সর্বনিম্ন" value={filters.min} onChange={(e) => setFilters((f) => ({ ...f, min: e.target.value }))} className="h-8 w-24 text-xs" />
                <Input type="number" placeholder="সর্বোচ্চ" value={filters.max} onChange={(e) => setFilters((f) => ({ ...f, max: e.target.value }))} className="h-8 w-24 text-xs" />
              </div>
            </div>
            {group("ব্যবহার", "tags", facts.tags)}
            {group("CPU", "cpu", facts.cpu)}
            {group("GPU", "gpu", facts.gpu)}
            {group("RAM", "ram", facts.ram, (v) => `${v}GB`)}
            <Button size="sm" variant="outline" className="h-8 rounded-none text-xs" onClick={() => setFilters(emptyFilters())}>ফিল্টার মুছুন</Button>
          </div>
        </section>

        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {builds === null && <p className="text-xs text-muted-foreground">Loading…</p>}
          {builds !== null && shown.length === 0 && <p className="text-xs text-muted-foreground">কোনো বিল্ড মেলেনি</p>}
          {shown.map((b) => {
            const t = b.totals;
            const saved = t ? t.regular - t.final : 0;
            const oos = outOfStock(b);
            const left = b.ends_at ? countdown(b.ends_at) : null;
            return (
              <div key={b.id} className={`grid content-start gap-2 border border-border bg-card p-3 ${oos ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap gap-1">
                  {b.tags.map((x) => (
                    <Chip key={x} cls="bg-muted text-muted-foreground">{x}</Chip>
                  ))}
                </div>
                {b.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.images[0]} alt="" className="h-[130px] w-full object-cover" />
                ) : (
                  <div className="grid h-[130px] place-items-center bg-gradient-to-br from-primary/10 to-cyan-500/10 text-4xl">🖥</div>
                )}
                <b className="text-[15px]">{b.name}</b>
                {b.fps_label && <span className="text-right text-xs text-primary">Game FPS: {b.fps_label}</span>}
                <div className="grid gap-0.5 border-t border-border pt-2 text-[12.5px]">
                  {mainSlots.map((cat) => {
                    const name = defaultItem(b, cat.id)?.product_name;
                    return name ? (
                      <div key={cat.id}>
                        <SlotIconView icon={cat.icon} size={16} /> {name}
                      </div>
                    ) : null;
                  })}
                </div>
                {b.show_timer && left && t?.discount_applied && (
                  <div className="border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600">⏱ অফার শেষ হবে: {left}</div>
                )}
                <div>
                  <b className="text-xl">{t ? taka(t.final) : "—"}</b>{" "}
                  {saved > 0 && (
                    <>
                      <s className="text-xs text-muted-foreground">{taka(t!.regular)}</s>{" "}
                      <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{taka(saved)} ছাড়</Chip>
                    </>
                  )}
                </div>
                <Button size="sm" disabled={oos} variant={oos ? "outline" : "default"} onClick={() => setCustomizing(b)}>
                  {oos ? "স্টকে নেই" : "Customize"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {customizing && (
        <CustomerView
          build={customizing}
          categories={categories}
          tabs={tabs}
          slots={slots}
          onClose={() => setCustomizing(null)}
        />
      )}
    </div>
  );
}

function CustomerView({
  build,
  categories,
  tabs,
  slots,
  onClose,
}: {
  build: ReadyBuild;
  categories: ReturnType<typeof useConfiguratorCategories>["categories"];
  tabs: { id: string; name: string }[];
  slots: SlotWithProducts[];
  onClose: () => void;
}) {
  // categoryId -> chosen product id ("" = nothing). Absent = the build's default.
  const [sel, setSel] = useState<Record<string, string>>({});
  const evaluateBuild = useCompatibilityRuleStore((s) => s.evaluateBuild);
  const rulesLoaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);
  useEffect(() => {
    if (!rulesLoaded) void fetchRules();
  }, [rulesLoaded, fetchRules]);

  const bslot = (categoryId: string) => build.slots.find((s) => s.category_id === categoryId);
  const defaultOf = (categoryId: string) => {
    const s = bslot(categoryId);
    if (!s || s.mode === "hidden") return "";
    return (s.items.find((i) => i.is_default && i.product_id) ?? s.items.find((i) => i.product_id))?.product_id ?? "";
  };
  const chosen = (categoryId: string) => (categoryId in sel ? sel[categoryId] : defaultOf(categoryId));
  const catalogPrice = (categoryId: string, pid: string) =>
    slots.find((s) => s.id === categoryId)?.products.find((p) => p.id === pid)?.price ??
    bslot(categoryId)?.items.find((i) => i.product_id === pid)?.catalog_price ??
    0;
  const buildPrice = (categoryId: string, pid: string) => {
    const it = bslot(categoryId)?.items.find((i) => i.product_id === pid);
    return it?.build_price ?? catalogPrice(categoryId, pid);
  };

  const totals = (() => {
    let regular = 0;
    let price = 0;
    let changed = false;
    for (const cat of categories) {
      const s = bslot(cat.id);
      if (!s || s.mode === "hidden") continue;
      const pid = chosen(cat.id);
      if (!pid) continue;
      if (pid !== defaultOf(cat.id)) changed = true;
      regular += catalogPrice(cat.id, pid);
      price += buildPrice(cat.id, pid);
    }
    const today = new Date().toISOString().slice(0, 10);
    const live =
      build.discount_type !== "none" &&
      !(build.starts_at && build.starts_at > today) &&
      !(build.ends_at && build.ends_at < today);
    const apply = live && (build.discount_on_change || !changed);
    const whole = !apply ? 0 : build.discount_type === "pct" ? Math.round(price * build.discount_value) / 100 : build.discount_value;
    const final = Math.max(0, price - whole);
    return { regular, price, final, saved: regular - final, changed, applied: apply, live };
  })();

  const check = useMemo(() => {
    const components: BuildComponentContext[] = [];
    const missing: string[] = [];
    for (const cat of categories) {
      const s = bslot(cat.id);
      if (!s || s.mode === "hidden") continue;
      const pid = chosen(cat.id);
      if (!pid) {
        if (cat.isRequired) missing.push(cat.name);
        continue;
      }
      const product = slots.find((x) => x.id === cat.id)?.products.find((p) => p.id === pid);
      const cap = CAP_BY_SLUG[cat.slug];
      if (cap && product) components.push({ componentProfileId: cap, componentName: product.name, productId: product.id, attributes: product.attributes });
    }
    const result = rulesLoaded ? evaluateBuild("pc-builder", components) : null;
    return {
      missing,
      errors: (result?.results ?? []).filter((r) => r.status === "incompatible").map((r) => r.message || r.ruleName),
      warnings: (result?.results ?? []).filter((r) => r.status === "warning").map((r) => r.message || r.ruleName),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, categories, slots, rulesLoaded, evaluateBuild]);

  const left = build.ends_at ? countdown(build.ends_at) : null;
  const orderedTabs = tabs.length ? tabs : [{ id: "", name: "" }];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[1120px]">
        <div className="border-b border-input px-5 py-4">
          <h2 className="text-lg font-semibold">কাস্টমার-ভিউ: {build.name}</h2>
        </div>
        <div className="grid flex-1 gap-4 overflow-auto p-5">
          {build.show_timer && left && totals.live && (
            <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">⏱ অফার শেষ হবে: {left}</div>
          )}
          {orderedTabs.map((tab) => {
            const rows = categories
              .filter((c) => (tab.id ? c.tabId === tab.id : true) && bslot(c.id) && bslot(c.id)!.mode !== "hidden")
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (rows.length === 0) return null;
            return (
              <div key={tab.id || "all"} className="grid gap-1.5">
                {tab.name && <span className="text-xs font-semibold text-muted-foreground">{tab.name}</span>}
                {rows.map((cat) => {
                  const s = bslot(cat.id)!;
                  const cur = chosen(cat.id);
                  const options =
                    s.mode === "list"
                      ? s.items.filter((i) => i.product_id).map((i) => ({ id: i.product_id, name: i.product_name ?? i.product_id, in_stock: slots.find((x) => x.id === cat.id)?.products.find((p) => p.id === i.product_id)?.in_stock }))
                      : (slots.find((x) => x.id === cat.id)?.products ?? []).map((p) => ({ id: p.id, name: `${p.name} · ${taka(buildPrice(cat.id, p.id))}`, in_stock: p.in_stock }));
                  const curName = options.find((o) => o.id === cur)?.name ?? s.items.find((i) => i.product_id === cur)?.product_name ?? "";
                  return (
                    <div key={cat.id} className="flex items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2">
                      <span className="w-40 shrink-0 text-[13px]">
                        <SlotIconView icon={cat.icon} size={16} /> <b>{cat.name}</b>
                      </span>
                      <div className="flex min-w-0 flex-1">
                        {s.mode === "locked" ? (
                          <span className="text-[13px]">🔒 {curName}</span>
                        ) : (
                          <ProductPicker
                            products={options.map((o) => ({ ...o, name: s.mode === "list" ? `${o.name} · ${taka(buildPrice(cat.id, o.id))}` : o.name }))}
                            value={cur}
                            label={cat.name}
                            onChange={(id) => setSel((x) => ({ ...x, [cat.id]: id }))}
                          />
                        )}
                      </div>
                      <b className="w-24 shrink-0 text-right text-[13px]">{cur ? taka(buildPrice(cat.id, cur)) : "—"}</b>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="grid gap-0.5 text-xs">
            {check.missing.map((n) => (
              <div key={`m-${n}`} className="text-destructive">✕ {n} বেছে নিন, এটা বাধ্যতামূলক</div>
            ))}
            {check.errors.map((m, i) => (
              <div key={`e-${i}`} className="text-destructive">✕ {m}</div>
            ))}
            {check.warnings.map((m, i) => (
              <div key={`w-${i}`} className="text-amber-600">⚠ {m}</div>
            ))}
          </div>

          <div className="grid gap-0.5 border border-border bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">মোট{totals.changed ? " (আপনি কিছু পার্ট বদলেছেন)" : ""}</span>
            <div>
              <b className="text-2xl">{taka(totals.final)}</b>{" "}
              {totals.saved > 0 && (
                <>
                  <s className="text-xs text-muted-foreground">{taka(totals.regular)}</s>{" "}
                  <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">−{taka(totals.saved)}</Chip>
                </>
              )}
            </div>
            {build.discount_type !== "none" && totals.changed && !totals.applied && totals.live && (
              <span className="text-xs text-muted-foreground">পার্ট বদলানোয় পুরো-বিল্ড ডিসকাউন্ট প্রযোজ্য নয়</span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-input px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setSel({})}>ডিফল্টে ফেরত</Button>
          <Button
            size="sm"
            disabled={check.errors.length > 0 || check.missing.length > 0}
            onClick={() => toast(`প্রিভিউ: কার্টে যোগ হবে ${taka(totals.final)}`)}
          >
            Add to Cart
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
