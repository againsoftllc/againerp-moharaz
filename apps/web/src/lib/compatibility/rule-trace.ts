import { readAttribute } from "@/lib/compatibility/rule-evaluator";
import type { CompatibilityCondition, CompatibilityRule } from "@/lib/compatibility/types";

/** A product placed in a build, with how many of it. */
export type BuildItem = { name: string; attributes: Record<string, string | number | boolean>; qty: number };

/** Builds are keyed by component id ("cap_cpu"…), the id rules refer to. */
export type TraceBuild = Record<string, BuildItem[]>;

export type TraceStatus = "pass" | "fail" | "skip" | "unknown";
export type RuleTrace = { rule: CompatibilityRule; status: TraceStatus; detail: string };

type Names = { slot: (cap: string) => string; field: (cap: string, code: string) => string };

const norm = (v: unknown) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
const toks = (v: unknown) => String(v).split(/[,|/]+/).map((x) => x.trim()).filter(Boolean);
const num = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isNaN(n) && String(v).trim() !== "") return n;
  const m = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isNaN(m) ? null : m;
};
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));

const val = (item: BuildItem, code: string) => readAttribute(item.attributes, code);

/** The same checks the rule engine makes, but returning a plain-language
 * detail line for each ("AM4 = AM4", "Σ 2 ≤ 2", "Power Supply নেওয়া হয়নি") so an admin
 * can see why a build passes, fails or isn't checked. */
export function traceRule(rule: CompatibilityRule, build: TraceBuild, names: Names): RuleTrace {
  const out = (status: TraceStatus, detail: string): RuleTrace => ({ rule, status, detail });
  const body = rule.body;
  const c: CompatibilityCondition | undefined = body.conditions[0];
  if (!c || body.conditions.length !== 1) return out("skip", "একাধিক শর্তের রুল");

  const lcap = c.left.profileId;
  const literal = "literal" in c.right;
  const rcap = literal ? "" : (c.right as { profileId: string }).profileId;
  const rfield = literal ? "" : (c.right as { fieldCode: string }).fieldCode;
  const op = c.operator;

  let L = lcap === "all" ? [] : (build[lcap] ?? []);
  const R = literal ? [] : (build[rcap] ?? []);

  // The rule's own gate ("only when cooler type = Air").
  if (body.when) {
    const w = body.when;
    const ok = (i: BuildItem) => {
      const v = val(i, w.fieldCode);
      return v !== null && norm(v) === norm(w.value);
    };
    const wItems = build[w.profileId] ?? [];
    if (!wItems.length) return out("skip", "শর্ত প্রযোজ্য নয়");
    if (w.profileId === lcap) {
      L = L.filter(ok);
      if (!L.length) return out("skip", "শর্ত প্রযোজ্য নয়");
    } else if (!wItems.some(ok)) {
      return out("skip", "শর্ত প্রযোজ্য নয়");
    }
  }

  if (op === "requires") {
    const left = build[lcap] ?? [];
    if (!left.length) return out("skip", `${names.slot(lcap)} নেওয়া হয়নি`);
    const triggers = left.some((i) => {
      const v = val(i, c.left.fieldCode);
      return v !== null && norm(v) === norm(c.value ?? "");
    });
    if (!triggers) return out("pass", "প্রযোজ্য নয়");
    return R.length ? out("pass", `${names.slot(rcap)} আছে`) : out("fail", `${names.slot(rcap)} নেওয়া হয়নি`);
  }

  if (!literal && !R.length) return out("skip", `${names.slot(rcap)} নেওয়া হয়নি`);
  const rRaw = literal ? (c.right as { literal: string | number | boolean }).literal : val(R[0], rfield);

  if (op === "power") {
    if (rRaw === null || num(rRaw) === null) return out("unknown", `${names.slot(rcap)}: ${names.field(rcap, rfield)} খালি`);
    const rv = num(rRaw) as number;
    const base = c.base ?? 0;
    const k = 1 + (c.margin ?? 0) / 100;
    let total = base;
    const parts: number[] = [];
    for (const items of Object.values(build)) {
      for (const i of items) {
        const w = num(val(i, "tdp") ?? val(i, "gpu_tdp"));
        if (w !== null) {
          total += w * i.qty;
          parts.push(w * i.qty);
        }
      }
    }
    const need = Math.round(total * k);
    return out(need <= rv ? "pass" : "fail", `(${parts.join("+")}+${base})×${k} = ${need}W ${need <= rv ? "≤" : ">"} ${rv}W`);
  }

  if (!L.length) return out("skip", `${names.slot(lcap)} নেওয়া হয়নি`);
  if (rRaw === null) return out("unknown", `${R[0]?.name ?? names.slot(rcap)}: ${names.field(rcap, rfield)} খালি`);
  const rNum = num(rRaw);

  if (op === "count_lte") {
    if (rNum === null) return out("unknown", `${R[0]?.name}: ${names.field(rcap, rfield)} খালি`);
    const n = L.reduce((a, i) => a + i.qty, 0);
    return out(n <= rNum ? "pass" : "fail", `${n} ${n <= rNum ? "≤" : ">"} ${rNum}`);
  }
  if (op === "sum_lte") {
    if (rNum === null) return out("unknown", `${R[0]?.name}: ${names.field(rcap, rfield)} খালি`);
    let n = 0;
    for (const i of L) {
      const v = num(val(i, c.left.fieldCode));
      if (v === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
      n += v * i.qty;
    }
    return out(n <= rNum ? "pass" : "fail", `Σ ${n} ${n <= rNum ? "≤" : ">"} ${rNum}`);
  }

  const k = 1 + (c.margin ?? 0) / 100;
  let last = "";
  for (const i of L) {
    const lv = val(i, c.left.fieldCode);
    if (lv === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
    let ok = false;
    let detail = "";
    switch (op) {
      case "equals":
        ok = norm(lv) === norm(rRaw);
        detail = `${show(lv)} ${ok ? "=" : "≠"} ${show(rRaw)}`;
        break;
      case "not_equals":
        ok = norm(lv) !== norm(rRaw);
        detail = `${show(lv)} ${ok ? "≠" : "="} ${show(rRaw)}`;
        break;
      case "in": {
        const r = toks(rRaw).map(norm);
        ok = toks(lv).some((t) => r.includes(norm(t)));
        detail = `${show(lv)} ${ok ? "∈" : "∉"} [${toks(rRaw).join(", ")}]`;
        break;
      }
      case "not_in": {
        const r = toks(rRaw).map(norm);
        ok = !toks(lv).some((t) => r.includes(norm(t)));
        detail = ok ? `${show(lv)} লিস্টে নেই` : `${show(lv)} আছে লিস্টে`;
        break;
      }
      case "contains": {
        ok = toks(lv).map(norm).includes(norm(rRaw));
        detail = `[${toks(lv).join(", ")}] ${ok ? "∋" : "∌"} ${show(rRaw)}`;
        break;
      }
      case "supports": {
        const a = toks(lv).map(norm);
        const b = toks(rRaw).map(norm);
        ok = a.includes("universal") || b.includes("universal") || a.some((t) => b.includes(t));
        detail = `[${toks(lv).join(", ")}] ${ok ? "≈" : "≉"} [${toks(rRaw).join(", ")}]`;
        break;
      }
      case "overlap": {
        const b = toks(rRaw).map(norm);
        const common = toks(lv).filter((t) => b.includes(norm(t)));
        ok = common.length > 0;
        detail = ok ? `কমন: ${common.join(", ")}` : `[${toks(lv).join(", ")}] ∩ [${toks(rRaw).join(", ")}] = ∅`;
        break;
      }
      case "lte": {
        const l = num(lv);
        if (l === null || rNum === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
        ok = l * k <= rNum;
        detail = `${Math.round(l * k)} ${ok ? "≤" : ">"} ${rNum}`;
        break;
      }
      case "gte": {
        const l = num(lv);
        if (l === null || rNum === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
        ok = l >= rNum * k;
        detail = `${l} ${ok ? "≥" : "<"} ${Math.round(rNum * k)}`;
        break;
      }
      case "greater_than": {
        const l = num(lv);
        if (l === null || rNum === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
        ok = l > rNum;
        detail = `${l} ${ok ? ">" : "≤"} ${rNum}`;
        break;
      }
      case "less_than": {
        const l = num(lv);
        if (l === null || rNum === null) return out("unknown", `${i.name}: ${names.field(lcap, c.left.fieldCode)} খালি`);
        ok = l < rNum;
        detail = `${l} ${ok ? "<" : "≥"} ${rNum}`;
        break;
      }
      default:
        return out("skip", "অজানা শর্ত");
    }
    // Rules saved in the older "warn when it matches" shape put the problem on THEN:
    // there a match IS the failure.
    const bad = body.then.status !== "compatible" ? ok : !ok;
    if (bad) return out("fail", detail);
    last = detail;
  }
  return out("pass", last);
}

/** Whether a rule's outcome when it fails is an Error (blocks) or a Warning. */
export function ruleSeverity(rule: CompatibilityRule): "error" | "warning" {
  const problem = rule.body.then.status !== "compatible" ? rule.body.then : rule.body.else;
  return problem.status === "incompatible" ? "error" : "warning";
}

export function ruleProblemMessage(rule: CompatibilityRule): string {
  const problem = rule.body.then.status !== "compatible" ? rule.body.then : rule.body.else;
  return problem.message || rule.name;
}
