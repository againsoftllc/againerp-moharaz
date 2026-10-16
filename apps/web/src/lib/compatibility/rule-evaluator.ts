import type {
  AttributeRef,
  BuildComponentContext,
  CompatibilityCondition,
  CompatibilityEvaluationResult,
  CompatibilityOperator,
  CompatibilityOutcome,
  CompatibilityRule,
  CompatibilityRuleBody,
  CompatibilityStatus,
  ConditionOperand,
  RuleEvaluationResult,
} from "@/lib/compatibility/types";
import { mergeStatuses } from "@/lib/compatibility/types";

const FIELD_ALIASES: Record<string, string[]> = {
  socket: ["socket"],
  ram_type: ["ram_type", "type"],
  type: ["type", "ram_type"],
  tdp: ["tdp"],
  speed: ["speed"],
  wattage: ["wattage"],
  socket_support: ["socket_support", "socket"],
  cores: ["cores", "core_count"],
  core_count: ["core_count", "cores"],
};

export function readAttribute(
  attributes: Record<string, string | number | boolean>,
  fieldCode: string,
): string | number | boolean | null {
  for (const key of FIELD_ALIASES[fieldCode] ?? [fieldCode]) {
    const val = attributes[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
  }
  return null;
}

function resolveAttributeRef(
  ref: AttributeRef,
  components: BuildComponentContext[],
): string | number | boolean | null {
  const comp = components.find((c) => c.componentProfileId === ref.profileId);
  if (!comp) return null;
  return readAttribute(comp.attributes, ref.fieldCode);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokens(value: string | number | boolean): string[] {
  return String(value)
    .split(/[,|/]+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);
}

function resolveOperand(
  operand: ConditionOperand,
  components: BuildComponentContext[],
): string | number | boolean | null {
  if ("literal" in operand) return operand.literal;
  return resolveAttributeRef(operand, components);
}

function compareValues(
  left: string | number | boolean | null,
  operator: CompatibilityOperator,
  right: string | number | boolean | null,
): boolean {
  if (left === null || right === null) return false;

  switch (operator) {
    case "equals":
      return normalizeToken(String(left)) === normalizeToken(String(right));
    case "not_equals":
      return normalizeToken(String(left)) !== normalizeToken(String(right));
    case "contains":
      return String(left).toLowerCase().includes(String(right).toLowerCase());
    case "supports": {
      const leftTokens = tokens(left);
      const rightTokens = tokens(right);
      if (leftTokens.includes("universal") || rightTokens.includes("universal")) return true;
      return rightTokens.some((token) => leftTokens.includes(token)) || leftTokens.some((token) => rightTokens.includes(token));
    }
    case "overlap": {
      // Stricter than "supports" — a real shared token required, no
      // "universal" bypass. Multi-value-vs-multi-value fit checks.
      const leftTokens = new Set(tokens(left));
      const rightTokens = tokens(right);
      return rightTokens.some((t) => leftTokens.has(t));
    }
    case "in":
      return tokens(left).some((t) => tokens(right).includes(t));
    case "not_in":
      return !tokens(left).some((t) => tokens(right).includes(t));
    case "greater_than": {
      const l = Number(left);
      const r = Number(right);
      return !Number.isNaN(l) && !Number.isNaN(r) && l > r;
    }
    case "less_than": {
      const l = Number(left);
      const r = Number(right);
      return !Number.isNaN(l) && !Number.isNaN(r) && l < r;
    }
    default:
      return false;
  }
}

function findAllComponents(profileId: string, components: BuildComponentContext[]): BuildComponentContext[] {
  return components.filter((c) => c.componentProfileId === profileId);
}

/** sum_lte / count_lte — aggregate across EVERY component sharing the left
 * slot's profileId (e.g. every selected RAM stick), not just the first
 * match resolveAttributeRef would normally use. */
function evaluateAggregateCondition(
  condition: CompatibilityCondition,
  components: BuildComponentContext[],
): boolean | null {
  const matches = findAllComponents(condition.left.profileId, components);
  if (matches.length === 0) return null;
  const right = resolveOperand(condition.right, components);
  if (right === null) return null;
  const target = Number(right);
  if (Number.isNaN(target)) return false;

  if (condition.operator === "count_lte") return matches.length <= target;

  let total = 0;
  let anyValue = false;
  for (const comp of matches) {
    const val = readAttribute(comp.attributes, condition.left.fieldCode);
    if (val === null) continue;
    const n = Number(val);
    if (!Number.isNaN(n)) {
      total += n;
      anyValue = true;
    }
  }
  if (!anyValue) return null;
  return total <= target;
}

// Fields summed for a whole-build power-budget check, first present wins
// per component — mirrors the artifact's `val(p,"cpu_tdp") ?? val(p,"gpu_tdp")`.
const POWER_FIELDS = ["tdp", "gpu_tdp"];

function evaluatePowerCondition(
  condition: CompatibilityCondition,
  components: BuildComponentContext[],
): boolean | null {
  const right = resolveOperand(condition.right, components);
  if (right === null) return null;
  const target = Number(right);
  if (Number.isNaN(target)) return false;

  const base = condition.base ?? 0;
  const margin = condition.margin ?? 0;
  let total = base;
  for (const comp of components) {
    for (const field of POWER_FIELDS) {
      const val = comp.attributes[field];
      if (val === undefined || val === null) continue;
      const n = Number(val);
      if (!Number.isNaN(n)) total += n;
      break;
    }
  }
  const need = total * (1 + margin / 100);
  return need <= target;
}

/** requires (⇒) — if the left field equals condition.value, the right slot
 * must have something selected. A non-triggering left value makes the
 * implication vacuously true (matches the artifact's own "প্রযোজ্য নয়" pass). */
function evaluateRequiresCondition(
  condition: CompatibilityCondition,
  components: BuildComponentContext[],
): boolean | null {
  const left = resolveAttributeRef(condition.left, components);
  if (left === null) return null;
  if (normalizeToken(String(left)) !== normalizeToken(condition.value ?? "")) return true;
  if ("literal" in condition.right) return false;
  return findAllComponents(condition.right.profileId, components).length > 0;
}

export function evaluateCondition(
  condition: CompatibilityCondition,
  components: BuildComponentContext[],
): boolean | null {
  if (condition.operator === "sum_lte" || condition.operator === "count_lte") {
    return evaluateAggregateCondition(condition, components);
  }
  if (condition.operator === "power") return evaluatePowerCondition(condition, components);
  if (condition.operator === "requires") return evaluateRequiresCondition(condition, components);
  const left = resolveAttributeRef(condition.left, components);
  const right = resolveOperand(condition.right, components);
  if (left === null || right === null) return null;
  if (condition.operator === "lte" || condition.operator === "gte") {
    // Numeric ≤ / ≥ with an optional safety margin %: lte checks left×(1+m) ≤ right,
    // gte checks left ≥ right×(1+m).
    const l = Number(left);
    const r = Number(right);
    if (Number.isNaN(l) || Number.isNaN(r)) return false;
    const k = 1 + (condition.margin ?? 0) / 100;
    return condition.operator === "lte" ? l * k <= r : l >= r * k;
  }
  return compareValues(left, condition.operator, right);
}

function whenOk(when: CompatibilityRuleBody["when"], components: BuildComponentContext[]): boolean | null {
  if (!when) return true;
  const value = resolveAttributeRef({ profileId: when.profileId, fieldCode: when.fieldCode }, components);
  if (value === null) return null;
  return normalizeToken(String(value)) === normalizeToken(when.value);
}

export function evaluateRuleBody(
  body: CompatibilityRuleBody,
  components: BuildComponentContext[],
): { matched: boolean; outcome: CompatibilityOutcome; branch: "then" | "else"; skipped?: boolean } {
  const when = whenOk(body.when, components);
  if (when === null || when === false) {
    return {
      matched: false,
      skipped: true,
      outcome: { status: "compatible", message: "" },
      branch: "then",
    };
  }
  const checks = body.conditions.map((c) => evaluateCondition(c, components));
  if (checks.some((value) => value === null)) {
    return {
      matched: false,
      skipped: true,
      outcome: { status: "compatible", message: "" },
      branch: "then",
    };
  }
  const matched = checks.length === 0 || checks.every(Boolean);

  if (matched) {
    return { matched: true, outcome: body.then, branch: "then" };
  }
  return { matched: false, outcome: body.else, branch: "else" };
}

function profileMatches(ruleProfileId: string, wanted?: string): boolean {
  if (!wanted) return true;
  if (ruleProfileId === wanted) return true;
  const aliases = new Set(["pc-builder", "cfg_pc"]);
  return aliases.has(wanted) && aliases.has(ruleProfileId);
}

export function evaluateCompatibilityRules(
  rules: CompatibilityRule[],
  components: BuildComponentContext[],
  configuratorProfileId?: string,
): CompatibilityEvaluationResult {
  const active = rules
    .filter((r) => r.active)
    .filter((r) => profileMatches(r.configuratorProfileId, configuratorProfileId))
    .sort((a, b) => a.priority - b.priority);

  const results: RuleEvaluationResult[] = [];
  for (const rule of active) {
    const { matched, outcome, branch, skipped } = evaluateRuleBody(rule.body, components);
    if (skipped) continue;
    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      status: outcome.status,
      message: outcome.message,
      branch,
    });
  }

  const status = mergeStatuses(results.map((r) => r.status));

  return {
    status,
    results,
    evaluatedAt: new Date().toISOString(),
    cached: false,
  };
}
