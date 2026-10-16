"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { useConfiguratorFiltersByCategory } from "@/lib/api/use-configurator-filters";
import { getSlotProducts, type SlotWithProducts } from "@/lib/api/configurator-slot-products";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { CAP_BY_SLUG } from "@/lib/configurator/pcb-components";
import { ruleProblemMessage, ruleSeverity, traceRule, type RuleTrace, type TraceBuild } from "@/lib/compatibility/rule-trace";
import { Chip, ProductPicker, prettyCode } from "@/components/configurator/admin/pcb-ui";

const chipFor = (t: RuleTrace) => {
  if (t.status === "pass") return { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Pass" };
  if (t.status === "skip") return { cls: "bg-muted text-muted-foreground", label: "Skip" };
  if (t.status === "unknown") return { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "যাচাই হয়নি" };
  return ruleSeverity(t.rule) === "error"
    ? { cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "Error" }
    : { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Warning" };
};

export function SmartPcBuilderTestBuild() {
  const [slots, setSlots] = useState<SlotWithProducts[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [build, setBuild] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [filterSlot, setFilterSlot] = useState("");

  const rules = useCompatibilityRuleStore((s) => s.rules);
  const loaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);
  useEffect(() => {
    if (!loaded) void fetchRules();
  }, [loaded, fetchRules]);

  useEffect(() => {
    let cancelled = false;
    getSlotProducts(true)
      .then((s) => {
        if (cancelled) return;
        setSlots(s);
        setFilterSlot((cur) => cur || s.find((x) => CAP_BY_SLUG[x.slug])?.id || s[0]?.id || "");
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the catalog"));
    return () => {
      cancelled = true;
    };
  }, []);

  const { byId: fieldsById } = useConfiguratorFiltersByCategory((slots ?? []).map((s) => s.id));

  const capOf = (slot: SlotWithProducts) => CAP_BY_SLUG[slot.slug];
  const slotByCap = (cap: string) => (slots ?? []).find((s) => capOf(s) === cap);
  const names = useMemo(
    () => ({
      slot: (cap: string) => slotByCap(cap)?.name ?? cap.replace(/^cap_/, ""),
      field: (cap: string, code: string) => {
        const s = slotByCap(cap);
        return (s && fieldsById[s.id]?.find((f) => f.code === code)?.name) || prettyCode(code);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, fieldsById],
  );

  const pcRules = useMemo(
    () =>
      rules
        .filter((r) => (r.configuratorProfileId === "pc-builder" || r.configuratorProfileId === "cfg_pc") && r.active)
        .sort((a, b) => a.priority - b.priority),
    [rules],
  );

  const toTrace = (b: Record<string, string[]>): TraceBuild => {
    const out: TraceBuild = {};
    for (const slot of slots ?? []) {
      const cap = capOf(slot);
      if (!cap) continue;
      out[cap] = (b[slot.id] ?? [])
        .map((id) => slot.products.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ name: p.name, attributes: p.attributes, qty: qty[slot.id + p.id] || 1 }));
    }
    return out;
  };

  const traces = useMemo(() => {
    const tb = toTrace(build);
    return pcRules.map((r) => traceRule(r, tb, names));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcRules, build, qty, slots, names]);

  const errors = traces.filter((t) => t.status === "fail" && ruleSeverity(t.rule) === "error");
  const warnings = traces.filter((t) => t.status === "fail" && ruleSeverity(t.rule) === "warning");
  const unknowns = traces.filter((t) => t.status === "unknown");
  const passes = traces.filter((t) => t.status === "pass");
  const skips = traces.filter((t) => t.status === "skip");
  const missing = (slots ?? []).filter((s) => s.required && !(build[s.id] ?? []).length);

  const titleFor = (t: RuleTrace) => {
    if (t.status === "unknown") {
      const [p, f] = t.detail.replace(/ খালি$/, "").split(": ");
      return f ? `${p}-এর ${f} তথ্য নেই, তাই মিল যাচাই করা যায়নি` : t.detail;
    }
    return t.status === "fail" ? ruleProblemMessage(t.rule) : t.rule.name;
  };

  // Auto Filter Preview: what a customer would see when opening one slot with the current build.
  const involves = (t: RuleTrace, cap: string) => {
    const c = t.rule.body.conditions[0];
    if (!c || c.operator === "requires") return false;
    if (c.left.profileId === cap) return true;
    if ("profileId" in c.right && c.right.profileId === cap) return true;
    if (t.rule.body.when?.profileId === cap) return true;
    return c.operator === "power" && (cap === "cap_cpu" || cap === "cap_gpu");
  };
  const fSlot = (slots ?? []).find((s) => s.id === filterSlot);
  const candidates = useMemo(() => {
    if (!fSlot) return [];
    const cap = capOf(fSlot);
    return fSlot.products.map((p) => {
      const nb = { ...build, [fSlot.id]: [p.id] };
      const tb = toTrace(nb);
      const rr = cap ? pcRules.filter((r) => involves({ rule: r, status: "pass", detail: "" }, cap)).map((r) => traceRule(r, tb, names)) : [];
      const bad = rr.filter((x) => x.status === "fail" && ruleSeverity(x.rule) === "error");
      const warn = rr.filter((x) => (x.status === "fail" && ruleSeverity(x.rule) === "warning") || x.status === "unknown");
      return { p, bad, warn };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fSlot, build, qty, pcRules, names]);
  const hiddenCount = candidates.filter((c) => c.bad.length).length;

  const setPick = (slot: SlotWithProducts, index: number, value: string) => {
    setBuild((b) => {
      const arr = [...(b[slot.id] ?? [])];
      if (value) arr[index] = value;
      else arr.splice(index, 1);
      return { ...b, [slot.id]: arr.filter(Boolean) };
    });
  };

  if (error) return <p className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>;
  if (!slots) return <p className="px-2 py-8 text-center text-xs text-muted-foreground">Loading live catalog…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-xs text-muted-foreground">
        একটা বিল্ড বানিয়ে দেখুন রুলগুলো ঠিকমতো কাজ করছে কি না। প্রতিটা ড্রপডাউনে শুধু সেই স্লটের প্রোডাক্ট আসে। নিচের Auto Filter দেখায় কাস্টমার কোনো স্লট খুললে কী দেখবে।
      </p>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-none border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">বিল্ড</h2>
            <Button size="sm" variant="outline" className="h-7 rounded-none text-xs" onClick={() => setBuild({})}>
              সব খালি
            </Button>
          </div>
          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            {slots.map((slot) => {
              const cur = build[slot.id] ?? [];
              const rowCount = slot.max_select > 1 ? Math.min(slot.max_select, cur.length + 1) : 1;
              return (
                <div key={slot.id} className="grid min-w-0 content-start gap-1.5 border border-border bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between text-[13px] font-semibold">
                    <span>{slot.name}</span>
                    {slot.required && <span className="text-[11px] font-medium text-muted-foreground">Required</span>}
                  </div>
                  {Array.from({ length: rowCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                <ProductPicker
                        products={slot.products}
                        value={cur[i] ?? ""}
                        onChange={(id) => setPick(slot, i, id)}
                        label={slot.name}
                      />
                      {slot.max_select > 1 && cur[i] && (
                        <Input
                          type="number"
                          min={1}
                          max={4}
                          value={qty[slot.id + cur[i]] || 1}
                          onChange={(e) => setQty((q) => ({ ...q, [slot.id + cur[i]]: Math.max(1, Number(e.target.value) || 1) }))}
                          className="h-8 w-14 text-xs"
                          aria-label="Qty"
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-none border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">ফলাফল</h2>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {errors.length ? (
                <Chip cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">{errors.length} Error</Chip>
              ) : (
                <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">কোনো Error নেই</Chip>
              )}
              <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">{warnings.length} Warning</Chip>
              {unknowns.length > 0 && <Chip cls="bg-amber-500/10 text-amber-600 dark:text-amber-400">{unknowns.length} যাচাই হয়নি</Chip>}
              <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{passes.length} Pass</Chip>
              <Chip cls="bg-muted text-muted-foreground">{skips.length} Skip</Chip>
            </div>
            {missing.length > 0 && (
              <div className="mb-1.5 grid grid-cols-[auto_1fr] gap-2.5 border border-border bg-muted/20 px-2.5 py-2 text-[13px]">
                <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">বাকি</Chip>
                <div>বাধ্যতামূলক স্লট খালি: {missing.map((s) => s.name).join(", ")}</div>
              </div>
            )}
            <div className="grid gap-1.5">
              {[...errors, ...warnings, ...unknowns, ...passes, ...skips].map((t) => {
                const chip = chipFor(t);
                return (
                  <div key={t.rule.id} className="grid grid-cols-[auto_1fr] gap-2.5 border border-border bg-muted/20 px-2.5 py-2">
                    <span><Chip cls={chip.cls}>{chip.label}</Chip></span>
                    <div>
                      <div className="text-[13px] font-medium">{titleFor(t)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{t.detail}</div>
                    </div>
                  </div>
                );
              })}
              {traces.length === 0 && loaded && <p className="text-xs text-muted-foreground">কোনো সক্রিয় রুল নেই</p>}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">Auto Filter Preview</h2>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            কাস্টমার খুলল:
            <Select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} className="h-8 w-44 text-xs">
              {slots.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {candidates.length}টির মধ্যে <b>{hiddenCount}টি</b> বর্তমান বিল্ডের সাথে মেলে না, তাই লুকানো থাকবে।
          </p>
          <div className="grid gap-1">
            {candidates.length === 0 && <p className="text-xs text-muted-foreground">এই স্লটে কোনো প্রোডাক্ট নেই।</p>}
            {candidates.map(({ p, bad, warn }) => (
              <div
                key={p.id}
                className={`flex items-start justify-between gap-2 border bg-background px-2.5 py-1.5 text-xs ${bad.length ? "border-dashed border-border opacity-80" : "border-border"}`}
              >
                <div className="min-w-0">
                  <div>{p.name}</div>
                  {bad.map((x) => (
                    <div key={x.rule.id} className="text-[11.5px] text-destructive">
                      ✕ {ruleProblemMessage(x.rule)} · <span className="font-mono">{x.detail}</span>
                    </div>
                  ))}
                  {!bad.length &&
                    warn.map((x) => (
                      <div key={x.rule.id} className="text-[11.5px] text-amber-600">
                        ⚠ {x.status === "unknown" ? titleFor(x) : ruleProblemMessage(x.rule)}
                      </div>
                    ))}
                </div>
                <span className="flex shrink-0 gap-1">
                  {!p.in_stock && <Chip cls="bg-muted text-muted-foreground">Out of stock</Chip>}
                  <Chip cls={bad.length ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}>
                    {bad.length ? "লুকানো" : "দেখাবে"}
                  </Chip>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
