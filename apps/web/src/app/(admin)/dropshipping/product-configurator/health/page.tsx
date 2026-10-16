"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useConfiguratorCategories } from "@/lib/api/use-configurator-categories";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import {
  type Overview,
  type OverviewIssue,
  type OverviewIssueKind,
  type OverviewSlotHead,
  loadOverviewBySlot,
} from "@/lib/api/configurator-overview";
import {
  createCategoryOverride,
  createProductOverride,
  listAttributeAliases,
  listChipsetLookup,
  listProductOverrides,
} from "@/lib/api/configurator-lookups";

const KIND_CHIP: Record<OverviewIssueKind, { cls: string; label: string }> = {
  missing: { cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "মান নেই" },
  profile: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "ক্যাটাগরি ভিন্ন" },
  rule: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "রুলের ডাটা নেই" },
  lookup: { cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "Lookup নেই" },
  alias: { cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", label: "এলোমেলো মান" },
};

function issueText(i: OverviewIssue): string {
  const field = i.field_label ?? i.field_code ?? "";
  switch (i.kind) {
    case "missing":
      return `${field} খালি, তাই ${i.slot_name} স্লটে আসছে না`;
    case "profile":
      return `${field}-এ মান আছে কিন্তু ক্যাটাগরি "${i.from_slot ?? ""}", তাই বাদ পড়েছে`;
    case "rule":
      return `রুলের জন্য দরকারি ${field} খালি`;
    case "lookup":
      return `Chipset "${i.value ?? ""}" Lookup টেবিলে নেই`;
    case "alias":
      return `"${i.value ?? ""}" মানটা এলোমেলো, Alias দিয়ে ঠিক করুন`;
  }
}

function Chip({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap px-2 py-px text-[11px] font-semibold ${cls}`}>{children}</span>;
}

const ISSUES_PER_PAGE = 50;

/** a slot whose numbers are still loading */
function SlotCardLoading({ slot }: { slot: OverviewSlotHead }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-none border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm">{slot.name}</b>
        {slot.required && <span className="text-[11px] text-muted-foreground">Required</span>}
      </div>
      <div className="h-[26px] w-16 animate-pulse bg-muted" />
      <div className="h-1.5 animate-pulse bg-muted" />
      <div className="h-[18px] w-24 animate-pulse bg-muted" />
    </div>
  );
}

function SlotCard({ slot }: { slot: Overview["slots"][number] }) {
  const barColor = slot.ready_pct >= 90 ? "bg-emerald-500" : slot.ready_pct >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex flex-col gap-1.5 rounded-none border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm">{slot.name}</b>
        {slot.required && <span className="text-[11px] text-muted-foreground">Required</span>}
      </div>
      <div className="text-[22px] font-bold tabular-nums leading-tight">
        {slot.shown}
        <span className="ml-1 text-xs font-medium text-muted-foreground">প্রোডাক্ট দেখাবে</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-muted" aria-label={`${slot.ready_pct}% ready`}>
        <div className={`h-full ${barColor}`} style={{ width: `${slot.ready_pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{slot.ready_pct}% ডাটা সম্পূর্ণ</span>
        {slot.issue_count > 0 ? (
          <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">{slot.issue_count} সমস্যা</Chip>
        ) : (
          <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">ঠিক আছে</Chip>
        )}
      </div>
    </div>
  );
}

/** "Override দিন" — a PC-Builder-only value for one product+field. The catalog
 * product itself is never touched. */
function OverrideSheet({
  issue,
  onClose,
  onSaved,
}: {
  issue: OverviewIssue;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [field, setField] = useState(issue.field_code ?? "");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!field.trim() || !value.trim()) {
      toast.error("মান দিন");
      return;
    }
    setSaving(true);
    try {
      await createProductOverride({ product_id: issue.product_id, field_code: field.trim(), value: value.trim() });
      toast.success("Override সেভ হয়েছে");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Override সেভ হয়নি");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">Override দিন</h2>
        </div>
        <p className="text-xs text-muted-foreground">এই মান শুধু PC Builder মডিউলে সেভ হবে। প্রোডাক্ট পেজে কিছু বদলাবে না।</p>
        <div className="space-y-1">
          <Label className="text-xs">প্রোডাক্ট</Label>
          <div className="border border-input bg-muted/30 px-3 py-2 text-sm">
            {issue.product_name} <span className="text-xs text-muted-foreground">· {issue.slot_name}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ফিল্টার (field code)</Label>
          <Input value={field} onChange={(e) => setField(e.target.value)} />
          <span className="text-[11px] text-muted-foreground">
            প্রোডাক্টে এখন আছে: <span className="font-mono">খালি</span>
          </span>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">বিল্ডার যে মান ধরবে</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="যেমন LGA1700, 160, ATX" autoFocus />
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>সেভ করুন</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SmartPcBuilderOverviewContent() {
  const jump = useSmartPcBuilderNavStore((s) => s.jump);
  const jumpWithAlias = useSmartPcBuilderNavStore((s) => s.jumpWithAlias);
  const jumpWithChipset = useSmartPcBuilderNavStore((s) => s.jumpWithChipset);
  const { categories } = useConfiguratorCategories();

  // the slots come at once; each slot's numbers and issues arrive as they load
  const [slotList, setSlotList] = useState<OverviewSlotHead[] | null>(null);
  const [bySlot, setBySlot] = useState<Record<string, Overview | null>>({});
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadRun = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<OverviewIssue | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  const setBadges = useSmartPcBuilderNavStore((s) => s.setBadges);

  const load = useCallback(async () => {
    loadRun.current?.abort();
    const run = new AbortController();
    loadRun.current = run;
    setLoading(true);
    setBySlot({});
    try {
      let total = 0;
      await loadOverviewBySlot({
        signal: run.signal,
        onSlots: (slots) => {
          setSlotList(slots);
          setBadges({ "tabs-slots": slots.length });
        },
        onSlot: (id, result) => {
          setBySlot((prev) => ({ ...prev, [id]: result }));
          total += result?.total ?? 0;
          setBadges({ overview: total });
        },
      });
      if (run.signal.aborted) return;
      const ruleStore = useCompatibilityRuleStore.getState();
      if (!ruleStore.loaded) await ruleStore.fetchRules();
      setBadges({ rules: useCompatibilityRuleStore.getState().rules.filter((r) => r.active).length });
      setError(null);
    } catch (err) {
      if (!run.signal.aborted) setError(err instanceof Error ? err.message : "Could not load the overview");
    } finally {
      if (!run.signal.aborted) setLoading(false);
    }
  }, [setBadges]);

  useEffect(() => () => loadRun.current?.abort(), []);

  // the slots so far, in order, with all the issues found so far
  const data = useMemo<Overview | null>(() => {
    if (!slotList) return null;
    const results = slotList.map((s) => bySlot[s.id]).filter((r): r is Overview => !!r);
    const issues = results.flatMap((r) => r.issues);
    return { slots: results.flatMap((r) => r.slots), issues, total: issues.length };
  }, [slotList, bySlot]);
  const loadedCount = slotList ? slotList.filter((s) => s.id in bySlot).length : 0;
  const pages = data ? Math.max(1, Math.ceil(data.issues.length / ISSUES_PER_PAGE)) : 1;
  const pageNow = Math.min(page, pages - 1);
  const pageIssues = data ? data.issues.slice(pageNow * ISSUES_PER_PAGE, (pageNow + 1) * ISSUES_PER_PAGE) : [];

  useEffect(() => {
    void load();
  }, [load]);

  const dismissOrInclude = async (issue: OverviewIssue, action: "include" | "ignore") => {
    try {
      await createCategoryOverride({ category_id: issue.slot_id, product_id: issue.product_id, action });
      toast.success(
        action === "include" ? `${issue.product_name} ${issue.slot_name} স্লটে Include হয়েছে` : "বাদ থাকল",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ হয়নি");
    }
  };

  const exportJson = async () => {
    try {
      if (!useCompatibilityRuleStore.getState().loaded) await useCompatibilityRuleStore.getState().fetchRules();
      const rules = useCompatibilityRuleStore.getState().rules;
      const [chipsetLookup, aliases, overrides] = await Promise.all([
        listChipsetLookup(),
        listAttributeAliases(),
        listProductOverrides(),
      ]);
      const slots = categories
        .filter((c) => c.profileName === "PC Builder")
        .map((c) => ({
          id: c.slug,
          name: c.name,
          required: c.isRequired,
          icon: c.icon,
          kind: c.kind,
          tabId: c.tabId ?? null,
          conds: c.conditions,
          specs: c.specs,
          catalogCategory: c.catalogCategorySlug ?? null,
        }));
      setExportText(JSON.stringify({ slots, rules, chipsetLookup, aliases, overrides }, null, 2));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export হয়নি");
    }
  };

  const actions = (issue: OverviewIssue) => {
    switch (issue.kind) {
      case "profile":
        return (
          <>
            <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => void dismissOrInclude(issue, "include")}>
              Include করুন
            </Button>
            <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => void dismissOrInclude(issue, "ignore")}>
              বাদ থাকুক
            </Button>
          </>
        );
      case "lookup":
        return (
          <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => jumpWithChipset({ chipset: issue.value ?? "" })}>
            Lookup-এ যোগ
          </Button>
        );
      case "alias":
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-none px-2 text-xs"
            onClick={() =>
              jumpWithAlias({
                field_code: issue.field_code ?? "",
                raw_pattern: issue.value ?? "",
                normalized_value: issue.suggested ?? "",
              })
            }
          >
            Alias বানান
          </Button>
        );
      default:
        return (
          <Button size="sm" className="h-7 rounded-none px-2 text-xs" onClick={() => setOverrideFor(issue)}>
            Override দিন
          </Button>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-xs text-muted-foreground">
          PC Builder প্রোডাক্টে কিছু লেখে না, শুধু পড়ে। প্রতিটা স্লট চেনে <b>ক্যাটাগরি + একটা চেনার ফিল্টার</b> দিয়ে, আর রুল লেখা হয় ফিল্টার দিয়ে।
          নিচে দেখুন কোন স্লটে কতগুলো প্রোডাক্ট তৈরি, আর কোথায় কী ঠিক করতে হবে।
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 rounded-none text-xs" onClick={() => void exportJson()}>
            Export JSON
          </Button>
          <Button size="sm" variant="outline" className="h-7 rounded-none text-xs" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : !data || !slotList ? (
        <p className="px-2 py-8 text-center text-xs text-muted-foreground">Loading live slot data…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {slotList.map((head) => {
              const loaded = bySlot[head.id]?.slots[0];
              return loaded ? <SlotCard key={head.id} slot={loaded} /> : <SlotCardLoading key={head.id} slot={head} />;
            })}
          </div>

          <section className="rounded-none border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[15px] font-semibold">
                যা ঠিক করতে হবে
                {loadedCount < slotList.length && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({loadedCount}/{slotList.length} slots loaded…)
                  </span>
                )}
              </h2>
              <Chip cls={data.total ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}>
                {data.total}টি
              </Chip>
            </div>
            <div className="grid gap-1.5 p-3">
              {data.issues.length === 0 && loadedCount < slotList.length ? (
                <p className="py-5 text-center text-xs text-muted-foreground">Loading…</p>
              ) : data.issues.length === 0 ? (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  সব ঠিক আছে।{" "}
                  <button type="button" className="underline" onClick={() => jump("test-build")}>
                    Test Build-এ গিয়ে একবার যাচাই করে নিন।
                  </button>
                </p>
              ) : (
                pageIssues.map((issue) => (
                  <div
                    key={`${issue.kind}-${issue.slot_id}-${issue.product_id}-${issue.field_code}`}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-none border border-border bg-muted/20 px-3 py-2"
                  >
                    <Chip cls={KIND_CHIP[issue.kind].cls}>{KIND_CHIP[issue.kind].label}</Chip>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {issue.product_name} <span className="text-xs font-normal text-muted-foreground">· {issue.slot_name} স্লট</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{issueText(issue)}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">{actions(issue)}</div>
                  </div>
                ))
              )}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <span>
                  {pageNow * ISSUES_PER_PAGE + 1}–{Math.min((pageNow + 1) * ISSUES_PER_PAGE, data.issues.length)} of {data.issues.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" disabled={pageNow === 0} onClick={() => setPage(0)}>
                    «
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" disabled={pageNow === 0} onClick={() => setPage(pageNow - 1)}>
                    ‹ Prev
                  </Button>
                  <span className="tabular-nums">
                    Page {pageNow + 1} / {pages}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" disabled={pageNow >= pages - 1} onClick={() => setPage(pageNow + 1)}>
                    Next ›
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" disabled={pageNow >= pages - 1} onClick={() => setPage(pages - 1)}>
                    »
                  </Button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {exportText !== null && (
        <section className="rounded-none border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">Configuration JSON (ডেভেলপারের জন্য)</h2>
            <Button size="sm" variant="outline" className="h-7 rounded-none text-xs" onClick={() => setExportText(null)}>
              বন্ধ
            </Button>
          </div>
          <div className="p-3">
            <textarea
              readOnly
              rows={14}
              value={exportText}
              className="w-full rounded-none border border-input bg-background p-2 font-mono text-xs"
            />
          </div>
        </section>
      )}

      {overrideFor && (
        <OverrideSheet issue={overrideFor} onClose={() => setOverrideFor(null)} onSaved={() => void load()} />
      )}
    </div>
  );
}

export default function ConfiguratorHealthPage() {
  redirect("/workspace/plugins/smart-pc-builder");
}
