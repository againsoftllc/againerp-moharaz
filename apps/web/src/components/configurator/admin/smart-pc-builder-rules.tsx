"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { getSlotProducts } from "@/lib/api/configurator-slot-products";
import { CAP_BY_SLUG } from "@/lib/configurator/pcb-components";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useConfiguratorCategories } from "@/lib/api/use-configurator-categories";
import {
  useConfiguratorFiltersByCategory,
  type ConfiguratorFilterField,
} from "@/lib/api/use-configurator-filters";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import { CompatibilityRuleFormSheet } from "@/components/configurator/compatibility-rule-form-sheet";
import { Chip, Tok, prettyCode, typeChipFor } from "@/components/configurator/admin/pcb-ui";
import type {
  CompatibilityCondition,
  CompatibilityOperator,
  CompatibilityRule,
  CompatibilityRuleBody,
} from "@/lib/compatibility/types";

const ALL_PARTS = "all";

type Kind = "select" | "multi" | "number" | "count" | "power" | "presence";

type OpDef = { sym: string; name: string; types: [Kind, Kind][]; legacy?: boolean };

/** Operators, keyed by their wire name. Which ones apply is decided by the two
 * fields' types — the same narrowing the reference builder does. */
const OPS: Record<string, OpDef> = {
  equals: { sym: "=", name: "সমান (=)", types: [["select", "select"]] },
  in: { sym: "∈", name: "ডান পাশের লিস্টে আছে (∈)", types: [["select", "multi"]] },
  not_in: { sym: "∉", name: "ডান লিস্টে থাকলে সতর্ক (∉)", types: [["select", "multi"]] },
  contains: { sym: "∋", name: "বাম লিস্টে ডানের মান আছে (∋)", types: [["multi", "select"]] },
  overlap: { sym: "∩", name: "অন্তত একটা মিল (∩)", types: [["multi", "multi"]] },
  lte: { sym: "≤", name: "ছোট বা সমান (≤)", types: [["number", "number"]] },
  gte: { sym: "≥", name: "বড় বা সমান (≥)", types: [["number", "number"]] },
  sum_lte: { sym: "Σ≤", name: "সবগুলোর যোগফল ≤", types: [["number", "number"]] },
  count_lte: { sym: "#≤", name: "সংখ্যা ≤", types: [["count", "number"]] },
  power: { sym: "W≤", name: "মোট পাওয়ার + মার্জিন ≤", types: [["power", "number"]] },
  requires: { sym: "⇒", name: "হলে বাধ্যতামূলক (⇒)", types: [["select", "presence"]] },
  // Operators older rules were saved with — still shown and editable, just not offered for new rules.
  supports: {
    sym: "≈",
    name: "মিলতে হবে (≈)",
    types: [["select", "select"], ["multi", "select"], ["select", "multi"], ["multi", "multi"]],
    legacy: true,
  },
  not_equals: { sym: "≠", name: "সমান নয় (≠)", types: [["select", "select"]], legacy: true },
  greater_than: { sym: ">", name: "বড় (>)", types: [["number", "number"]], legacy: true },
  less_than: { sym: "<", name: "ছোট (<)", types: [["number", "number"]], legacy: true },
};

const opsFor = (a: Kind | null, b: Kind | null, current?: string) =>
  Object.keys(OPS).filter(
    (k) => (!OPS[k].legacy || k === current) && !!a && !!b && OPS[k].types.some(([x, y]) => x === a && y === b),
  );

function kindOf(field?: ConfiguratorFilterField): Kind | null {
  if (!field) return null;
  if (field.code === "__qty") return "count";
  if (field.code === "__selected") return "presence";
  if (field.code === "__power") return "power";
  if (field.source === "lookup") return field.code === "socket" ? "select" : "multi";
  switch (field.field_type) {
    case "multi_select":
      return "multi";
    case "number":
      return "number";
    default:
      return "select";
  }
}

type Draft = {
  id: string | null;
  name: string;
  priority: number;
  code?: string;
  active: boolean;
  ls: string; // cap id or "all"
  la: string;
  op: string;
  rs: string;
  ra: string;
  lval: string;
  sev: "error" | "warning";
  msg: string;
  okMsg: string;
  margin: number;
  base: number;
  when: { s: string; f: string; v: string } | null;
  inverted: boolean; // the problem outcome sits on THEN (older "warn when matched" rules)
  literal: string | null; // right side is a fixed number rather than another slot's field
};

type ParsedRule = { draft: Draft } | { complex: true };

function parseRule(rule: CompatibilityRule): ParsedRule {
  const body = rule.body;
  if (body.conditions.length !== 1) return { complex: true };
  const c = body.conditions[0];
  const inverted = body.then.status !== "compatible";
  const problem = inverted ? body.then : body.else;
  const ok = inverted ? body.else : body.then;
  const literal = "literal" in c.right ? String(c.right.literal) : null;
  return {
    draft: {
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      code: rule.code,
      active: rule.active,
      ls: c.left.profileId,
      la: c.left.fieldCode,
      op: c.operator,
      rs: "literal" in c.right ? "" : c.right.profileId,
      ra: "literal" in c.right ? "" : c.right.fieldCode,
      lval: c.value ?? "",
      sev: problem.status === "incompatible" ? "error" : "warning",
      msg: problem.message,
      okMsg: ok.message,
      margin: c.margin ?? 0,
      base: c.base ?? 0,
      when: body.when ? { s: body.when.profileId, f: body.when.fieldCode, v: body.when.value } : null,
      inverted,
      literal,
    },
  };
}

function emptyDraft(priority: number): Draft {
  return {
    id: null,
    name: "",
    priority,
    active: true,
    ls: "cap_cpu",
    la: "socket",
    op: "equals",
    rs: "cap_mobo",
    ra: "socket",
    lval: "",
    sev: "error",
    msg: "",
    okMsg: "",
    margin: 0,
    base: 0,
    when: null,
    inverted: false,
    literal: null,
  };
}

function buildBody(d: Draft): CompatibilityRuleBody {
  const cond: CompatibilityCondition = {
    id: "c1",
    left: { profileId: d.ls, fieldCode: d.la },
    operator: d.op as CompatibilityOperator,
    right: d.literal !== null ? { literal: Number(d.literal) } : { profileId: d.rs, fieldCode: d.ra },
  };
  if (d.op === "requires") cond.value = d.lval;
  if (["lte", "gte", "power", "greater_than", "less_than"].includes(d.op) && d.margin) cond.margin = d.margin;
  if (d.op === "power") cond.base = d.base || 0;

  const problemStatus = d.sev === "error" ? "incompatible" : "warning";
  const problemMsg =
    d.msg.trim() ||
    (d.sev === "error" ? `${d.name} — these parts are not compatible.` : `${d.name} — please double-check before ordering.`);
  const problem = { status: problemStatus as "incompatible" | "warning", message: problemMsg };
  const ok = { status: "compatible" as const, message: d.okMsg || "All conditions met." };

  const body: CompatibilityRuleBody = {
    conditions: [cond],
    then: d.inverted ? problem : ok,
    else: d.inverted ? ok : problem,
  };
  if (d.when && d.when.s && d.when.f && d.when.v.trim()) {
    body.when = { profileId: d.when.s, fieldCode: d.when.f, value: d.when.v.trim() };
  }
  return body;
}

type SlotInfo = { cap: string; name: string; categoryId: string; slug: string };

export function SmartPcBuilderRules({ addTrigger = 0 }: { addTrigger?: number }) {
  const { profiles } = useConfiguratorProfiles();
  const profileId = profiles.find((p) => p.slug === "pc-builder")?.id;
  const { categories } = useConfiguratorCategories(profileId);
  const jump = useSmartPcBuilderNavStore((s) => s.jump);
  const setBadges = useSmartPcBuilderNavStore((s) => s.setBadges);

  const rules = useCompatibilityRuleStore((s) => s.rules);
  const loaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);
  const upsertRule = useCompatibilityRuleStore((s) => s.upsertRule);
  const deleteRule = useCompatibilityRuleStore((s) => s.deleteRule);
  useEffect(() => {
    if (!loaded) void fetchRules();
  }, [loaded, fetchRules]);

  // Slots a rule can talk about: one per component id, in builder order.
  const slots: SlotInfo[] = useMemo(() => {
    const seen = new Set<string>();
    const out: SlotInfo[] = [];
    for (const c of [...categories].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (c.status !== "active") continue;
      const cap = CAP_BY_SLUG[c.slug];
      if (!cap || seen.has(cap)) continue;
      seen.add(cap);
      out.push({ cap, name: c.name, categoryId: c.id, slug: c.slug });
    }
    return out;
  }, [categories]);
  const slotByCap = (cap: string) => slots.find((s) => s.cap === cap);
  const slotName = (cap: string) => (cap === ALL_PARTS ? "সব পার্ট" : (slotByCap(cap)?.name ?? cap.replace(/^cap_/, "")));

  const { byId: fieldsById } = useConfiguratorFiltersByCategory(slots.map((s) => s.categoryId));
  const fieldsOf = (cap: string): ConfiguratorFilterField[] => {
    if (cap === ALL_PARTS) return [{ code: "__power", name: "মোট TDP", field_type: "power", source: "special" }];
    const s = slotByCap(cap);
    return s ? (fieldsById[s.categoryId] ?? []) : [];
  };
  const fieldOf = (cap: string, code: string) => fieldsOf(cap).find((f) => f.code === code);
  const fieldName = (cap: string, code: string) => fieldOf(cap, code)?.name ?? prettyCode(code);

  const pcRules = useMemo(
    () =>
      rules
        .filter((r) => r.configuratorProfileId === "pc-builder" || r.configuratorProfileId === "cfg_pc")
        .sort((a, b) => a.priority - b.priority),
    [rules],
  );
  useEffect(() => {
    if (loaded) setBadges({ rules: pcRules.filter((r) => r.active).length });
  }, [loaded, pcRules, setBadges]);

  const [slotFilter, setSlotFilter] = useState("");
  const involves = (r: CompatibilityRule, cap: string) => {
    const c = r.body.conditions[0];
    if (!c) return false;
    if (c.left.profileId === cap) return true;
    if (!("literal" in c.right) && c.right.profileId === cap) return true;
    if (r.body.when?.profileId === cap) return true;
    return c.operator === "power" && (cap === "cap_cpu" || cap === "cap_gpu");
  };
  const shown = pcRules.filter((r) => !slotFilter || involves(r, slotFilter));

  const [editing, setEditing] = useState<Draft | null>(null);
  const [legacyRule, setLegacyRule] = useState<CompatibilityRule | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);

  const [lastAddTrigger, setLastAddTrigger] = useState(addTrigger);
  useEffect(() => {
    if (addTrigger !== lastAddTrigger) {
      setLastAddTrigger(addTrigger);
      setEditing(emptyDraft((pcRules.at(-1)?.priority ?? 0) + 1));
    }
  }, [addTrigger, lastAddTrigger, pcRules]);

  const openEdit = (rule: CompatibilityRule) => {
    const parsed = parseRule(rule);
    if ("complex" in parsed) {
      setLegacyRule(rule);
      setLegacyOpen(true);
    } else {
      setEditing(parsed.draft);
    }
  };
  const openCopy = (rule: CompatibilityRule) => {
    const parsed = parseRule(rule);
    if ("complex" in parsed) {
      toast.info("এই রুলে একাধিক শর্ত আছে, Edit থেকে কপি করুন");
      return;
    }
    setEditing({ ...parsed.draft, id: null, code: undefined, name: `${rule.name} (copy)`, active: true });
  };

  const toggle = async (rule: CompatibilityRule) => {
    await upsertRule({
      id: rule.id,
      name: rule.name,
      configuratorProfileId: rule.configuratorProfileId,
      configuratorProfileName: rule.configuratorProfileName,
      active: !rule.active,
      body: rule.body,
    });
  };

  const sentence = (d: Draft): string => {
    const L = `${slotName(d.ls)} › ${fieldName(d.ls, d.la)}`;
    const R = d.literal !== null ? d.literal : `${slotName(d.rs)} › ${fieldName(d.rs, d.ra)}`;
    const m = d.margin ? ` (+${d.margin}%)` : "";
    let s = "";
    switch (d.op) {
      case "equals":
        s = `${L} আর ${R} একই হতে হবে`;
        break;
      case "supports":
        s = `${L} আর ${R} মিলতে হবে`;
        break;
      case "not_equals":
        s = `${L} আর ${R} আলাদা হতে হবে`;
        break;
      case "in":
        s = `${L}-এর মান ${R}-এর লিস্টে থাকতে হবে`;
        break;
      case "not_in":
        s = `${L} যদি ${R}-এর লিস্টে থাকে, সতর্ক করো`;
        break;
      case "contains":
        s = `${L}-এর লিস্টে ${R}-এর মান থাকতে হবে`;
        break;
      case "overlap":
        s = `${L} আর ${R}-এর মধ্যে অন্তত একটা মিল থাকতে হবে`;
        break;
      case "lte":
        s = `${L}${m} ≤ ${R}`;
        break;
      case "gte":
        s = `${L} ≥ ${R}${m}`;
        break;
      case "greater_than":
        s = `${L} > ${R}`;
        break;
      case "less_than":
        s = `${L} < ${R}`;
        break;
      case "sum_lte":
        s = `সব ${slotName(d.ls)}-এর ${fieldName(d.ls, d.la)} যোগ করলে ${R}-এর বেশি হবে না`;
        break;
      case "count_lte":
        s = `${slotName(d.ls)}-এর সংখ্যা ${R}-এর বেশি হবে না`;
        break;
      case "power":
        s = `(সব পার্টের TDP + ${d.base || 0}W)${m} ≤ ${R}`;
        break;
      case "requires":
        s = `${L} = ${d.lval} হলে ${slotName(d.rs)} নেওয়া বাধ্যতামূলক`;
        break;
    }
    if (d.when && d.op !== "requires") s = `যদি ${slotName(d.when.s)} › ${fieldName(d.when.s, d.when.f)} = ${d.when.v}, তাহলে ${s}`;
    return s;
  };

  const formula = (d: Draft) => {
    if (d.op === "requires") {
      return (
        <>
          <Tok>{slotName(d.ls)} › {fieldName(d.ls, d.la)} = {d.lval}</Tok>
          <span className="px-0.5 font-mono font-semibold text-primary">⇒</span>
          <Tok>{slotName(d.rs)}</Tok>
        </>
      );
    }
    const pre = d.op === "sum_lte" ? "Σ " : d.op === "count_lte" ? "# " : "";
    const left = d.op === "count_lte" ? slotName(d.ls) : `${slotName(d.ls)} › ${fieldName(d.ls, d.la)}`;
    const right = d.literal !== null ? d.literal : `${slotName(d.rs)} › ${fieldName(d.rs, d.ra)}`;
    return (
      <>
        <Tok>{pre}{left}</Tok>
        <span className="px-0.5 font-mono font-semibold text-primary">{OPS[d.op]?.sym ?? "?"}</span>
        <Tok>{right}</Tok>
      </>
    );
  };

  return (
    <div>
      <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
        রুল মানে দুই স্লটের দুটো ফিল্টারের তুলনা। ফিল্টারের টাইপ দেখে শর্ত নিজে থেকে সীমিত হয়: <Chip cls="bg-orange-500/15 text-orange-600 dark:text-orange-400">Range</Chip> হলে ≤ ≥,{" "}
        <Chip cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Dynamic</Chip> বা <Chip cls="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">Multi-select</Chip> হলে = ∈ ∋ ∩।
        মাদারবোর্ডের Socket আসে <Chip cls="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">Lookup</Chip> থেকে।
      </p>

      <section className="rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">Compatibility Rules</h2>
          <div className="flex items-center gap-2">
            <Select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)} className="h-8 w-40 text-xs" aria-label="Filter by slot">
              <option value="">সব স্লট</option>
              {slots.map((s) => (
                <option key={s.cap} value={s.cap}>{s.name}</option>
              ))}
            </Select>
            <Button size="sm" onClick={() => setEditing(emptyDraft((pcRules.at(-1)?.priority ?? 0) + 1))}>
              + নতুন রুল
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">On</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">টাইপ</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!loaded && <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>}
              {loaded && shown.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">কোনো রুল নেই</td></tr>
              )}
              {shown.map((rule) => {
                const parsed = parseRule(rule);
                const d = "draft" in parsed ? parsed.draft : null;
                return (
                  <tr key={rule.id} className={`border-b border-border/60 align-top ${rule.active ? "" : "opacity-45"}`}>
                    <td className="px-4 py-3">
                      <Switch checked={rule.active} onCheckedChange={() => void toggle(rule)} aria-label="On/Off" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold">{rule.name}</div>
                      {d ? (
                        <>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">{formula(d)}</div>
                          <div className="mt-1 text-[12.5px] text-muted-foreground">{sentence(d)}</div>
                        </>
                      ) : (
                        <div className="mt-1 text-[12.5px] text-muted-foreground">একাধিক শর্তের রুল ({rule.body.conditions.length}টি শর্ত)</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(d ? d.sev === "error" : rule.body.else.status === "incompatible") ? (
                        <Chip cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">Error</Chip>
                      ) : (
                        <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">Warning</Chip>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => openEdit(rule)}>Edit</Button>{" "}
                      <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={() => openCopy(rule)}>Copy</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <RuleDrawer
          draft={editing}
          slots={slots}
          slotName={slotName}
          fieldsOf={fieldsOf}
          onClose={() => setEditing(null)}
          onSave={async (d, goTest) => {
            const id = await upsertRule({
              id: d.id ?? undefined,
              name: d.name.trim(),
              code: d.id ? d.code : `${(d.name.trim() || "rule").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "rule"}_${Date.now().toString(36)}`,
              configuratorProfileId: "pc-builder",
              configuratorProfileName: "PC Builder",
              priority: d.priority,
              active: d.active,
              body: buildBody(d),
            });
            if (!id) return;
            toast.success("রুল সেভ হয়েছে");
            setEditing(null);
            if (goTest) jump("test-build");
          }}
          onDelete={
            editing.id
              ? async () => {
                  await deleteRule(editing.id as string);
                  setEditing(null);
                }
              : undefined
          }
          sentence={sentence}
        />
      )}

      <CompatibilityRuleFormSheet
        open={legacyOpen}
        onOpenChange={setLegacyOpen}
        rule={legacyRule}
        defaultConfiguratorProfileId="pc-builder"
      />
    </div>
  );
}

function RuleDrawer({
  draft: initial,
  slots,
  slotName,
  fieldsOf,
  sentence,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  slots: SlotInfo[];
  slotName: (cap: string) => string;
  fieldsOf: (cap: string) => ConfiguratorFilterField[];
  sentence: (d: Draft) => string;
  onClose: () => void;
  onSave: (d: Draft, goTest: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);

  const leftFields = fieldsOf(d.ls);
  const rightFields = fieldsOf(d.rs);
  const lf = leftFields.find((f) => f.code === d.la);
  const rf = d.literal !== null ? undefined : rightFields.find((f) => f.code === d.ra);
  // A field the registry no longer lists (older rules) keeps the kind its operator already implies.
  const lk = kindOf(lf) ?? (lf ? null : (OPS[d.op]?.types[0]?.[0] ?? null));
  const rk = d.literal !== null ? "number" : (kindOf(rf) ?? (rf ? null : (OPS[d.op]?.types[0]?.[1] ?? null)));
  const ops = opsFor(lk, rk, d.op);

  // Keep the field / operator picks valid whenever a slot or field changes.
  const patch = (next: Partial<Draft>) =>
    setD((prev) => {
      const m = { ...prev, ...next };
      if (m.ls === ALL_PARTS) m.la = "__power";
      const lfs = fieldsOf(m.ls);
      if (lfs.length && !lfs.some((f) => f.code === m.la)) m.la = lfs[0].code;
      if (m.literal === null) {
        const rfs = fieldsOf(m.rs);
        if (rfs.length && !rfs.some((f) => f.code === m.ra)) m.ra = rfs[0].code;
      }
      const nlk = kindOf(fieldsOf(m.ls).find((f) => f.code === m.la));
      const nrk = m.literal !== null ? "number" : kindOf(fieldsOf(m.rs).find((f) => f.code === m.ra));
      const valid = opsFor(nlk, nrk, m.op);
      if (!valid.includes(m.op)) {
        m.op = valid[0] ?? "";
        m.inverted = false; // a different operator starts from the normal then/else shape
      }
      return m;
    });

  const setOp = (op: string) => setD((prev) => ({ ...prev, op, inverted: op === prev.op ? prev.inverted : false }));

  // Values seen on real products, offered as suggestions for "= value" inputs.
  const valueSuggestions = useFieldValues(slots, d.ls, d.op === "requires" ? d.la : null);
  const whenSuggestions = useFieldValues(slots, d.when?.s ?? "", d.when?.f ?? null);

  const whenFields = d.when ? fieldsOf(d.when.s).filter((f) => f.source !== "special" && (kindOf(f) === "select")) : [];
  const valid = ops.length > 0;
  const preview = valid ? sentence(d) : "";

  const save = async (goTest: boolean) => {
    if (!d.name.trim()) {
      const auto = `${fieldsOf(d.ls).find((f) => f.code === d.la)?.name ?? d.la} ${OPS[d.op]?.sym ?? ""} ${
        d.literal !== null ? d.literal : (fieldsOf(d.rs).find((f) => f.code === d.ra)?.name ?? d.ra)
      }`;
      d.name = auto;
    }
    if (!valid) return;
    if (d.op === "requires" && !d.lval.trim()) {
      toast.error("কোন মানে বাধ্যতামূলক হবে সেটা দিন");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...d, name: d.name }, goTest);
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel = "text-xs font-semibold text-muted-foreground";
  const side = "grid content-start gap-1.5 border border-border bg-muted/20 p-2.5";
  const slotOptions = (withAll: boolean) => (
    <>
      {withAll && <option value={ALL_PARTS}>সব পার্ট (পাওয়ার)</option>}
      {slots.map((s) => (
        <option key={s.cap} value={s.cap}>{s.name}</option>
      ))}
      {!slots.some((s) => s.cap === d.ls) && d.ls !== ALL_PARTS && <option value={d.ls}>{slotName(d.ls)}</option>}
    </>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[620px]">
        <div className="border-b border-input pb-3">
          <h2 className="text-base font-semibold">{d.id ? "রুল এডিট" : "নতুন রুল"}</h2>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">রুলের নাম</Label>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="যেমন: CPU ও মাদারবোর্ডের Socket" />
        </div>

        <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <div className={side}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">বাম পাশ</h4>
            <Select value={d.ls} onChange={(e) => patch({ ls: e.target.value })} className="h-8 text-xs" aria-label="Left slot">
              {slotOptions(true)}
            </Select>
            <Select value={d.la} onChange={(e) => patch({ la: e.target.value })} className="h-8 text-xs" aria-label="Left filter" disabled={d.ls === ALL_PARTS}>
              {!lf && <option value={d.la}>{prettyOf(d.la)}</option>}
              {leftFields.map((f) => (
                <option key={f.code} value={f.code}>{f.name}</option>
              ))}
            </Select>
            <div>{typeChip(lf)}</div>
            {d.op === "requires" && (
              <>
                <Input
                  value={d.lval}
                  onChange={(e) => setD({ ...d, lval: e.target.value })}
                  list="rule-lval-values"
                  placeholder="যেমন: No"
                  className="h-8 text-xs"
                  aria-label="Value"
                />
                <datalist id="rule-lval-values">
                  {valueSuggestions.map((v) => <option key={v} value={v} />)}
                </datalist>
              </>
            )}
          </div>

          <div className="grid content-center">
            <Select value={d.op} onChange={(e) => setOp(e.target.value)} className="h-8 w-full text-xs sm:w-52" aria-label="Condition">
              {ops.length === 0 ? <option>— মেলে না —</option> : ops.map((k) => <option key={k} value={k}>{OPS[k].name}</option>)}
            </Select>
          </div>

          <div className={side}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ডান পাশ</h4>
            {d.literal !== null ? (
              <Input
                type="number"
                value={d.literal}
                onChange={(e) => setD({ ...d, literal: e.target.value })}
                className="h-8 text-xs"
                aria-label="Number"
              />
            ) : (
              <>
                <Select value={d.rs} onChange={(e) => patch({ rs: e.target.value })} className="h-8 text-xs" aria-label="Right slot">
                  {slots.map((s) => (
                    <option key={s.cap} value={s.cap}>{s.name}</option>
                  ))}
                  {!slots.some((s) => s.cap === d.rs) && <option value={d.rs}>{slotName(d.rs)}</option>}
                </Select>
                <Select value={d.ra} onChange={(e) => patch({ ra: e.target.value })} className="h-8 text-xs" aria-label="Right filter">
                  {!rf && <option value={d.ra}>{prettyOf(d.ra)}</option>}
                  {rightFields.map((f) => (
                    <option key={f.code} value={f.code}>{f.name}</option>
                  ))}
                </Select>
                <div>{typeChip(rf)}</div>
              </>
            )}
          </div>
        </div>

        {valid ? (
          <div className="border border-dashed border-primary bg-primary/10 px-3 py-2 text-[13.5px]">📖 {preview}</div>
        ) : (
          <div className="border border-dashed border-destructive bg-destructive/10 px-3 py-2 text-[13.5px]">
            এই দুই ফিল্টার তুলনা করা যায় না ({lk ?? "?"} ও {rk ?? "?"})। অন্য ফিল্টার বাছুন।
          </div>
        )}

        <div className="space-y-1.5">
          <span className={sectionLabel}>এই রুল না মিললে বাস্তবে কী হয়?</span>
          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 border border-border px-2.5 py-1.5 text-[13px]">
              <input type="radio" name="sev" checked={d.sev === "error"} onChange={() => setD({ ...d, sev: "error" })} />
              <Chip cls="bg-rose-500/15 text-rose-600 dark:text-rose-400">চলবে না</Chip> অমিল প্রোডাক্ট লুকাবে, বিল্ড আটকাবে
            </label>
            <label className="flex cursor-pointer items-center gap-2 border border-border px-2.5 py-1.5 text-[13px]">
              <input type="radio" name="sev" checked={d.sev === "warning"} onChange={() => setD({ ...d, sev: "warning" })} />
              <Chip cls="bg-amber-500/15 text-amber-600 dark:text-amber-400">চলবে, সতর্ক করো</Chip> প্রোডাক্ট দেখাবে, সাথে নোটিশ
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">কাস্টমারকে মেসেজ (ঐচ্ছিক)</Label>
          <Input
            value={d.msg}
            onChange={(e) => setD({ ...d, msg: e.target.value })}
            placeholder="খালি রাখলে ডিফল্ট মেসেজ বসবে"
            className="text-xs"
          />
          <span className="text-[11px] text-muted-foreground">
            Preview: <i>{d.msg.trim() || (d.sev === "error" ? `${d.name || "রুল"} — these parts are not compatible.` : `${d.name || "রুল"} — please double-check before ordering.`)}</i>
          </span>
        </div>

        {d.op !== "requires" && (
          <div className="space-y-1.5">
            <span className={sectionLabel}>শুধু তখন চেক করো যখন (ঐচ্ছিক)</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={d.when?.s ?? ""}
                onChange={(e) => {
                  const s = e.target.value;
                  if (!s) return setD({ ...d, when: null });
                  const f = fieldsOf(s).find((x) => x.source !== "special" && kindOf(x) === "select");
                  setD({ ...d, when: { s, f: f?.code ?? "", v: "" } });
                }}
                className="h-8 w-44 text-xs"
                aria-label="Condition slot"
              >
                <option value="">— সবসময় —</option>
                {slots.map((s) => (
                  <option key={s.cap} value={s.cap}>{s.name}</option>
                ))}
              </Select>
              {d.when && (
                <>
                  <Select
                    value={d.when.f}
                    onChange={(e) => setD({ ...d, when: d.when && { ...d.when, f: e.target.value, v: "" } })}
                    className="h-8 w-48 text-xs"
                    aria-label="Condition filter"
                  >
                    {!whenFields.some((f) => f.code === d.when?.f) && <option value={d.when.f}>{prettyOf(d.when.f)}</option>}
                    {whenFields.map((f) => (
                      <option key={f.code} value={f.code}>{f.name}</option>
                    ))}
                  </Select>
                  <span className="font-mono font-semibold text-primary">=</span>
                  <Input
                    value={d.when.v}
                    onChange={(e) => setD({ ...d, when: d.when && { ...d.when, v: e.target.value } })}
                    list="rule-when-values"
                    placeholder="মান"
                    className="h-8 w-32 text-xs"
                    aria-label="Condition value"
                  />
                  <datalist id="rule-when-values">
                    {whenSuggestions.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {["lte", "gte", "power", "greater_than", "less_than"].includes(d.op) && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              মার্জিন %
              <Input
                type="number"
                value={d.margin}
                onChange={(e) => setD({ ...d, margin: Number(e.target.value) || 0 })}
                className="h-8 w-20 text-xs"
              />
            </label>
          )}
          {d.op === "power" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              বেস W
              <Input type="number" value={d.base} onChange={(e) => setD({ ...d, base: Number(e.target.value) || 0 })} className="h-8 w-24 text-xs" />
            </label>
          )}
        </div>

        <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-input pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>বাতিল</Button>
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => {
                if (!armedDelete) return setArmedDelete(true);
                void onDelete();
              }}
            >
              {armedDelete ? "নিশ্চিত?" : "মুছুন"}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={!valid || saving} onClick={() => void save(true)}>
            Test-এ দেখুন
          </Button>
          <Button size="sm" disabled={!valid || saving} onClick={() => void save(false)}>
            সেভ করুন
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const prettyOf = (code: string) => prettyCode(code);
const typeChip = (field?: ConfiguratorFilterField) => {
  const chip = typeChipFor(field);
  return chip ? <Chip cls={chip.cls}>{chip.label}</Chip> : null;
};

/** Distinct values a field actually holds on real products in a slot — offered
 * as suggestions for the "= value" inputs. */
function useFieldValues(slots: SlotInfo[], cap: string, code: string | null): string[] {
  const [values, setValues] = useState<string[]>([]);
  const slug = slots.find((s) => s.cap === cap)?.slug;
  useEffect(() => {
    if (!slug || !code) {
      setValues([]);
      return;
    }
    let cancelled = false;
    void getSlotProducts()
      .then((all) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const p of all.find((s) => s.slug === slug)?.products ?? []) {
          const v = p.attributes?.[code];
          if (v && String(v).trim()) set.add(String(v).trim());
        }
        setValues([...set].sort());
      })
      .catch(() => !cancelled && setValues([]));
    return () => {
      cancelled = true;
    };
  }, [slug, code]);
  return values;
}
