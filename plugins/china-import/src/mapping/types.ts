/** Provider-independent smart mapping types (STEP 05). */

export type MappingEntityType = "brand" | "category" | "attribute" | "supplier";

export type MappingStatus =
  | "pending"
  | "suggested"
  | "auto_matched"
  | "manual"
  | "approved"
  | "rejected"
  | "conflict"
  | "merged";

export type MatchMethod = "none" | "exact" | "rule" | "fuzzy" | "ai" | "manual";

export type MappingCandidate = {
  id: string;
  name: string;
  score: number;
  entity_type?: MappingEntityType;
  source?: "rule" | "exact" | "fuzzy" | "ai_suggestion" | "manual";
  reason?: string;
};

export type ProviderEntityRef = {
  provider: string;
  entity_type: MappingEntityType;
  provider_entity_id: string;
  provider_name: string;
  path?: string[];
};

export const ENTITY_LABELS: Record<MappingEntityType, string> = {
  brand: "Brand",
  category: "Category",
  attribute: "Attribute",
  supplier: "Supplier",
};

export const STATUS_TONES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  suggested: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  auto_matched: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  manual: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-destructive/10 text-destructive",
  conflict: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  merged: "bg-muted text-muted-foreground",
};

export const METHOD_LABELS: Record<MatchMethod, string> = {
  none: "No match",
  exact: "Exact match",
  rule: "Rule based",
  fuzzy: "Fuzzy match",
  ai: "AI suggestion",
  manual: "Manual",
};
