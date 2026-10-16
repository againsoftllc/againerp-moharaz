/** Compatibility rule engine types — IF / THEN / ELSE */

export const COMPATIBILITY_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "supports",
  "in",
  "not_in",
  "lte",
  "gte",
  "greater_than",
  "less_than",
  "overlap",
  "sum_lte",
  "count_lte",
  "power",
  "requires",
] as const;

export type CompatibilityOperator = (typeof COMPATIBILITY_OPERATORS)[number];

export const COMPATIBILITY_STATUSES = ["compatible", "warning", "incompatible"] as const;

export type CompatibilityStatus = (typeof COMPATIBILITY_STATUSES)[number];

export const OPERATOR_LABELS: Record<CompatibilityOperator, string> = {
  equals: "equals",
  not_equals: "not equals",
  contains: "contains",
  supports: "supports",
  in: "is one of (∈)",
  not_in: "is not one of (∉)",
  lte: "≤ (with margin)",
  gte: "≥ (with margin)",
  greater_than: "greater than",
  less_than: "less than",
  overlap: "overlaps with (∩)",
  sum_lte: "sum of all ≤",
  count_lte: "count of all ≤",
  power: "total power + margin ≤",
  requires: "requires (⇒)",
};

export const STATUS_LABELS: Record<CompatibilityStatus, string> = {
  compatible: "Compatible",
  warning: "Warning",
  incompatible: "Incompatible",
};

/** Reference to a component attribute: Profile.fieldCode */
export type AttributeRef = {
  profileId: string;
  fieldCode: string;
};

export type ConditionOperand =
  | AttributeRef
  | { literal: string | number | boolean };

export type CompatibilityCondition = {
  id: string;
  left: AttributeRef;
  operator: CompatibilityOperator;
  right: ConditionOperand;
  /** requires only: the left-field value that triggers the implication. */
  value?: string;
  /** power only: extra base wattage before summing components. */
  base?: number;
  /** lte/gte/greater_than/less_than/power only: tolerance % applied to the left/sum side. */
  margin?: number;
};

export type CompatibilityOutcome = {
  status: CompatibilityStatus;
  message: string;
};

/** Only evaluate this rule's conditions when some OTHER field elsewhere in
 * the build matches a value (e.g. a radiator-size rule that only applies
 * when the cooler type is AIO). */
export type CompatibilityWhen = AttributeRef & { value: string };

/** IF conditions (AND) → THEN → ELSE */
export type CompatibilityRuleBody = {
  conditions: CompatibilityCondition[];
  then: CompatibilityOutcome;
  else: CompatibilityOutcome;
  when?: CompatibilityWhen;
};

export type CompatibilityRule = {
  id: string;
  name: string;
  code: string;
  configuratorProfileId: string;
  configuratorProfileName: string;
  description?: string;
  priority: number;
  active: boolean;
  body: CompatibilityRuleBody;
  updatedAt: string;
};

/** Component in a build with resolved attribute values */
export type BuildComponentContext = {
  componentProfileId: string;
  componentName?: string;
  productId?: string;
  attributes: Record<string, string | number | boolean>;
};

export type RuleEvaluationResult = {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  status: CompatibilityStatus;
  message: string;
  branch: "then" | "else";
};

export type CompatibilityEvaluationResult = {
  status: CompatibilityStatus;
  results: RuleEvaluationResult[];
  evaluatedAt: string;
  cached: boolean;
};

export function describeCondition(cond: CompatibilityCondition, profileNames: Map<string, string>): string {
  const left = `${profileNames.get(cond.left.profileId) ?? cond.left.profileId}.${cond.left.fieldCode}`;
  const op = OPERATOR_LABELS[cond.operator];
  if (cond.operator === "requires") {
    const rightSlot = "literal" in cond.right ? "" : (profileNames.get(cond.right.profileId) ?? cond.right.profileId);
    return `${left} = "${cond.value ?? ""}" ${op} ${rightSlot}`;
  }
  const right =
    "literal" in cond.right
      ? String(cond.right.literal)
      : `${profileNames.get(cond.right.profileId) ?? cond.right.profileId}.${cond.right.fieldCode}`;
  const margin = cond.margin ? ` (+${cond.margin}%)` : "";
  return `${left} ${op} ${right}${margin}`;
}

export function describeRuleBody(
  body: CompatibilityRuleBody,
  profileNames: Map<string, string>,
): string {
  const when = body.conditions.map((c) => describeCondition(c, profileNames)).join(" AND ");
  const prefix = body.when
    ? `WHEN ${profileNames.get(body.when.profileId) ?? body.when.profileId}.${body.when.fieldCode} = "${body.when.value}" → `
    : "";
  return `${prefix}IF ${when} → ${body.then.status.toUpperCase()} ELSE ${body.else.status.toUpperCase()}`;
}

/** Worst status wins: incompatible > warning > compatible */
export function mergeStatuses(statuses: CompatibilityStatus[]): CompatibilityStatus {
  if (statuses.includes("incompatible")) return "incompatible";
  if (statuses.includes("warning")) return "warning";
  return "compatible";
}
